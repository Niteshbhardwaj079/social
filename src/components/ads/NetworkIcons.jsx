import PlatformIcon from '../common/PlatformIcon';

// Every platform an ad network runs on, side by side — so Meta Ads shows
// Facebook AND Instagram instead of hiding Instagram behind one logo.
function NetworkIcons({ network, size = 44 }) {
  const platforms = network.platforms;
  const iconSize = platforms.length > 1 ? Math.round(size * 0.82) : size;
  return (
    <span className="network-icons" aria-label={network.subtitle}>
      {platforms.map((platformKey) => (
        <PlatformIcon key={platformKey} platformKey={platformKey} size={iconSize} />
      ))}
    </span>
  );
}

export default NetworkIcons;
