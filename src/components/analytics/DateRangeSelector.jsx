import { DATE_RANGE_PRESETS, DATE_RANGE_PRESET_LABELS } from '../../config/constants';

function DateRangeSelector({ value, onChange }) {
  return (
    <div className="segmented-control">
      {Object.values(DATE_RANGE_PRESETS).map((preset) => (
        <button
          key={preset}
          type="button"
          className={`segmented-control__item ${value === preset ? 'is-active' : ''}`.trim()}
          onClick={() => onChange(preset)}
        >
          {DATE_RANGE_PRESET_LABELS[preset]}
        </button>
      ))}
    </div>
  );
}

export default DateRangeSelector;
