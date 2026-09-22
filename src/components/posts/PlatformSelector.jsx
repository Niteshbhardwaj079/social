import PlatformIcon from '../common/PlatformIcon';
import Icon from '../common/Icon';
import { PLATFORMS } from '../../config/platforms';

function PlatformSelector({ selectedPlatforms, onChange, connectedPlatformKeys }) {
  function togglePlatform(platformKey) {
    if (selectedPlatforms.includes(platformKey)) {
      onChange(selectedPlatforms.filter((key) => key !== platformKey));
    } else {
      onChange([...selectedPlatforms, platformKey]);
    }
  }

  return (
    <div className="platform-selector-grid">
      {PLATFORMS.map((platform) => {
        const isConnected = connectedPlatformKeys.includes(platform.key);
        const isSelected = selectedPlatforms.includes(platform.key);

        return (
          <button
            key={platform.key}
            type="button"
            className={`platform-chip ${isSelected ? 'is-selected' : ''}`.trim()}
            onClick={() => togglePlatform(platform.key)}
            disabled={!isConnected}
            title={isConnected ? platform.label : `${platform.label} is not connected`}
          >
            <PlatformIcon platformKey={platform.key} size={22} />
            {platform.label}
            {isSelected ? <Icon name="Check" size={14} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export default PlatformSelector;
