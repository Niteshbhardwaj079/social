import Modal from '../common/Modal';
import Icon from '../common/Icon';
import { summarizeUsage, describeUse, describeAtRisk } from '../../utils/mediaUsage';

// Tells the person exactly what deleting this file will and will not do,
// based on where it is used — see utils/mediaUsage.js for the rules.
function DeleteMediaDialog({ item, onClose, onConfirm, isDeleting }) {
  if (!item) return null;
  const { published, atRisk } = summarizeUsage(item);
  const hasRisk = atRisk.length > 0;

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isDeleting}>
        Cancel
      </button>
      <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isDeleting}>
        {hasRisk ? 'Delete anyway' : 'Delete'}
      </button>
    </>
  );

  return (
    <Modal isOpen onClose={onClose} title="Delete this file?" footer={footer} size="md">
      <p className="mb-3 text-secondary-custom">
        <strong>{item.name}</strong> will be removed from {item.storage === 'linked' ? 'your library (the original stays where it is)' : 'storage'}.
      </p>

      {published.length > 0 ? (
        <div className="callout-banner callout-banner--success">
          <Icon name="CheckCircle2" size={16} />
          <span>
            Used in {published.length} published {published.length > 1 ? 'posts' : 'post'}. Those posts <strong>stay live</strong> on
            the platforms — they keep their own copy. Only the preview inside this app will go blank.
          </span>
        </div>
      ) : null}

      {hasRisk ? (
        <div className="callout-banner callout-banner--warning mb-3">
          <Icon name="AlertTriangle" size={16} />
          <span>
            Still needed by <strong>{describeAtRisk(atRisk)}</strong>. If you delete it, scheduled posts will fail to publish, a
            recycled post can’t be re-posted, and emails will show a broken picture.
          </span>
        </div>
      ) : null}

      {hasRisk ? (
        <ul className="media-usage-list">
          {atRisk.map((use) => (
            <li key={`${use.kind}-${use.title}`}>
              <span className="media-usage-list__kind">{describeUse(use)}</span>
              {use.title}
            </li>
          ))}
        </ul>
      ) : null}

      {published.length === 0 && !hasRisk ? (
        <p className="mb-0 text-secondary-custom">It isn’t used in any post, recycling item or email, so nothing else is affected.</p>
      ) : null}
    </Modal>
  );
}

export default DeleteMediaDialog;
