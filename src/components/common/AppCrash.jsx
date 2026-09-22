// Last line of defence, shown when something outside a page breaks (the app shell itself).
// Deliberately plain: no translations, store or router, so it can never fail the same way.
function AppCrash({ onRetry }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: '#5c6178', marginBottom: 20 }}>The app hit an unexpected problem. Your saved data is safe — reloading usually fixes it.</p>
        <button
          type="button"
          onClick={() => (onRetry ? onRetry() : window.location.reload())}
          style={{ padding: '10px 20px', borderRadius: 8, border: 0, background: '#4f46e5', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

export default AppCrash;
