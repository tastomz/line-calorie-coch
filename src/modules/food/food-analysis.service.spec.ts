import { ConfigService } from '@nestjs/config';
import { openAiCircuitBreaker } from '../../common/openai-circuit-breaker';
import {
  FoodAnalysisError,
  FoodEstimateEmptyError,
  FoodImageUnreadableError,
  FoodAnalysisService,
} from './food-analysis.service';

type VisionCallArg = {
  messages: Array<{
    content: string | Array<{ type: string; image_url?: { url: string } }>;
  }>;
};

function firstCreateArg(create: jest.Mock): VisionCallArg {
  const calls = create.mock.calls as unknown[][];
  const first = calls[0]?.[0];
  return first as VisionCallArg;
}

function extractImageBase64(callArg: VisionCallArg): string {
  const contents = callArg.messages.flatMap((m) =>
    Array.isArray(m.content) ? m.content : [],
  );
  const imagePart = contents.find((p) => p.type === 'image_url');
  return (imagePart?.image_url?.url ?? '').split(',')[1] ?? '';
}

describe('FoodAnalysisService', () => {
  beforeEach(() => {
    openAiCircuitBreaker.reset();
  });
  it('throws when OPENAI_API_KEY is missing', async () => {
    const config = {
      get: () => '',
    } as unknown as ConfigService;
    const service = new FoodAnalysisService(config);
    expect(service.isConfigured()).toBe(false);
    await expect(service.analyzeText('ข้าว')).rejects.toBeInstanceOf(
      FoodAnalysisError,
    );
  });

  it('analyzes text via OpenAI structured output', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              foodName: 'ข้าวกะเพรา',
              estimatedCalories: 600,
              proteinG: 30,
              carbsG: 70,
              fatG: 20,
              confidence: 0.75,
              assumptions: ['1 จาน'],
              estimatedQuantity: 1,
              quantityUnit: 'plate',
            }),
          },
        },
      ],
    });

    const config = {
      get: (key: string) => (key === 'OPENAI_API_KEY' ? 'test-key' : ''),
    } as unknown as ConfigService;
    const service = new FoodAnalysisService(config);
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = {
      chat: { completions: { create } },
    };

    const result = await service.analyzeText('ข้าวกะเพราไก่');
    expect(result.foodName).toBe('ข้าวกะเพรา');
    expect(create).toHaveBeenCalled();
  });

  it('analyzes image via OpenAI vision', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              foodName: 'สลัด',
              estimatedCalories: 250,
              proteinG: 10,
              carbsG: 20,
              fatG: 12,
              confidence: 0.7,
              assumptions: [],
              estimatedQuantity: 1,
              quantityUnit: 'bowl',
            }),
          },
        },
      ],
    });
    const config = {
      get: (key: string) => (key === 'OPENAI_API_KEY' ? 'test-key' : ''),
    } as unknown as ConfigService;
    const service = new FoodAnalysisService(config);
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = {
      chat: { completions: { create } },
    };

    // Distinct bytes that would be corrupted if truncated mid-buffer.
    const imageBytes = Buffer.alloc(300_000, 0xab);
    imageBytes[0] = 0xff;
    imageBytes[1] = 0xd8;
    imageBytes[imageBytes.length - 2] = 0xff;
    imageBytes[imageBytes.length - 1] = 0xd9;

    const result = await service.analyzeImage({
      imageBytes,
      mimeType: 'image/jpeg',
    });
    expect(result.estimatedCalories).toBe(250);
    expect(create).toHaveBeenCalled();

    const decoded = Buffer.from(
      extractImageBase64(firstCreateArg(create)),
      'base64',
    );
    expect(decoded.length).toBe(imageBytes.length);
    expect(decoded[0]).toBe(0xff);
    expect(decoded[decoded.length - 1]).toBe(0xd9);
  });

  it('does not truncate image bytes below the hard reject limit', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              foodName: 'x',
              estimatedCalories: 1,
              proteinG: 1,
              carbsG: 1,
              fatG: 1,
              confidence: 0.5,
              assumptions: [],
              estimatedQuantity: 1,
              quantityUnit: 'plate',
            }),
          },
        },
      ],
    });
    const config = {
      get: (key: string) => (key === 'OPENAI_API_KEY' ? 'test-key' : ''),
    } as unknown as ConfigService;
    const service = new FoodAnalysisService(config);
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = {
      chat: { completions: { create } },
    };

    const imageBytes = Buffer.alloc(250_001, 1);
    await service.analyzeImage({ imageBytes });
    expect(
      Buffer.from(extractImageBase64(firstCreateArg(create)), 'base64').length,
    ).toBe(250_001);
  });

  it('handles OpenAI failure safely', async () => {
    const create = jest.fn().mockRejectedValue(new Error('upstream down'));
    const config = {
      get: (key: string) => (key === 'OPENAI_API_KEY' ? 'test-key' : ''),
    } as unknown as ConfigService;
    const service = new FoodAnalysisService(config);
    (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client = {
      chat: { completions: { create } },
    };

    await expect(service.analyzeText('ข้าว')).rejects.toThrow(
      /temporarily unavailable/,
    );
  });
  describe('Thai output requirement', () => {
    type SystemCall = { messages: Array<{ role: string; content: unknown }> };

    function serviceWith(create: jest.Mock): FoodAnalysisService {
      const config = {
        get: (key: string) => (key === 'OPENAI_API_KEY' ? 'test-key' : ''),
      } as unknown as ConfigService;
      const service = new FoodAnalysisService(config);
      (
        service as unknown as {
          client: { chat: { completions: { create: typeof create } } };
        }
      ).client = { chat: { completions: { create } } };
      return service;
    }

    function okResponse(foodName: string) {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                foodName,
                estimatedCalories: 600,
                proteinG: 30,
                carbsG: 70,
                fatG: 20,
                confidence: 0.8,
                assumptions: ['1 จาน'],
                estimatedQuantity: 1,
                quantityUnit: 'plate',
              }),
            },
          },
        ],
      };
    }

    function systemPrompt(create: jest.Mock): string {
      const calls = create.mock.calls as unknown[][];
      const arg = calls[0][0] as SystemCall;
      return String(arg.messages.find((m) => m.role === 'system')?.content);
    }

    it('tells the model to name text-analysis dishes in Thai', async () => {
      const create = jest.fn().mockResolvedValue(okResponse('ข้าวมันไก่'));
      await serviceWith(create).analyzeText('fried chicken rice');
      expect(systemPrompt(create)).toContain('MUST be in Thai');
    });

    it('tells the model to name photo dishes in Thai', async () => {
      const create = jest.fn().mockResolvedValue(okResponse('ข้าวมันไก่'));
      await serviceWith(create).analyzeImage({
        imageBytes: Buffer.from([1, 2, 3]),
      });
      expect(systemPrompt(create)).toContain('MUST be in Thai');
    });

    it('tells photos of packaged food to be named and never 0 kcal', async () => {
      const create = jest.fn().mockResolvedValue(okResponse('อกไก่ย่าง'));
      await serviceWith(create).analyzeImage({
        imageBytes: Buffer.from([1, 2, 3]),
      });
      const prompt = systemPrompt(create);
      expect(prompt).toContain('packaged product');
      expect(prompt).toContain(
        'printed on the pack, use exactly those numbers',
      );
      expect(prompt).toContain('Never output 0 kcal');
      expect(prompt).not.toContain('labelKcal');
    });

    function imageDetail(create: jest.Mock): string {
      const call = (create.mock.calls[0] as unknown[])[0] as {
        messages: Array<{ content: unknown }>;
      };
      const parts = call.messages[1].content as Array<{
        image_url?: { detail?: string };
      }>;
      return parts.find((p) => p.image_url)?.image_url?.detail ?? '';
    }

    function serviceWithConfig(
      create: jest.Mock,
      extra: Record<string, string>,
    ): FoodAnalysisService {
      const config = {
        get: (key: string) =>
          key === 'OPENAI_API_KEY' ? 'test-key' : (extra[key] ?? ''),
      } as unknown as ConfigService;
      const service = new FoodAnalysisService(config);
      (
        service as unknown as {
          client: { chat: { completions: { create: typeof create } } };
        }
      ).client = { chat: { completions: { create } } };
      return service;
    }

    function modelOf(create: jest.Mock): string {
      return ((create.mock.calls[0] as unknown[])[0] as { model: string })
        .model;
    }

    it('uses FOOD_VISION_MODEL for photos only', async () => {
      const create = jest.fn().mockResolvedValue(okResponse('อกไก่ย่าง'));
      const service = serviceWithConfig(create, {
        FOOD_VISION_MODEL: 'gpt-4o',
      });
      await service.analyzeImage({ imageBytes: Buffer.from([1, 2, 3]) });
      expect(modelOf(create)).toBe('gpt-4o');

      const textCreate = jest.fn().mockResolvedValue(okResponse('ข้าว'));
      await serviceWithConfig(textCreate, {
        FOOD_VISION_MODEL: 'gpt-4o',
      }).analyzeText('ข้าว');
      expect(modelOf(textCreate)).toBe('gpt-4o-mini');
    });

    it('sends GPT-5 style limits (no temperature/max_tokens) for gpt-5 models', async () => {
      const create = jest.fn().mockResolvedValue(okResponse('อกไก่ย่าง'));
      await serviceWithConfig(create, {
        FOOD_VISION_MODEL: 'gpt-5',
      }).analyzeImage({ imageBytes: Buffer.from([1, 2, 3]) });
      const body = (create.mock.calls[0] as unknown[])[0] as Record<
        string,
        unknown
      >;
      expect(body.temperature).toBeUndefined();
      expect(body.max_tokens).toBeUndefined();
      expect(body.max_completion_tokens).toBe(2000);
      expect(body.reasoning_effort).toBe('low');
    });

    it('keeps temperature 0 and max_tokens for gpt-4o family', async () => {
      const create = jest.fn().mockResolvedValue(okResponse('อกไก่ย่าง'));
      await serviceWithConfig(create, {
        FOOD_VISION_MODEL: 'gpt-4o',
      }).analyzeImage({ imageBytes: Buffer.from([1, 2, 3]) });
      const body = (create.mock.calls[0] as unknown[])[0] as Record<
        string,
        unknown
      >;
      expect(body.temperature).toBe(0);
      expect(body.max_tokens).toBe(220);
      expect(body.reasoning_effort).toBeUndefined();
    });

    it('falls back to the default model when FOOD_VISION_MODEL is unset or odd', async () => {
      for (const value of ['', 'bad model!']) {
        const create = jest.fn().mockResolvedValue(okResponse('อกไก่ย่าง'));
        await serviceWithConfig(create, {
          FOOD_VISION_MODEL: value,
        }).analyzeImage({ imageBytes: Buffer.from([1, 2, 3]) });
        expect(modelOf(create)).toBe('gpt-4o-mini');
      }
    });

    it('rejects a text answer of 0 kcal instead of offering a 0 kcal meal', async () => {
      const zero = okResponse('สันในไก่ย่าง');
      zero.choices[0].message.content = JSON.stringify({
        ...JSON.parse(zero.choices[0].message.content),
        estimatedCalories: 0,
      });
      const create = jest.fn().mockResolvedValue(zero);
      await expect(
        serviceWith(create).analyzeText('สันในไก่ย่าง cp 1 ซอง'),
      ).rejects.toBeInstanceOf(FoodEstimateEmptyError);
    });

    it('rejects a photo that yields 0 kcal instead of offering a 0 kcal meal', async () => {
      const zero = okResponse('เกี๊ยวซ่า');
      zero.choices[0].message.content = JSON.stringify({
        ...JSON.parse(zero.choices[0].message.content),
        estimatedCalories: 0,
      });
      const create = jest.fn().mockResolvedValue(zero);
      await expect(
        serviceWith(create).analyzeImage({
          imageBytes: Buffer.from([1, 2, 3]),
        }),
      ).rejects.toBeInstanceOf(FoodImageUnreadableError);
    });

    it.each([
      ['', 'low'],
      ['bogus', 'low'],
      ['high', 'high'],
      ['auto', 'auto'],
    ])('FOOD_VISION_DETAIL=%j sends detail=%s', async (setting, expected) => {
      const create = jest.fn().mockResolvedValue(okResponse('อกไก่ย่าง'));
      const config = {
        get: (key: string) =>
          key === 'OPENAI_API_KEY'
            ? 'test-key'
            : key === 'FOOD_VISION_DETAIL'
              ? setting
              : '',
      } as unknown as ConfigService;
      const service = new FoodAnalysisService(config);
      (
        service as unknown as {
          client: { chat: { completions: { create: typeof create } } };
        }
      ).client = { chat: { completions: { create } } };
      await service.analyzeImage({ imageBytes: Buffer.from([1, 2, 3]) });
      expect(imageDetail(create)).toBe(expected);
    });

    it('tells the model to keep composition re-estimates in Thai', async () => {
      const create = jest.fn().mockResolvedValue(okResponse('ข้าวเปล่า'));
      await serviceWith(create).analyzeCompositionAdjustment({
        previous: {
          foodName: 'ข้าวมันไก่',
          estimatedCalories: 600,
          proteinG: 30,
          carbsG: 70,
          fatG: 20,
          confidence: 0.8,
          assumptions: [],
          estimatedQuantity: 1,
          quantityUnit: 'plate',
        },
        instruction: 'ไม่กินไก่',
      });
      expect(systemPrompt(create)).toContain('MUST be in Thai');
    });
  });
});
