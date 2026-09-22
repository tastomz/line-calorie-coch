import { ConfigService } from '@nestjs/config';
import { AiGatewayService } from '../membership/ai-gateway.service';
import { DailyCoachService } from './daily-coach.service';
import { DailyCoachSummary } from './daily-summary.service';

describe('DailyCoachService', () => {
  const summary: DailyCoachSummary = {
    date: new Date(),
    consumed: { calories: 1250, proteinG: 82, carbsG: 120, fatG: 42 },
    target: { calories: 2000, proteinG: 140, carbsG: 220, fatG: 55 },
    remaining: { calories: 750, proteinG: 58, carbsG: 100, fatG: 13 },
  };

  const aiGateway = {
    run: jest.fn(
      async (_userId: string, _op: string, work: () => Promise<string>) =>
        work(),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    aiGateway.run.mockImplementation(
      async (_userId: string, _op: string, work: () => Promise<string>) =>
        work(),
    );
  });

  it('falls back to deterministic tip when OpenAI is not configured', async () => {
    const config = {
      get: jest.fn().mockReturnValue(''),
    };
    const service = new DailyCoachService(
      config as unknown as ConfigService,
      aiGateway as unknown as AiGatewayService,
    );
    const tip = await service.buildTodayCoachTip('user-a', summary);
    expect(tip.length).toBeGreaterThan(0);
    expect(tip).toMatch(/โปรตีน|kcal/);
    expect(aiGateway.run).not.toHaveBeenCalled();
  });

  it('falls back when OpenAI call fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('boom'));
    const config = {
      get: jest.fn().mockReturnValue('sk-test'),
    };
    const service = new DailyCoachService(
      config as unknown as ConfigService,
      aiGateway as unknown as AiGatewayService,
    );
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = {
      chat: { completions: { create } },
    };

    const tip = await service.buildTodayCoachTip('user-a', summary);
    expect(create).toHaveBeenCalled();
    expect(aiGateway.run).toHaveBeenCalledWith(
      'user-a',
      'COACH',
      expect.any(Function),
    );
    expect(tip).toMatch(/โปรตีน|kcal/);
  });

  it('meal recommendation uses remaining macros in prompt context', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'ลองอกไก่กับผักครับ' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const config = {
      get: jest.fn().mockReturnValue('sk-test'),
    };
    const service = new DailyCoachService(
      config as unknown as ConfigService,
      aiGateway as unknown as AiGatewayService,
    );
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = {
      chat: { completions: { create } },
    };

    const tip = await service.buildMealRecommendation('user-a', {
      calories: 650,
      proteinG: 55,
      carbsG: 70,
      fatG: 20,
    });

    expect(tip).toContain('อกไก่');
    expect(aiGateway.run).toHaveBeenCalledWith(
      'user-a',
      'COACH',
      expect.any(Function),
    );
    const firstCall = create.mock.calls[0] as
      [{ messages: Array<{ role: string; content: string }> }] | undefined;
    expect(firstCall).toBeDefined();
    const userContent = firstCall![0].messages[1].content;
    expect(userContent).toContain('650');
    expect(userContent).toContain('55');
    expect(userContent).toContain('FACTUAL USER CONTEXT');
    expect(userContent).toContain('USER MESSAGE (untrusted)');
  });
});
