import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import PlatformIcon from '../common/PlatformIcon';
import { getPosts } from '../../services/api/postsApi';
import { POST_STATUS } from '../../config/constants';
import RECYCLE_INTERVALS from '../../config/recyclingIntervals';
import { useI18n } from '../../i18n/useI18n';
import brand from '../../config/brand';

function AddToRecyclingModal({ isOpen, onClose, onSubmit, excludePostIds }) {
  const { t } = useI18n();
  const [publishedPosts, setPublishedPosts] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [intervalDays, setIntervalDays] = useState(RECYCLE_INTERVALS[1].value);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPostId(null);
    setIntervalDays(RECYCLE_INTERVALS[1].value);
    getPosts().then((posts) => {
      setPublishedPosts(
        posts.filter((post) => post.status === POST_STATUS.PUBLISHED && !excludePostIds.includes(post.id))
      );
    });
  }, [isOpen, excludePostIds]);

  function handleSubmit(event) {
    event.preventDefault();
    const post = publishedPosts.find((item) => item.id === selectedPostId);
    if (!post) return;
    onSubmit(post, intervalDays);
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button type="submit" form="add-recycling-form" className="btn btn-primary" disabled={!selectedPostId}>
        {t('recycling.addToRecycling')}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('recycling.addToRecycling')} footer={footer} size="lg">
      <form id="add-recycling-form" onSubmit={handleSubmit}>
        <label className="form-label-custom">{t('recycling.addModal.pickPost')}</label>
        {publishedPosts.length === 0 ? (
          <p className="text-muted-custom small">{t('recycling.addModal.noEligible')}</p>
        ) : (
          <div className="recycling-post-picker mb-4">
            {publishedPosts.map((post) => (
              <label
                key={post.id}
                className={`recycling-post-picker__item ${selectedPostId === post.id ? 'is-selected' : ''}`.trim()}
              >
                <input
                  type="radio"
                  name="recyclingPost"
                  value={post.id}
                  checked={selectedPostId === post.id}
                  onChange={() => setSelectedPostId(post.id)}
                />
                <div className="d-flex gap-1">
                  {post.platforms.map((platformKey) => (
                    <PlatformIcon key={platformKey} platformKey={platformKey} size={20} />
                  ))}
                </div>
                <span className="recycling-post-picker__text">{post.content}</span>
              </label>
            ))}
          </div>
        )}

        <label htmlFor="recycleInterval" className="form-label-custom">
          {t('recycling.addModal.repeatInterval')}
        </label>
        <select
          id="recycleInterval"
          className="form-select"
          value={intervalDays}
          onChange={(event) => setIntervalDays(Number(event.target.value))}
        >
          {RECYCLE_INTERVALS.map((interval) => (
            <option key={interval.value} value={interval.value}>
              {t(`recycling.intervals.${interval.labelKey}`)}
            </option>
          ))}
        </select>
        <p className="form-hint mb-0">{t('recycling.addModal.hint', { product: brand.productName })}</p>
      </form>
    </Modal>
  );
}

export default AddToRecyclingModal;
