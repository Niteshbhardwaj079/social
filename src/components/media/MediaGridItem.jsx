import Icon from '../common/Icon';
import { MEDIA_TYPE } from '../../config/constants';
import { formatDate, formatFileSize } from '../../utils/formatters';
import { summarizeUsage, describeAtRisk } from '../../utils/mediaUsage';

const STORAGE_BADGE_CLASS = {
  server: 'media-card__badge--server',
  external: 'media-card__badge--external',
  linked: 'media-card__badge--linked',
};

function MediaGridItem({ item, onOpen, onCopyLink, onCrop, onDelete }) {
  const usage = summarizeUsage(item);
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const canCrop = isImage && Boolean(item.url) && item.url.startsWith('data:');
  const dimensions = item.width && item.height ? `${item.width} × ${item.height} px · ` : '';

  let usageNode;
  if (usage.atRisk.length > 0) {
    usageNode = (
      <span className="media-card__usage is-risk" title="Deleting this file would break these">
        <Icon name="AlertTriangle" size={12} /> In use: {describeAtRisk(usage.atRisk)}
      </span>
    );
  } else if (usage.published.length > 0) {
    usageNode = (
      <span className="media-card__usage">
        <Icon name="CheckCircle2" size={12} /> Only in {usage.published.length} published{' '}
        {usage.published.length > 1 ? 'posts' : 'post'} — safe to delete
      </span>
    );
  } else {
    usageNode = (
      <span className="media-card__usage">
        <Icon name="Circle" size={12} /> Not used anywhere yet
      </span>
    );
  }

  return (
    <div className="media-card">
      <button type="button" className="media-card__thumb" onClick={onOpen} aria-label={`Open ${item.name}`}>
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
            {item.storageLabel || 'Server'}
          </span>
        </div>
        <div className="media-card__meta">
          {dimensions}
          {formatFileSize(item.sizeKb * 1024)} · Added {formatDate(item.uploadedAt)}
        </div>
        {usageNode}

        <div className="media-card__link">
          <code className="media-card__url" title={item.publicUrl}>
            {item.publicUrl}
          </code>
          <button type="button" className="media-card__copy" onClick={onCopyLink}>
            Copy link
          </button>
        </div>

        <div className="media-card__actions">
          {canCrop ? (
            <button
              type="button"
              className="btn btn-icon-sm btn-outline-secondary-custom"
              onClick={onCrop}
              aria-label={`Crop ${item.name}`}
              data-tooltip="Crop or compress"
            >
              <Icon name="Crop" size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-icon-sm btn-outline-secondary-custom text-danger"
            onClick={onDelete}
            aria-label={`Delete ${item.name}`}
            data-tooltip="Delete"
          >
            <Icon name="Trash2" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default MediaGridItem;
