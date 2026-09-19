import {
  buildWeightOverviewMessage,
  buildWeightSavedMessage,
  NO_WEIGHT_DATA_TEXT,
} from './weight.messages';

describe('weight.messages', () => {
  it('formats saved weight confirmation', () => {
    const text = buildWeightSavedMessage(
      84.2,
      new Date('2026-09-19T10:00:00.000Z'),
    );
    expect(text).toContain('บันทึกน้ำหนักแล้ว');
    expect(text).toContain('84.2 kg');
    expect(text).toContain('ก.ย.');
  });

  it('returns empty-state copy when no data', () => {
    expect(
      buildWeightOverviewMessage({
        todayAverageKg: null,
        recentDays: [],
        trend: null,
        progress: null,
      }),
    ).toBe(NO_WEIGHT_DATA_TEXT);
  });

  it('includes history and target progress', () => {
    const text = buildWeightOverviewMessage({
      todayAverageKg: 84.2,
      recentDays: [
        {
          dateKey: '2026-09-19',
          parts: { year: 2026, month: 9, day: 19 },
          averageKg: 84.2,
          count: 1,
        },
        {
          dateKey: '2026-09-18',
          parts: { year: 2026, month: 9, day: 18 },
          averageKg: 84.6,
          count: 1,
        },
      ],
      trend: {
        recentAverageKg: 84.5,
        previousAverageKg: 85.2,
        changeKg: -0.7,
        recentDaysWithData: 7,
        previousDaysWithData: 7,
      },
      progress: {
        latestKg: 84.2,
        targetKg: 74,
        remainingKg: 10.2,
      },
    });

    expect(text).toContain('วันนี้: 84.2 kg');
    expect(text).toContain('7 วันล่าสุด');
    expect(text).toContain('เปลี่ยนแปลง: -0.7 kg');
    expect(text).toContain('เป้าหมาย: 74 kg');
    expect(text).toContain('เหลืออีก 10.2 kg ถึงเป้า');
  });
});
