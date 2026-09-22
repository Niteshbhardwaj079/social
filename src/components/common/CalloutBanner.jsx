import Icon from './Icon';

function CalloutBanner({ icon = 'Info', tone = 'info', children }) {
  return (
    <div className={`callout-banner callout-banner--${tone}`}>
      <Icon name={icon} size={18} />
      <p className="mb-0">{children}</p>
    </div>
  );
}

export default CalloutBanner;
