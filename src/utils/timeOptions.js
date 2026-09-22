const MINUTES_PER_DAY = 24 * 60;
const TIME_STEP_MINUTES = 15;
const HOURS_PER_DAY = 12;

export function generateTimeOptions() {
  const options = [];
  for (let totalMinutes = 0; totalMinutes < MINUTES_PER_DAY; totalMinutes += TIME_STEP_MINUTES) {
    options.push({ hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 });
  }
  return options;
}

export function formatTimeOfDay(hours, minutes) {
  const period = hours >= HOURS_PER_DAY ? 'PM' : 'AM';
  const displayHours = hours % HOURS_PER_DAY === 0 ? HOURS_PER_DAY : hours % HOURS_PER_DAY;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}
