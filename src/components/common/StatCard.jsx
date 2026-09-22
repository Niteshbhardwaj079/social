import Icon from './Icon';

// One number-at-a-glance card: coloured icon tile, label, big value and an
// optional small hint (a trend, a share...). Give it `onClick` and it becomes a
// button — used on list pages so a card doubles as a quick filter.
function StatCard({ icon, label, value, tone = 'primary', hint, onClick, isActive = false }) {
  const content = (
    <>
      <span className={`stat-card__icon stat-card__icon--${tone}`}>
        <Icon name={icon} size={22} />
      </span>
      <span className="stat-card__body">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__value">{value}</span>
        {hint ? <span className="stat-card__hint">{hint}</span> : null}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`stat-card is-clickable ${isActive ? 'is-active' : ''}`.trim()} onClick={onClick} aria-pressed={isActive}>
        {content}
      </button>
    );
  }
  return <div className="stat-card">{content}</div>;
}

export function StatCardGrid({ cards, className = '' }) {
  return (
    <div className={`stat-card-grid ${className}`.trim()}>
      {cards.map(({ key, ...card }) => (
        <StatCard key={key || card.label} {...card} />
      ))}
    </div>
  );
}

export default StatCard;
