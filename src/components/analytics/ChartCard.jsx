function ChartCard({ title, actions, children }) {
  return (
    <div className="panel-card">
      <div className="panel-card__header">
        <h3 className="panel-card__title">{title}</h3>
        {actions}
      </div>
      <div className="panel-card__body">{children}</div>
    </div>
  );
}

export default ChartCard;
