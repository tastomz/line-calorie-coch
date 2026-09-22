import { getZonedDateParts } from '../food/day-bounds';

/**
 * Program week/day from user join (or profile start).
 * Week 1 · Day 1 = calendar day of start (APP_TIMEZONE).
 */
export function getProgramWeekDay(
  startAt: Date,
  now = new Date(),
): { week: number; day: number; label: string } {
  const start = getZonedDateParts(startAt);
  const current = getZonedDateParts(now);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const nowUtc = Date.UTC(current.year, current.month - 1, current.day);
  const days = Math.max(0, Math.floor((nowUtc - startUtc) / 86_400_000));
  const week = Math.floor(days / 7) + 1;
  const day = (days % 7) + 1;
  return { week, day, label: `Week ${week} · Day ${day}` };
}

export function dateKeyFromParts(parts: {
  year: number;
  month: number;
  day: number;
}): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function todayDateKey(now = new Date()): string {
  return dateKeyFromParts(getZonedDateParts(now));
}
