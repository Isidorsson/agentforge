import { loadEnv } from './config/env.js';
import { createLogger } from './obs/logger.js';
import { createPool } from './db/pool.js';
import { createAnthropic, createApp, type AppContext } from './app.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);
  const pool = createPool(env);
  const anthropic = createAnthropic(env);

  await pool.query('SELECT 1');
  logger.info({ database: 'connected' }, 'pool ready');

  const ctx: AppContext = { env, logger, pool, anthropic };
  const app = createApp(ctx);

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'agentforge listening');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown initiated');

    server.close((err) => {
      if (err) logger.error({ err }, 'http server close failed');
    });

    const deadline = setTimeout(() => {
      logger.warn('forcing exit after 10s shutdown deadline');
      process.exit(1);
    }, 10_000);
    deadline.unref();

    try {
      await pool.end();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    void shutdown('uncaughtException');
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`startup failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
