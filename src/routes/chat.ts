import { Router } from 'express';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { AppContext } from '../app.js';
import { runAgent } from '../agent/loop.js';
import { openSseStream } from './sse.js';
import {
  appendMessage,
  createSession,
  getSession,
  listMessages,
  rowsToMessageParams,
} from '../db/sessions.js';

const ChatRequest = z.object({
  session_id: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
});

export function chatRoutes(ctx: AppContext): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = ChatRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const { session_id, message } = parsed.data;

    const session = session_id
      ? await getSession(ctx.pool, session_id)
      : await createSession(ctx.pool, message.slice(0, 80));
    if (!session) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    await appendMessage(ctx.pool, session.id, 'user', message);

    const history = await listMessages(ctx.pool, session.id);
    const messages = rowsToMessageParams(history);

    const sse = openSseStream(res);
    sse.send('session', { id: session.id });

    const abort = new AbortController();
    req.on('close', () => abort.abort());

    let assistantText = '';
    let lastUsage: Anthropic.Usage | null = null;

    try {
      for await (const event of runAgent({
        anthropic: ctx.anthropic,
        model: ctx.env.ANTHROPIC_MODEL,
        maxIterations: ctx.env.MAX_AGENT_ITERATIONS,
        messages,
        signal: abort.signal,
        log: (e, data) => ctx.logger.debug({ event: e, ...data }, 'agent'),
      })) {
        sse.send(event.type, event);
        if (event.type === 'text_delta') assistantText += event.text;
        if (event.type === 'usage') lastUsage = event.usage;
      }

      if (assistantText.length > 0) {
        await appendMessage(
          ctx.pool,
          session.id,
          'assistant',
          [{ type: 'text', text: assistantText }],
          lastUsage?.input_tokens ?? undefined,
          lastUsage?.output_tokens ?? undefined,
        );
      }
    } catch (err) {
      ctx.logger.error({ err, sessionId: session.id }, 'agent run failed');
      sse.send('error', { message: err instanceof Error ? err.message : 'unknown error' });
    } finally {
      sse.close();
    }
  });

  return router;
}
