import { ConfigService } from '@nestjs/config';
import { MessageClassifyService } from './message-classify.service';

describe('MessageClassifyService', () => {
  it('normalizes weight_log and clamps invalid kg to null via classify response', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              type: 'weight_log',
              weightKg: 84.2,
              weightQuery: null,
              coachHint: null,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    });

    const config = { get: jest.fn().mockReturnValue('sk-test') };
    const service = new MessageClassifyService(
      config as unknown as ConfigService,
    );
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = { chat: { completions: { create } } };

    const result = await service.classify('วันนี้ชั่งได้ประมาณ 84.2');
    expect(result).toEqual({
      type: 'weight_log',
      weightKg: 84.2,
      weightQuery: null,
      coachHint: null,
      exerciseType: null,
      exerciseDurationMinutes: null,
      sleepDurationMinutes: null,
      waterAmountMl: null,
    });
    expect(create).toHaveBeenCalled();
    // gpt-5 is a reasoning model: no max_tokens/temperature, uses
    // max_completion_tokens + reasoning_effort instead (completionLimits()).
    const firstCall = create.mock.calls[0] as
      [{ max_completion_tokens: number; reasoning_effort: string }] | undefined;
    expect(firstCall?.[0].max_completion_tokens).toBe(2000);
    expect(firstCall?.[0].reasoning_effort).toBe('low');
  });

  it('extracts exercise type + duration from a natural sentence', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              type: 'exercise',
              weightKg: null,
              weightQuery: null,
              coachHint: null,
              exerciseType: 'running',
              exerciseDurationMinutes: 30,
              sleepDurationMinutes: null,
              waterAmountMl: null,
            }),
          },
        },
      ],
    });
    const service = new MessageClassifyService({
      get: jest.fn().mockReturnValue('sk-test'),
    } as unknown as ConfigService);
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = { chat: { completions: { create } } };

    const result = await service.classify('วิ่งมา 30 นาที');
    expect(result).toEqual({
      type: 'exercise',
      weightKg: null,
      weightQuery: null,
      coachHint: null,
      exerciseType: 'running',
      exerciseDurationMinutes: 30,
      sleepDurationMinutes: null,
      waterAmountMl: null,
    });
  });

  it('falls back exercise without a usable duration to other', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              type: 'exercise',
              weightKg: null,
              weightQuery: null,
              coachHint: null,
              exerciseType: 'running',
              exerciseDurationMinutes: null,
              sleepDurationMinutes: null,
              waterAmountMl: null,
            }),
          },
        },
      ],
    });
    const service = new MessageClassifyService({
      get: jest.fn().mockReturnValue('sk-test'),
    } as unknown as ConfigService);
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = { chat: { completions: { create } } };

    const result = await service.classify('วิ่งเหนื่อยมากเลย');
    expect(result.type).toBe('other');
  });

  it('extracts sleep duration in Thai-casual phrasing', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              type: 'sleep',
              weightKg: null,
              weightQuery: null,
              coachHint: null,
              exerciseType: null,
              exerciseDurationMinutes: null,
              sleepDurationMinutes: 330,
              waterAmountMl: null,
            }),
          },
        },
      ],
    });
    const service = new MessageClassifyService({
      get: jest.fn().mockReturnValue('sk-test'),
    } as unknown as ConfigService);
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = { chat: { completions: { create } } };

    const result = await service.classify(
      'เมื่อคืนนอนไม่ค่อยหลับ ได้ประมาณ 5 ชั่วโมงกว่าๆ',
    );
    expect(result.type).toBe('sleep');
    expect(result.sleepDurationMinutes).toBe(330);
  });

  it('clamps an out-of-range water amount to other', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              type: 'water',
              weightKg: null,
              weightQuery: null,
              coachHint: null,
              exerciseType: null,
              exerciseDurationMinutes: null,
              sleepDurationMinutes: null,
              waterAmountMl: 50000,
            }),
          },
        },
      ],
    });
    const service = new MessageClassifyService({
      get: jest.fn().mockReturnValue('sk-test'),
    } as unknown as ConfigService);
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = { chat: { completions: { create } } };

    const result = await service.classify('ดื่มน้ำไป 50 ลิตร');
    expect(result.type).toBe('other');
    expect(result.waterAmountMl).toBeNull();
  });

  it('accepts the health_coach type for exercise / sleep advice questions', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              type: 'health_coach',
              weightKg: null,
              weightQuery: null,
              coachHint: null,
            }),
          },
        },
      ],
    });
    const service = new MessageClassifyService({
      get: jest.fn().mockReturnValue('sk-test'),
    } as unknown as ConfigService);
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = { chat: { completions: { create } } };

    const result = await service.classify('ควรไปวิ่งกี่นาทีดี');
    expect(result.type).toBe('health_coach');
  });

  it('throws when API key missing', async () => {
    const config = { get: jest.fn().mockReturnValue('') };
    const service = new MessageClassifyService(
      config as unknown as ConfigService,
    );
    await expect(service.classify('food')).rejects.toThrow(/not configured/);
  });
});
