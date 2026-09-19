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
    });
    expect(create).toHaveBeenCalled();
    const firstCall = create.mock.calls[0] as
      [{ max_tokens: number }] | undefined;
    expect(firstCall?.[0].max_tokens).toBe(60);
  });

  it('throws when API key missing', async () => {
    const config = { get: jest.fn().mockReturnValue('') };
    const service = new MessageClassifyService(
      config as unknown as ConfigService,
    );
    await expect(service.classify('food')).rejects.toThrow(/not configured/);
  });
});
