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
      const arg = calls[calls.length - 1][0] as SystemCall;
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
      expect(systemPrompt(create)).toContain('Thai only');
    });

    function componentsResponse() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                components: [
                  {
                    name: 'ข้าวสวย',
                    grams: 180,
                    calories: 234,
                    proteinG: 4.5,
                    carbsG: 50,
                    fatG: 0.5,
                  },
                  {
                    name: 'ไก่',
                    grams: 140,
                    calories: 230,
                    proteinG: 42,
                    carbsG: 0,
                    fatG: 5,
                  },
                  {
                    name: 'ผักบุ้ง',
                    grams: 120,
                    calories: 50,
                    proteinG: 3,
                    carbsG: 6,
                    fatG: 2,
                  },
                  {
                    name: 'น้ำมันผัด',
                    grams: 18,
                    calories: 160,
                    proteinG: 0,
                    carbsG: 0,
                    fatG: 18,
                  },
                ],
                foodName: 'ข้าวผัดผักบุ้งไฟแดงไก่',
                confidence: 0.7,
                assumptions: ['ข้าว ~180 g, ไก่ ~140 g, ผักบุ้ง ~120 g'],
                estimatedQuantity: 1,
                quantityUnit: 'plate',
              }),
            },
          },
        ],
      };
    }

    it('sums the itemised components in code instead of trusting a single guess', async () => {
      const create = jest
        .fn()
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"kind":"food"}' } }],
        })
        .mockResolvedValueOnce(componentsResponse());
      const result = await serviceWith(create).analyzePhoto({
        imageBytes: Buffer.from([1, 2, 3]),
      });
      expect(result.kind).toBe('food');
      if (result.kind !== 'food') return;
      expect(result.analysis.estimatedCalories).toBe(674);
      expect(result.analysis.proteinG).toBe(49.5);
      expect(result.analysis.carbsG).toBe(56);
      expect(result.analysis.fatG).toBe(25.5);
      expect(result.analysis.assumptions[0]).toContain('ข้าว');
    });

    it('asks for rice, protein, vegetables and cooking oil as separate components', async () => {
      const create = jest
        .fn()
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"kind":"food"}' } }],
        })
        .mockResolvedValueOnce(componentsResponse());
      await serviceWith(create).analyzePhoto({
        imageBytes: Buffer.from([1, 2, 3]),
      });
      const body = (create.mock.calls[1] as unknown[])[0] as {
        response_format: { json_schema: { name: string } };
        max_tokens: number;
      };
      expect(body.response_format.json_schema.name).toBe(
        'food_photo_components',
      );
      expect(body.max_tokens).toBe(650);
      const prompt = systemPrompt(create);
      expect(prompt).toContain('cooking oil');
      expect(prompt).toContain('rice');
      expect(prompt).toContain('Do not leave out the rice');
    });

    function kindResponse(kind: string) {
      return { choices: [{ message: { content: JSON.stringify({ kind }) } }] };
    }

    function workoutResponse(workout: Record<string, unknown>) {
      return {
        choices: [{ message: { content: JSON.stringify(workout) } }],
      };
    }

    type CallBody = {
      model: string;
      max_tokens?: number;
      response_format: { json_schema: { name: string } };
      messages: Array<{ role: string; content: unknown }>;
    };

    function callBody(create: jest.Mock, index: number): CallBody {
      return (create.mock.calls[index] as unknown[])[0] as CallBody;
    }

    it('checks the photo kind first with a cheap low-detail mini call', async () => {
      const create = jest
        .fn()
        .mockResolvedValueOnce(kindResponse('food'))
        .mockResolvedValueOnce(okResponse('อกไก่ย่าง'));
      const result = await serviceWith(create).analyzePhoto({
        imageBytes: Buffer.from([1, 2, 3]),
      });
      expect(result.kind).toBe('food');
      expect(create).toHaveBeenCalledTimes(2);
      const check = callBody(create, 0);
      expect(check.model).toBe('gpt-4o-mini');
      expect(check.max_tokens).toBe(20);
      expect(check.response_format.json_schema.name).toBe('photo_kind');
      const parts = check.messages[1].content as Array<{
        image_url?: { detail?: string };
      }>;
      expect(parts.find((p) => p.image_url)?.image_url?.detail).toBe('low');
    });

    it('does not run the expensive meal analysis for a workout screenshot', async () => {
      const create = jest
        .fn()
        .mockResolvedValueOnce(kindResponse('workout'))
        .mockResolvedValueOnce(
          workoutResponse({
            exerciseType: 'OTHER',
            durationMinutes: 59,
            caloriesBurned: 400,
            avgHeartRate: 135,
            workoutName: 'Freestyle',
          }),
        );
      const result = await serviceWithConfig(create, {
        FOOD_VISION_MODEL: 'gpt-4o',
      }).analyzePhoto({ imageBytes: Buffer.from([1, 2, 3]) });
      expect(result).toMatchObject({
        kind: 'workout',
        workout: { durationMinutes: 59, caloriesBurned: 400 },
      });
      expect(create).toHaveBeenCalledTimes(2);
      expect(callBody(create, 1).model).toBe('gpt-4o-mini');
      expect(callBody(create, 1).response_format.json_schema.name).toBe(
        'workout_screenshot',
      );
    });

    it('stops after the cheap check for images that are neither food nor a workout', async () => {
      const create = jest.fn().mockResolvedValue(kindResponse('other'));
      const result = await serviceWith(create).analyzePhoto({
        imageBytes: Buffer.from([1, 2, 3]),
      });
      expect(result).toEqual({ kind: 'other' });
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('treats a workout screenshot with an unreadable duration as other', async () => {
      const create = jest
        .fn()
        .mockResolvedValueOnce(kindResponse('workout'))
        .mockResolvedValueOnce(
          workoutResponse({
            exerciseType: 'RUNNING',
            durationMinutes: null,
            caloriesBurned: 400,
            avgHeartRate: null,
            workoutName: null,
          }),
        );
      const result = await serviceWith(create).analyzePhoto({
        imageBytes: Buffer.from([1, 2, 3]),
      });
      expect(result).toEqual({ kind: 'other' });
    });

    it('falls back to the food analysis when the cheap check fails', async () => {
      const create = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(okResponse('อกไก่ย่าง'));
      const result = await serviceWith(create).analyzePhoto({
        imageBytes: Buffer.from([1, 2, 3]),
      });
      expect(result.kind).toBe('food');
    });

    it('text analysis never runs the photo check', async () => {
      const create = jest.fn().mockResolvedValue(okResponse('ข้าว'));
      await serviceWith(create).analyzeText('ข้าว');
      expect(create).toHaveBeenCalledTimes(1);
      expect(callBody(create, 0).response_format.json_schema.name).toBe(
        'food_nutrition_estimate',
      );
    });

    it('analyzeImage still refuses non-food photos', async () => {
      const create = jest.fn().mockResolvedValue(kindResponse('other'));
      await expect(
        serviceWith(create).analyzeImage({
          imageBytes: Buffer.from([1, 2, 3]),
        }),
      ).rejects.toBeInstanceOf(FoodImageUnreadableError);
    });

    it('tells photos of packaged food to be named and never 0 kcal', async () => {
      const create = jest.fn().mockResolvedValue(okResponse('อกไก่ย่าง'));
      await serviceWith(create).analyzeImage({
        imageBytes: Buffer.from([1, 2, 3]),
      });
      const prompt = systemPrompt(create);
      expect(prompt).toContain('packaged product');
      expect(prompt).toContain('do not multiply or rescale them');
      expect(prompt).toContain('Never output 0 kcal');
      expect(prompt).not.toContain('labelKcal');
    });

    function imageDetail(create: jest.Mock): string {
      const call = (
        create.mock.calls[create.mock.calls.length - 1] as unknown[]
      )[0] as {
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
      return (
        (create.mock.calls[create.mock.calls.length - 1] as unknown[])[0] as {
          model: string;
        }
      ).model;
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
      const body = (
        create.mock.calls[create.mock.calls.length - 1] as unknown[]
      )[0] as Record<string, unknown>;
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
      const body = (
        create.mock.calls[create.mock.calls.length - 1] as unknown[]
      )[0] as Record<string, unknown>;
      expect(body.temperature).toBe(0);
      // Photo analysis is itemised, so it gets a larger output budget.
      expect(body.max_tokens).toBe(650);
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
