import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { api } from './api';
import { connectSocket } from './socket';
import type { MemberView, SessionState, SwipeDirection } from './types';

interface SessionContextValue {
  state: SessionState | null;
  me: MemberView | null;
  connected: boolean;
  error: string | null;
  swipe: (showId: string, direction: SwipeDirection) => void;
  start: () => Promise<void>;
  finish: () => Promise<void>;
  join: (name: string) => Promise<void>;
  extendDeck: () => Promise<void>;
}

const Ctx = createContext<SessionContextValue | null>(null);

export function useSession() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession must be used within a SessionProvider');
  return value;
}

function storageKey(code: string) {
  return `showpickr:${code}`;
}

function applySwipe(
  prev: SessionState,
  p: { memberId: string; showId: string; direction: SwipeDirection }
): SessionState {
  const swipes = prev.swipes.filter(
    (s) => !(s.memberId === p.memberId && s.showId === p.showId)
  );
  return {
    ...prev,
    swipes: [...swipes, { memberId: p.memberId, showId: p.showId, direction: p.direction }],
  };
}

export function SessionProvider({ code, children }: { code: string; children: ReactNode }) {
  const [state, setState] = useState<SessionState | null>(null);
  const [me, setMe] = useState<MemberView | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey(code));
      return raw ? (JSON.parse(raw) as MemberView) : null;
    } catch {
      return null;
    }
  });
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const extendingRef = useRef(false);

  const persistMe = useCallback(
    (m: MemberView) => {
      localStorage.setItem(storageKey(code), JSON.stringify(m));
      setMe(m);
    },
    [code]
  );

  useEffect(() => {
    if (!me) return;
    const socket = connectSocket(code, me.id);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('session:state', (s: SessionState) => setState(s));
    socket.on('member:joined', () => {
      api.getSession(code).then(setState).catch(() => {});
    });
    socket.on('member:finished', () => {
      api.getSession(code).then(setState).catch(() => {});
    });
    socket.on('session:finished', () => {
      api.getSession(code).then(setState).catch(() => {});
    });
    socket.on('swipe:recorded', (p) => setState((prev) => (prev ? applySwipe(prev, p) : prev)));
    socket.on('session:started', (s: SessionState) => setState(s));
    socket.on('deck:extended', (p) =>
      setState((prev) =>
        prev
          ? { ...prev, deck: [...prev.deck, ...p.shows], hasMore: p.hasMore, nextCursor: p.nextCursor }
          : prev
      )
    );
    socket.on('error', (msg: string) => setError(String(msg)));

    api.getSession(code).then(setState).catch((e) => setError(e.message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, me?.id]);

  // Keep the persisted "me" in sync with the authoritative session state so that
  // `me.finished` flips to true after "Done picking" (and stays accurate across
  // socket updates and reconnects).
  useEffect(() => {
    if (!state || !me) return;
    const mine = state.members.find((m) => m.id === me.id);
    if (
      mine &&
      (mine.finished !== me.finished ||
        mine.name !== me.name ||
        mine.isHost !== me.isHost)
    ) {
      persistMe({ id: me.id, name: mine.name, isHost: mine.isHost, finished: mine.finished });
    }
  }, [state, me, persistMe]);

  const swipe = useCallback((showId: string, direction: SwipeDirection) => {
    socketRef.current?.emit('swipe', { showId, direction });
  }, []);

  const start = useCallback(async () => {
    if (!me) return;
    setError(null);
    try {
      const s = await api.startSession(code, me.id);
      setState(s);
    } catch (e: any) {
      setError(e.message);
    }
  }, [code, me]);

  const finish = useCallback(async () => {
    if (!me) return;
    setError(null);
    try {
      const s = await api.finishSession(code, me.id);
      setState(s);
    } catch (e: any) {
      setError(e.message);
    }
  }, [code, me]);

  const join = useCallback(
    async (name: string) => {
      setError(null);
      try {
        const res = await api.joinSession(code, name.trim());
        persistMe(res.member);
        setState(res.state);
      } catch (e: any) {
        setError(e.message);
      }
    },
    [code, persistMe]
  );

  const extendDeck = useCallback(async () => {
    if (extendingRef.current) return;
    extendingRef.current = true;
    try {
      await api.extendDeck(code);
    } catch (e: any) {
      setError(e.message);
    } finally {
      extendingRef.current = false;
    }
  }, [code]);

  return (
    <Ctx.Provider
      value={{ state, me, connected, error, swipe, start, finish, join, extendDeck }}
    >
      {children}
    </Ctx.Provider>
  );
}
