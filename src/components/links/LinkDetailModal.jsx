import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Modal from '../common/Modal';
import { formatDate } from '../../utils/formatters';
import chartColors from '../../config/chartColors';
import useChartPrimaryColor from '../../hooks/useChartPrimaryColor';
import useUiScale from '../../hooks/useUiScale';
import brand from '../../config/brand';

function LinkDetailModal({ link, onClose }) {
  const chartPrimary = useChartPrimaryColor();
  const uiScale = useUiScale();
  const axisFont = Math.round(12 * uiScale);

  if (!link) {
    return null;
  }

  return (
    <Modal isOpen={Boolean(link)} onClose={onClose} title="Link details" size="lg">
      <div className="mb-4">
        <div className="fw-semibold mb-1">{link.label}</div>
        <div className="small text-secondary-custom text-break">{link.destinationUrl}</div>
      </div>

      <dl className="activity-detail-list">
        <dt>Short link</dt>
        <dd>
          {brand.website}/l/{link.slug}
        </dd>
        <dt>Total clicks</dt>
        <dd>{link.clicks.toLocaleString()}</dd>
        <dt>Created</dt>
        <dd>
          {formatDate(link.createdAt)} by {link.createdBy}
        </dd>
      </dl>

      <h6 className="mb-3">Clicks — last 14 days</h6>
      {link.clickHistory.length === 0 ? (
        <p className="small text-muted-custom mb-0">No clicks recorded yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.round(220 * uiScale)}>
          <AreaChart data={link.clickHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
            <XAxis height={Math.round(30 * uiScale)}
              dataKey="date"
              stroke={chartColors.textMuted}
              fontSize={axisFont}
              tickFormatter={(value) => formatDate(value, { day: 'numeric', month: 'short' })}
            />
            <YAxis width={Math.round(60 * uiScale)} stroke={chartColors.textMuted} fontSize={axisFont} allowDecimals={false} />
            <Tooltip labelFormatter={(value) => formatDate(value)} />
            <Area type="monotone" dataKey="clicks" stroke={chartPrimary} fill={chartPrimary} fillOpacity={0.2} strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Modal>
  );
}

export default LinkDetailModal;
