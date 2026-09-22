import PlatformIcon from '../common/PlatformIcon';
import { getPlatformByKey } from '../../config/platforms';
import brand from '../../config/brand';

function PostPreview({ platformKey, content, mediaItems }) {
  const platform = getPlatformByKey(platformKey);

  return (
    <div className="post-preview-card">
      <div className="post-preview-card__header">
        <PlatformIcon platformKey={platformKey} size={32} />
        <div>
          <div className="post-preview-card__account">{brand.name}</div>
          <div className="post-preview-card__platform">{platform?.label}</div>
        </div>
      </div>
      <p className="post-preview-card__text">{content || 'Your post content will appear here...'}</p>
      {mediaItems.length > 0 ? (
        <div className="post-preview-card__media">
          {mediaItems[0].type === 'video' ? (
            <video src={mediaItems[0].previewUrl} className="post-preview-card__media-item" muted />
          ) : (
            <img src={mediaItems[0].previewUrl} alt="" className="post-preview-card__media-item" />
          )}
        </div>
      ) : null}
    </div>
  );
}

export default PostPreview;
