/**
 * Festivals and special days the agent can post about (India-first, plus global days).
 *
 *  - FIXED: same date every year (month, day).
 *  - NTH_WEEKDAY: e.g. Mother's Day = 2nd Sunday of May.
 *  - LUNAR: festivals whose date changes every year — listed per year. These dates are best-known
 *    calendar dates; please check them each year and add the next year's (just add a line below).
 */

const FIXED = [
  { month: 1, day: 1, name: 'New Year', kind: 'greeting' },
  { month: 1, day: 14, name: 'Makar Sankranti', kind: 'festival' },
  { month: 1, day: 26, name: 'Republic Day', kind: 'national' },
  { month: 2, day: 14, name: "Valentine's Day", kind: 'greeting' },
  { month: 3, day: 8, name: "International Women's Day", kind: 'day' },
  { month: 4, day: 7, name: 'World Health Day', kind: 'day' },
  { month: 4, day: 14, name: 'Baisakhi', kind: 'festival' },
  { month: 6, day: 5, name: 'World Environment Day', kind: 'day' },
  { month: 6, day: 21, name: 'International Yoga Day', kind: 'day' },
  { month: 8, day: 15, name: 'Independence Day', kind: 'national' },
  { month: 9, day: 5, name: "Teachers' Day", kind: 'day' },
  { month: 9, day: 15, name: "Engineers' Day", kind: 'day' },
  { month: 10, day: 2, name: 'Gandhi Jayanti', kind: 'national' },
  { month: 11, day: 14, name: "Children's Day", kind: 'day' },
  { month: 12, day: 25, name: 'Christmas', kind: 'festival' },
  { month: 12, day: 31, name: "New Year's Eve", kind: 'greeting' },
];

// [month, which weekday (0 = Sunday), nth occurrence]
const NTH_WEEKDAY = [
  { month: 5, weekday: 0, nth: 2, name: "Mother's Day", kind: 'day' },
  { month: 6, weekday: 0, nth: 3, name: "Father's Day", kind: 'day' },
  { month: 8, weekday: 0, nth: 1, name: 'Friendship Day', kind: 'day' },
];

const LUNAR = {
  2026: [
    ['2026-02-15', 'Maha Shivratri'],
    ['2026-03-04', 'Holi'],
    ['2026-03-20', 'Eid al-Fitr'],
    ['2026-03-26', 'Ram Navami'],
    ['2026-05-27', 'Eid al-Adha'],
    ['2026-08-28', 'Raksha Bandhan'],
    ['2026-09-04', 'Janmashtami'],
    ['2026-09-14', 'Ganesh Chaturthi'],
    ['2026-10-11', 'Navratri begins'],
    ['2026-10-20', 'Dussehra'],
    ['2026-11-06', 'Dhanteras'],
    ['2026-11-08', 'Diwali'],
    ['2026-11-10', 'Bhai Dooj'],
    ['2026-11-24', 'Guru Nanak Jayanti'],
  ],
  2027: [
    ['2027-03-22', 'Holi'],
    ['2027-03-10', 'Eid al-Fitr'],
    ['2027-08-17', 'Raksha Bandhan'],
    ['2027-09-04', 'Ganesh Chaturthi'],
    ['2027-10-09', 'Dussehra'],
    ['2027-10-29', 'Diwali'],
  ],
};

const isoDate = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function nthWeekday(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  return isoDate(year, month, day);
}

function eventsOfYear(year) {
  return [
    ...FIXED.map((event) => ({ date: isoDate(year, event.month, event.day), name: event.name, kind: event.kind })),
    ...NTH_WEEKDAY.map((event) => ({ date: nthWeekday(year, event.month, event.weekday, event.nth), name: event.name, kind: event.kind })),
    ...(LUNAR[year] ?? []).map(([date, name]) => ({ date, name, kind: 'festival' })),
  ];
}

/** Events from `from` (a Date) up to `days` days ahead, soonest first. */
export function upcomingEvents(from = new Date(), days = 30) {
  const start = from.toISOString().slice(0, 10);
  const end = new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const year = from.getUTCFullYear();
  return [...eventsOfYear(year), ...eventsOfYear(year + 1)]
    .filter((event) => event.date >= start && event.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The event on this exact day (YYYY-MM-DD), if any. */
export function eventOn(date) {
  return eventsOfYear(Number(date.slice(0, 4))).find((event) => event.date === date) ?? null;
}
