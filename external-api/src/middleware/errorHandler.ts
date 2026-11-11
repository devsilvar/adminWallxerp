import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, errorEnvelope } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** Terminal handler: anything that reached here matched no route. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(errorEnvelope('NOT_FOUND', 'Resource not found', req.id));
};

type BodyParserError = Error & { type?: string };

const isBodyParserError = (err: unknown): err is BodyParserError =>
  err instanceof Error && 'type' in err;

/**
 * Every failure leaves as the envelope of plan §7.2, carrying the request id so
 * a partner can quote one line to support instead of a timestamp.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // A partially streamed response cannot be replaced by an envelope.
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, requestId: req.id, code: err.code }, err.message);
    } else {
      logger.warn({ requestId: req.id, code: err.code }, err.message);
    }

    res.status(err.status).json(errorEnvelope(err.code, err.message, req.id, err.details));
    return;
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      res
        .status(413)
        .json(errorEnvelope('PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MB', req.id));
      return;
    }

    if (err.type === 'entity.parse.failed') {
      res
        .status(400)
        .json(errorEnvelope('VALIDATION_FAILED', 'Request body is not valid JSON', req.id));
      return;
    }
  }

  // The message is never echoed: internals stay in the log, keyed by request id.
  logger.error({ err, requestId: req.id }, 'unhandled error');
  res.status(500).json(errorEnvelope('INTERNAL', 'An unexpected error occurred', req.id));
};
