import { useState } from 'react';
import { Link } from 'react-router-dom';
import PlatformPicker from './PlatformPicker';
import { useToast } from '../common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { createPost } from '../../services/api/postsApi';
import { useI18n } from '../../i18n/useI18n';

/**
 * "Save as a draft post": turns AI output (text and/or a Media Library file) into a real draft,
 * which can then be edited, scheduled or sent for approval from Posts like any other post.
 */
function SaveDraftPanel({ initialContent = '', initialPlatforms = [], mediaIds = [], idPrefix = 'draft' }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [content, setContent] = useState(initialContent);
  const [platforms, setPlatforms] = useState(initialPlatforms);
  const [savedPostId, setSavedPostId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  function handleSave() {
    if (!content.trim()) return showToast({ type: 'error', title: t('ai.draft.textRequired') });
    if (!platforms.length) return showToast({ type: 'error', title: t('ai.draft.platformRequired') });
    setIsSaving(true);
    createPost({ content: content.trim(), platforms, status: 'draft', mediaIds })
      .then((post) => {
        setSavedPostId(post.id);
        showToast({ type: 'success', title: t('ai.draft.savedTitle'), message: t('ai.draft.savedText') });
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  return (
    <div className="ai-save-draft">
      <label className="form-label" htmlFor={`${idPrefix}-content`}>
        {t('ai.draft.postText')}
      </label>
      <textarea id={`${idPrefix}-content`} className="form-control mb-3" rows={4} value={content} onChange={(event) => setContent(event.target.value)} maxLength={10000} />
      <PlatformPicker value={platforms} onChange={setPlatforms} idPrefix={`${idPrefix}-platform`} />
      <div className="d-flex align-items-center gap-3 mt-3 flex-wrap">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('billing.saving') : t('ai.draft.save')}
        </button>
        {savedPostId ? (
          <Link to={`/posts/${savedPostId}/edit`} className="fw-semibold text-decoration-none">
            {t('ai.draft.open')} →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default SaveDraftPanel;
