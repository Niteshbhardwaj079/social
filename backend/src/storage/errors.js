/** Same shape as providers/errors.js's ProviderError, for storage: 'auth' | 'rejected' | 'unreachable'. */
export class StorageError extends Error {
  constructor(message, kind = 'rejected') {
    super(message);
    this.kind = kind;
  }
}
