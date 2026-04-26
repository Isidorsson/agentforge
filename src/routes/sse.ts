import type { Response } from 'express';

export function openSseStream(res: Response): {
  send: (event: string, data: unknown) => void;
  close: () => void;
} {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': keep-alive\n\n');
  }, 15_000);
  heartbeat.unref();

  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      res.end();
    },
  };
}
