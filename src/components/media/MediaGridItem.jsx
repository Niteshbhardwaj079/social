import Icon from '../common/Icon';
import { MEDIA_TYPE } from '../../config/constants';
import { formatDate, formatFileSize } from '../../utils/formatters';
import { summarizeUsage, describeAtRisk } from '../../utils/mediaUsage';
import { useI18n } from '../../i18n/useI18n';

function MediaGridItem({ item, onOpen, onCopyLink, onCrop, onDelete }) {
  const { t } = useI18n();
  const usage = summarizeUsage(item);
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const canCrop = isImage && Boolean(item.url) && item.url.startsWith('data:');
  const dimensions = item.width && item.height ? `${t('media.dimensions', { width: item.width, height: item.height })} · ` : '';

  let usageNode;
  if (usage.atRisk.length > 0) {
    usageNode = (
      <span className="media-card__usage is-risk" title={t('media.gridItem.riskTooltip')}>
        <Icon name="AlertTriangle" size={12} /> {t('media.gridItem.inUsePrefix', { list: describeAtRisk(usage.atRisk, t) })}
      </span>
    );
  } else if (usage.published.length > 0) {
    usageNode = (
      <span className="media-card__usage">
        <Icon name="CheckCircle2" size={12} />{' '}
        {t(usage.published.length === 1 ? 'media.gridItem.onlyInPublishedOne' : 'media.gridItem.onlyInPublishedOther', { count: usage.published.length })}
      </span>
    );
  } else {
    usageNode = (
      <span className="media-card__usage">
        <Icon name="Circle" size={12} /> {t('media.gridItem.notUsedYet')}
      </span>
    );
  }

  return (
    <div className="media-card">
      <button type="button" className="media-card__thumb" onClick={onOpen} aria-label={t('media.gridItem.openAria', { name: item.name })}>
        {item.url && isImage ? (
          <img src={item.url} alt={item.name} className="media-card__image" />
        ) : (
          <Icon name={item.type === MEDIA_TYPE.VIDEO ? 'Video' : 'Image'} size={28} />
        )}
        {item.type === MEDIA_TYPE.VIDEO ? (
          <span className="media-card__video-icon">
            <Icon name="Play" size={18} />
          </span>
        ) : null}
      </button>

      <div className="media-card__body">
        <div className="media-card__title-row">
          <span className="media-card__name" title={item.name}>
            {item.name}
          </span>
          <span className={`media-card__badge ${STORAGE_BADGE_CLASS[item.storage] || ''}`.trim()}>
            {item.storageLabel || t('media.gridItem.server')}
          </span>
        </div>
        <div className="media-card__meta">
          {dimensions}
          {formatFileSize(item.sizeKb * 1024)} · {t('media.addedOn', { date: formatDate(item.uploadedAt) })}
        </div>
        {usageNode}

        <div className="media-card__link">
          <code className="media-card__url" title={item.publicUrl}>
            {item.publicUrl}
          </code>
          <button type="button" className="media-card__copy" onClick={onCopyLink}>
            {t('media.copyLink')}
          </button>
        </div>

        <div className="media-card__actions">
          {canCrop ? (
            <button
              type="button"
              className="btn btn-icon-sm btn-outline-secondary-custom"
              onClick={onCrop}
              aria-label={t('media.gridItem.cropAria', { name: item.name })}
              data-tooltip={t('media.gridItem.cropTooltip')}
            >
              <Icon name="Crop" size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-icon-sm btn-outline-secondary-custom text-danger"
            onClick={onDelete}
            aria-label={t('media.gridItem.deleteAria', { name: item.name })}
            data-tooltip={t('common.delete')}
          >
            <Icon name="Trash2" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

const STORAGE_BADGE_CLASS = {
  server: 'media-card__badge--server',
  external: 'media-card__badge--external',
  linked: 'media-card__badge--linked',
};

export default MediaGridItem;
