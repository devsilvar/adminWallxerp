import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './lib/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function start(): void {
  // Throws on a bad environment. Better to fail the deploy than to run with a
  // silently defaulted rate limit or a missing database URL.
  const config = loadConfig();
  const app = createApp(config);

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'external-api listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');

    server.close((err) => {
      if (err) {
        logger.error({ err }, 'error while closing the server');
        process.exit(1);
      }

      process.exit(0);
    });

    // Keep-alive connections can pin the process past the platform's grace period.
    setTimeout(() => {
      logger.warn({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown timed out, exiting forcibly');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => shutdown(signal));
  }

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandled rejection');
  });
}

try {
  start();
} catch (err) {
  logger.error({ err }, 'failed to start');
  process.exit(1);
}
