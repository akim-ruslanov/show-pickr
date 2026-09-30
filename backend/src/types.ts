export type ShowType = 'movie' | 'series';
export type SwipeDirection = 'yes' | 'no';
export type SessionStatus = 'lobby' | 'picking' | 'matched';

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
  type: string; // subscription | rent | buy | free | addon
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
