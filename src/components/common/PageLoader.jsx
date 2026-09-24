/** `minHeight` centers it inside a short, shrink-wrapped container (e.g. a settings panel that
 *  doesn't itself stretch to fill the page) instead of collapsing to the spinner's own size. */
function PageLoader({ minHeight } = {}) {
  return (
    <div className="d-flex align-items-center justify-content-center py-9" style={minHeight ? { minHeight } : undefined}>
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
}

export default PageLoader;
