import { Injectable, Logger } from '@nestjs/common';
import { AiQuotaExceededError } from './membership.errors';
import { AiOperation } from './plan.config';
import { AiUsageService } from './ai-usage.service';

/**
 * Central AI gateway: entitlement/quota → consume → OpenAI work.
 * Deterministic features must NOT call this.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(private readonly aiUsage: AiUsageService) {}

  /**
   * Reserve quota then run `work`.
   * Consumption happens before the OpenAI call so concurrent requests cannot
   * oversell the daily limit. If `work` throws before/during the call, the
   * slot stays consumed (see docs/MEMBERSHIP.md).
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
    try {
      return await work();
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
