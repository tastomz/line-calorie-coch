import { ConfigService } from '@nestjs/config';
import { openAiCircuitBreaker } from '../../common/openai-circuit-breaker';
import {
  FoodAnalysisError,
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
});
