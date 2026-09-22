import { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import Icon from '../common/Icon';
import ErrorState from '../common/ErrorState';
import { getMediaItems } from '../../services/api/mediaApi';
import { MEDIA_TYPE } from '../../config/constants';

// Reuses already-uploaded files instead of re-uploading the same image/video into every post that needs it.
function MediaLibraryPickerModal({ isOpen, onClose, onSelect }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  function loadItems() {
    setStatus('loading');
    getMediaItems().then(
      (loaded) => {
        setItems(loaded);
        setStatus('succeeded');
      },
      () => setStatus('failed')
    );
  }

  useEffect(() => {
    if (!isOpen) return;
    setSearchTerm('');
    setSelectedIds([]);
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const filteredItems = useMemo(
    () => items.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [items, searchTerm]
  );

  function toggleSelected(id) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));
  }

  function handleAdd() {
    const chosen = items.filter((item) => selectedIds.includes(item.id));
    onSelect(
      chosen.map((item) => ({ id: item.id, mediaId: item.id, name: item.name, type: item.type, previewUrl: item.publicUrl }))
    );
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Media Library"
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={selectedIds.length === 0} onClick={handleAdd}>
            Add {selectedIds.length > 0 ? selectedIds.length : ''} {selectedIds.length === 1 ? 'file' : 'files'}
          </button>
        </>
      }
    >
      {status === 'loading' ? (
        <div className="media-picker__loading text-muted-custom">Loading your media...</div>
      ) : status === 'failed' ? (
        <ErrorState onRetry={() => setStatus('loading') || getMediaItems().then((loaded) => { setItems(loaded); setStatus('succeeded'); }, () => setStatus('failed'))} />
      ) : (
        <>
          <div className="search-input media-picker__search mb-3">
            <Icon name="Search" size={16} />
            <input
              type="search"
              className="form-control"
              placeholder="Search media by name..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              autoFocus
            />
          </div>

          {filteredItems.length === 0 ? (
            <p className="text-muted-custom mb-0">No media found. Upload something first.</p>
          ) : (
            <div className="media-uploader-grid media-picker__grid">
              {filteredItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`media-uploader-grid__item media-picker__item ${isSelected ? 'is-selected' : ''}`.trim()}
                    onClick={() => toggleSelected(item.id)}
                    aria-pressed={isSelected}
                    aria-label={item.name}
                    title={item.name}
                  >
                    {item.type === MEDIA_TYPE.VIDEO ? (
                      <video src={item.publicUrl || item.url} className="media-uploader-grid__preview" muted />
                    ) : (
                      <img src={item.publicUrl || item.url} alt={item.name} className="media-uploader-grid__preview" />
                    )}
                    <span className="media-picker__check">
                      <Icon name={isSelected ? 'CheckCircle2' : 'Circle'} size={20} />
                    </span>
                    <span className="media-picker__name">{item.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export default MediaLibraryPickerModal;
