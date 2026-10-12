import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import ErrorState from '../../components/common/ErrorState';
import { SkeletonKpiRow } from '../../components/common/LoadingSkeleton';
import PlatformSelector from '../../components/posts/PlatformSelector';
import MediaUploader from '../../components/posts/MediaUploader';
import PostPreview from '../../components/posts/PostPreview';
import SchedulePicker from '../../components/posts/SchedulePicker';
import EmojiPicker from '../../components/common/EmojiPicker';
import { getSocialAccounts, getPinterestBoards } from '../../services/api/socialAccountsApi';
import { getCampaigns } from '../../services/api/campaignsApi';
import { createPost, getPostById, updatePost } from '../../services/api/postsApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { API_ENABLED } from '../../config/runtime';
import { getPlatformByKey } from '../../config/platforms';
import { useToast } from '../../components/common/ToastProvider';
import { ACCOUNT_STATUS, POST_STATUS, REQUEST_STATUS } from '../../config/constants';
import { useI18n } from '../../i18n/useI18n';

const CHARACTER_LIMIT = 2200;
const CHARACTER_WARNING_THRESHOLD = 0.9;

// Roles that may schedule and publish; the others can only save drafts and ask for approval (the server enforces this too).
const PUBLISHER_ROLES = ['superAdmin', 'admin', 'editor'];

function PostComposer({ postId }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const textareaRef = useRef(null);
  const role = useSelector((state) => state.auth.currentUser?.role);
  const canPublish = !API_ENABLED || PUBLISHER_ROLES.includes(role);
  const canWrite = !API_ENABLED || role !== 'analyst';
  const isEditing = Boolean(postId);
  // "Use in Post" from the Media Library hands off one file via navigation state — only relevant to a fresh post.
  const preselectedMedia = !isEditing ? location.state?.preselectedMedia : null;
  // "Add Post" from a Campaign's own page hands off which campaign this new post belongs to the same way.
  const preselectedCampaignId = !isEditing ? location.state?.campaignId ?? '' : '';

  const [connectedPlatformKeys, setConnectedPlatformKeys] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState(preselectedCampaignId);
  const [pinterestBoards, setPinterestBoards] = useState([]);
  const [pinterestBoardId, setPinterestBoardId] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [content, setContent] = useState('');
  const [mediaItems, setMediaItems] = useState(() =>
    preselectedMedia
      ? [{ id: preselectedMedia.id, mediaId: preselectedMedia.id, name: preselectedMedia.name, type: preselectedMedia.type, previewUrl: preselectedMedia.publicUrl }]
      : []
  );
  const [scheduledAt, setScheduledAt] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [existingPost, setExistingPost] = useState(null);
  const [loadStatus, setLoadStatus] = useState(isEditing ? REQUEST_STATUS.LOADING : REQUEST_STATUS.SUCCEEDED);

  useEffect(() => {
    if (!postId) return undefined;
    let cancelled = false;
    getPostById(postId)
      .then((post) => {
        if (cancelled) return;
        if (!post) throw new Error('Post not found');
        setExistingPost(post);
        setContent(post.content);
        setSelectedPlatforms(post.platforms);
        setScheduledAt(post.scheduledAt && post.status !== POST_STATUS.PUBLISHED ? new Date(post.scheduledAt) : null);
        setMediaItems((post.media || []).map((item) => ({ id: item.id, mediaId: item.id, name: item.name, type: item.type, previewUrl: item.publicUrl })));
        setCampaignId(post.campaignId || '');
        setPinterestBoardId(post.pinterestBoardId || '');
        setLoadStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => {
        if (!cancelled) setLoadStatus(REQUEST_STATUS.FAILED);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    getSocialAccounts()
      .then((accounts) => {
        setConnectedPlatformKeys(
          accounts.filter((account) => account.status === ACCOUNT_STATUS.CONNECTED).map((account) => account.platform)
        );
      })
      .catch(() => setConnectedPlatformKeys([]));
  }, []);

  useEffect(() => {
    getCampaigns()
      .then(setCampaigns)
      .catch(() => setCampaigns([]));
  }, []);

  useEffect(() => {
    getPinterestBoards()
      .then(setPinterestBoards)
      .catch(() => setPinterestBoards([]));
  }, []);

  function insertAtCursor(text) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((current) => current + text);
      return;
    }
    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;
    const nextValue = `${content.slice(0, start)}${text}${content.slice(end)}`;
    setContent(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + text.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }

  const characterCount = content.length;
  const characterRatio = characterCount / CHARACTER_LIMIT;
  const counterClassName =
    characterRatio >= 1 ? 'is-danger' : characterRatio >= CHARACTER_WARNING_THRESHOLD ? 'is-warning' : '';

  function buildPostPayload(status) {
    return {
      content,
      platforms: selectedPlatforms,
      status,
      // "Publish now" goes out immediately, so a time would only confuse; every other status keeps the chosen time.
      scheduledAt: status !== POST_STATUS.PUBLISHED && scheduledAt ? scheduledAt.toISOString() : null,
      // Only real, already-uploaded files count — one still mid-upload has no id yet and is left out.
      mediaIds: API_ENABLED ? mediaItems.filter((item) => item.mediaId).map((item) => item.mediaId) : undefined,
      campaignId: campaignId || null,
      pinterestBoardId: selectedPlatforms.includes('pinterest') ? pinterestBoardId || null : null,
    };
  }

  function handleSave(status, successMessage) {
    if (!content.trim()) {
      showToast({ type: 'error', title: t('composer.addContentTitle'), message: t('composer.addContentMessage') });
      return;
    }
    if (selectedPlatforms.length === 0) {
      showToast({ type: 'error', title: t('composer.selectPlatformTitle'), message: t('composer.selectPlatformMessage') });
      return;
    }
    if (status !== POST_STATUS.DRAFT && selectedPlatforms.includes('pinterest') && !pinterestBoardId) {
      showToast({ type: 'error', title: t('composer.choosePinterestBoardTitle'), message: t('composer.pinterestNeedsBoardMessage') });
      return;
    }

    setIsSubmitting(true);
    setPendingStatus(status);
    const payload = buildPostPayload(status);
    (isEditing ? updatePost(postId, payload) : createPost(payload))
      .then((post) => {
        const failedTarget = API_ENABLED && status === POST_STATUS.PUBLISHED ? post.targets?.find((target) => target.status === 'failed') : null;
        if (failedTarget) {
          // The post exists and some platforms may have worked: say which one did not, and why.
          showToast({
            type: 'error',
            title: t('composer.notAllPublishedTitle'),
            message: `${getPlatformByKey(failedTarget.platform)?.label || failedTarget.platform}: ${failedTarget.error}`,
          });
        } else {
          showToast({ type: 'success', title: successMessage });
        }
        navigate('/posts');
      })
      .catch((error) => {
        setIsSubmitting(false);
        setPendingStatus(null);
        showToast({ type: 'error', title: apiErrorMessage(error, t('composer.postSaveError')) });
      });
  }

  if (loadStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.createPost')} />
        <SkeletonKpiRow count={3} />
      </>
    );
  }

  if (loadStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.createPost')} />
        <ErrorState onRetry={() => navigate(0)} />
      </>
    );
  }

  const isLocked = existingPost?.status === POST_STATUS.PUBLISHED || existingPost?.status === POST_STATUS.PUBLISHING;
  const isBlocked = isLocked || !canWrite;
  const busyLabel = (status, idle, busy) => (pendingStatus === status ? busy : idle);

  return (
    <div className="fade-in composer-page">
      <PageHeader title={t('nav.createPost')} subtitle={t('pages.createPost')} guideChapterId="posts" />

      {isLocked ? (
        <div className="callout-banner callout-banner--info mb-4" role="status">
          <span>{existingPost.status === POST_STATUS.PUBLISHING ? t('composer.lockedPublishing') : t('composer.lockedPublished')}</span>
        </div>
      ) : null}
      {!canWrite ? (
        <div className="callout-banner callout-banner--info mb-4" role="status">
          <span>{t('composer.readOnlyNotice')}</span>
        </div>
      ) : null}
      {canWrite && !canPublish ? (
        <div className="callout-banner callout-banner--info mb-4" role="status">
          <span>{t('composer.limitedRoleNotice')}</span>
        </div>
      ) : null}

      <div className="composer-layout">
        <div className="composer-layout__main">
          <div className="panel-card mb-5">
            <div className="panel-card__header">
              <h3 className="panel-card__title">{t('composer.platforms')}</h3>
            </div>
            <div className="panel-card__body">
              <PlatformSelector
                selectedPlatforms={selectedPlatforms}
                onChange={setSelectedPlatforms}
                connectedPlatformKeys={connectedPlatformKeys}
              />
              {connectedPlatformKeys.length === 0 ? (
                <p className="form-hint mt-3 mb-0">
                  {t('composer.noAccountsConnected')}{' '}
                  <button type="button" className="btn btn-link p-0 small" onClick={() => navigate('/social-accounts/connect')}>
                    {t('composer.connectAccountLink')}
                  </button>{' '}
                  {t('composer.toEnablePosting')}
                </p>
              ) : null}
              {selectedPlatforms.includes('pinterest') ? (
                <div className="mt-3">
                  <label htmlFor="pinterestBoard" className="form-label-custom">
                    {t('composer.pinterestBoard')}
                  </label>
                  <select
                    id="pinterestBoard"
                    className="form-select"
                    value={pinterestBoardId}
                    onChange={(event) => setPinterestBoardId(event.target.value)}
                  >
                    <option value="">{t('composer.choosePinterestBoardOption')}</option>
                    {pinterestBoards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.name}
                      </option>
                    ))}
                  </select>
                  {pinterestBoards.length === 0 ? (
                    <p className="form-hint mt-2 mb-0">{t('composer.noPinterestBoards')}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel-card mb-5">
            <div className="panel-card__header">
              <h3 className="panel-card__title">{t('composer.content')}</h3>
            </div>
            <div className="panel-card__body">
              <textarea
                ref={textareaRef}
                className="form-control composer-textarea"
                placeholder={t('composer.contentPlaceholder')}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={6}
              />
              <div className="d-flex justify-content-between align-items-center mt-2">
                <div className="d-flex gap-2">
                  <EmojiPicker onSelect={(emoji) => insertAtCursor(emoji)} />
                  <button type="button" className="btn btn-icon-sm btn-outline-secondary-custom" title={t('composer.addHashtag')} onClick={() => insertAtCursor('#')}>
                    #
                  </button>
                  <button type="button" className="btn btn-icon-sm btn-outline-secondary-custom" title={t('composer.mentionSomeone')} onClick={() => insertAtCursor('@')}>
                    @
                  </button>
                </div>
                <span className={`character-counter ${counterClassName}`.trim()}>
                  {characterCount} / {CHARACTER_LIMIT}
                </span>
              </div>
            </div>
          </div>

          <div className="panel-card mb-5">
            <div className="panel-card__header">
              <h3 className="panel-card__title">{t('composer.media')}</h3>
            </div>
            <div className="panel-card__body">
              <MediaUploader
                mediaItems={mediaItems}
                onAdd={(items) => setMediaItems((current) => [...current, ...items])}
                onRemove={(id) => setMediaItems((current) => current.filter((item) => item.id !== id))}
              />
              {API_ENABLED ? (
                <p className="form-hint mt-3 mb-0">{t('composer.googleBusinessNote')}</p>
              ) : null}
            </div>
          </div>

          <div className="panel-card mb-5">
            <div className="panel-card__header">
              <h3 className="panel-card__title">{t('composer.campaign')}</h3>
            </div>
            <div className="panel-card__body">
              <select
                className="form-select"
                aria-label={t('composer.campaign')}
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
              >
                <option value="">{t('composer.noCampaign')}</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-card__header">
              <h3 className="panel-card__title">{t('composer.schedule')}</h3>
            </div>
            <div className="panel-card__body">
              <SchedulePicker scheduledAt={scheduledAt} onChange={setScheduledAt} />
            </div>
          </div>
        </div>

        <div className="composer-layout__preview">
          <div className="panel-card">
            <div className="panel-card__header">
              <h3 className="panel-card__title">{t('composer.preview')}</h3>
            </div>
            <div className="panel-card__body d-flex flex-column gap-4">
              {selectedPlatforms.length === 0 ? (
                <p className="text-muted-custom mb-0">{t('composer.selectPlatformPreview')}</p>
              ) : (
                selectedPlatforms.map((platformKey) => (
                  <PostPreview key={platformKey} platformKey={platformKey} content={content} mediaItems={mediaItems} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="composer-action-bar">
        <button type="button" className="btn btn-outline-secondary-custom" disabled={isSubmitting || isBlocked} onClick={() => handleSave(POST_STATUS.DRAFT, t('composer.draftSavedToast'))}>
          {busyLabel(POST_STATUS.DRAFT, t('composer.saveDraft'), t('common.saving'))}
        </button>
        <button type="button" className="btn btn-outline-secondary-custom" disabled={isSubmitting || isBlocked} onClick={() => handleSave(POST_STATUS.PENDING_APPROVAL, t('composer.submittedForApprovalToast'))}>
          {busyLabel(POST_STATUS.PENDING_APPROVAL, t('composer.submitForApproval'), t('composer.submitting'))}
        </button>
        {canPublish ? (
          <>
            <button type="button" className="btn btn-soft-primary" disabled={isSubmitting || isBlocked || !scheduledAt} onClick={() => handleSave(POST_STATUS.SCHEDULED, t('composer.postScheduledToast'))}>
              {busyLabel(POST_STATUS.SCHEDULED, t('composer.schedule'), t('composer.scheduling'))}
            </button>
            <button type="button" className="btn btn-primary" disabled={isSubmitting || isBlocked} onClick={() => handleSave(POST_STATUS.PUBLISHED, t('composer.postPublishedToast'))}>
              {busyLabel(POST_STATUS.PUBLISHED, t('composer.publishNow'), t('composer.publishing'))}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// One composer per post: opening another post (or a new one) starts from a clean slate.
function CreatePost() {
  const { postId } = useParams();
  return <PostComposer key={postId || 'new'} postId={postId} />;
}

export default CreatePost;
