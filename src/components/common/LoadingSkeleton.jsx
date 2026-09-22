export function SkeletonText({ size = 'md' }) {
  return <span className={`skeleton skeleton-text skeleton-text--${size}`} />;
}

export function SkeletonCircle({ diameter = 40 }) {
  return (
    <span
      className="skeleton skeleton-circle"
      style={{ '--skeleton-diameter': `${diameter}px`, width: diameter, height: diameter }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <SkeletonText size="sm" />
      <SkeletonText size="lg" />
      <SkeletonText size="md" />
    </div>
  );
}

export function SkeletonKpiRow({ count = 4 }) {
  return (
    <div className="kpi-grid">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((__, colIndex) => (
                <td key={colIndex}>
                  <SkeletonText size="md" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
