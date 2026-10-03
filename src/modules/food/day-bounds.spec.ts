import {
  dayBounds,
  dayBoundsDaysAgo,
  describeDayTh,
  getZonedDateParts,
  localDaysAgo,
  shiftDaysAgoKeepingTime,
  zonedLocalToUtc,
} from './day-bounds';

describe('dayBounds (Asia/Bangkok)', () => {
  it('returns a 24h window for a Bangkok calendar day', () => {
    // 2026-09-19 15:00 Bangkok = 2026-09-19 08:00 UTC
    const instant = new Date('2026-09-19T08:00:00.000Z');
    const { start, end } = dayBounds(instant, 'Asia/Bangkok');

    expect(start.toISOString()).toBe('2026-09-18T17:00:00.000Z'); // midnight +7
    expect(end.toISOString()).toBe('2026-09-19T17:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('keeps late-evening Bangkok time on the same local day', () => {
    // 2026-09-19 23:30 Bangkok = 2026-09-19 16:30 UTC
    const instant = new Date('2026-09-19T16:30:00.000Z');
    const parts = getZonedDateParts(instant, 'Asia/Bangkok');
    expect(parts).toEqual({ year: 2026, month: 9, day: 19 });

    const { start, end } = dayBounds(instant, 'Asia/Bangkok');
    expect(instant.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(instant.getTime()).toBeLessThan(end.getTime());
  });

  it('converts Bangkok midnight to correct UTC', () => {
    const utc = zonedLocalToUtc(
      { year: 2026, month: 9, day: 19 },
      'Asia/Bangkok',
    );
    expect(utc.toISOString()).toBe('2026-09-18T17:00:00.000Z');
  });
});

describe('past-day helpers (Asia/Bangkok)', () => {
  const tz = 'Asia/Bangkok';
  // 2026-10-03 15:00 Bangkok
  const now = new Date('2026-10-03T08:00:00.000Z');

  it('returns bounds of the local day N days ago', () => {
    const { start, end } = dayBoundsDaysAgo(1, now, tz);
    expect(start.toISOString()).toBe('2026-10-01T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-02T17:00:00.000Z');
    expect(dayBoundsDaysAgo(0, now, tz).start.toISOString()).toBe(
      '2026-10-02T17:00:00.000Z',
    );
  });

  it('keeps the local time of day when shifting back', () => {
    expect(shiftDaysAgoKeepingTime(1, now, tz).toISOString()).toBe(
      '2026-10-02T08:00:00.000Z',
    );
    expect(shiftDaysAgoKeepingTime(0, now, tz).toISOString()).toBe(
      now.toISOString(),
    );
  });

  it('shifting just after midnight stays on the previous local day', () => {
    // 00:10 Bangkok on Oct 3
    const early = new Date('2026-10-02T17:10:00.000Z');
    const shifted = shiftDaysAgoKeepingTime(1, early, tz);
    expect(shifted.toISOString()).toBe('2026-10-01T17:10:00.000Z');
    expect(localDaysAgo(shifted, early, tz)).toBe(1);
  });

  it('counts local calendar days, not 24h blocks', () => {
    // 23:30 Bangkok Oct 2 → yesterday; 00:00 Bangkok Oct 3 → today
    expect(localDaysAgo(new Date('2026-10-02T16:30:00.000Z'), now, tz)).toBe(1);
    expect(localDaysAgo(new Date('2026-10-02T17:00:00.000Z'), now, tz)).toBe(0);
    expect(localDaysAgo(new Date('2026-09-30T08:00:00.000Z'), now, tz)).toBe(3);
  });

  it('describes days relative to now in Thai', () => {
    expect(describeDayTh(now, now, tz)).toBe('วันนี้');
    expect(describeDayTh(new Date('2026-10-02T08:00:00.000Z'), now, tz)).toBe(
      'เมื่อวาน',
    );
    expect(
      describeDayTh(new Date('2026-09-30T08:00:00.000Z'), now, tz),
    ).toContain('30');
  });
});
