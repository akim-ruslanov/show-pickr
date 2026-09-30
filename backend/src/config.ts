import 'dotenv/config';
import path from 'path';

const env = process.env;

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === '1' || value === 'true';
}

export const config = {
  port: Number(env.PORT ?? 4000),
  motnApiKey: env.MOTN_API_KEY ?? '',
  motnBaseUrl: env.MOTN_BASE_URL ?? 'https://api.movieofthenight.com/v4',
  corsOrigins: (env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // On by default in development, off in production unless explicitly enabled.
  motnCacheEnabled: boolFromEnv(env.MOTN_CACHE, env.NODE_ENV !== 'production'),
  motnCacheDir: env.MOTN_CACHE_DIR ?? path.join(process.cwd(), '.cache'),
  motnCacheTtlSeconds: Number(env.MOTN_CACHE_TTL_SECONDS ?? 604800), // 7 days
};
