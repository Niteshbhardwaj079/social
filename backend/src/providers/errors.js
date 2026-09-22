/**
 * Why a platform check failed, in words the client can act on.
 *   auth        the platform refused the credentials (wrong, expired, revoked, missing permission)
 *   rejected    the platform answered but the request cannot work (wrong id, no channel, ...)
 *   unreachable the platform could not be reached or is busy — the credentials may be fine
 */
export class ProviderError extends Error {
  constructor(kind, message, reason) {
    super(message);
    this.kind = kind;
    // Only meaningful when kind === 'auth': the social account status it should become. Most platforms
    // answer "invalid token" without saying whether it expired or was revoked (Google's invalid_grant and
    // Meta's error code 190 both cover either case, by their own documentation) — 'auth_error' is the
    // honest default for that ambiguity. Only http.js's generic 401/403 handler sets a more specific one,
    // and only when the platform's own error text actually says so.
    this.reason = reason || 'auth_error';
  }
}

export const authFailure = (message, reason) => new ProviderError('auth', message, reason);
export const rejection = (message) => new ProviderError('rejected', message);
export const unreachable = (message) => new ProviderError('unreachable', message);
