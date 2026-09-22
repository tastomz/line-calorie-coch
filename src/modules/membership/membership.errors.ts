import { AiOperation } from './plan.config';

export class AiQuotaExceededError extends Error {
  constructor(
    readonly operation: AiOperation,
    readonly plan: 'FREE' | 'PRO',
    readonly used: number,
    readonly limit: number,
  ) {
    super(`AI quota exceeded for ${operation}`);
    this.name = 'AiQuotaExceededError';
  }
}

export class PromoRedeemError extends Error {
  constructor(
    readonly code:
      | 'invalid'
      | 'expired'
      | 'inactive'
      | 'max_reached'
      | 'already_redeemed'
      | 'already_pro'
      | 'trial_active',
    message: string,
  ) {
    super(message);
    this.name = 'PromoRedeemError';
  }
}
