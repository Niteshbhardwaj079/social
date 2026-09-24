/** Defaults to filling the viewport — this is used both while the whole app is still booting
 *  (ProtectedRoute/GuestRoute) and as the top-level route Suspense fallback (AppRoutes), and in
 *  both cases it is, at that moment, the ONLY thing on the page — no sidebar, no header, nothing
 *  above or below it to visually "center" against, so without an explicit height it collapses to
 *  the spinner's own size and sits pinned near the top of an otherwise blank page. Pass a smaller
 *  `minHeight` (e.g. "24rem") when centering inside a panel that already has real content around
 *  it, like a Settings page's own data-loading state. */
function PageLoader({ minHeight = '100vh' } = {}) {
  return (
    <div className="d-flex align-items-center justify-content-center py-9" style={{ minHeight }}>
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
}

export default PageLoader;
