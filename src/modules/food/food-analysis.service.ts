import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { openAiCircuitBreaker } from '../../common/openai-circuit-breaker';
import {
  OPENAI_CALL_TIMEOUT_MS,
  TimeoutError,
  withTimeout,
} from '../../common/with-timeout';
import {
  FOOD_ANALYSIS_JSON_SCHEMA,
  FOOD_ANALYSIS_MAX_TOKENS,
  FOOD_ANALYSIS_MODEL,
  FOOD_ANALYSIS_SYSTEM_PROMPT,
  FOOD_COMPOSITION_ADJUST_PROMPT,
  FoodAnalysisResult,
} from './food-analysis.types';
import {
  FoodAnalysisValidationError,
  parseFoodAnalysisJson,
} from './food-analysis.validator';

export class FoodAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FoodAnalysisError';
  }
}

/** Reject absurdly large payloads; never silently truncate image bytes. */
const MAX_IMAGE_BYTES = 4_000_000;

@Injectable()
export class FoodAnalysisService {
  private readonly logger = new Logger(FoodAnalysisService.name);
  private readonly client: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async analyzeText(foodText: string): Promise<FoodAnalysisResult> {
    const trimmed = foodText.trim().slice(0, 300);
    if (!trimmed) {
      throw new FoodAnalysisValidationError('food text is required');
    }

    return this.requestAnalysis([
      {
        role: 'user',
        content: `USER CONTENT (untrusted food description):\nFood: ${trimmed}`,
      },
    ]);
  }

  async analyzeImage(params: {
    imageBytes: Buffer;
    mimeType?: string;
    caption?: string;
  }): Promise<FoodAnalysisResult> {
    if (!params.imageBytes.length) {
      throw new FoodAnalysisValidationError('image bytes are required');
    }

    // Never truncate binary/base64 image data — pass the complete buffer.
    if (params.imageBytes.length > MAX_IMAGE_BYTES) {
      throw new FoodAnalysisValidationError('image is too large to analyze');
    }

    const bytes = params.imageBytes;

    this.logger.log(
      `Vision request bytes=${bytes.length} detail=low model=${FOOD_ANALYSIS_MODEL}`,
    );

    const mime = params.mimeType ?? 'image/jpeg';
    const base64 = bytes.toString('base64');
    const caption = (params.caption?.trim() || 'Estimate this meal.').slice(
      0,
      80,
    );

    return this.requestAnalysis([
      {
        role: 'user',
        content: [
          { type: 'text', text: caption },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mime};base64,${base64}`,
              // Low detail drastically reduces vision token cost.
              detail: 'low',
            },
          },
        ],
      },
    ]);
  }

  /**
   * Re-estimate when the user changes meal composition
   * (e.g. ate fish only, skipped rice) — not a simple quantity ratio.
   */
  async analyzeCompositionAdjustment(params: {
    previous: FoodAnalysisResult;
    instruction: string;
  }): Promise<FoodAnalysisResult> {
    const instruction = params.instruction.trim().slice(0, 200);
    if (!instruction) {
      throw new FoodAnalysisValidationError(
        'composition instruction is required',
      );
    }

    // Compact previous payload — omit long assumptions to save tokens.
    const previousCompact = {
      foodName: params.previous.foodName,
      estimatedCalories: params.previous.estimatedCalories,
      proteinG: params.previous.proteinG,
      carbsG: params.previous.carbsG,
      fatG: params.previous.fatG,
      estimatedQuantity: params.previous.estimatedQuantity,
      quantityUnit: params.previous.quantityUnit,
    };

    return this.requestAnalysis(
      [
        {
          role: 'user',
          content: `Prev:${JSON.stringify(previousCompact)}\nUSER CONTENT (untrusted correction):\nChange:${instruction}`,
        },
      ],
      FOOD_COMPOSITION_ADJUST_PROMPT,
    );
  }

  private async requestAnalysis(
    userMessages: OpenAI.Chat.ChatCompletionMessageParam[],
    systemPrompt: string = FOOD_ANALYSIS_SYSTEM_PROMPT,
  ): Promise<FoodAnalysisResult> {
    if (!this.client) {
      throw new FoodAnalysisError('OPENAI_API_KEY is not configured');
    }

    if (openAiCircuitBreaker.isOpen()) {
      throw new FoodAnalysisError('Food analysis is temporarily unavailable');
    }

    try {
      const completion = await withTimeout(
        this.client.chat.completions.create({
          model: FOOD_ANALYSIS_MODEL,
          temperature: 0,
          max_tokens: FOOD_ANALYSIS_MAX_TOKENS,
          messages: [
            { role: 'system', content: systemPrompt },
            ...userMessages,
          ],
          response_format: {
            type: 'json_schema',
            json_schema: FOOD_ANALYSIS_JSON_SCHEMA,
          },
        }),
        OPENAI_CALL_TIMEOUT_MS,
        'OpenAI food analysis',
      );

      const usage = completion.usage;
      if (usage) {
        this.logger.log(
          `OpenAI usage prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`,
        );
      }

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new FoodAnalysisValidationError('AI returned an empty response');
      }

      const parsed = parseFoodAnalysisJson(content);
      openAiCircuitBreaker.recordSuccess();
      return parsed;
    } catch (error) {
      if (
        error instanceof FoodAnalysisValidationError ||
        error instanceof FoodAnalysisError
      ) {
        throw error;
      }

      openAiCircuitBreaker.recordFailure();
      this.logger.error(
        `OpenAI food analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      if (error instanceof TimeoutError) {
        throw new FoodAnalysisError('Food analysis is temporarily unavailable');
      }
      throw new FoodAnalysisError('Food analysis is temporarily unavailable');
    }
  }
}
