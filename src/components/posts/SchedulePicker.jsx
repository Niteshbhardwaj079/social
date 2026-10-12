import { useState } from 'react';
import DatePickerField from '../forms/DatePickerField';
import TimeSelectField from '../forms/TimeSelectField';
import { useI18n } from '../../i18n/useI18n';

function combineDateAndTime(date, hours, minutes) {
  const combined = date ? new Date(date) : new Date();
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

function SchedulePicker({ scheduledAt, onChange }) {
  const { t } = useI18n();
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
          label={t('composer.date')}
          selected={scheduledAt}
          onChange={handleDateChange}
          minDate={minDate}
          placeholderText={t('composer.selectDate')}
          className="mb-0"
        />
      </div>
      <div className="col-sm-5">
        <TimeSelectField
          id="scheduledTime"
          label={t('composer.time')}
          hours={scheduledAt ? scheduledAt.getHours() : null}
          minutes={scheduledAt ? scheduledAt.getMinutes() : null}
          onChange={handleTimeChange}
          placeholder={t('composer.selectTime')}
          className="mb-0"
        />
      </div>
    </div>
  );
}

export default SchedulePicker;
