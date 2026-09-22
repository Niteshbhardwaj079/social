import { useState } from 'react';
import DatePickerField from '../forms/DatePickerField';
import TimeSelectField from '../forms/TimeSelectField';

function combineDateAndTime(date, hours, minutes) {
  const combined = date ? new Date(date) : new Date();
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

function SchedulePicker({ scheduledAt, onChange }) {
  // Computed once per mount, not on every render — a fresh `new Date()` on
  // every render would change minDate's reference each time.
  const [minDate] = useState(() => new Date());

  function handleDateChange(date) {
    if (!date) {
      onChange(null);
      return;
    }
    const hours = scheduledAt ? scheduledAt.getHours() : 9;
    const minutes = scheduledAt ? scheduledAt.getMinutes() : 0;
    onChange(combineDateAndTime(date, hours, minutes));
  }

  function handleTimeChange(hours, minutes) {
    onChange(combineDateAndTime(scheduledAt, hours, minutes));
  }

  return (
    <div className="row g-3">
      <div className="col-sm-7">
        <DatePickerField
          id="scheduledDate"
          label="Date"
          selected={scheduledAt}
          onChange={handleDateChange}
          minDate={minDate}
          placeholderText="Select date"
          className="mb-0"
        />
      </div>
      <div className="col-sm-5">
        <TimeSelectField
          id="scheduledTime"
          label="Time"
          hours={scheduledAt ? scheduledAt.getHours() : null}
          minutes={scheduledAt ? scheduledAt.getMinutes() : null}
          onChange={handleTimeChange}
          className="mb-0"
        />
      </div>
    </div>
  );
}

export default SchedulePicker;
