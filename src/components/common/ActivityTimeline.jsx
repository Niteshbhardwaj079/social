import Avatar from './Avatar';
import { formatRelativeTime } from '../../utils/formatters';

function ActivityTimeline({ items }) {
  if (!items.length) {
    return <p className="text-muted-custom mb-0">No recent activity yet.</p>;
  }

  return (
    <ul className="list-unstyled mb-0 d-flex flex-column gap-3">
      {items.map((item) => (
        <li key={item.id} className="d-flex gap-3">
          <Avatar name={item.user} size="sm" />
          <div>
            <div className="small">
              <strong>{item.user}</strong> {item.action} <strong>{item.target}</strong>
            </div>
            <div className="small text-muted-custom">{formatRelativeTime(item.time)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default ActivityTimeline;
