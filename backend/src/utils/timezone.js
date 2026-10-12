/**
 * Time-zone maths with nothing but the built-in Intl API (no date library needed).
 * Used by the AI autopilot and weekly content plans: "10:00 in Asia/Kolkata" → the exact UTC moment.
 */

/** Minutes between UTC and `timeZone` at `date` (e.g. Asia/Kolkata → +330). */
export function zoneOffsetMinutes(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** The calendar date (year, month, day, weekday 0 = Sunday) in `timeZone` for `date`. */
export function localDate(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(date).map((part) => [part.type, part.value])
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday };
}

/** "YYYY-MM-DD" of a local date object from localDate(). */
export const isoOf = (day) => `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;

/** The UTC moment of `hour:minute` on a local calendar day in `timeZone`. */
export function atLocalTime(day, hour, minute, timeZone) {
  const naiveUtc = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  return new Date(naiveUtc - zoneOffsetMinutes(new Date(naiveUtc), timeZone) * 60_000);
}

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
