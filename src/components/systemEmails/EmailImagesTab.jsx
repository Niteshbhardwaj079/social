import { useRef, useState } from 'react';
import Icon from '../common/Icon';
import ImageCropModal from '../common/ImageCropModal';
import { formatFileSize } from '../../utils/formatters';
import { copyToClipboard } from '../../utils/clipboard';
import { useToast } from '../common/ToastProvider';
import useUploadGuard from '../../hooks/useUploadGuard';
import { useI18n } from '../../i18n/useI18n';

function EmailImagesTab({ email, onAddImage, onRemoveImage }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const ensureUploadAllowed = useUploadGuard();
  const fileInputRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) setPendingFile(file);
    event.target.value = '';
  }

  function handleCropComplete({ dataUrl, blob, width, height, sizeBytes, originalSizeBytes }) {
    setPendingFile(null);
    onAddImage(
      {
        url: dataUrl,
        width,
        height,
        sizeBytes,
        originalSizeBytes,
        uploadedAt: new Date().toISOString(),
      },
      blob
    );
  }

  function handleCopyUrl(image) {
    copyToClipboard(image.url).then((copied) =>
      showToast(copied ? { type: 'success', title: t('emails.urlCopied') } : { type: 'error', title: t('emails.copyFailed') })
    );
  }

  return (
    <div>
      <p className="text-secondary-custom mb-4">
        {t('emails.imagesIntro')}
      </p>

      <button type="button" className="btn btn-outline-secondary-custom mb-4" onClick={() => ensureUploadAllowed() && fileInputRef.current?.click()}>
        <Icon name="ImagePlus" size={16} />
        {t('emails.upload')}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />

      {email.images.length === 0 ? (
        <p className="small text-muted-custom">{t('emails.noImages')}</p>
      ) : (
        <div className="email-image-grid">
          {email.images.map((image) => (
            <div key={image.id} className="email-image-grid__item">
              <img src={image.url} alt="Uploaded" className="email-image-grid__preview" />
              <div className="email-image-grid__meta">
                {image.width}×{image.height}px · {formatFileSize(image.sizeBytes)}
              </div>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-sm btn-outline-secondary-custom flex-grow-1" onClick={() => handleCopyUrl(image)}>
                  <Icon name="Copy" size={14} /> {t('emails.copyUrl')}
                </button>
                <button
                  type="button"
                  className="btn btn-icon-sm btn-outline-secondary-custom text-danger"
                  onClick={() => onRemoveImage(image.id)}
                  aria-label={t('emails.removeImage')}
                >
                  <Icon name="Trash2" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ImageCropModal isOpen={Boolean(pendingFile)} file={pendingFile} onClose={() => setPendingFile(null)} onComplete={handleCropComplete} />
    </div>
  );
}

export default EmailImagesTab;
