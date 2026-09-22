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
