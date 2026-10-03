import { DailyHealthSnapshot } from '../health/health-dashboard.service';
import {
  buildCoachNextActionsText,
  buildNextActions,
} from './coach-next-actions';

function snapshot(
  overrides: Partial<DailyHealthSnapshot> = {},
): DailyHealthSnapshot {
  return {
    programLabel: 'W1D1',
    nutrition: {
      date: new Date('2026-10-03T00:00:00.000Z'),
      consumed: { calories: 1500, proteinG: 90, carbsG: 150, fatG: 50 },
      target: { calories: 1900, proteinG: 120, carbsG: 200, fatG: 60 },
      remaining: { calories: 400, proteinG: 30, carbsG: 50, fatG: 10 },
    },
    weightKg: null,
    sleepMinutes: 8 * 60,
    exerciseMinutes: 30,
    steps: 8000,
    waterMl: 2500,
    waterTargetMl: 2500,
    recoveryScore: null,
    tip: '',
    ...overrides,
  };
}

describe('buildNextActions', () => {
  it('tells the user how much food is left to reach the targets', () => {
    const actions = buildNextActions(snapshot());
    expect(actions[0]).toContain('กินให้ถึงเป้า');
    expect(actions[0]).toContain('400 kcal');
    expect(actions[0]).toContain('โปรตีน 30 g');
  });

  it('warns when calories are over the target', () => {
    const actions = buildNextActions(
      snapshot({
        nutrition: {
          ...snapshot().nutrition!,
          remaining: { calories: -250, proteinG: 0, carbsG: 0, fatG: 0 },
        },
      }),
    );
    expect(actions[0]).toContain('เกินเป้า');
    expect(actions[0]).toContain('250');
  });

  it('suggests exercise, water, steps and sleep only when recorded data calls for it', () => {
    const actions = buildNextActions(
      snapshot({
        exerciseMinutes: 0,
        steps: 2000,
        waterMl: 500,
        sleepMinutes: 5 * 60,
      }),
    );
    expect(actions).toHaveLength(4);
    expect(actions.join('\n')).toContain('ออกกำลังกาย');
    expect(actions.join('\n')).not.toContain('นอน 5');
  });

  it('prompts to log sleep instead of guessing when none is recorded', () => {
    const actions = buildNextActions(snapshot({ sleepMinutes: null }));
    expect(actions.join('\n')).toContain('ยังไม่มีบันทึกการนอน');
  });

  it('does not invent steps advice when steps were never recorded', () => {
    const actions = buildNextActions(
      snapshot({ steps: null, sleepMinutes: 8 * 60 }),
    );
    expect(actions.join('\n')).not.toContain('ก้าว');
  });

  it('caps the list at four items', () => {
    const actions = buildNextActions(
      snapshot({
        exerciseMinutes: 0,
        steps: 100,
        waterMl: 0,
        sleepMinutes: null,
      }),
    );
    expect(actions.length).toBeLessThanOrEqual(4);
  });
});

describe('buildCoachNextActionsText', () => {
  it('congratulates when nothing is outstanding', () => {
    const text = buildCoachNextActionsText(
      snapshot({
        nutrition: {
          ...snapshot().nutrition!,
          remaining: { calories: 50, proteinG: 2, carbsG: 5, fatG: 1 },
        },
      }),
    );
    expect(text).toContain('ทำได้ครบตามเป้า');
    expect(text).toContain('ถามผมได้เลย');
  });
});
