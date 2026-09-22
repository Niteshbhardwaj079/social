import { useNavigate } from 'react-router-dom';
import StatusBadge from '../common/StatusBadge';
import PlatformIcon from '../common/PlatformIcon';
import Icon from '../common/Icon';
import { formatCompactNumber, formatDate } from '../../utils/formatters';

function CampaignCard({ campaign }) {
  const navigate = useNavigate();

  return (
    <div className="campaign-card" onClick={() => navigate(`/campaigns/${campaign.id}`)} role="button" tabIndex={0}>
      <div className="d-flex justify-content-between align-items-start mb-2">
        <h3 className="h5 mb-0">{campaign.name}</h3>
        <StatusBadge status={campaign.status} />
      </div>
      <p className="text-secondary-custom small mb-3 table-cell-truncate">{campaign.description}</p>

      <div className="d-flex align-items-center gap-2 mb-3">
        {campaign.platforms.map((platformKey) => (
          <PlatformIcon key={platformKey} platformKey={platformKey} size={26} />
        ))}
      </div>

      <div className="campaign-card__meta">
        <span className="d-inline-flex align-items-center gap-1">
          <Icon name="CalendarDays" size={14} />
          {formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}
        </span>
        <span>{campaign.owner}</span>
      </div>

      <div className="campaign-card__stats">
        <div>
          <span className="campaign-card__stat-value">{campaign.postsCount}</span>
          <span className="campaign-card__stat-label">Posts</span>
        </div>
        <div>
          <span className="campaign-card__stat-value">{formatCompactNumber(campaign.reach)}</span>
          <span className="campaign-card__stat-label">Reach</span>
        </div>
        <div>
          <span className="campaign-card__stat-value">{formatCompactNumber(campaign.engagement)}</span>
          <span className="campaign-card__stat-label">Engagement</span>
        </div>
        <div>
          <span className="campaign-card__stat-value">{formatCompactNumber(campaign.clicks)}</span>
          <span className="campaign-card__stat-label">Clicks</span>
        </div>
      </div>
    </div>
  );
}

export default CampaignCard;
