import { PLATFORMS } from '../../config/platforms';
import { useI18n } from '../../i18n/useI18n';

/** Toggle chips for choosing social platforms. `value` is an array of platform keys. */
function PlatformPicker({ value, onChange, idPrefix = 'platform' }) {
  const { t } = useI18n();
  function toggle(key) {
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  }
  return (
    <div className="ai-platform-picker" role="group" aria-label={t('ai.platforms')}>
      {PLATFORMS.map((platform) => (
        <button
          key={platform.key}
          id={`${idPrefix}-${platform.key}`}
          type="button"
          className={`ai-chip ${value.includes(platform.key) ? 'is-on' : ''}`.trim()}
          aria-pressed={value.includes(platform.key)}
          onClick={() => toggle(platform.key)}
        >
          {platform.label}
        </button>
      ))}
    </div>
  );
}

export default PlatformPicker;
