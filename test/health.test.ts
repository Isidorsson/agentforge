import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';
import { createApp, type AppContext } from '../src/app.js';
import pino from 'pino';

function fakeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return {
    env: {
      NODE_ENV: 'test',
      PORT: 0,
      LOG_LEVEL: 'silent',
      ANTHROPIC_API_KEY: 'sk-test',
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      DATABASE_URL: 'postgres://x:y@localhost:5432/z',
      MAX_AGENT_ITERATIONS: 8,
    },
    logger: pino({ level: 'silent' }),
    pool: { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) } as never,
    anthropic: new Anthropic({ apiKey: 'sk-test' }),
    ...overrides,
  };
}

describe('healthz', () => {
  it('returns ok when database is reachable', async () => {
    const app = createApp(fakeCtx());
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'agentforge' });
  });

  it('returns 503 when database fails', async () => {
    const ctx = fakeCtx({
      pool: { query: vi.fn().mockRejectedValue(new Error('boom')) } as never,
    });
    const app = createApp(ctx);
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
  });
});

describe('metrics', () => {
  it('exposes prometheus text format', async () => {
    const app = createApp(fakeCtx());
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('agentforge_http_requests_total');
  });
});

describe('chat validation', () => {
  it('rejects empty body', async () => {
    const app = createApp(fakeCtx());
    const res = await request(app).post('/v1/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('rejects oversized message', async () => {
    const app = createApp(fakeCtx());
    const res = await request(app)
      .post('/v1/chat')
      .send({ message: 'x'.repeat(8001) });
    expect(res.status).toBe(400);
  });
});
