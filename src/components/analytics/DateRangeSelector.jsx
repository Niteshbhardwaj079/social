import { DATE_RANGE_PRESETS } from '../../config/constants';
import { useI18n } from '../../i18n/useI18n';

const PRESET_LABEL_KEYS = {
  [DATE_RANGE_PRESETS.LAST_7_DAYS]: 'days7',
  [DATE_RANGE_PRESETS.LAST_30_DAYS]: 'days30',
  [DATE_RANGE_PRESETS.LAST_90_DAYS]: 'days90',
  [DATE_RANGE_PRESETS.CUSTOM]: 'custom',
};

function DateRangeSelector({ value, onChange }) {
  const { t } = useI18n();
  return (
    <div className="segmented-control">
      {Object.values(DATE_RANGE_PRESETS).map((preset) => (
        <button
          key={preset}
          type="button"
          className={`segmented-control__item ${value === preset ? 'is-active' : ''}`.trim()}
          onClick={() => onChange(preset)}
        >
          {t(`analytics.dateRangePresets.${PRESET_LABEL_KEYS[preset]}`)}
        </button>
      ))}
    </div>
  );
}

export default DateRangeSelector;
