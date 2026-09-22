import Icon from '../common/Icon';
import { formatCompactNumber } from '../../utils/formatters';

function KpiCard({ label, value, suffix = '', delta, isPositive, icon, accent = 'primary' }) {
  const formattedValue = typeof value === 'number' ? formatCompactNumber(value) : value;
  const iconClassName = accent === 'primary' ? 'kpi-card__icon' : `kpi-card__icon kpi-card__icon--${accent}`;

  return (
    <div className="kpi-card">
      <div className="kpi-card__top">
        <span className="kpi-card__label">{label}</span>
        <span className={iconClassName}>
          <Icon name={icon} size={19} />
        </span>
      </div>
      <div className="kpi-card__value">
        {formattedValue}
        {suffix}
      </div>
      {typeof delta === 'number' ? (
        <span className={`kpi-card__delta ${isPositive ? 'is-positive' : 'is-negative'}`}>
          <Icon name={isPositive ? 'ArrowUp' : 'ArrowDown'} size={12} />
          {Math.abs(delta)}% vs last period
        </span>
      ) : null}
    </div>
  );
}

export default KpiCard;
