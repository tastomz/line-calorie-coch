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
