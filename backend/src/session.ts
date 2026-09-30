import { prisma } from './db';
import type { Member, Session, Swipe } from '@prisma/client';
import type { SwipeDirection } from './types';

export const roomName = (code: string) => `session:${code}`;

type SessionWithRelations = Session & { members: Member[]; swipes: Swipe[] };

export function serializeSession(s: SessionWithRelations) {
  return {
    code: s.code,
    status: s.status,
    filters: s.filters,
    groupSize: s.groupSize,
    deck: s.deck,
    hasMore: s.hasMore,
    nextCursor: s.nextCursor,
    matchedShow: s.matchedShow,
    members: s.members.map((m) => ({
      id: m.id,
      name: m.name,
      isHost: m.isHost,
      finished: m.finished,
    })),
    swipes: s.swipes.map((sw) => ({
      memberId: sw.memberId,
      showId: sw.showId,
      direction: sw.direction as SwipeDirection,
    })),
  };
}

export async function getSessionState(code: string) {
  const s = await prisma.session.findUnique({
    where: { code },
    include: { members: true, swipes: true },
  });
  return s ? serializeSession(s) : null;
}

export type RecordOutcome = { error: string } | { result: 'recorded' };

export async function recordSwipe(
  sessionId: string,
  memberId: string,
  showId: string,
  direction: SwipeDirection
): Promise<RecordOutcome> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { members: true },
  });
  if (!session) return { error: 'Session not found' };
  if (session.status !== 'picking') return { error: 'This session is not picking' };

  const member = session.members.find((m) => m.id === memberId);
  if (!member) return { error: 'You are not a member of this session' };
  if (member.finished) return { error: 'You already finished picking' };

  await prisma.swipe.upsert({
    where: { sessionId_memberId_showId: { sessionId, memberId, showId } },
    update: { direction },
    create: { sessionId, memberId, showId, direction },
  });

  return { result: 'recorded' };
}

export type FinishOutcome =
  | { error: string }
  | { result: 'waiting'; finishedCount: number; groupSize: number }
  | { result: 'finalized'; matchedShow: any };

export async function finishPicking(
  sessionId: string,
  memberId: string
): Promise<FinishOutcome> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { members: true },
  });
  if (!session) return { error: 'Session not found' };
  if (session.status !== 'picking') return { error: 'This session is not picking' };

  const member = session.members.find((m) => m.id === memberId);
  if (!member) return { error: 'You are not a member of this session' };

  if (!member.finished) {
    await prisma.member.update({ where: { id: memberId }, data: { finished: true } });
  }

  const members = await prisma.member.findMany({ where: { sessionId } });
  const finishedCount = members.filter((m) => m.finished).length;
  const groupSize = session.groupSize;

  if (groupSize > 0 && finishedCount >= groupSize) {
    const finalized = await finalizeSession(sessionId);
    return { result: 'finalized', matchedShow: finalized.matchedShow };
  }

  return { result: 'waiting', finishedCount, groupSize };
}

export async function finalizeSession(sessionId: string): Promise<{ matchedShow: any }> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { members: true, swipes: true },
  });
  if (!session) throw new Error('Session not found');

  const memberIds = new Set(session.members.map((m) => m.id));

  // Count "yes" votes per show (only from current members).
  const yesCount: Record<string, number> = {};
  for (const sw of session.swipes) {
    if (sw.direction === 'yes' && memberIds.has(sw.memberId)) {
      yesCount[sw.showId] = (yesCount[sw.showId] ?? 0) + 1;
    }
  }

  const threshold = session.groupSize;
  const deck = (session.deck as any[]) ?? [];

  // Rank: most votes, then highest rating, then deck order.
  const candidates = deck
    .map((show, index) => ({
      show,
      index,
      votes: yesCount[show.id] ?? 0,
      rating: show.rating ?? 0,
    }))
    .filter((c) => threshold > 0 && c.votes >= threshold)
    .sort((a, b) => b.votes - a.votes || b.rating - a.rating || a.index - b.index);

  const winner = candidates[0]?.show ?? null;

  await prisma.session.update({
    where: { id: sessionId },
    data: { status: winner ? 'matched' : 'no-match', matchedShow: winner ?? null },
  });

  return { matchedShow: winner };
}
