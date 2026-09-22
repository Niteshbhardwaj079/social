function TextField({ label, id, error, hint, className = '', ...inputProps }) {
  return (
    <div className={`mb-4 ${className}`.trim()}>
      {label ? (
        <label htmlFor={id} className="form-label-custom">
          {label}
        </label>
      ) : null}
      <input id={id} className={`form-control ${error ? 'is-invalid' : ''}`.trim()} {...inputProps} />
      {error ? <div className="form-error">{error}</div> : null}
      {!error && hint ? <div className="form-hint">{hint}</div> : null}
    </div>
  );
}

export default TextField;
