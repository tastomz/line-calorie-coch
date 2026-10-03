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
  FOOD_PHOTO_JSON_SCHEMA,
  FOOD_PHOTO_KIND_RULES,
  FOOD_ANALYSIS_MAX_TOKENS,
  FOOD_ANALYSIS_MODEL,
  FOOD_ANALYSIS_SYSTEM_PROMPT,
  FOOD_COMPOSITION_ADJUST_PROMPT,
  FoodAnalysisResult,
} from './food-analysis.types';
import {
  FoodAnalysisValidationError,
  PhotoAnalysisResult,
  parseFoodAnalysisJson,
  parsePhotoAnalysisJson,
} from './food-analysis.validator';
import {
  reportAiTokenUsage,
  usageFromOpenAiCompletion,
} from '../membership/ai-token-capture';

export class FoodAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FoodAnalysisError';
  }
}

/** The photo gave no usable numbers (e.g. a pack whose label cannot be read). */
export class FoodImageUnreadableError extends FoodAnalysisError {
  constructor() {
    super('image could not be read');
    this.name = 'FoodImageUnreadableError';
  }
}

/**
 * GPT-5 / o-series models reject `temperature` and `max_tokens`, and spend
 * part of the budget on reasoning, so they need a larger completion limit.
 */
const REASONING_MODEL = /^(gpt-5|o\d)/;
const REASONING_MAX_COMPLETION_TOKENS = 2000;

export function completionLimits(model: string):
  | { temperature: number; max_tokens: number }
  | {
      max_completion_tokens: number;
      reasoning_effort: 'low';
    } {
  return REASONING_MODEL.test(model)
    ? {
        max_completion_tokens: REASONING_MAX_COMPLETION_TOKENS,
        reasoning_effort: 'low',
      }
    : { temperature: 0, max_tokens: FOOD_ANALYSIS_MAX_TOKENS };
}

/** The text gave no usable numbers (0 kcal) — never offer that as a meal. */
export class FoodEstimateEmptyError extends FoodAnalysisError {
  constructor() {
    super('estimate was empty');
    this.name = 'FoodEstimateEmptyError';
  }
}

/** Reject absurdly large payloads; never silently truncate image bytes. */
const MAX_IMAGE_BYTES = 4_000_000;

@Injectable()
export class FoodAnalysisService {
  private readonly logger = new Logger(FoodAnalysisService.name);
  private readonly client: OpenAI | null;
  private readonly visionDetail: 'low' | 'high' | 'auto';
  private readonly visionModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';
    const detail = this.configService.get<string>('FOOD_VISION_DETAIL');
    // 'low' is the cheap default; 'high'/'auto' read small pack labels better.
    const model = this.configService.get<string>('FOOD_VISION_MODEL')?.trim();
    // Photos can use a stronger model than text; unset keeps the cheap default.
    this.visionModel =
      model && /^[\w.-]+$/.test(model) ? model : FOOD_ANALYSIS_MODEL;
    this.visionDetail = detail === 'high' || detail === 'auto' ? detail : 'low';
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

    const analysis = await this.requestAnalysis([
      {
        role: 'user',
        content: `USER CONTENT (untrusted food description):\nFood: ${trimmed}`,
      },
    ]);
    if (analysis.estimatedCalories <= 0) {
      throw new FoodEstimateEmptyError();
    }
    return analysis;
  }

  /**
   * Photo → food estimate, workout-screenshot numbers, or "other".
   * One vision call decides which, so a smartwatch screenshot is never
   * turned into a made-up meal.
   */
  async analyzePhoto(params: {
    imageBytes: Buffer;
    mimeType?: string;
    caption?: string;
  }): Promise<PhotoAnalysisResult> {
    if (!params.imageBytes.length) {
      throw new FoodAnalysisValidationError('image bytes are required');
    }

    // Never truncate binary/base64 image data — pass the complete buffer.
    if (params.imageBytes.length > MAX_IMAGE_BYTES) {
      throw new FoodAnalysisValidationError('image is too large to analyze');
    }

    const bytes = params.imageBytes;

    this.logger.log(
      `Vision request bytes=${bytes.length} detail=${this.visionDetail} model=${this.visionModel}`,
    );

    const mime = params.mimeType ?? 'image/jpeg';
    const base64 = bytes.toString('base64');
    const caption = (params.caption?.trim() || 'Estimate this meal.').slice(
      0,
      80,
    );

    const result = await this.requestStructured(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: caption },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mime};base64,${base64}`,
                // Low detail drastically reduces vision token cost.
                detail: this.visionDetail,
              },
            },
          ],
        },
      ],
      `${FOOD_ANALYSIS_SYSTEM_PROMPT}\n${FOOD_PHOTO_KIND_RULES}`,
      this.visionModel,
      FOOD_PHOTO_JSON_SCHEMA,
      parsePhotoAnalysisJson,
    );
    // 0 kcal is "nothing read", not a meal: ask for a clearer photo instead.
    if (result.kind === 'food' && result.analysis.estimatedCalories <= 0) {
      throw new FoodImageUnreadableError();
    }
    return result;
  }

  /** Food-only view of a photo (kept for callers that only handle meals). */
  async analyzeImage(params: {
    imageBytes: Buffer;
    mimeType?: string;
    caption?: string;
  }): Promise<FoodAnalysisResult> {
    const result = await this.analyzePhoto(params);
    if (result.kind !== 'food') {
      throw new FoodImageUnreadableError();
    }
    return result.analysis;
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

  private requestAnalysis(
    userMessages: OpenAI.Chat.ChatCompletionMessageParam[],
    systemPrompt: string = FOOD_ANALYSIS_SYSTEM_PROMPT,
    model: string = FOOD_ANALYSIS_MODEL,
  ): Promise<FoodAnalysisResult> {
    return this.requestStructured(
      userMessages,
      systemPrompt,
      model,
      FOOD_ANALYSIS_JSON_SCHEMA,
      parseFoodAnalysisJson,
    );
  }

  private async requestStructured<T>(
    userMessages: OpenAI.Chat.ChatCompletionMessageParam[],
    systemPrompt: string,
    model: string,
    schema: typeof FOOD_ANALYSIS_JSON_SCHEMA | typeof FOOD_PHOTO_JSON_SCHEMA,
    parse: (content: string) => T,
  ): Promise<T> {
    if (!this.client) {
      throw new FoodAnalysisError('OPENAI_API_KEY is not configured');
    }

    if (openAiCircuitBreaker.isOpen()) {
      throw new FoodAnalysisError('Food analysis is temporarily unavailable');
    }

    try {
      const completion = await withTimeout(
        this.client.chat.completions.create({
          model,
          ...completionLimits(model),
          messages: [
            { role: 'system', content: systemPrompt },
            ...userMessages,
          ],
          response_format: {
            type: 'json_schema',
            json_schema: schema,
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
        const meta = usageFromOpenAiCompletion(completion, model);
        if (meta) reportAiTokenUsage(meta);
      }

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new FoodAnalysisValidationError('AI returned an empty response');
      }

      const parsed = parse(content);
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
