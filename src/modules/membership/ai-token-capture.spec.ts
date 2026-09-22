import {
  reportAiTokenUsage,
  runWithAiTokenCapture,
  usageFromOpenAiCompletion,
} from './ai-token-capture';

describe('ai-token-capture', () => {
  it('captures usage inside ALS context', async () => {
    let captured:
      { model: string; inputTokens: number; outputTokens: number } | undefined;
    await runWithAiTokenCapture(
      (m) => {
        captured = m;
      },
      () => {
        reportAiTokenUsage({
          model: 'gpt-4o-mini',
          inputTokens: 10,
          outputTokens: 5,
        });
        return Promise.resolve('ok');
      },
    );
    expect(captured).toEqual({
      model: 'gpt-4o-mini',
      inputTokens: 10,
      outputTokens: 5,
    });
  });

  it('is a no-op outside context', () => {
    expect(() =>
      reportAiTokenUsage({
        model: 'gpt-4o-mini',
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).not.toThrow();
  });

  it('extracts OpenAI completion usage', () => {
    expect(
      usageFromOpenAiCompletion(
        {
          model: 'gpt-4o-mini-2024',
          usage: {
            prompt_tokens: 12,
            completion_tokens: 3,
            total_tokens: 15,
          },
        },
        'gpt-4o-mini',
      ),
    ).toEqual({
      model: 'gpt-4o-mini-2024',
      inputTokens: 12,
      outputTokens: 3,
    });
  });
});
