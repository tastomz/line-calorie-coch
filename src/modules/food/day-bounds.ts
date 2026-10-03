/** Default app timezone for "today" food windows (Thailand). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Bangkok';

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

/** Calendar Y/M/D for an instant in the given IANA timezone. */
export function getZonedDateParts(
  instant: Date,
  timeZone: string = APP_TIMEZONE,
): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const map = Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

/**
 * Offset of `timeZone` at `instant`: local = utc + offset.
 * Positive for zones east of UTC (e.g. Asia/Bangkok ≈ +7h).
 */
export function getTimeZoneOffsetMs(
  instant: Date,
  timeZone: string = APP_TIMEZONE,
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const map = Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );

  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  return asIfUtc - instant.getTime();
}

/** Convert a wall-clock local datetime in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(
  parts: LocalDateParts & {
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone: string = APP_TIMEZONE,
): Date {
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
    second,
  );

  let utcMs = desiredAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    utcMs = desiredAsUtc - offsetMs;
  }

  return new Date(utcMs);
}

/**
 * Inclusive start / exclusive end of the local calendar day containing `day`,
 * in APP_TIMEZONE (not server process local timezone).
 */
export function dayBounds(
  day: Date = new Date(),
  timeZone: string = APP_TIMEZONE,
): { start: Date; end: Date } {
  const { year, month, day: d } = getZonedDateParts(day, timeZone);
  const start = zonedLocalToUtc({ year, month, day: d }, timeZone);

  const next = new Date(Date.UTC(year, month - 1, d + 1));
  const end = zonedLocalToUtc(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
    },
    timeZone,
  );

  return { start, end };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bounds of the local calendar day `daysAgo` days before `now` (0 = today). */
export function dayBoundsDaysAgo(
  daysAgo: number,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE,
): { start: Date; end: Date } {
  const { start } = dayBounds(now, timeZone);
  // Noon of the target day sits safely inside it regardless of offset shifts.
  const anchor = new Date(start.getTime() - daysAgo * DAY_MS + DAY_MS / 2);
  return dayBounds(anchor, timeZone);
}

/** Same local wall-clock time, `daysAgo` days earlier. */
export function shiftDaysAgoKeepingTime(
  daysAgo: number,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE,
): Date {
  const timeOfDayMs = now.getTime() - dayBounds(now, timeZone).start.getTime();
  return new Date(
    dayBoundsDaysAgo(daysAgo, now, timeZone).start.getTime() + timeOfDayMs,
  );
}

/** Whole local calendar days between `instant` and `now` (0 = same day). */
export function localDaysAgo(
  instant: Date,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE,
): number {
  const a = dayBounds(instant, timeZone).start.getTime();
  const b = dayBounds(now, timeZone).start.getTime();
  return Math.round((b - a) / DAY_MS);
}

/** Thai short date for day labels, e.g. "ศ. 2 ต.ค.". */
export function formatThaiShortDate(
  instant: Date,
  timeZone: string = APP_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(instant);
}

/** "วันนี้" / "เมื่อวาน" / "ศ. 2 ต.ค." relative to now. */
export function describeDayTh(
  instant: Date,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE,
): string {
  const ago = localDaysAgo(instant, now, timeZone);
  if (ago === 0) return 'วันนี้';
  if (ago === 1) return 'เมื่อวาน';
  return formatThaiShortDate(instant, timeZone);
}

/** Format HH:mm in APP_TIMEZONE for history lines. */
export function formatZonedTime(
  instant: Date,
  timeZone: string = APP_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}
