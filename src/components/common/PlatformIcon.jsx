import { getPlatformByKey } from '../../config/platforms';
import { pxToRem } from '../../utils/uiScale';

/**
 * Renders a simple, recognizable glyph for each supported platform on a
 * colored badge. Lucide's icon set does not include brand/logo marks, so
 * these are small custom glyphs (not exact reproductions of official logos)
 * kept in one place — update a platform's look here only.
 */
const PLATFORM_GLYPHS = {
  facebook: (
    <path d="M13.5 9H15V6.5h-2A3.5 3.5 0 0 0 9.5 10v1.5H8V14h1.5v6h2.5v-6H14l.5-2.5H12V10c0-.6.4-1 1-1z" fill="#fff" />
  ),
  instagram: (
    <g fill="none" stroke="#fff" strokeWidth="1.6">
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.2" />
      <circle cx="12" cy="12" r="2.8" />
      <circle cx="15.6" cy="8.4" r="0.6" fill="#fff" stroke="none" />
    </g>
  ),
  x: (
    <path
      d="M7 7l10 10M17 7L7 17"
      fill="none"
      stroke="#fff"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  ),
  linkedin: (
    <g fill="#fff">
      <rect x="7" y="10" width="2.2" height="7" />
      <circle cx="8.1" cy="7.3" r="1.2" />
      <path d="M11.6 10h2.1v1.1c.5-.8 1.3-1.3 2.4-1.3 2 0 2.9 1.3 2.9 3.5V17h-2.2v-3.3c0-1-.4-1.7-1.3-1.7-.8 0-1.3.5-1.5 1-.1.2-.1.5-.1.8V17h-2.2z" />
    </g>
  ),
  linkedinCompany: (
    <g fill="#fff">
      <rect x="7" y="10" width="2.2" height="7" />
      <circle cx="8.1" cy="7.3" r="1.2" />
      <path d="M11.6 10h2.1v1.1c.5-.8 1.3-1.3 2.4-1.3 2 0 2.9 1.3 2.9 3.5V17h-2.2v-3.3c0-1-.4-1.7-1.3-1.7-.8 0-1.3.5-1.5 1-.1.2-.1.5-.1.8V17h-2.2z" />
    </g>
  ),
  googleBusiness: (
    <path
      d="M17.6 12.2c0-.5 0-1-.1-1.4h-5.4v2.7h3.1c-.1.7-.5 1.4-1.2 1.8v1.5h1.9c1.1-1 1.7-2.5 1.7-4.3v-.3z M12.1 17.5c1.5 0 2.8-.5 3.7-1.4l-1.9-1.5c-.5.4-1.2.6-1.8.6-1.4 0-2.6-1-3-2.3H7.1v1.5c.9 1.9 2.8 3.1 5 3.1z M9.1 13c-.1-.3-.2-.7-.2-1s.1-.7.2-1V9.5H7.1c-.3.7-.5 1.6-.5 2.5s.2 1.8.5 2.5z M12.1 8.7c.8 0 1.6.3 2.1.8l1.6-1.6c-1-1-2.3-1.6-3.7-1.6-2.2 0-4.1 1.2-5 3.1l2 1.5c.4-1.3 1.6-2.2 3-2.2z"
      fill="#fff"
    />
  ),
  youtube: (
    <g>
      <rect x="6.5" y="8.5" width="11" height="7" rx="2" fill="none" stroke="#fff" strokeWidth="1.4" />
      <path d="M10.8 10.6v3.2l2.8-1.6z" fill="#fff" />
    </g>
  ),
  pinterest: (
    <path
      d="M12 6.5c-3 0-5 2-5 4.6 0 1.6.9 2.8 2.2 3.3.1-.3.2-.7.3-1 .1-.3.4-1.6.4-1.6s-.2-.4-.2-1c0-.9.5-1.6 1.2-1.6.6 0 .9.4.9 1 0 .6-.4 1.5-.6 2.3-.2.7.3 1.3 1.1 1.3 1.3 0 2.2-1.6 2.2-3.5 0-1.4-1-2.5-2.8-2.5-2 0-3.3 1.5-3.3 3.2 0 .6.2 1 .4 1.3.1.1.1.2.1.3l-.2.7c0 .1-.1.2-.3.1-.9-.4-1.4-1.5-1.4-2.7 0-2.2 1.9-4.8 5.1-4.8 2.5 0 4.2 1.8 4.2 3.9 0 2.7-1.5 4.7-3.7 4.7-.7 0-1.4-.4-1.7-.8l-.5 1.8c-.2.7-.5 1.4-.9 1.9.5.1 1 .2 1.6.2 3.6 0 6.4-2.9 6.4-6.6 0-3.6-2.9-6.4-6.6-6.4z"
      fill="#fff"
    />
  ),
  tiktok: (
    <path
      d="M14.5 6.5c.3 1.4 1.2 2.3 2.6 2.5v2c-.9 0-1.8-.3-2.6-.8v4.3c0 2.1-1.7 3.7-3.7 3.7-2.1 0-3.7-1.7-3.7-3.7 0-2.1 1.7-3.7 3.7-3.7.2 0 .4 0 .6.1v2.1c-.2-.1-.4-.1-.6-.1-.9 0-1.6.7-1.6 1.6 0 .9.7 1.6 1.6 1.6.9 0 1.7-.7 1.7-1.6V6.5z"
      fill="#fff"
    />
  ),
  mastodon: (
    <path
      d="M17 9.8c0-2.4-1.6-3.1-1.6-3.1-.8-.4-2.2-.5-3.6-.5h0c-1.4 0-2.8.1-3.6.5 0 0-1.6.7-1.6 3.1 0 .6-.01 1.3 0 2 .05 2.6.23 5.2 4.7 5.3.5 0 1-.02 1.4-.1v-1.6s-.8.2-1.7.2c-1.8-.1-1.9-.9-2-1.3.7.4 1.7.6 2.8.6 1.4 0 2.6-.3 3.6-.8-.1.5-.02 1.1-.2 1.7l1.5-.4c.2-.7.3-1.5.3-2.1V9.8zm-1.9 2.8h-1.5V9.7c0-.6-.2-1-.7-1-.4 0-.6.3-.7.7v1.8h-1.5V9.4c0-.4-.3-.7-.7-.7-.5 0-.7.4-.7 1v2.9H7.9V9.3c0-1.5 1-2.3 2.1-2.3.7 0 1.2.3 1.5.9.3-.6.8-.9 1.5-.9 1.1 0 2.1.8 2.1 2.3v3.3z"
      fill="#fff"
    />
  ),
  threads: (
    <path
      d="M12 6.5c-3 0-4.9 1.9-4.9 5s2 5.2 4.9 5.2c1.6 0 2.7-.5 3.5-1.2l-.9-1.3c-.6.5-1.3.8-2.4.8-1.4 0-2.5-.7-2.8-2 1 .2 2.4.3 3.6 0 1.5-.3 2.4-1.2 2.4-2.5 0-1.5-1.3-2.5-3.1-2.5-1.5 0-2.7.6-3.5 1.7l1.2.9c.5-.7 1.2-1.1 2.1-1.1.8 0 1.4.4 1.4 1 0 .5-.4.8-1.2 1-.9.2-2 .1-2.9-.1.1-1.5 1-2.6 2.5-2.6.2 0 .4 0 .6.1z"
      fill="#fff"
    />
  ),
  bluesky: (
    <path
      d="M12 9.8c-.6-1.3-2.3-3.7-3.8-3.7-1.5 0-2 1-2 2 0 1.2.6 3.6 2.6 4.4-1.7-.2-3.3.3-3.3 1.9 0 1.8 2.1 2.5 3.6 1.7 1-.5 2-1.6 2.9-3.1.9 1.5 1.9 2.6 2.9 3.1 1.5.8 3.6.1 3.6-1.7 0-1.6-1.6-2.1-3.3-1.9 2-.8 2.6-3.2 2.6-4.4 0-1-.5-2-2-2-1.5 0-3.2 2.4-3.8 3.7z"
      fill="#fff"
    />
  ),
};

function PlatformIcon({ platformKey, size = 32, rounded = true, className = '' }) {
  const platform = getPlatformByKey(platformKey);
  const glyph = PLATFORM_GLYPHS[platformKey];

  if (!platform || !glyph) {
    return null;
  }

  const iconStyle = {
    '--platform-icon-size': pxToRem(size),
    '--platform-icon-bg': platform.color,
  };

  return (
    <span
      className={`platform-icon ${rounded ? '' : 'platform-icon--square'} ${className}`.trim()}
      style={iconStyle}
      aria-label={platform.label}
      title={platform.label}
    >
      <svg width={pxToRem(size * 0.6)} height={pxToRem(size * 0.6)} viewBox="0 0 24 24">
        {glyph}
      </svg>
    </span>
  );
}

export default PlatformIcon;
