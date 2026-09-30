import type {
  CountryMeta,
  Filters,
  GenreMeta,
  MemberView,
  SessionState,
  ShowSummary,
} from './types';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  countries: () => request<CountryMeta[]>('/api/meta/countries'),
  genres: () => request<GenreMeta[]>('/api/meta/genres'),
  createSession: (name: string, filters: Filters, groupSize: number) =>
    request<{ code: string; member: MemberView; state: SessionState }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name, filters, groupSize }),
    }),
  joinSession: (code: string, name: string) =>
    request<{ code: string; member: MemberView; state: SessionState }>(
      `/api/sessions/${encodeURIComponent(code)}/join`,
      { method: 'POST', body: JSON.stringify({ name }) }
    ),
  getSession: (code: string) =>
    request<SessionState>(`/api/sessions/${encodeURIComponent(code)}`),
  startSession: (code: string, memberId: string) =>
    request<SessionState>(`/api/sessions/${encodeURIComponent(code)}/start`, {
      method: 'POST',
      body: JSON.stringify({ memberId }),
    }),
  finishSession: (code: string, memberId: string) =>
    request<SessionState>(`/api/sessions/${encodeURIComponent(code)}/finish`, {
      method: 'POST',
      body: JSON.stringify({ memberId }),
    }),
  extendDeck: (code: string) =>
    request<{ shows: ShowSummary[]; hasMore: boolean; nextCursor: string | null }>(
      `/api/sessions/${encodeURIComponent(code)}/deck`,
      { method: 'POST', body: '{}' }
    ),
};
