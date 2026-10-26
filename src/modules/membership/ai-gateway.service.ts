import { Injectable, Logger } from '@nestjs/common';
import { AiQuotaExceededError } from './membership.errors';
import { AiOperation } from './plan.config';
import { AiUsageService } from './ai-usage.service';
import { AiTokenUsageMeta, runWithAiTokenCapture } from './ai-token-capture';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';
import { AiRoute, runWithAiRoute } from '../../common/ai-route';
import { getCodexBackend } from '../../common/codex-bridge';

/**
 * Central AI gateway: entitlement/quota → consume → OpenAI work → token log.
 * Deterministic features must NOT call this.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private readonly aiUsage: AiUsageService,
    private readonly entitlement: SubscriptionEntitlementService,
  ) {}

  /**
   * Trial package (PRO + TRIALING) → the owner's ChatGPT sign-in via Codex,
   * for every AI call (no API fallback). Everyone else → OPENAI_API_KEY.
   */
  async routeFor(userId: string): Promise<AiRoute> {
    if (!getCodexBackend()?.routesTrial()) return 'api';
    try {
      const ent = await this.entitlement.getEntitlement(userId);
      return ent.plan === 'TRIAL' && ent.status === 'TRIALING' ? 'codex' : 'api';
    } catch {
      return 'api';
    }
  }

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
    return this.execute(userId, operation, work, true);
  }

  /**
   * Same as `run` but does NOT consume the user's daily plan quota.
   * Only for tiny internal routing calls (message type classification) that
   * the user did not ask for; tokens are still logged for cost tracking.
   */
  async runUnmetered<T>(
    userId: string,
    operation: AiOperation,
    work: () => Promise<T>,
  ): Promise<T> {
    return this.execute(userId, operation, work, false);
  }

  private async execute<T>(
    userId: string,
    operation: AiOperation,
    work: () => Promise<T>,
    metered: boolean,
  ): Promise<T> {
    if (!userId) {
      throw new Error('userId is required for AI gateway');
    }
    if (metered) {
      await this.aiUsage.consumeAiUsage(userId, operation);
    }
    const captured: AiTokenUsageMeta[] = [];
    const route = await this.routeFor(userId);
    try {
      const result = await runWithAiTokenCapture(
        (meta) => {
          captured.push(meta);
        },
        () => runWithAiRoute(route, work),
      );
      // One row per OpenAI call (a photo may use a cheap check + an analysis).
      for (const meta of captured) {
        await this.aiUsage.recordTokenUsage(userId, operation, meta);
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
