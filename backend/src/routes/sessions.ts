import { Router } from 'express';
import type { Server } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../db';
import { searchShows } from '../motn';
import { finishPicking, getSessionState, roomName } from '../session';
import type { Filters } from '../types';

const filtersSchema = z.object({
  country: z.string().min(2).max(2),
  catalogs: z.array(z.string()).max(32).default([]),
  showType: z.enum(['movie', 'series']),
  genres: z.array(z.string()).default([]),
  genresRelation: z.enum(['and', 'or']).default('and'),
  keyword: z.string().optional(),
});

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Prevents concurrent deck-extension requests for the same session
const deckInFlight = new Set<string>();

function generateCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function buildSessionsRouter(io: Server) {
  const r = Router();

  // Create a session (host)
  r.post('/', async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(1).max(40),
          filters: filtersSchema,
          groupSize: z.number().int().min(1).max(32).default(2),
        })
        .parse(req.body);
      const f = body.filters;
      const filters: Filters = {
        country: f.country,
        catalogs: f.catalogs,
        showType: f.showType,
        genres: f.genres,
        genresRelation: f.genresRelation,
        keyword: f.keyword,
      };

      let code = generateCode();
      while (await prisma.session.findUnique({ where: { code } })) {
        code = generateCode();
      }

      const session = await prisma.session.create({
        data: {
          code,
          filters: filters as any,
          groupSize: body.groupSize,
          members: { create: { name: body.name, isHost: true } },
        },
        include: { members: true },
      });

      const host = session.members[0];
      res.json({
        code: session.code,
        member: { id: host.id, name: host.name, isHost: true, finished: host.finished },
        state: await getSessionState(code),
      });
    } catch (e) {
      next(e);
    }
  });

  // Join a session
  r.post('/:code/join', async (req, res, next) => {
    try {
      const { name } = z.object({ name: z.string().min(1).max(40) }).parse(req.body);
      const code = req.params.code.toUpperCase();
      const session = await prisma.session.findUnique({ where: { code } });
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const member = await prisma.member.create({
        data: { sessionId: session.id, name },
      });

      io.to(roomName(code)).emit('member:joined', { id: member.id, name: member.name, isHost: false });
      res.json({
        code,
        member: { id: member.id, name: member.name, isHost: false, finished: member.finished },
        state: await getSessionState(code),
      });
    } catch (e) {
      next(e);
    }
  });

  // A member finishes picking (async); finalizes when everyone is done
  r.post('/:code/finish', async (req, res, next) => {
    try {
      const code = req.params.code.toUpperCase();
      const { memberId } = z.object({ memberId: z.string() }).parse(req.body);
      const session = await prisma.session.findUnique({ where: { code } });
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const outcome = await finishPicking(session.id, memberId);
      if ('error' in outcome) return res.status(400).json({ error: outcome.error });

      io.to(roomName(code)).emit('member:finished', { memberId });
      if (outcome.result === 'finalized') {
        io.to(roomName(code)).emit('session:finished', { matchedShow: outcome.matchedShow });
      }

      res.json(await getSessionState(code));
    } catch (e) {
      next(e);
    }
  });

  // Get session state
  r.get('/:code', async (req, res, next) => {
    try {
      const code = req.params.code.toUpperCase();
      const state = await getSessionState(code);
      if (!state) return res.status(404).json({ error: 'Session not found' });
      res.json(state);
    } catch (e) {
      next(e);
    }
  });

  // Host starts picking (fetches first deck)
  r.post('/:code/start', async (req, res, next) => {
    try {
      const code = req.params.code.toUpperCase();
      const { memberId } = z.object({ memberId: z.string() }).parse(req.body);
      const session = await prisma.session.findUnique({
        where: { code },
        include: { members: true },
      });
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const member = session.members.find((m) => m.id === memberId);
      if (!member?.isHost) return res.status(403).json({ error: 'Only the host can start' });
      if (session.status !== 'lobby') return res.status(400).json({ error: 'Already started' });

      const { shows, hasMore, nextCursor } = await searchShows(
        session.filters as unknown as Filters
      );
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'picking', deck: shows as any, hasMore, nextCursor: nextCursor ?? null },
      });

      const state = await getSessionState(code);
      io.to(roomName(code)).emit('session:started', state);
      res.json(state);
    } catch (e) {
      next(e);
    }
  });

  // Extend the deck with the next page
  r.post('/:code/deck', async (req, res, next) => {
    try {
      const code = req.params.code.toUpperCase();
      const session = await prisma.session.findUnique({ where: { code } });
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'picking' || !session.hasMore || !session.nextCursor) {
        return res.json({ shows: [], hasMore: false, nextCursor: null });
      }
      if (deckInFlight.has(code)) {
        return res.json({ shows: [], hasMore: session.hasMore, nextCursor: session.nextCursor });
      }

      deckInFlight.add(code);
      try {
        const { shows, hasMore, nextCursor } = await searchShows(
          session.filters as unknown as Filters,
          session.nextCursor
        );
        const deck = [...(session.deck as any[]), ...shows];
        await prisma.session.update({
          where: { id: session.id },
          data: { deck, hasMore, nextCursor: nextCursor ?? null },
        });

        io.to(roomName(code)).emit('deck:extended', {
          shows,
          hasMore,
          nextCursor: nextCursor ?? null,
        });
        res.json({ shows, hasMore, nextCursor: nextCursor ?? null });
      } finally {
        deckInFlight.delete(code);
      }
    } catch (e) {
      next(e);
    }
  });

  return r;
}
