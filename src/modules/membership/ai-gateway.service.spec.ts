import { AiGatewayService } from './ai-gateway.service';
import { AiUsageService } from './ai-usage.service';
import { AiQuotaExceededError } from './membership.errors';

describe('AiGatewayService', () => {
  const aiUsage = {
    consumeAiUsage: jest.fn(),
    recordTokenUsage: jest.fn(),
  };

  const service = new AiGatewayService(aiUsage as unknown as AiUsageService);

  beforeEach(() => {
    jest.clearAllMocks();
    aiUsage.consumeAiUsage.mockResolvedValue(undefined);
    aiUsage.recordTokenUsage.mockResolvedValue(undefined);
  });

  it('consumes quota then runs work', async () => {
    const work = jest.fn().mockResolvedValue('ok');
    const result = await service.run('user-a', 'FOOD_TEXT', work);
    expect(result).toBe('ok');
    expect(aiUsage.consumeAiUsage).toHaveBeenCalledWith('user-a', 'FOOD_TEXT');
    expect(work).toHaveBeenCalled();
  });

  it('does not run work when quota is exceeded', async () => {
    aiUsage.consumeAiUsage.mockRejectedValue(
      new AiQuotaExceededError('FOOD_VISION', 'FREE', 2, 2),
    );
    const work = jest.fn();
    await expect(
      service.run('user-a', 'FOOD_VISION', work),
    ).rejects.toBeInstanceOf(AiQuotaExceededError);
    expect(work).not.toHaveBeenCalled();
  });

  it('keeps quota consumed when work fails after consume', async () => {
    const work = jest.fn().mockRejectedValue(new Error('openai down'));
    await expect(service.run('user-a', 'CLASSIFY', work)).rejects.toThrow(
      'openai down',
    );
    expect(aiUsage.consumeAiUsage).toHaveBeenCalledTimes(1);
  });

  it('requires userId', async () => {
    await expect(
      service.run('', 'FOOD_TEXT', () => Promise.resolve(1)),
    ).rejects.toThrow(/userId/);
    expect(aiUsage.consumeAiUsage).not.toHaveBeenCalled();
  });
});
