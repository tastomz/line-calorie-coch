import { AiGatewayService } from './ai-gateway.service';
import { AiUsageService } from './ai-usage.service';
import { reportAiTokenUsage } from './ai-token-capture';

describe('AiGatewayService token recording', () => {
  it('records tokens when work reports usage', async () => {
    const aiUsage = {
      consumeAiUsage: jest.fn().mockResolvedValue(undefined),
      recordTokenUsage: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AiGatewayService(aiUsage as unknown as AiUsageService);

    const result = await service.run('user-a', 'FOOD_TEXT', () => {
      reportAiTokenUsage({
        model: 'gpt-4o-mini',
        inputTokens: 100,
        outputTokens: 20,
      });
      return Promise.resolve('ok');
    });

    expect(result).toBe('ok');
    expect(aiUsage.consumeAiUsage).toHaveBeenCalledWith('user-a', 'FOOD_TEXT');
    expect(aiUsage.recordTokenUsage).toHaveBeenCalledWith(
      'user-a',
      'FOOD_TEXT',
      {
        model: 'gpt-4o-mini',
        inputTokens: 100,
        outputTokens: 20,
      },
    );
  });

  it('records every OpenAI call made inside one run (cheap check + analysis)', async () => {
    const aiUsage = {
      consumeAiUsage: jest.fn().mockResolvedValue(undefined),
      recordTokenUsage: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AiGatewayService(aiUsage as unknown as AiUsageService);

    await service.run('user-a', 'FOOD_VISION', () => {
      reportAiTokenUsage({
        model: 'gpt-4o-mini',
        inputTokens: 2800,
        outputTokens: 8,
      });
      reportAiTokenUsage({
        model: 'gpt-4o',
        inputTokens: 1300,
        outputTokens: 120,
      });
      return Promise.resolve('ok');
    });

    expect(aiUsage.consumeAiUsage).toHaveBeenCalledTimes(1);
    expect(aiUsage.recordTokenUsage).toHaveBeenCalledTimes(2);
    expect(aiUsage.recordTokenUsage).toHaveBeenNthCalledWith(
      1,
      'user-a',
      'FOOD_VISION',
      expect.objectContaining({ model: 'gpt-4o-mini' }),
    );
    expect(aiUsage.recordTokenUsage).toHaveBeenNthCalledWith(
      2,
      'user-a',
      'FOOD_VISION',
      expect.objectContaining({ model: 'gpt-4o' }),
    );
  });

  it('skips token log when work does not report usage', async () => {
    const aiUsage = {
      consumeAiUsage: jest.fn().mockResolvedValue(undefined),
      recordTokenUsage: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AiGatewayService(aiUsage as unknown as AiUsageService);
    await service.run('user-a', 'CLASSIFY', () => Promise.resolve(1));
    expect(aiUsage.recordTokenUsage).not.toHaveBeenCalled();
  });
});
