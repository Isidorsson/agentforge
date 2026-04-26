import pg from 'pg';
import type { Env } from '../config/env.js';

export function createPool(env: Env): pg.Pool {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === 'production' ? 20 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    process.stderr.write(`Unexpected pg pool error: ${err.message}\n`);
  });

  return pool;
}

export type Pool = pg.Pool;
