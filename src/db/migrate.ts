import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { PoolClient } from 'pg';
import { loadEnv } from '../config/env.js';
import { createPool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedSet(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((r) => r.filename));
}

export async function runMigrations(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env);

  try {
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    if (files.length === 0) {
      process.stdout.write('No migrations found.\n');
      return;
    }

    const client = await pool.connect();
    try {
      await ensureMigrationsTable(client);
      const done = await appliedSet(client);

      for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(join(migrationsDir, file), 'utf8');
        process.stdout.write(`Applying ${file}...\n`);
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [file]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      }
      process.stdout.write('Migrations complete.\n');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

const isCli =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  runMigrations().catch((err: unknown) => {
    process.stderr.write(`Migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
