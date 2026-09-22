import { forwardRef } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Icon from '../common/Icon';

// Date-only by design: react-datepicker's `showTimeSelect` time list has a
// confirmed runaway-height bug in this version (its floating-ui-based
// autoUpdate loop keeps growing the popup indefinitely). Pair this with
// TimeSelectField for a combined date + time control instead of enabling
// showTimeSelect here.

const DATEPICKER_PORTAL_ID = 'app-datepicker-portal';

const DateTriggerButton = forwardRef(({ value, onClick, placeholder, disabled }, ref) => (
  <button
    type="button"
    className="date-picker-trigger"
    onClick={onClick}
    ref={ref}
    disabled={disabled}
  >
    <Icon name="CalendarDays" size={16} />
    <span className={value ? 'date-picker-trigger__value' : 'date-picker-trigger__placeholder'}>
      {value || placeholder}
    </span>
  </button>
));
DateTriggerButton.displayName = 'DateTriggerButton';

function DatePickerField({
  id,
  label,
  selected,
  onChange,
  placeholderText = 'Select date',
  minDate,
  error,
  hint,
  className = '',
}) {
  return (
    <div className={`mb-4 ${className}`.trim()}>
      {label ? (
        <label htmlFor={id} className="form-label-custom">
          {label}
        </label>
      ) : null}
      <ReactDatePicker
        id={id}
        selected={selected}
        onChange={onChange}
        dateFormat="MMM d, yyyy"
        minDate={minDate}
        placeholderText={placeholderText}
        customInput={<DateTriggerButton placeholder={placeholderText} />}
        calendarClassName="app-datepicker"
        popperClassName="app-datepicker-popper"
        portalId={DATEPICKER_PORTAL_ID}
        showPopperArrow={false}
      />
      {error ? <div className="form-error">{error}</div> : null}
      {!error && hint ? <div className="form-hint">{hint}</div> : null}
    </div>
  );
}

export default DatePickerField;
