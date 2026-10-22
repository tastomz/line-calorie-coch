import { Injectable } from '@nestjs/common';
import { DiscountType, Prisma, ProPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Stripe's smallest THB charge is ฿10 — never sell below this. */
export const MIN_CHARGE_THB = 10;
export const MAX_PLAN_PRICE_THB = 100_000;
export const MAX_PLAN_DAYS = 3650;
export const MAX_PERCENT_DISCOUNT = 90;
const CODE_PATTERN = /^[a-z0-9-]{1,20}$/;

export type PricedPlan = {
  code: string;
  labelTh: string;
  days: number;
  /** Full price before discount. */
  priceThb: number;
  /** What the user pays now (discount applied when its window is open). */
  finalPriceThb: number;
  discountActive: boolean;
  discountType: DiscountType;
  discountValue: number;
  discountLabel: string | null;
  discountEndsAt: Date | null;
  /** Price per 30 days, for "≈ X บาท/เดือน" hints. */
  perMonthThb: number;
};

export class PlanValidationError extends Error {}

function isDiscountOpen(plan: ProPlan, now: Date): boolean {
  if (plan.discountType === DiscountType.NONE || plan.discountValue <= 0) {
    return false;
  }
  if (plan.discountStartsAt && plan.discountStartsAt.getTime() > now.getTime())
    return false;
  if (plan.discountEndsAt && plan.discountEndsAt.getTime() <= now.getTime())
    return false;
  return true;
}

/** Discounted price, whole baht, never below MIN_CHARGE_THB. */
export function priceProPlan(plan: ProPlan, now = new Date()): PricedPlan {
  const open = isDiscountOpen(plan, now);
  let finalPrice = plan.priceThb;
  if (open && plan.discountType === DiscountType.PERCENT) {
    finalPrice = Math.round((plan.priceThb * (100 - plan.discountValue)) / 100);
  } else if (open && plan.discountType === DiscountType.AMOUNT) {
    finalPrice = plan.priceThb - plan.discountValue;
  }
  finalPrice = Math.max(MIN_CHARGE_THB, finalPrice);
  return {
    code: plan.code,
    labelTh: plan.labelTh,
    days: plan.days,
    priceThb: plan.priceThb,
    finalPriceThb: finalPrice,
    discountActive: open && finalPrice < plan.priceThb,
    discountType: plan.discountType,
    discountValue: plan.discountValue,
    discountLabel: plan.discountLabel,
    discountEndsAt: plan.discountEndsAt,
    perMonthThb: Math.round((finalPrice * 30) / plan.days),
  };
}

export type ProPlanInput = {
  code?: unknown;
  labelTh?: unknown;
  days?: unknown;
  priceThb?: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  discountLabel?: unknown;
  discountStartsAt?: unknown;
  discountEndsAt?: unknown;
  active?: unknown;
  sortOrder?: unknown;
};

function intIn(value: unknown, min: number, max: number, field: string) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new PlanValidationError(
      `${field} must be a whole number from ${min} to ${max}`,
    );
  }
  return value;
}

function optionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new PlanValidationError(`${field} must be an ISO date`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new PlanValidationError(`${field} must be an ISO date`);
  }
  return d;
}

/**
 * Validates a full plan (create) or a plan merged with a partial update.
 * Rejects rather than coerces: strings for numbers, decimals, out-of-range.
 */
export function validateProPlan(
  input: ProPlanInput,
): Omit<Prisma.ProPlanCreateInput, 'id'> {
  if (typeof input.code !== 'string' || !CODE_PATTERN.test(input.code)) {
    throw new PlanValidationError('code must be 1–20 chars of a–z, 0–9 or "-"');
  }
  const labelTh = typeof input.labelTh === 'string' ? input.labelTh.trim() : '';
  if (labelTh.length < 1 || labelTh.length > 40) {
    throw new PlanValidationError('labelTh must be 1–40 characters');
  }
  const days = intIn(input.days, 1, MAX_PLAN_DAYS, 'days');
  const priceThb = intIn(
    input.priceThb,
    MIN_CHARGE_THB,
    MAX_PLAN_PRICE_THB,
    'priceThb',
  );

  const discountType = (input.discountType ?? DiscountType.NONE) as string;
  if (!Object.values(DiscountType).includes(discountType as DiscountType)) {
    throw new PlanValidationError(
      'discountType must be NONE, PERCENT or AMOUNT',
    );
  }
  let discountValue = 0;
  if (discountType === DiscountType.PERCENT) {
    discountValue = intIn(
      input.discountValue,
      1,
      MAX_PERCENT_DISCOUNT,
      'discountValue (%)',
    );
  } else if (discountType === DiscountType.AMOUNT) {
    discountValue = intIn(
      input.discountValue,
      1,
      priceThb - MIN_CHARGE_THB,
      'discountValue (THB)',
    );
  }
  const discountLabelRaw =
    typeof input.discountLabel === 'string' ? input.discountLabel.trim() : '';
  if (discountLabelRaw.length > 40) {
    throw new PlanValidationError(
      'discountLabel must be at most 40 characters',
    );
  }
  const discountStartsAt = optionalDate(
    input.discountStartsAt,
    'discountStartsAt',
  );
  const discountEndsAt = optionalDate(input.discountEndsAt, 'discountEndsAt');
  if (
    discountStartsAt &&
    discountEndsAt &&
    discountEndsAt.getTime() <= discountStartsAt.getTime()
  ) {
    throw new PlanValidationError(
      'discountEndsAt must be after discountStartsAt',
    );
  }
  const active = input.active === undefined ? true : input.active;
  if (typeof active !== 'boolean') {
    throw new PlanValidationError('active must be true or false');
  }
  const sortOrder =
    input.sortOrder === undefined
      ? 0
      : intIn(input.sortOrder, -10_000, 10_000, 'sortOrder');

  return {
    code: input.code,
    labelTh,
    days,
    priceThb,
    discountType: discountType as DiscountType,
    discountValue,
    discountLabel:
      discountType === DiscountType.NONE ? null : discountLabelRaw || null,
    discountStartsAt:
      discountType === DiscountType.NONE ? null : discountStartsAt,
    discountEndsAt: discountType === DiscountType.NONE ? null : discountEndsAt,
    active,
    sortOrder,
  };
}

@Injectable()
export class ProPlanService {
  constructor(private readonly prisma: PrismaService) {}

  /** Plans users can buy right now, priced (discounts applied). */
  async listForSale(now = new Date()): Promise<PricedPlan[]> {
    const plans = await this.prisma.proPlan.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { days: 'asc' }],
    });
    return plans.map((p) => priceProPlan(p, now));
  }

  async findForSale(
    code: unknown,
    now = new Date(),
  ): Promise<PricedPlan | null> {
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return null;
    const plan = await this.prisma.proPlan.findUnique({ where: { code } });
    if (!plan || !plan.active) return null;
    return priceProPlan(plan, now);
  }

  async adminList(now = new Date()) {
    const plans = await this.prisma.proPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { days: 'asc' }],
    });
    return plans.map((p) => ({ ...p, priced: priceProPlan(p, now) }));
  }

  async create(input: ProPlanInput): Promise<ProPlan> {
    const data = validateProPlan(input);
    const existing = await this.prisma.proPlan.findUnique({
      where: { code: data.code },
    });
    if (existing) {
      throw new PlanValidationError(`code "${data.code}" already exists`);
    }
    return this.prisma.proPlan.create({ data });
  }

  /** Partial update — merged with the stored plan, then fully re-validated. */
  async update(id: string, input: ProPlanInput): Promise<ProPlan> {
    const current = await this.prisma.proPlan.findUnique({ where: { id } });
    if (!current) {
      throw new PlanValidationError('plan not found');
    }
    const merged: ProPlanInput = {
      code: current.code,
      labelTh: current.labelTh,
      days: current.days,
      priceThb: current.priceThb,
      discountType: current.discountType,
      discountValue: current.discountValue,
      discountLabel: current.discountLabel,
      discountStartsAt: current.discountStartsAt?.toISOString() ?? null,
      discountEndsAt: current.discountEndsAt?.toISOString() ?? null,
      active: current.active,
      sortOrder: current.sortOrder,
      ...input,
    };
    // Code is the checkout key users may have open in a tab — keep it stable.
    merged.code = current.code;
    const data = validateProPlan(merged);
    return this.prisma.proPlan.update({ where: { id }, data });
  }
}
