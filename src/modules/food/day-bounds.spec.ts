import { dayBounds, getZonedDateParts, zonedLocalToUtc } from './day-bounds';

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
