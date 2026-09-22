import { Link } from 'react-router-dom';
import PlatformIcon from '../common/PlatformIcon';
import StatusBadge from '../common/StatusBadge';
import Icon from '../common/Icon';
import DropdownMenu from '../common/DropdownMenu';
import { getPlatformByKey } from '../../config/platforms';
import { platformHasPaidTier } from '../../config/platformProfileFields';
import { getNetworkForPlatform } from '../../config/adPlatforms';
import { isNetworkConnected } from '../../services/api/adsApi';
import { ACCOUNT_STATUS, ACCOUNT_STATUS_NEEDS_ATTENTION } from '../../config/constants';
import { formatCompactNumber, formatRelativeTime } from '../../utils/formatters';

function AccountCard({ account, onConnect, onDisconnect, onSync }) {
  const platform = getPlatformByKey(account.platform);
  const isConnected = account.status === ACCOUNT_STATUS.CONNECTED;
  const adNetwork = getNetworkForPlatform(account.platform);
  const adsReady = adNetwork ? isNetworkConnected(adNetwork.key) : false;
  const needsAttention = ACCOUNT_STATUS_NEEDS_ATTENTION.includes(account.status);

  return (
    <div className="account-card">
      <div className="account-card__top">
        <PlatformIcon platformKey={account.platform} size={44} />
        <div className="flex-grow-1 overflow-hidden">
          <div className="account-card__name">{account.accountName}</div>
          <div className="account-card__meta">{platform?.label}</div>
        </div>
        <DropdownMenu
          trigger={
            <button
              type="button"
              className="btn btn-icon-sm bg-transparent border-0"
              aria-label="Account options"
              data-tooltip="More options"
            >
              <Icon name="MoreVertical" size={16} />
            </button>
          }
        >
          {({ close }) => (
            <>
              <button type="button" className="dropdown-item" onClick={close}>
                <Icon name="Settings" size={16} /> Manage
              </button>
              {isConnected || needsAttention ? (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onSync?.(account.id);
                    close();
                  }}
                >
                  <Icon name="RefreshCw" size={16} /> Sync Now
                </button>
              ) : null}
              {isConnected || needsAttention ? (
                <button
                  type="button"
                  className="dropdown-item text-danger"
                  onClick={() => {
                    onDisconnect(account.id);
                    close();
                  }}
                >
                  <Icon name="Unlink" size={16} /> Disconnect
                </button>
              ) : null}
            </>
          )}
        </DropdownMenu>
      </div>

      <div className="d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <StatusBadge status={account.status} />
          {isConnected && adNetwork ? (
            <Link
              to={adsReady ? '/ads/create' : '/ads?tab=accounts'}
              className={`api-tier-chip ${adsReady ? 'is-paid' : ''}`.trim()}
              data-tooltip={adsReady ? `Create an ad on ${adNetwork.label}` : `Connect your ${adNetwork.label} account to run ads`}
            >
              {adsReady ? 'Ads ready' : 'Set up ads'}
            </Link>
          ) : null}
          {platformHasPaidTier(account.platform) ? (
            <span className={`api-tier-chip ${account.apiTier === 'paid' ? 'is-paid' : ''}`.trim()} data-tooltip="The plan your own API key is on">
              {account.apiTier === 'paid' ? 'Paid API' : 'Free API'}
            </span>
          ) : null}
        </div>
        {isConnected ? (
          <span className="small text-muted-custom">{formatCompactNumber(account.followers)} followers</span>
        ) : null}
      </div>

      {needsAttention && account.lastError ? <div className="small text-danger">{account.lastError}</div> : null}

      <div className="small text-muted-custom">
        {account.lastSyncedAt ? `Synced ${formatRelativeTime(account.lastSyncedAt)}` : 'Never synced'}
      </div>

      <div className="account-card__actions">
        {isConnected ? (
          <button type="button" className="btn btn-sm btn-outline-secondary-custom w-100">
            Manage
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-soft-primary w-100"
            onClick={() => onConnect(account.platform)}
          >
            {needsAttention ? 'Reconnect' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}

export default AccountCard;
