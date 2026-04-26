import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from './db/pool.js';
import type { Env } from './config/env.js';
import type { Logger } from './obs/logger.js';
import { httpDuration, httpRequests, registry } from './obs/metrics.js';
import { chatRoutes } from './routes/chat.js';
import { sessionRoutes } from './routes/sessions.js';
import { evalRoutes } from './routes/evals.js';

export interface AppContext {
  env: Env;
  logger: Logger;
  pool: Pool;
  anthropic: Anthropic;
}

export function createAnthropic(env: Env): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export function createApp(ctx: AppContext): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger: ctx.logger }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const stop = httpDuration.startTimer();
    res.on('finish', () => {
      const labels = {
        route: req.route?.path ?? req.path,
        method: req.method,
        status: String(res.statusCode),
      };
      httpRequests.inc(labels);
      stop(labels);
    });
    next();
  });

  app.get('/healthz', async (_req, res) => {
    try {
      await ctx.pool.query('SELECT 1');
      res.json({ status: 'ok', service: 'agentforge' });
    } catch (err) {
      ctx.logger.error({ err }, 'healthz database check failed');
      res.status(503).json({ status: 'degraded', reason: 'database_unreachable' });
    }
  });

  app.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  app.use('/v1/chat', chatRoutes(ctx));
  app.use('/v1/sessions', sessionRoutes(ctx));
  app.use('/v1/evals', evalRoutes(ctx));

  app.use(express.static('public'));

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'unknown error';
    ctx.logger.error({ err, path: req.path }, 'unhandled error');
    if (res.headersSent) return;
    res.status(500).json({ error: 'internal_error', message });
  });

  return app;
}
