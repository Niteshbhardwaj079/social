const DAYS_IN_WEEK = 7;

export function getMonthGrid(year, month) {
  const firstDayOfMonth = new Date(year, month, 1);
  const startOffset = firstDayOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  const weeks = [];
  let cursor = new Date(gridStart);

  for (let week = 0; week < 6; week += 1) {
    const days = [];
    for (let day = 0; day < DAYS_IN_WEEK; day += 1) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }

  return weeks;
}

export function getWeekDays(referenceDate) {
  const startOfWeek = new Date(referenceDate);
  startOfWeek.setDate(referenceDate.getDate() - referenceDate.getDay());

  return Array.from({ length: DAYS_IN_WEEK }).map((_, index) => {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + index);
    return day;
  });
}

export function isSameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

export function isSameMonth(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() === dateB.getMonth();
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
