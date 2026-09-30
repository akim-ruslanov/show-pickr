import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config';
import { buildMetaRouter } from './routes/meta';
import { buildSessionsRouter } from './routes/sessions';
import { setupSocket } from './socket';

function main() {
  const app = express();

  const corsOrigin = config.corsOrigins.includes('*') ? true : config.corsOrigins;
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
      credentials: true,
    },
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/meta', buildMetaRouter());
  app.use('/api/sessions', buildSessionsRouter(io));

  // Central error handler
  app.use(
    (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(err);
      res.status(400).json({ error: err?.message ?? 'Bad request' });
    }
  );

  setupSocket(io);

  server.listen(config.port, () => {
    console.log(`ShowPickr API + Socket.io listening on :${config.port}`);
  });
}

main();
