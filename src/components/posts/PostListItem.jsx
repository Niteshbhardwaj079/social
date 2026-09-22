import StatusBadge from '../common/StatusBadge';
import PlatformIcon from '../common/PlatformIcon';
import { formatDateTime } from '../../utils/formatters';

function PostListItem({ post, onClick }) {
  return (
    <button type="button" className="post-list-item" onClick={onClick}>
      <div className="post-list-item__platforms">
        {post.platforms.slice(0, 3).map((platformKey) => (
          <PlatformIcon key={platformKey} platformKey={platformKey} size={28} />
        ))}
        {post.platforms.length > 3 ? (
          <span className="post-list-item__more">+{post.platforms.length - 3}</span>
        ) : null}
      </div>
      <div className="post-list-item__content">
        <p className="post-list-item__text">{post.content}</p>
        <span className="post-list-item__meta">
          {post.scheduledAt ? formatDateTime(post.scheduledAt) : 'Not scheduled'}
        </span>
      </div>
      <StatusBadge status={post.status} />
    </button>
  );
}

export default PostListItem;
