import Icon from '../common/Icon';
import { getPlatformByKey } from '../../config/platforms';
import brand from '../../config/brand';

// A rough look at how the ad will read. The real placement styling is decided by each platform.
function AdPreview({ creative, platformKey, imageUrl }) {
  const platform = getPlatformByKey(platformKey);
  return (
    <div className="ad-preview">
      <div className="ad-preview__head">
        <span className="ad-preview__avatar">{brand.name.slice(0, 1)}</span>
        <div>
          <div className="ad-preview__name">{brand.name}</div>
          <div className="ad-preview__sponsored">Sponsored{platform ? ` · ${platform.label}` : ''}</div>
        </div>
      </div>
      <p className="ad-preview__text">{creative.text || 'Your ad text appears here.'}</p>
      <div className="ad-preview__media">{imageUrl ? <img src={imageUrl} alt="" /> : <Icon name="Image" size={34} />}</div>
      <div className="ad-preview__foot">
        <div className="ad-preview__foot-text">
          <div className="ad-preview__url">{(creative.destinationUrl || brand.website).replace(/^https?:\/\//, '')}</div>
          <div className="ad-preview__headline">{creative.headline || 'Your headline'}</div>
        </div>
        <span className="ad-preview__cta">{creative.cta || 'Learn more'}</span>
      </div>
    </div>
  );
}

export default AdPreview;
