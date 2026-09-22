import { Component } from 'react';

// A lazily loaded page can fail to download (offline, or a new deploy replaced the old
// files). React caches that failure, so "try again" must reload the page to actually recover.
function isChunkLoadError(error) {
  const message = String(error?.message || error);
  return /dynamically imported module|Loading chunk|Failed to fetch|Importing a module script failed/i.test(message);
}

/**
 * Catches a crash while rendering its children and shows `fallback` instead of a blank
 * screen. Whenever `resetKey` changes (for example a route change) it tries again on its own.
 *
 *   <ErrorBoundary resetKey={pathname} fallback={({ reset }) => <Oops onRetry={reset} />}>
 */
class ErrorBoundary extends Component {
  state = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error) {
    return { error };
  }

  // A new resetKey (for example another route) clears the error so the next page gets a fresh try.
  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  reset = () => {
    if (isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) return this.props.fallback({ error: this.state.error, reset: this.reset });
    return this.props.children;
  }
}

export default ErrorBoundary;
