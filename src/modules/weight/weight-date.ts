import {
  APP_TIMEZONE,
  LocalDateParts,
  dayBounds,
  getZonedDateParts,
  zonedLocalToUtc,
} from '../food/day-bounds';

export { APP_TIMEZONE, dayBounds, getZonedDateParts };
export type { LocalDateParts };

export function addLocalDays(
  parts: LocalDateParts,
  days: number,
): LocalDateParts {
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function localDateKey(parts: LocalDateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Inclusive local-day window: start of `fromParts` → end of `toParts` (exclusive next midnight). */
export function localDateRangeBounds(
  fromParts: LocalDateParts,
  toParts: LocalDateParts,
  timeZone: string = APP_TIMEZONE,
): { start: Date; end: Date } {
  const start = zonedLocalToUtc(fromParts, timeZone);
  const dayAfterTo = addLocalDays(toParts, 1);
  const end = zonedLocalToUtc(dayAfterTo, timeZone);
  return { start, end };
}

const TH_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
] as const;

/** e.g. 19 ก.ย. 2026 */
export function formatThaiDate(
  instant: Date,
  timeZone: string = APP_TIMEZONE,
  options?: { includeYear?: boolean },
): string {
  const parts = getZonedDateParts(instant, timeZone);
  const month = TH_SHORT_MONTHS[parts.month - 1];
  if (options?.includeYear === false) {
    return `${parts.day} ${month}`;
  }
  return `${parts.day} ${month} ${parts.year}`;
}

export function formatThaiDateParts(
  parts: LocalDateParts,
  options?: { includeYear?: boolean },
): string {
  const month = TH_SHORT_MONTHS[parts.month - 1];
  if (options?.includeYear === false) {
    return `${parts.day} ${month}`;
  }
  return `${parts.day} ${month} ${parts.year}`;
}
