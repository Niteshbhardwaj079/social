function PageLoader() {
  return (
    <div className="d-flex align-items-center justify-content-center py-9">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
}

export default PageLoader;
