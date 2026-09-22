import DropdownMenu from '../common/DropdownMenu';
import Icon from '../common/Icon';
import { generateTimeOptions, formatTimeOfDay } from '../../utils/timeOptions';

const TIME_OPTIONS = generateTimeOptions();

function TimeSelectField({ id, label, hours, minutes, onChange, placeholder = 'Select time', className = '' }) {
  const hasValue = hours != null && minutes != null;
  const selectedLabel = hasValue ? formatTimeOfDay(hours, minutes) : null;

  return (
    <div className={`mb-4 ${className}`.trim()}>
      {label ? (
        <label htmlFor={id} className="form-label-custom">
          {label}
        </label>
      ) : null}
      <DropdownMenu
        align="start"
        trigger={
          <button type="button" id={id} className="date-picker-trigger">
            <Icon name="Clock" size={16} />
            <span className={selectedLabel ? 'date-picker-trigger__value' : 'date-picker-trigger__placeholder'}>
              {selectedLabel || placeholder}
            </span>
          </button>
        }
      >
        {({ close }) => (
          <div className="time-select-list">
            {TIME_OPTIONS.map((option) => {
              const optionLabel = formatTimeOfDay(option.hours, option.minutes);
              const isSelected = hasValue && hours === option.hours && minutes === option.minutes;

              return (
                <button
                  key={optionLabel}
                  type="button"
                  className={`dropdown-item ${isSelected ? 'active' : ''}`.trim()}
                  onClick={() => {
                    onChange(option.hours, option.minutes);
                    close();
                  }}
                >
                  {optionLabel}
                </button>
              );
            })}
          </div>
        )}
      </DropdownMenu>
    </div>
  );
}

export default TimeSelectField;
