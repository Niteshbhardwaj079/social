import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

/**
 * The last stop for every error. Errors we raised on purpose (HttpError) are shown as they are;
 * everything else becomes a plain 500 with a request id — details go to the log, never to the
 * client, so a bug cannot leak internals and the process keeps serving other requests.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, _next) {
  if (res.headersSent) return;

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_request', message: 'The request body is not valid JSON' } });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'payload_too_large', message: 'The request is too large' } });
  }
  if (error?.code === '23505') {
    return res.status(409).json({ error: { code: 'conflict', message: 'That already exists' } });
  }

  logger.error('Unhandled error', error, { requestId: req.id, method: req.method, path: req.path });
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on our side', requestId: req.id } });
}
