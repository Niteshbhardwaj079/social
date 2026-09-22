import { getUploadTarget } from '../services/api/storageApi';
import { useToast } from '../components/common/ToastProvider';

// Every upload button calls this first. If both storage switches are off in
// Settings → Storage, uploads are blocked with a clear message instead of
// failing silently later. Call it inside the click handler, before opening the
// file picker.
function useUploadGuard() {
  const { showToast } = useToast();

  return function ensureUploadAllowed() {
    const target = getUploadTarget();
    if (target.allowed) return target;
    showToast({ type: 'error', title: 'Uploads are switched off', message: target.reason });
    return null;
  };
}

export default useUploadGuard;
