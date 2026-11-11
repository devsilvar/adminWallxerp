import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import { requestId } from './middleware/requestId.js';
import { requireApiEnabled } from './middleware/requireApiEnabled.js';
import { healthRouter } from './routes/health.routes.js';

export function createApp(config: Config): Express {
  const app = express();

  app.disable('x-powered-by');

  // Must precede any IP-reading middleware (the rate limiter arrives in Phase 2),
  // or every caller is attributed to the proxy's address.
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(helmet());

  // Before the body parser: a malformed payload must still come back with an id.
  app.use(requestId);
  app.use(requestLogger);

  // 1 MB. This surface carries a handful of rows per request and never a bulk
  // import, so a large body is a mistake or an attack, not a use case.
  app.use(express.json({ limit: '1mb' }));

  // Ahead of the kill switch: a disabled API must still answer its health probe.
  app.use(healthRouter);

  app.use('/api', requireApiEnabled(config));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
