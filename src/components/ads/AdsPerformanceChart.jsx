import { useId, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { AD_METRICS } from '../../config/adPlatforms';
import { formatCompactNumber, formatCurrency } from '../../utils/formatters';
import chartColors from '../../config/chartColors';
import useChartPrimaryColor from '../../hooks/useChartPrimaryColor';
import useUiScale from '../../hooks/useUiScale';

function MetricTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="growth-tooltip">
      <div className="growth-tooltip__date">{label}</div>
      <div className="growth-tooltip__value">
        {metric.label}: {metric.isMoney ? formatCurrency(value) : value.toLocaleString()}
      </div>
    </div>
  );
}

// Daily performance with a Spend / Impressions / Clicks / Results switch.
function AdsPerformanceChart({ series, title = 'Performance', height = 300, actions = null }) {
  const primary = useChartPrimaryColor();
  const uiScale = useUiScale();
  const axisFont = Math.round(12 * uiScale);
  const gradientId = useId().replace(/:/g, '');
  const [metricKey, setMetricKey] = useState('spend');
  const metric = AD_METRICS.find((item) => item.key === metricKey);

  return (
    <div className="panel-card">
      <div className="panel-card__header flex-wrap gap-3">
        <h3 className="panel-card__title">{title}</h3>
        <div className="d-flex gap-3 align-items-center flex-wrap">
          <div className="segmented-control" role="group" aria-label="Metric">
            {AD_METRICS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`segmented-control__item ${item.key === metricKey ? 'is-active' : ''}`.trim()}
                onClick={() => setMetricKey(item.key)}
                aria-pressed={item.key === metricKey}
              >
                {item.label}
              </button>
            ))}
          </div>
          {actions}
        </div>
      </div>
      <div className="panel-card__body">
        <ResponsiveContainer width="100%" height={Math.round(height * uiScale)}>
          <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primary} stopOpacity={0.35} />
                <stop offset="100%" stopColor={primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={chartColors.border} />
            <XAxis height={Math.round(30 * uiScale)} dataKey="label" stroke={chartColors.textMuted} fontSize={axisFont} tickLine={false} axisLine={false} tickMargin={Math.round(10 * uiScale)} minTickGap={28} />
            <YAxis
              stroke={chartColors.textMuted}
              fontSize={axisFont}
              tickLine={false}
              axisLine={false}
              width={Math.round(58 * uiScale)}
              tickFormatter={(value) => (metric.isMoney ? formatCurrency(value, { compact: true }) : formatCompactNumber(value))}
            />
            <Tooltip content={<MetricTooltip metric={metric} />} cursor={{ stroke: primary, strokeOpacity: 0.3, strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey={metricKey}
              stroke={primary}
              strokeWidth={2.75}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 3, stroke: 'var(--color-surface)', fill: primary }}
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default AdsPerformanceChart;
