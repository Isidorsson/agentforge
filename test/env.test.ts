import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const ORIGINAL_ENV = process.env;

describe('env loader', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.DATABASE_URL = 'postgres://x:y@localhost:5432/z';
    expect(() => loadEnv()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws when DATABASE_URL is not a URL', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.DATABASE_URL = 'not-a-url';
    expect(() => loadEnv()).toThrow(/DATABASE_URL/);
  });

  it('applies defaults', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.DATABASE_URL = 'postgres://x:y@localhost:5432/z';
    delete process.env.PORT;
    delete process.env.LOG_LEVEL;
    const env = loadEnv();
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces PORT from string', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.DATABASE_URL = 'postgres://x:y@localhost:5432/z';
    process.env.PORT = '8080';
    expect(loadEnv().PORT).toBe(8080);
  });
});
