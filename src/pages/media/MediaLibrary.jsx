import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Icon from '../../components/common/Icon';
import Modal from '../../components/common/Modal';
import ImageCropModal from '../../components/common/ImageCropModal';
import MediaGridItem from '../../components/media/MediaGridItem';
import StorageUsageBanner from '../../components/media/StorageUsageBanner';
import { StatCardGrid } from '../../components/common/StatCard';
import { Pager, TableToolbar } from '../../components/common/DataTableParts';
import usePagination from '../../hooks/usePagination';
import DeleteMediaDialog from '../../components/media/DeleteMediaDialog';
import FreeUpSpaceModal from '../../components/media/FreeUpSpaceModal';
import { SkeletonKpiRow } from '../../components/common/LoadingSkeleton';
import {
  getMediaItems,
  getMediaFolders,
  uploadMediaItem,
  addLinkedMedia,
  updateMediaItem,
  deleteMediaItem,
  deleteMediaItems,
} from '../../services/api/mediaApi';
import { getStorageLimitBytes, getUploadTarget } from '../../services/api/storageApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { REQUEST_STATUS, MEDIA_TYPE } from '../../config/constants';
import { formatDate, formatFileSize } from '../../utils/formatters';
import { copyToClipboard } from '../../utils/clipboard';
import { summarizeUsage, describeUse } from '../../utils/mediaUsage';
import { useToast } from '../../components/common/ToastProvider';
import useMediaQuery from '../../hooks/useMediaQuery';
import useUploadGuard from '../../hooks/useUploadGuard';
import { useI18n } from '../../i18n/useI18n';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'largest', label: 'Largest' },
];

function sortItems(items, sortKey) {
  const sorted = [...items];
  if (sortKey === 'oldest') sorted.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
  else if (sortKey === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortKey === 'largest') sorted.sort((a, b) => b.sizeKb - a.sizeKb);
  else sorted.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return sorted;
}

function MediaLibrary() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const ensureUploadAllowed = useUploadGuard();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const fileInputRef = useRef(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [activeFolder, setActiveFolder] = useState('All Media');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('recent');
  const [viewMode, setViewMode] = useState('grid');
  const [activeItemId, setActiveItemId] = useState(null);
  const [itemPendingDelete, setItemPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFreeUpOpen, setIsFreeUpOpen] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [itemBeingRecropped, setItemBeingRecropped] = useState(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [isAddingLink, setIsAddingLink] = useState(false);

  function loadMedia() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    Promise.all([getMediaItems(), getMediaFolders()])
      .then(([items, folderList]) => {
        setMediaItems(items);
        setFolders(folderList);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    loadMedia();
  }, []);

  const filteredItems = useMemo(() => {
    const matching = mediaItems.filter((item) => {
      const matchesFolder = activeFolder === 'All Media' || item.folder === activeFolder;
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFolder && matchesSearch;
    });
    return sortItems(matching, sortKey);
  }, [mediaItems, activeFolder, searchTerm, sortKey]);

  const pagination = usePagination(filteredItems, { resetKey: `${activeFolder}|${searchTerm}|${sortKey}`, initialSize: 25 });
  const activeItem = mediaItems.find((item) => item.id === activeItemId) || null;

  const imageCount = mediaItems.filter((item) => item.type === MEDIA_TYPE.IMAGE).length;
  const videoCount = mediaItems.filter((item) => item.type === MEDIA_TYPE.VIDEO).length;
  const inUseCount = mediaItems.filter((item) => summarizeUsage(item).atRisk.length > 0).length;
  const usedBytes = mediaItems.filter((item) => item.storage !== 'linked').reduce((sum, item) => sum + item.sizeKb * 1024, 0);
  const uploadTarget = getUploadTarget();
  const uploadFolder = activeFolder === 'All Media' ? 'Campaigns' : activeFolder;

  function handleUploadClick() {
    if (ensureUploadAllowed()) fileInputRef.current?.click();
  }

  function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.type.startsWith('image/')) {
      setPendingImageFile(file);
      return;
    }

    // Videos skip the crop step — upload as-is.
    uploadMediaItem(
      {
        name: file.name,
        type: MEDIA_TYPE.VIDEO,
        url: URL.createObjectURL(file),
        folder: uploadFolder,
        sizeKb: Math.round(file.size / 1024),
      },
      file
    ).then(
      (newItem) => {
        setMediaItems((current) => [newItem, ...current]);
        showToast({ type: 'success', title: 'File uploaded', message: `${newItem.name} · saved to ${newItem.storageLabel}` });
      },
      (error) => showToast({ type: 'error', title: 'Could not upload that file', message: apiErrorMessage(error) })
    );
  }

  function handleCropComplete({ dataUrl, blob, width, height, sizeBytes, originalSizeBytes }) {
    // Re-cropping an existing file replaces it in place.
    if (itemBeingRecropped) {
      const target = itemBeingRecropped;
      setItemBeingRecropped(null);
      setPendingImageFile(null);
      updateMediaItem(target.id, { url: dataUrl, sizeKb: Math.round(sizeBytes / 1024), width, height }, blob).then(
        (updated) => {
          setMediaItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          showToast({
            type: 'success',
            title: 'Image updated',
            message: `${updated.name} · ${formatFileSize(sizeBytes)} (was ${formatFileSize(target.sizeKb * 1024)})`,
          });
        },
        (error) => showToast({ type: 'error', title: 'Could not update that image', message: apiErrorMessage(error) })
      );
      return;
    }

    const file = pendingImageFile;
    setPendingImageFile(null);
    uploadMediaItem(
      {
        name: file.name,
        type: MEDIA_TYPE.IMAGE,
        url: dataUrl,
        folder: uploadFolder,
        sizeKb: Math.round(sizeBytes / 1024),
        width,
        height,
      },
      blob
    ).then(
      (newItem) => {
        setMediaItems((current) => [newItem, ...current]);
        showToast({
          type: 'success',
          title: 'File uploaded',
          message: `${newItem.name} · ${formatFileSize(sizeBytes)} (was ${formatFileSize(originalSizeBytes)}) · saved to ${newItem.storageLabel}`,
        });
      },
      (error) => showToast({ type: 'error', title: 'Could not upload that file', message: apiErrorMessage(error) })
    );
  }

  function closeCropModal() {
    setPendingImageFile(null);
    setItemBeingRecropped(null);
  }

  function handleRecrop(item) {
    fetch(item.url)
      .then((response) => response.blob())
      .then((blob) => {
        setItemBeingRecropped(item);
        setPendingImageFile(new File([blob], item.name, { type: blob.type || 'image/png' }));
      })
      .catch(() => showToast({ type: 'error', title: 'Could not open this image for cropping' }));
  }

  function handleAddLink(event) {
    event.preventDefault();
    const url = linkUrl.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) {
      showToast({ type: 'error', title: 'Enter a full image link', message: 'It should start with https://' });
      return;
    }

    setIsAddingLink(true);
    const probe = new Image();
    probe.onload = () => {
      const name = decodeURIComponent(url.split('?')[0].split('/').pop() || 'linked-image');
      addLinkedMedia({ url, name, width: probe.naturalWidth, height: probe.naturalHeight }).then(
        (newItem) => {
          setMediaItems((current) => [newItem, ...current]);
          setLinkUrl('');
          setIsAddingLink(false);
          showToast({ type: 'success', title: 'Image added by link', message: 'Nothing was copied — it still lives at that address.' });
        },
        (error) => {
          setIsAddingLink(false);
          showToast({ type: 'error', title: 'Could not add that link', message: apiErrorMessage(error) });
        }
      );
    };
    probe.onerror = () => {
      setIsAddingLink(false);
      showToast({ type: 'error', title: 'Could not load an image from that link' });
    };
    probe.src = url;
  }

  function handleCopyLink(item) {
    copyToClipboard(item.publicUrl).then((copied) =>
      showToast(copied ? { type: 'success', title: 'Link copied' } : { type: 'error', title: 'Could not copy the link' })
    );
  }

  function handleDeleteConfirmed() {
    if (!itemPendingDelete) return;
    setIsDeleting(true);
    deleteMediaItem(itemPendingDelete.id).then(
      () => {
        setMediaItems((current) => current.filter((item) => item.id !== itemPendingDelete.id));
        setItemPendingDelete(null);
        setActiveItemId(null);
        setIsDeleting(false);
        showToast({ type: 'success', title: 'File deleted' });
      },
      (error) => {
        setIsDeleting(false);
        showToast({ type: 'error', title: 'Could not delete that file', message: apiErrorMessage(error) });
      }
    );
  }

  function handleFreeUpConfirmed(ids) {
    setIsDeleting(true);
    deleteMediaItems(ids).then(
      (result) => {
        const freed = mediaItems.filter((item) => ids.includes(item.id)).reduce((sum, item) => sum + item.sizeKb * 1024, 0);
        setMediaItems((current) => current.filter((item) => !ids.includes(item.id)));
        setIsFreeUpOpen(false);
        setIsDeleting(false);
        const count = result?.deleted ?? ids.length;
        showToast({ type: 'success', title: `${count} ${count === 1 ? 'file' : 'files'} deleted`, message: `${formatFileSize(freed)} freed` });
      },
      (error) => {
        setIsDeleting(false);
        showToast({ type: 'error', title: 'Could not free up space', message: apiErrorMessage(error) });
      }
    );
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.mediaLibrary')} subtitle="Loading your media..." />
        <SkeletonKpiRow />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.mediaLibrary')} />
        <ErrorState onRetry={loadMedia} />
      </>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.mediaLibrary')}
        subtitle={t('pages.media')}
        guideChapterId="media-library"
        actions={
          <>
            <button type="button" className="btn btn-outline-secondary-custom" onClick={() => setIsFreeUpOpen(true)}>
              <Icon name="Eraser" size={16} />
              Free up space
            </button>
            <button type="button" className="btn btn-primary" onClick={handleUploadClick}>
              <Icon name="Upload" size={16} />
              Upload
            </button>
          </>
        }
      />
      <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleFileSelected} />

      <StatCardGrid
        cards={[
          { key: 'files', label: 'Total Files', value: mediaItems.length, icon: 'Images', tone: 'primary' },
          { key: 'images', label: 'Images', value: imageCount, icon: 'Image', tone: 'sky' },
          { key: 'videos', label: 'Videos', value: videoCount, icon: 'Video', tone: 'purple' },
          { key: 'used', label: 'Space Used', value: formatFileSize(usedBytes), icon: 'HardDrive', tone: 'green' },
          { key: 'inuse', label: 'In Use (Scheduled etc.)', value: inUseCount, icon: 'Link', tone: 'amber' },
        ]}
      />

      <StorageUsageBanner items={mediaItems} limitBytes={getStorageLimitBytes()} />

      <div className="panel-card media-add-card">
        <div className="panel-card__body">
          <form onSubmit={handleAddLink}>
            <div className="media-add-card__head">
              <label htmlFor="mediaLinkUrl" className="media-add-card__title">
                Add an image that is already online
              </label>
              {uploadTarget.allowed ? (
                <span className="media-add-card__hint">
                  New uploads are saved to <strong>{uploadTarget.label}</strong> ·{' '}
                  <Link to="/settings/storage">Change storage</Link>
                </span>
              ) : (
                <span className="media-add-card__hint is-warning">
                  <Icon name="AlertTriangle" size={13} /> Uploads are switched off ·{' '}
                  <Link to="/settings/storage">Open storage settings</Link>
                </span>
              )}
            </div>
            <div className="media-link-form__row">
              <input
                id="mediaLinkUrl"
                type="url"
                className="form-control"
                placeholder="https://yoursite.com/banner.jpg"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
              <button type="submit" className="btn btn-outline-primary-custom" disabled={!linkUrl.trim() || isAddingLink}>
                {isAddingLink ? 'Checking...' : 'Add'}
              </button>
            </div>
            {uploadTarget.allowed ? (
              <p className="form-hint mb-0 mt-2">
                Pasting a link copies nothing — the picture stays where it is. Uploaded images are cropped, and can be compressed, in your browser first.
              </p>
            ) : (
              <p className="form-hint mb-0 mt-2">{uploadTarget.reason}</p>
            )}
          </form>
        </div>
      </div>

      <div className="panel-card media-browse-card">
        <div className="media-browse">
          <div className="tab-strip media-browse__tabs">
            {folders.map((folder) => (
              <button
                key={folder}
                type="button"
                className={`tab-strip__item ${activeFolder === folder ? 'is-active' : ''}`.trim()}
                onClick={() => setActiveFolder(folder)}
              >
                {folder}
              </button>
            ))}
          </div>

          <div className="filter-bar media-browse__filters">
            <div className="search-input filter-bar__search">
              <Icon name="Search" size={16} />
              <input
                type="search"
                className="form-control"
                placeholder="Search media by name..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="filter-bar__field media-browse__sort">
              <select className="form-select" value={sortKey} onChange={(event) => setSortKey(event.target.value)} aria-label="Sort media">
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {isMobile ? null : (
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-control__item ${viewMode === 'grid' ? 'is-active' : ''}`.trim()}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                >
                  <Icon name="Grid" size={16} />
                </button>
                <button
                  type="button"
                  className={`segmented-control__item ${viewMode === 'list' ? 'is-active' : ''}`.trim()}
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                >
                  <Icon name="List" size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          icon="Images"
          title="No media found"
          description="Upload images and videos to reuse across your posts."
          actionLabel="Upload File"
          onAction={handleUploadClick}
        />
      ) : isMobile || viewMode === 'grid' ? (
        <>
        <div className="grid-toolbar">
          <TableToolbar pagination={pagination} />
        </div>
        <div className="media-grid">
          {pagination.pageItems.map((item) => (
            <MediaGridItem
              key={item.id}
              item={item}
              onOpen={() => setActiveItemId(item.id)}
              onCopyLink={() => handleCopyLink(item)}
              onCrop={() => handleRecrop(item)}
              onDelete={() => setItemPendingDelete(item)}
            />
          ))}
        </div>
        {pagination.totalPages > 1 ? (
          <div className="grid-pager">
            <Pager pagination={pagination} />
          </div>
        ) : null}
        </>
      ) : (
        <div className="panel-card">
          <TableToolbar pagination={pagination} />
          <div className="panel-card__body panel-card__body--flush">
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Stored in</th>
                    <th>Size</th>
                    <th>Folder</th>
                    <th>Uploaded by</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((item) => (
                    <tr key={item.id} onClick={() => setActiveItemId(item.id)} role="button">
                      <td className="table-row-title">{item.name}</td>
                      <td>{item.storageLabel}</td>
                      <td>{formatFileSize(item.sizeKb * 1024)}</td>
                      <td>{item.folder}</td>
                      <td>{item.uploadedBy}</td>
                      <td>{formatDate(item.uploadedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pager pagination={pagination} />
        </div>
      )}

      <Modal
        isOpen={Boolean(activeItem)}
        onClose={() => setActiveItemId(null)}
        title={activeItem?.name}
        footer={
          activeItem ? (
            <>
              <button type="button" className="btn btn-outline-secondary-custom" onClick={() => handleCopyLink(activeItem)}>
                <Icon name="Link" size={16} /> Copy link
              </button>
              <button type="button" className="btn btn-outline-secondary-custom text-danger" onClick={() => setItemPendingDelete(activeItem)}>
                <Icon name="Trash2" size={16} /> Delete
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/posts/create', { state: { preselectedMedia: activeItem } })}
              >
                <Icon name="PenSquare" size={16} /> Use in Post
              </button>
            </>
          ) : null
        }
      >
        {activeItem ? (
          <div>
            {activeItem.url && activeItem.type === MEDIA_TYPE.IMAGE ? (
              <img src={activeItem.url} alt={activeItem.name} className="media-preview-placeholder media-preview-placeholder--image mb-4" />
            ) : (
              <div className="media-preview-placeholder mb-4">
                <Icon name={activeItem.type === MEDIA_TYPE.VIDEO ? 'Video' : 'Image'} size={40} />
              </div>
            )}
            <dl className="media-detail-list">
              <dt>Stored in</dt>
              <dd>{activeItem.storageLabel}</dd>
              <dt>Folder</dt>
              <dd>{activeItem.folder}</dd>
              {activeItem.width && activeItem.height ? (
                <>
                  <dt>Dimensions</dt>
                  <dd>
                    {activeItem.width} × {activeItem.height} px
                  </dd>
                </>
              ) : null}
              <dt>Size</dt>
              <dd>{activeItem.storage === 'linked' ? 'Not stored here' : formatFileSize(activeItem.sizeKb * 1024)}</dd>
              <dt>Uploaded by</dt>
              <dd>{activeItem.uploadedBy}</dd>
              <dt>Uploaded on</dt>
              <dd>{formatDate(activeItem.uploadedAt)}</dd>
              <dt>Tags</dt>
              <dd>{activeItem.tags.join(', ') || '—'}</dd>
              <dt>Used in</dt>
              <dd>
                {activeItem.usedIn.length === 0 ? (
                  'Nowhere yet'
                ) : (
                  <ul className="media-usage-list mb-0">
                    {activeItem.usedIn.map((use) => (
                      <li key={`${use.kind}-${use.title}`}>
                        <span className="media-usage-list__kind">{describeUse(use)}</span>
                        {use.title}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
              {summarizeUsage(activeItem).atRisk.length > 0 ? (
                <>
                  <dt />
                  <dd className="text-warning-emphasis small">Some of these still need this file — see the warning before deleting.</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}
      </Modal>

      <DeleteMediaDialog
        item={itemPendingDelete}
        onClose={() => setItemPendingDelete(null)}
        onConfirm={handleDeleteConfirmed}
        isDeleting={isDeleting}
      />

      <FreeUpSpaceModal
        isOpen={isFreeUpOpen}
        onClose={() => setIsFreeUpOpen(false)}
        items={mediaItems}
        onConfirm={handleFreeUpConfirmed}
        isDeleting={isDeleting}
      />

      <ImageCropModal
        isOpen={Boolean(pendingImageFile)}
        file={pendingImageFile}
        onClose={closeCropModal}
        onComplete={handleCropComplete}
      />
    </div>
  );
}

export default MediaLibrary;
