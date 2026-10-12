import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Modal from '../common/Modal';
import { formatDate } from '../../utils/formatters';
import chartColors from '../../config/chartColors';
import useChartPrimaryColor from '../../hooks/useChartPrimaryColor';
import useUiScale from '../../hooks/useUiScale';
import brand from '../../config/brand';
import { useI18n } from '../../i18n/useI18n';

function LinkDetailModal({ link, onClose }) {
  const { t } = useI18n();
  const chartPrimary = useChartPrimaryColor();
  const uiScale = useUiScale();
  const axisFont = Math.round(12 * uiScale);

  if (!link) {
    return null;
  }

  return (
    <Modal isOpen={Boolean(link)} onClose={onClose} title={t('links.linkDetailsTitle')} size="lg">
      <div className="mb-4">
        <div className="fw-semibold mb-1">{link.label}</div>
        <div className="small text-secondary-custom text-break">{link.destinationUrl}</div>
      </div>

      <dl className="activity-detail-list">
        <dt>{t('links.shortLinkLabel')}</dt>
        <dd>
          {brand.website}/l/{link.slug}
        </dd>
        <dt>{t('links.statTotalClicks')}</dt>
        <dd>{link.clicks.toLocaleString()}</dd>
        <dt>{t('links.colCreated')}</dt>
        <dd>
          {t('links.createdByLine', { date: formatDate(link.createdAt), name: link.createdBy })}
        </dd>
      </dl>

      <h6 className="mb-3">{t('links.clicksLast14Days')}</h6>
      {link.clickHistory.length === 0 ? (
        <p className="small text-muted-custom mb-0">{t('links.noClicksYet')}</p>
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
