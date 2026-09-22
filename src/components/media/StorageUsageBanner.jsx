import Icon from '../common/Icon';
import { formatFileSize } from '../../utils/formatters';
import { MEDIA_TYPE } from '../../config/constants';

// Adds up what is really stored. Files added by link (storage: 'linked') live
// somewhere else, so they cost nothing here.
function StorageUsageBanner({ items, limitBytes }) {
  const bytesFor = (storage) =>
    items.filter((item) => item.storage === storage).reduce((sum, item) => sum + item.sizeKb * 1024, 0);

  const serverBytes = bytesFor('server');
  const externalBytes = bytesFor('external');
  const usedBytes = serverBytes + externalBytes;
  const linkedCount = items.filter((item) => item.storage === 'linked').length;
  const videoBytes = items.filter((item) => item.type === MEDIA_TYPE.VIDEO).reduce((sum, item) => sum + item.sizeKb * 1024, 0);
  const percent = limitBytes ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : null;

  return (
    <div className={`storage-banner ${percent !== null && percent >= 90 ? 'is-near-limit' : ''}`.trim()}>
      <Icon name="HardDrive" size={22} />
      <div className="storage-banner__text">
        <div className="storage-banner__title">
          {formatFileSize(usedBytes)} used
          {limitBytes ? ` of ${formatFileSize(limitBytes)} (${percent}%)` : ''}
        </div>
        <div className="storage-banner__detail">
          {formatFileSize(serverBytes)} on the app server · {formatFileSize(externalBytes)} in external storage
          {linkedCount ? ` · ${linkedCount} linked (not stored here)` : ''} · videos take {formatFileSize(videoBytes)}
        </div>
        {limitBytes ? (
          <div className="storage-banner__bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default StorageUsageBanner;
