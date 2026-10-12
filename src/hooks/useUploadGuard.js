import { getUploadTarget } from '../services/api/storageApi';
import { useToast } from '../components/common/ToastProvider';
import { useI18n } from '../i18n/useI18n';

// Every upload button calls this first. If both storage switches are off in
// Settings → Storage, uploads are blocked with a clear message instead of
// failing silently later. Call it inside the click handler, before opening the
// file picker.
function useUploadGuard() {
  const { showToast } = useToast();
  const { t } = useI18n();

  return function ensureUploadAllowed() {
    const target = getUploadTarget();
    if (target.allowed) return target;
    showToast({ type: 'error', title: t('media.uploadsOff'), message: t('composer.uploadsOffReason') });
    return null;
  };
}

export default useUploadGuard;
