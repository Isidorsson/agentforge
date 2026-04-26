import { Router } from 'express';
import type { AppContext } from '../app.js';
import { runEvalSuite } from '../agent/evals.js';

export function evalRoutes(ctx: AppContext): Router {
  const router = Router();

  router.post('/run', async (_req, res) => {
    try {
      const report = await runEvalSuite(ctx);
      res.json(report);
    } catch (err) {
      ctx.logger.error({ err }, 'eval run failed');
      res
        .status(500)
        .json({ error: 'eval_failed', message: err instanceof Error ? err.message : 'unknown' });
    }
  });

  return router;
}
