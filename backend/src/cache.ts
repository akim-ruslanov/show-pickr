import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from './config';

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

function fileFor(key: string): string {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(config.motnCacheDir, `${hash}.json`);
}

export function cacheGet<T>(key: string): T | null {
  if (!config.motnCacheEnabled) return null;
  try {
    const raw = fs.readFileSync(fileFor(key), 'utf8');
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry || typeof entry.expiresAt !== 'number' || entry.expiresAt < Date.now()) {
      return null;
    }
    return entry.value as T;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown): void {
  if (!config.motnCacheEnabled) return;
  try {
    fs.mkdirSync(config.motnCacheDir, { recursive: true });
    const entry: CacheEntry = {
      expiresAt: Date.now() + config.motnCacheTtlSeconds * 1000,
      value,
    };
    fs.writeFileSync(fileFor(key), JSON.stringify(entry));
  } catch {
    // Caching is best-effort; never let it break a request.
  }
}
