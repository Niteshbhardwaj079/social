/** An error we chose to show the client. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = 'Invalid request', details) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Please sign in') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to do that') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (message = 'Conflict') => new HttpError(409, 'conflict', message);
export const organizationSuspended = () =>
  new HttpError(403, 'organization_suspended', 'This workspace has been suspended. Please contact support.');
/** The organization's plan does not include this, or it has used up its plan's limit. `details` says which. */
export const planLimit = (message, details) => new HttpError(403, 'plan_limit', message, details);
export const tooManyRequests =(message = 'Too many attempts, try again later') =>
  new HttpError(429, 'too_many_requests', message);
