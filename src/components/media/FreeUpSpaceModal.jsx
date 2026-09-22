import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import Icon from '../common/Icon';
import { formatDate, formatFileSize } from '../../utils/formatters';
import { isSafeToBulkDelete, summarizeUsage } from '../../utils/mediaUsage';

const AGE_OPTIONS = [30, 60, 90, 180];
const DAY_MS = 24 * 60 * 60 * 1000;

// Bulk clean-up: only files that are old AND not needed by anything that would
// break (scheduled/draft posts, recycling, emails). Linked files are skipped
// because they take no space here.
function FreeUpSpaceModal({ isOpen, onClose, items, onConfirm, isDeleting }) {
  const [olderThanDays, setOlderThanDays] = useState(90);

  const eligible = useMemo(() => {
    const cutoff = Date.now() - olderThanDays * DAY_MS;
    return items.filter(
      (item) => item.storage !== 'linked' && new Date(item.uploadedAt).getTime() < cutoff && isSafeToBulkDelete(item)
    );
  }, [items, olderThanDays]);

  const totalBytes = eligible.reduce((sum, item) => sum + item.sizeKb * 1024, 0);

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isDeleting}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => onConfirm(eligible.map((item) => item.id))}
        disabled={eligible.length === 0 || isDeleting}
      >
        Delete {eligible.length} {eligible.length === 1 ? 'file' : 'files'} ({formatFileSize(totalBytes)})
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Free up space" footer={footer}>
      <p className="text-secondary-custom">
        Removes old files that nothing needs any more. Files used by a <strong>scheduled post, draft, recycling item or email</strong> are
        never included. Posts that are already published stay live on the platforms.
      </p>

      <label htmlFor="cleanupAge" className="form-label-custom">
        Older than
      </label>
      <select
        id="cleanupAge"
        className="form-select mb-4"
        value={olderThanDays}
        onChange={(event) => setOlderThanDays(Number(event.target.value))}
      >
        {AGE_OPTIONS.map((days) => (
          <option key={days} value={days}>
            {days} days
          </option>
        ))}
      </select>

      {eligible.length === 0 ? (
        <div className="callout-banner callout-banner--info mb-0">
          <Icon name="Info" size={16} />
          <span>Nothing to clean up — no file older than {olderThanDays} days is safe to remove.</span>
        </div>
      ) : (
        <ul className="media-usage-list media-usage-list--scroll">
          {eligible.map((item) => {
            const publishedCount = summarizeUsage(item).published.length;
            return (
              <li key={item.id}>
                <span className="media-usage-list__kind">{formatFileSize(item.sizeKb * 1024)}</span>
                {item.name}
                <span className="media-usage-list__note">
                  {formatDate(item.uploadedAt)} · {publishedCount ? `${publishedCount} published` : 'unused'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export default FreeUpSpaceModal;
