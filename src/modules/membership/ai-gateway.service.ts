import { Injectable, Logger } from '@nestjs/common';
import { AiQuotaExceededError } from './membership.errors';
import { AiOperation } from './plan.config';
import { AiUsageService } from './ai-usage.service';
import { AiTokenUsageMeta, runWithAiTokenCapture } from './ai-token-capture';

/**
 * Central AI gateway: entitlement/quota → consume → OpenAI work → token log.
 * Deterministic features must NOT call this.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(private readonly aiUsage: AiUsageService) {}

  /**
   * Reserve quota then run `work`.
   * OpenAI callers should invoke `reportAiTokenUsage(...)` inside `work`
   * so tokens are persisted centrally after a successful call.
   */
  async run<T>(
    userId: string,
    operation: AiOperation,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!userId) {
      throw new Error('userId is required for AI gateway');
    }
    await this.aiUsage.consumeAiUsage(userId, operation);
    let captured: AiTokenUsageMeta | undefined;
    try {
      const result = await runWithAiTokenCapture((meta) => {
        captured = meta;
      }, work);
      if (captured) {
        await this.aiUsage.recordTokenUsage(userId, operation, captured);
      }
      return result;
    } catch (error) {
      if (error instanceof AiQuotaExceededError) {
        throw error;
      }
      this.logger.warn(
        `AI gateway work failed op=${operation} userPrefix=${userId.slice(0, 8)}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw error;
    }
  }
}
