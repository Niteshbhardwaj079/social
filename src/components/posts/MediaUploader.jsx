import { useRef, useState } from 'react';
import Icon from '../common/Icon';
import ImageCropModal from '../common/ImageCropModal';
import MediaLibraryPickerModal from './MediaLibraryPickerModal';
import useUploadGuard from '../../hooks/useUploadGuard';
import { uploadMediaItem } from '../../services/api/mediaApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { API_ENABLED } from '../../config/runtime';
import { useToast } from '../common/ToastProvider';
import { MEDIA_TYPE } from '../../config/constants';

function MediaUploader({ mediaItems, onAdd, onRemove }) {
  const ensureUploadAllowed = useUploadGuard();
  const { showToast } = useToast();
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // In API mode a post can only reference media the server actually has, so the real upload happens
  // here, before the file ever appears in the picker — the mock keeps its old, instant local preview.
  function addItem({ name, type, previewUrl, payload, file }) {
    if (!API_ENABLED) {
      onAdd([{ id: `upload-${Date.now()}-${name}`, name, type, previewUrl }]);
      return;
    }
    setIsUploading(true);
    uploadMediaItem(payload, file).then(
      (item) => {
        setIsUploading(false);
        onAdd([{ id: item.id, mediaId: item.id, name: item.name, type: item.type, previewUrl: item.publicUrl }]);
      },
      (error) => {
        setIsUploading(false);
        showToast({ type: 'error', title: `Could not upload ${name}`, message: apiErrorMessage(error) });
      }
    );
  }

  function handleImageFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setPendingImageFile(file);
  }

  function handleVideoFileChange(event) {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      addItem({
        name: file.name,
        type: MEDIA_TYPE.VIDEO,
        previewUrl: URL.createObjectURL(file),
        payload: { name: file.name, type: MEDIA_TYPE.VIDEO, sizeKb: Math.round(file.size / 1024) },
        file,
      });
    }
    event.target.value = '';
  }

  function handleCropComplete({ dataUrl, blob, width, height, sizeBytes }) {
    addItem({
      name: pendingImageFile.name,
      type: MEDIA_TYPE.IMAGE,
      previewUrl: dataUrl,
      payload: { name: pendingImageFile.name, type: MEDIA_TYPE.IMAGE, sizeKb: Math.round(sizeBytes / 1024), width, height },
      file: blob,
    });
    setPendingImageFile(null);
  }

  return (
    <div>
      <div className="d-flex gap-2 mb-3">
        <button
          type="button"
          className="btn btn-outline-secondary-custom btn-sm"
          disabled={isUploading}
          onClick={() => ensureUploadAllowed() && imageInputRef.current?.click()}
        >
          <Icon name="ImagePlus" size={16} /> {isUploading ? 'Uploading...' : 'Upload Image'}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary-custom btn-sm"
          disabled={isUploading}
          onClick={() => ensureUploadAllowed() && videoInputRef.current?.click()}
        >
          <Icon name="Video" size={16} /> {isUploading ? 'Uploading...' : 'Upload Video'}
        </button>
        <button type="button" className="btn btn-outline-secondary-custom btn-sm" onClick={() => setIsLibraryOpen(true)}>
          <Icon name="Images" size={16} /> Media Library
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageFileChange} />
        <input ref={videoInputRef} type="file" accept="video/*" multiple hidden onChange={handleVideoFileChange} />
      </div>

      {mediaItems.length > 0 ? (
        <div className="media-uploader-grid">
          {mediaItems.map((item) => (
            <div key={item.id} className="media-uploader-grid__item">
              {item.type === 'video' ? (
                <video src={item.previewUrl} className="media-uploader-grid__preview" muted />
              ) : (
                <img src={item.previewUrl} alt={item.name} className="media-uploader-grid__preview" />
              )}
              <button
                type="button"
                className="media-uploader-grid__remove"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.name}`}
              >
                <Icon name="X" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <ImageCropModal
        isOpen={Boolean(pendingImageFile)}
        file={pendingImageFile}
        onClose={() => setPendingImageFile(null)}
        onComplete={handleCropComplete}
      />

      <MediaLibraryPickerModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onSelect={(picked) => {
          const existingIds = new Set(mediaItems.map((item) => item.id));
          const fresh = picked.filter((item) => !existingIds.has(item.id));
          if (fresh.length > 0) onAdd(fresh);
        }}
      />
    </div>
  );
}

export default MediaUploader;
