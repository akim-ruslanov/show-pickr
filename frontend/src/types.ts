export type ShowType = 'movie' | 'series';
export type SwipeDirection = 'yes' | 'no';
export type SessionStatus = 'lobby' | 'picking' | 'matched' | 'no-match';

export interface Filters {
  country: string;
  catalogs: string[];
  showType: ShowType;
  genres: string[];
  genresRelation: 'and' | 'or';
  keyword?: string;
}

export interface ServiceOption {
  serviceId: string;
  name: string;
  logo: string;
  type: string;
  link?: string;
  quality?: string;
}

export interface ShowSummary {
  id: string;
  imdbId?: string;
  tmdbId?: string;
  title: string;
  overview?: string;
  releaseYear?: number;
  rating?: number;
  genres: { id: string; name: string }[];
  poster?: string;
  backdrop?: string;
  showType: ShowType;
  services: ServiceOption[];
}

export interface MemberView {
  id: string;
  name: string;
  isHost: boolean;
  finished: boolean;
}

export interface SwipeView {
  memberId: string;
  showId: string;
  direction: SwipeDirection;
}

export interface SessionState {
  code: string;
  status: SessionStatus;
  filters: Filters;
  groupSize: number;
  deck: ShowSummary[];
  swipes: SwipeView[];
  members: MemberView[];
  matchedShow: ShowSummary | null;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface CountryService {
  id: string;
  name: string;
  logo: string;
  streamingOptionTypes: Record<string, boolean>;
}

export interface CountryMeta {
  code: string;
  name: string;
  services: CountryService[];
}

export interface GenreMeta {
  id: string;
  name: string;
}
