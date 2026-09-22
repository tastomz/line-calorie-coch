import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calculateNutritionTargets,
  NutritionValidationError,
} from '../nutrition/nutrition-calculator';
import {
  ACTIVITY_LEVEL_VALUES,
  GOAL_VALUES,
  NutritionProfileInput,
  SEX_VALUES,
} from '../nutrition/nutrition.types';
import { SheetsSyncService } from '../sheets/sheets-sync.service';
import { CreateNutritionProfileDto } from './dto/create-nutrition-profile.dto';
import { UpdateNutritionProfileDto } from './dto/update-nutrition-profile.dto';
import { UsersService } from './users.service';

@Injectable()
export class NutritionProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly sheetsSync: SheetsSyncService,
  ) {}

  async create(userId: string, dto: CreateNutritionProfileDto) {
    await this.usersService.findByIdOrThrow(userId);

    const existing = await this.prisma.nutritionProfile.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException(
        'Nutrition profile already exists for this user',
      );
    }

    const input = this.validateAndNormalize(dto);
    const targets = this.safeCalculate(input);

    const profile = await this.prisma.nutritionProfile.create({
      data: {
        userId,
        ...input,
        dailyCalories: targets.dailyCalories,
        dailyProteinG: targets.dailyProteinG,
        dailyCarbsG: targets.dailyCarbsG,
        dailyFatG: targets.dailyFatG,
      },
    });

    this.sheetsSync.enqueue('upsertNutritionProfile', () =>
      this.sheetsSync.upsertNutritionProfile(profile),
    );

    return {
      profile,
      calculated: {
        bmr: targets.bmr,
        tdee: targets.tdee,
        dailyCalories: targets.dailyCalories,
        dailyProteinG: targets.dailyProteinG,
        dailyCarbsG: targets.dailyCarbsG,
        dailyFatG: targets.dailyFatG,
      },
    };
  }

  /**
   * Temporary: userId comes from the route parameter.
   * This will later be replaced by authenticated LINE identity.
   * Every query is scoped by userId — profiles of other users are never returned.
   */
  async findByUserId(userId: string) {
    await this.usersService.findByIdOrThrow(userId);

    const profile = await this.prisma.nutritionProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException(
        `Nutrition profile for user ${userId} not found`,
      );
    }

    return profile;
  }

  /** Soft lookup for account/web — does not throw when onboarding incomplete. */
  async findOptionalByUserId(userId: string) {
    return this.prisma.nutritionProfile.findUnique({
      where: { userId },
    });
  }

  async upsert(userId: string, dto: CreateNutritionProfileDto) {
    const existing = await this.prisma.nutritionProfile.findUnique({
      where: { userId },
    });
    if (existing) {
      return this.update(userId, dto);
    }
    return this.create(userId, dto);
  }

  async update(userId: string, dto: UpdateNutritionProfileDto) {
    await this.usersService.findByIdOrThrow(userId);

    const existing = await this.prisma.nutritionProfile.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new NotFoundException(
        `Nutrition profile for user ${userId} not found`,
      );
    }

    const merged: NutritionProfileInput = {
      sex: dto.sex ?? existing.sex,
      age: dto.age ?? existing.age,
      heightCm: dto.heightCm ?? existing.heightCm,
      currentWeightKg: dto.currentWeightKg ?? existing.currentWeightKg,
      targetWeightKg: dto.targetWeightKg ?? existing.targetWeightKg,
      activityLevel: dto.activityLevel ?? existing.activityLevel,
      goal: dto.goal ?? existing.goal,
    };

    const input = this.validateAndNormalize(merged);
    const targets = this.safeCalculate(input);

    const profile = await this.prisma.nutritionProfile.update({
      where: { userId },
      data: {
        ...input,
        dailyCalories: targets.dailyCalories,
        dailyProteinG: targets.dailyProteinG,
        dailyCarbsG: targets.dailyCarbsG,
        dailyFatG: targets.dailyFatG,
      },
    });

    this.sheetsSync.enqueue('upsertNutritionProfile', () =>
      this.sheetsSync.upsertNutritionProfile(profile),
    );

    return {
      profile,
      calculated: {
        bmr: targets.bmr,
        tdee: targets.tdee,
        dailyCalories: targets.dailyCalories,
        dailyProteinG: targets.dailyProteinG,
        dailyCarbsG: targets.dailyCarbsG,
        dailyFatG: targets.dailyFatG,
      },
    };
  }

  private validateAndNormalize(
    dto: CreateNutritionProfileDto | NutritionProfileInput,
  ): NutritionProfileInput {
    const sex = this.requireEnum(dto.sex, SEX_VALUES, 'sex');
    const goal = this.requireEnum(dto.goal, GOAL_VALUES, 'goal');
    const activityLevel = this.requireEnum(
      dto.activityLevel,
      ACTIVITY_LEVEL_VALUES,
      'activityLevel',
    );

    this.assertPositive('age', dto.age);
    this.assertPositive('heightCm', dto.heightCm);
    this.assertPositive('currentWeightKg', dto.currentWeightKg);
    this.assertPositive('targetWeightKg', dto.targetWeightKg);

    if (!Number.isInteger(dto.age)) {
      throw new BadRequestException('age must be an integer');
    }

    return {
      sex,
      age: dto.age,
      heightCm: dto.heightCm,
      currentWeightKg: dto.currentWeightKg,
      targetWeightKg: dto.targetWeightKg,
      activityLevel,
      goal,
    };
  }

  private safeCalculate(input: NutritionProfileInput) {
    try {
      return calculateNutritionTargets(input);
    } catch (error) {
      if (error instanceof NutritionValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private assertPositive(
    field: string,
    value: unknown,
  ): asserts value is number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(`${field} must be greater than 0`);
    }
  }

  private requireEnum<T extends string>(
    value: unknown,
    allowed: readonly T[],
    field: string,
  ): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      throw new BadRequestException(
        `${field} must be one of: ${allowed.join(', ')}`,
      );
    }
    return value as T;
  }
}
