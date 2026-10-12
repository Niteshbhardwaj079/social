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

const SORT_KEYS = ['recent', 'oldest', 'name', 'largest'];

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
        showToast({ type: 'success', title: t('media.fileUploadedToast'), message: t('media.savedToStorage', { name: newItem.name, storage: newItem.storageLabel }) });
      },
      (error) => showToast({ type: 'error', title: t('media.uploadError'), message: apiErrorMessage(error) })
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
            title: t('media.imageUpdatedToast'),
            message: t('media.imageUpdatedMessage', { name: updated.name, size: formatFileSize(sizeBytes), oldSize: formatFileSize(target.sizeKb * 1024) }),
          });
        },
        (error) => showToast({ type: 'error', title: t('media.imageUpdateError'), message: apiErrorMessage(error) })
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
          title: t('media.fileUploadedToast'),
          message: t('media.uploadedWithCompression', { name: newItem.name, size: formatFileSize(sizeBytes), originalSize: formatFileSize(originalSizeBytes), storage: newItem.storageLabel }),
        });
      },
      (error) => showToast({ type: 'error', title: t('media.uploadError'), message: apiErrorMessage(error) })
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
      .catch(() => showToast({ type: 'error', title: t('media.cropOpenError') }));
  }

  function handleAddLink(event) {
    event.preventDefault();
    const url = linkUrl.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) {
      showToast({ type: 'error', title: t('media.enterFullLink'), message: t('media.enterFullLinkHint') });
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
          showToast({ type: 'success', title: t('media.imageAddedToast'), message: t('media.imageAddedMessage') });
        },
        (error) => {
          setIsAddingLink(false);
          showToast({ type: 'error', title: t('media.linkAddError'), message: apiErrorMessage(error) });
        }
      );
    };
    probe.onerror = () => {
      setIsAddingLink(false);
      showToast({ type: 'error', title: t('media.linkLoadError') });
    };
    probe.src = url;
  }

  function handleCopyLink(item) {
    copyToClipboard(item.publicUrl).then((copied) =>
      showToast(copied ? { type: 'success', title: t('media.linkCopiedToast') } : { type: 'error', title: t('media.linkCopyError') })
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
        showToast({ type: 'success', title: t('media.fileDeletedToast') });
      },
      (error) => {
        setIsDeleting(false);
        showToast({ type: 'error', title: t('media.fileDeleteError'), message: apiErrorMessage(error) });
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
        showToast({ type: 'success', title: t(count === 1 ? 'media.deletedCountOne' : 'media.deletedCountOther', { count }), message: t('media.freedMessage', { size: formatFileSize(freed) }) });
      },
      (error) => {
        setIsDeleting(false);
        showToast({ type: 'error', title: t('media.freeUpError'), message: apiErrorMessage(error) });
      }
    );
  }

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.mediaLibrary')} subtitle={t('media.loading')} />
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
              {t('media.freeUpSpace')}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleUploadClick}>
              <Icon name="Upload" size={16} />
              {t('media.upload')}
            </button>
          </>
        }
      />
      <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleFileSelected} />

      <StatCardGrid
        cards={[
          { key: 'files', label: t('media.statTotalFiles'), value: mediaItems.length, icon: 'Images', tone: 'primary' },
          { key: 'images', label: t('media.statImages'), value: imageCount, icon: 'Image', tone: 'sky' },
          { key: 'videos', label: t('media.statVideos'), value: videoCount, icon: 'Video', tone: 'purple' },
          { key: 'used', label: t('media.statUsed'), value: formatFileSize(usedBytes), icon: 'HardDrive', tone: 'green' },
          { key: 'inuse', label: t('media.statInUse'), value: inUseCount, icon: 'Link', tone: 'amber' },
        ]}
      />

      <StorageUsageBanner items={mediaItems} limitBytes={getStorageLimitBytes()} />

      <div className="panel-card media-add-card">
        <div className="panel-card__body">
          <form onSubmit={handleAddLink}>
            <div className="media-add-card__head">
              <label htmlFor="mediaLinkUrl" className="media-add-card__title">
                {t('media.addOnlineImageLabel')}
              </label>
              {uploadTarget.allowed ? (
                <span className="media-add-card__hint">
                  {t('media.savedToPrefix')} <strong>{uploadTarget.label}</strong> ·{' '}
                  <Link to="/settings/storage">{t('media.changeStorage')}</Link>
                </span>
              ) : (
                <span className="media-add-card__hint is-warning">
                  <Icon name="AlertTriangle" size={13} /> {t('media.uploadsOff')} ·{' '}
                  <Link to="/settings/storage">{t('media.openStorageSettings')}</Link>
                </span>
              )}
            </div>
            <div className="media-link-form__row">
              <input
                id="mediaLinkUrl"
                type="url"
                className="form-control"
                placeholder={t('media.linkPlaceholder')}
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
              <button type="submit" className="btn btn-outline-primary-custom" disabled={!linkUrl.trim() || isAddingLink}>
                {isAddingLink ? t('media.checking') : t('media.add')}
              </button>
            </div>
            {uploadTarget.allowed ? (
              <p className="form-hint mb-0 mt-2">{t('media.linkHint')}</p>
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
                {folder === 'All Media' ? t('media.allMediaFolder') : folder}
              </button>
            ))}
          </div>

          <div className="filter-bar media-browse__filters">
            <div className="search-input filter-bar__search">
              <Icon name="Search" size={16} />
              <input
                type="search"
                className="form-control"
                placeholder={t('media.searchPlaceholder')}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="filter-bar__field media-browse__sort">
              <select className="form-select" value={sortKey} onChange={(event) => setSortKey(event.target.value)} aria-label={t('media.sortAria')}>
                {SORT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(`media.sortOptions.${key}`)}
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
                  aria-label={t('media.gridViewAria')}
                >
                  <Icon name="Grid" size={16} />
                </button>
                <button
                  type="button"
                  className={`segmented-control__item ${viewMode === 'list' ? 'is-active' : ''}`.trim()}
                  onClick={() => setViewMode('list')}
                  aria-label={t('media.listViewAria')}
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
          title={t('media.emptyTitle')}
          description={t('media.emptyText')}
          actionLabel={t('media.uploadFile')}
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
                    <th>{t('media.colName')}</th>
                    <th>{t('media.colStoredIn')}</th>
                    <th>{t('media.colSize')}</th>
                    <th>{t('media.colFolder')}</th>
                    <th>{t('media.colUploadedBy')}</th>
                    <th>{t('media.colDate')}</th>
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
                <Icon name="Link" size={16} /> {t('media.copyLink')}
              </button>
              <button type="button" className="btn btn-outline-secondary-custom text-danger" onClick={() => setItemPendingDelete(activeItem)}>
                <Icon name="Trash2" size={16} /> {t('common.delete')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/posts/create', { state: { preselectedMedia: activeItem } })}
              >
                <Icon name="PenSquare" size={16} /> {t('media.useInPost')}
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
              <dt>{t('media.colStoredIn')}</dt>
              <dd>{activeItem.storageLabel}</dd>
              <dt>{t('media.colFolder')}</dt>
              <dd>{activeItem.folder === 'All Media' ? t('media.allMediaFolder') : activeItem.folder}</dd>
              {activeItem.width && activeItem.height ? (
                <>
                  <dt>{t('media.dimensionsLabel')}</dt>
                  <dd>{t('media.dimensions', { width: activeItem.width, height: activeItem.height })}</dd>
                </>
              ) : null}
              <dt>{t('media.colSize')}</dt>
              <dd>{activeItem.storage === 'linked' ? t('media.notStoredHere') : formatFileSize(activeItem.sizeKb * 1024)}</dd>
              <dt>{t('media.colUploadedBy')}</dt>
              <dd>{activeItem.uploadedBy}</dd>
              <dt>{t('media.uploadedOn')}</dt>
              <dd>{formatDate(activeItem.uploadedAt)}</dd>
              <dt>{t('media.tags')}</dt>
              <dd>{activeItem.tags.join(', ') || '—'}</dd>
              <dt>{t('media.usedIn')}</dt>
              <dd>
                {activeItem.usedIn.length === 0 ? (
                  t('media.nowhereYet')
                ) : (
                  <ul className="media-usage-list mb-0">
                    {activeItem.usedIn.map((use) => (
                      <li key={`${use.kind}-${use.title}`}>
                        <span className="media-usage-list__kind">{describeUse(use, t)}</span>
                        {use.title}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
              {summarizeUsage(activeItem).atRisk.length > 0 ? (
                <>
                  <dt />
                  <dd className="text-warning-emphasis small">{t('media.someStillNeedWarning')}</dd>
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
