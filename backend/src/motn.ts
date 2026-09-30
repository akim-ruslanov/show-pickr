import { config } from './config';
import { cacheGet, cacheSet } from './cache';
import type { Filters, ServiceOption, ShowSummary, ShowType } from './types';

interface MotnService {
  id: string;
  name: string;
  imageSet?: {
    lightThemeImage?: string;
    darkThemeImage?: string;
    whiteImage?: string;
  };
  streamingOptionTypes?: Record<string, boolean>;
}

interface MotnCountry {
  countryCode: string;
  name: string;
  services: MotnService[];
}

interface MotnGenre {
  id: string;
  name: string;
}

interface SearchResult {
  shows: ShowSummary[];
  hasMore: boolean;
  nextCursor?: string;
}

let countriesCache: { data: Record<string, MotnCountry>; ts: number } | null = null;
let genresCache: { data: MotnGenre[]; ts: number } | null = null;

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

async function motnGet(path: string, params: Record<string, string | undefined>): Promise<any> {
  const url = new URL(config.motnBaseUrl + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }

  const cacheKey = buildCacheKey(path, params);
  const cached = cacheGet<any>(cacheKey);
  if (cached) return cached;

  const res = await fetch(url.toString(), {
    headers: { 'X-API-Key': config.motnApiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MovieOfTheNight API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  cacheSet(cacheKey, data);
  return data;
}

function buildCacheKey(path: string, params: Record<string, string | undefined>): string {
  const qs = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `${path}?${qs}`;
}

export async function getCountries(): Promise<Record<string, MotnCountry>> {
  if (countriesCache && Date.now() - countriesCache.ts < CACHE_TTL) return countriesCache.data;
  const data = await motnGet('/countries', { output_language: 'en' });
  countriesCache = { data, ts: Date.now() };
  return data;
}

export async function getGenres(): Promise<MotnGenre[]> {
  if (genresCache && Date.now() - genresCache.ts < CACHE_TTL) return genresCache.data;
  const data = await motnGet('/genres', { output_language: 'en' });

  let list: MotnGenre[] = [];
  const raw = data?.result ?? data?.genres ?? data;
  if (Array.isArray(raw)) {
    list = raw.map((g: any) =>
      typeof g === 'string' ? { id: g, name: g } : { id: String(g.id), name: String(g.name) }
    );
  } else if (raw && typeof raw === 'object') {
    list = Object.entries(raw).map(([id, name]) => ({ id, name: String(name) }));
  }
  genresCache = { data: list, ts: Date.now() };
  return list;
}

export async function searchShows(filters: Filters, cursor?: string): Promise<SearchResult> {
  const catalogs = filters.catalogs.filter(Boolean);
  const genres = filters.genres.filter(Boolean);

  const params: Record<string, string | undefined> = {
    country: filters.country,
    show_type: filters.showType,
    output_language: 'en',
    order_by: 'popularity_1year',
    order_direction: 'desc',
    cursor,
  };
  if (catalogs.length) params.catalogs = catalogs.join(',');
  if (genres.length) {
    params.genres = genres.join(',');
    params.genres_relation = filters.genresRelation ?? 'and';
  }
  if (filters.keyword) params.keyword = filters.keyword;

  const data = await motnGet('/shows/search/filters', params);
  const shows: ShowSummary[] = (data.shows ?? []).map((s: any) => mapShow(s, filters));
  return { shows, hasMore: !!data.hasMore, nextCursor: data.nextCursor };
}

function mapShow(s: any, filters: Filters): ShowSummary {
  const isMovie = s.showType === 'movie';
  const allowed = new Set(filters.catalogs.filter(Boolean));
  const services: ServiceOption[] = [];

  const options = s.streamingOptions?.[filters.country] ?? [];
  for (const o of options) {
    const serviceId = o.service?.id;
    if (allowed.size > 0 && !allowed.has(serviceId)) continue;
    const img = o.service?.imageSet ?? {};
    services.push({
      serviceId,
      name: o.service?.name ?? serviceId ?? '',
      logo: img.darkThemeImage ?? img.lightThemeImage ?? img.whiteImage ?? '',
      type: o.type,
      link: o.link,
      quality: o.quality,
    });
  }

  return {
    id: s.id,
    imdbId: s.imdbId,
    tmdbId: s.tmdbId,
    title: s.title,
    overview: s.overview,
    releaseYear: isMovie ? s.releaseYear : s.firstAirYear,
    rating: s.rating,
    genres: s.genres ?? [],
    poster:
      s.imageSet?.verticalPoster?.w480 ??
      s.imageSet?.verticalPoster?.w600 ??
      s.imageSet?.verticalPoster?.w360,
    backdrop:
      s.imageSet?.horizontalBackdrop?.w720 ?? s.imageSet?.horizontalPoster?.w720,
    showType: s.showType as ShowType,
    services,
  };
}
