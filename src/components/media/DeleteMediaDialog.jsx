import Modal from '../common/Modal';
import Icon from '../common/Icon';
import { summarizeUsage, describeUse, describeAtRisk } from '../../utils/mediaUsage';
import { useI18n } from '../../i18n/useI18n';

// Tells the person exactly what deleting this file will and will not do,
// based on where it is used — see utils/mediaUsage.js for the rules.
function DeleteMediaDialog({ item, onClose, onConfirm, isDeleting }) {
  const { t } = useI18n();
  if (!item) return null;
  const { published, atRisk } = summarizeUsage(item);
  const hasRisk = atRisk.length > 0;

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isDeleting}>
        {t('common.cancel')}
      </button>
      <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isDeleting}>
        {hasRisk ? t('media.deleteModal.deleteAnyway') : t('common.delete')}
      </button>
    </>
  );

  return (
    <Modal isOpen onClose={onClose} title={t('media.deleteModal.title')} footer={footer} size="md">
      <p className="mb-3 text-secondary-custom">
        {t('media.deleteModal.willBeRemoved', {
          name: item.name,
          where: item.storage === 'linked' ? t('media.deleteModal.whereLibrary') : t('media.deleteModal.whereStorage'),
        })}
      </p>

      {published.length > 0 ? (
        <div className="callout-banner callout-banner--success">
          <Icon name="CheckCircle2" size={16} />
          <span>{t(published.length === 1 ? 'media.deleteModal.usedInPublishedOne' : 'media.deleteModal.usedInPublishedOther', { count: published.length })}</span>
        </div>
      ) : null}

      {hasRisk ? (
        <div className="callout-banner callout-banner--warning mb-3">
          <Icon name="AlertTriangle" size={16} />
          <span>{t('media.deleteModal.stillNeededBy', { list: describeAtRisk(atRisk, t) })}</span>
        </div>
      ) : null}

      {hasRisk ? (
        <ul className="media-usage-list">
          {atRisk.map((use) => (
            <li key={`${use.kind}-${use.title}`}>
              <span className="media-usage-list__kind">{describeUse(use, t)}</span>
              {use.title}
            </li>
          ))}
        </ul>
      ) : null}

      {published.length === 0 && !hasRisk ? (
        <p className="mb-0 text-secondary-custom">{t('media.deleteModal.notUsedAnywhere')}</p>
      ) : null}
    </Modal>
  );
}

export default DeleteMediaDialog;
