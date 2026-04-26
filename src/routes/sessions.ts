import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { createSession, getSession, listMessages } from '../db/sessions.js';

const CreateSession = z.object({
  title: z.string().min(1).max(200).optional(),
});

const SessionParams = z.object({
  id: z.string().uuid(),
});

export function sessionRoutes(ctx: AppContext): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = CreateSession.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const session = await createSession(ctx.pool, parsed.data.title);
    res.status(201).json(session);
  });

  router.get('/:id', async (req, res) => {
    const parsed = SessionParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_session_id' });
      return;
    }

    const session = await getSession(ctx.pool, parsed.data.id);
    if (!session) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const messages = await listMessages(ctx.pool, session.id);
    res.json({ session, messages });
  });

  return router;
}
