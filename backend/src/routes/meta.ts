import { Router } from 'express';
import { getCountries, getGenres } from '../motn';

export function buildMetaRouter() {
  const r = Router();

  r.get('/countries', async (_req, res, next) => {
    try {
      const data = await getCountries();
      const result = Object.entries(data).map(([code, c]) => ({
        code,
        name: c.name,
        services: (c.services ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          logo: s.imageSet?.darkThemeImage ?? s.imageSet?.lightThemeImage ?? '',
          streamingOptionTypes: s.streamingOptionTypes ?? {},
        })),
      }));
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  r.get('/genres', async (_req, res, next) => {
    try {
      res.json(await getGenres());
    } catch (e) {
      next(e);
    }
  });

  return r;
}
