// Last line of defence, shown when something outside a page breaks (the app shell itself).
// Deliberately self-contained: no translations, store, router or icon library import, so it
// can never fail the same way something upstream just did (including a broken asset pipeline).
function AppCrash({ onRetry }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        textAlign: 'center',
        background: '#f8f9fc',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 16, padding: '40px 32px', boxShadow: '0 10px 40px rgba(17, 24, 39, 0.08)' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(79, 70, 229, 0.1)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 20px',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>Something went wrong</h1>
        <p style={{ color: '#5c6178', margin: '0 0 24px', lineHeight: 1.5 }}>
          The app hit an unexpected problem. Your saved data is safe — reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => (onRetry ? onRetry() : window.location.reload())}
          style={{ padding: '11px 24px', borderRadius: 8, border: 0, background: '#4f46e5', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

export default AppCrash;
