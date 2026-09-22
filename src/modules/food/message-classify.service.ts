import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { openAiCircuitBreaker } from '../../common/openai-circuit-breaker';
import { OPENAI_CALL_TIMEOUT_MS, withTimeout } from '../../common/with-timeout';
import { WEIGHT_MAX_KG, WEIGHT_MIN_KG } from '../weight/weight-parse';
import { parseCoachHint } from './coach-hint';
import {
  ClassifiedMessage,
  MESSAGE_CLASSIFY_JSON_SCHEMA,
  MESSAGE_CLASSIFY_MAX_TOKENS,
  MESSAGE_CLASSIFY_MODEL,
  MESSAGE_CLASSIFY_SYSTEM_PROMPT,
} from './message-classify.types';
import {
  reportAiTokenUsage,
  usageFromOpenAiCompletion,
} from '../membership/ai-token-capture';

export class MessageClassifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageClassifyError';
  }
}

@Injectable()
export class MessageClassifyService {
  private readonly logger = new Logger(MessageClassifyService.name);
  private readonly client: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Cheap one-shot router: type + optional weightKg / query hints.
   * Keep prompts tiny — only used when deterministic rules are unsure.
   */
  async classify(text: string): Promise<ClassifiedMessage> {
    if (!this.client) {
      throw new MessageClassifyError('OPENAI_API_KEY is not configured');
    }

    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) {
      return {
        type: 'other',
        weightKg: null,
        weightQuery: null,
        coachHint: null,
      };
    }

    if (openAiCircuitBreaker.isOpen()) {
      throw new MessageClassifyError('classify unavailable');
    }

    try {
      const completion = await withTimeout(
        this.client.chat.completions.create({
          model: MESSAGE_CLASSIFY_MODEL,
          temperature: 0,
          max_tokens: MESSAGE_CLASSIFY_MAX_TOKENS,
          messages: [
            { role: 'system', content: MESSAGE_CLASSIFY_SYSTEM_PROMPT },
            { role: 'user', content: trimmed },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: MESSAGE_CLASSIFY_JSON_SCHEMA,
          },
        }),
        OPENAI_CALL_TIMEOUT_MS,
        'OpenAI message classify',
      );

      const usage = completion.usage;
      if (usage) {
        this.logger.log(
          `Classify usage prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`,
        );
        const meta = usageFromOpenAiCompletion(
          completion,
          MESSAGE_CLASSIFY_MODEL,
        );
        if (meta) reportAiTokenUsage(meta);
      }

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new MessageClassifyError('empty classify response');
      }

      const parsed = JSON.parse(content) as ClassifiedMessage;
      openAiCircuitBreaker.recordSuccess();
      return this.normalize(parsed);
    } catch (error) {
      if (error instanceof MessageClassifyError) {
        throw error;
      }
      openAiCircuitBreaker.recordFailure();
      this.logger.warn(
        `Message classify failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new MessageClassifyError('classify unavailable');
    }
  }

  private normalize(raw: ClassifiedMessage): ClassifiedMessage {
    const type = raw.type;
    let weightKg =
      typeof raw.weightKg === 'number' && Number.isFinite(raw.weightKg)
        ? Math.round(raw.weightKg * 100) / 100
        : null;

    if (
      weightKg != null &&
      (weightKg < WEIGHT_MIN_KG || weightKg > WEIGHT_MAX_KG)
    ) {
      weightKg = null;
    }

    return {
      type:
        type === 'weight_log' ||
        type === 'weight_query' ||
        type === 'food' ||
        type === 'coach' ||
        type === 'other'
          ? type
          : 'other',
      weightKg: type === 'weight_log' ? weightKg : null,
      weightQuery:
        type === 'weight_query'
          ? raw.weightQuery === 'latest' ||
            raw.weightQuery === 'trend' ||
            raw.weightQuery === 'progress' ||
            raw.weightQuery === 'overview'
            ? raw.weightQuery
            : 'latest'
          : null,
      coachHint: type === 'coach' ? parseCoachHint(raw.coachHint) : null,
    };
  }
}
