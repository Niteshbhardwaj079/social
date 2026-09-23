import { useId, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Icon from '../common/Icon';
import PlatformIcon from '../common/PlatformIcon';
import { formatCompactNumber } from '../../utils/formatters';
import chartColors from '../../config/chartColors';
import useChartPrimaryColor from '../../hooks/useChartPrimaryColor';
import useUiScale from '../../hooks/useUiScale';
import { useI18n } from '../../i18n/useI18n';

const RANGE_KEYS = [
  { key: '7d', label: '7D', captionKey: 'last7Days' },
  { key: '30d', label: '30D', captionKey: 'last30Days' },
  { key: '90d', label: '90D', captionKey: 'last90Days' },
];

function GrowthTooltip({ active, payload, label, series, t }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const index = series.findIndex((point) => point.date === label);
  const previous = index > 0 ? series[index - 1].followers : null;
  const change = previous === null ? null : value - previous;

  return (
    <div className="growth-tooltip">
      <div className="growth-tooltip__date">{label}</div>
      <div className="growth-tooltip__value">
        {value.toLocaleString()} {t('dashboard.followersUnit')}
      </div>
      {change !== null ? (
        <div className={`growth-tooltip__delta ${change >= 0 ? 'is-up' : 'is-down'}`}>
          {change >= 0 ? '+' : ''}
          {change.toLocaleString()} {t('dashboard.sincePrevious')}
        </div>
      ) : null}
    </div>
  );
}

// Followers over time: total + change up top, a gradient area chart with a 7/30/90
// day switch, and each connected platform's share underneath.
function FollowersGrowthChart({ seriesByRange, platforms }) {
  const { t } = useI18n();
  const primary = useChartPrimaryColor();
  const uiScale = useUiScale();
  const axisFont = Math.round(12 * uiScale);
  const gradientId = useId().replace(/:/g, '');
  const [rangeKey, setRangeKey] = useState('30d');

  const series = seriesByRange[rangeKey];
  const range = RANGE_KEYS.find((item) => item.key === rangeKey);

  const summary = useMemo(() => {
    const first = series[0].followers;
    const last = series[series.length - 1].followers;
    const change = last - first;
    return { last, change, percent: first ? (change / first) * 100 : 0 };
  }, [series]);

  const values = series.map((point) => point.followers);
  const padding = Math.max(Math.round((Math.max(...values) - Math.min(...values)) * 0.25), 50);
  const domain = [Math.max(Math.min(...values) - padding, 0), Math.max(...values) + padding];

  const totalPlatformFollowers = platforms.reduce((sum, row) => sum + row.followers, 0);

  return (
    <div className="panel-card growth-card">
      <div className="panel-card__header flex-wrap gap-3">
        <div>
          <h3 className="panel-card__title mb-1">{t('dashboard.followersGrowth')}</h3>
          <div className="growth-summary">
            <span className="growth-summary__total">{summary.last.toLocaleString()}</span>
            <span className={`growth-summary__delta ${summary.change >= 0 ? 'is-up' : 'is-down'}`}>
              <Icon name={summary.change >= 0 ? 'TrendingUp' : 'TrendingDown'} size={14} />
              {summary.change >= 0 ? '+' : ''}
              {summary.change.toLocaleString()} ({summary.percent.toFixed(1)}%)
            </span>
            <span className="growth-summary__caption">{t(`dashboard.${range.captionKey}`)}</span>
          </div>
        </div>
        <div className="segmented-control" role="group" aria-label={t('dashboard.chartRange')}>
          {RANGE_KEYS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`segmented-control__item ${item.key === rangeKey ? 'is-active' : ''}`.trim()}
              onClick={() => setRangeKey(item.key)}
              aria-pressed={item.key === rangeKey}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-card__body growth-card__body">
        <ResponsiveContainer width="100%" height={Math.round(280 * uiScale)}>
          <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={chartColors.border} />
            <XAxis height={Math.round(30 * uiScale)}
              dataKey="date"
              stroke={chartColors.textMuted}
              fontSize={axisFont}
              tickLine={false}
              axisLine={false}
              tickMargin={Math.round(10 * uiScale)}
              minTickGap={24}
            />
            <YAxis
              stroke={chartColors.textMuted}
              fontSize={axisFont}
              tickLine={false}
              axisLine={false}
              width={Math.round(52 * uiScale)}
              domain={domain}
              tickFormatter={(value) => formatCompactNumber(value)}
            />
            <Tooltip content={<GrowthTooltip series={series} t={t} />} cursor={{ stroke: primary, strokeOpacity: 0.3, strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="followers"
              stroke={primary}
              strokeWidth={2.75}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 3, stroke: 'var(--color-surface)', fill: primary }}
              isAnimationActive
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>

        <div className="growth-platforms">
          {platforms.map((row) => (
            <div key={row.platform} className="growth-platforms__item">
              <PlatformIcon platformKey={row.platform} size={26} />
              <span className="growth-platforms__count">{formatCompactNumber(row.followers)}</span>
              <span className="growth-platforms__share">{totalPlatformFollowers ? Math.round((row.followers / totalPlatformFollowers) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FollowersGrowthChart;
