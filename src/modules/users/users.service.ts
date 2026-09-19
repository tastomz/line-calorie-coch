import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnboardingState, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SheetsSyncService } from '../sheets/sheets-sync.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sheetsSync: SheetsSyncService,
  ) {}

  async create(dto: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          lineUserId: dto.lineUserId,
          displayName: dto.displayName,
          pictureUrl: dto.pictureUrl,
        },
      });
      this.sheetsSync.enqueue('upsertUser', () =>
        this.sheetsSync.upsertUser(user),
      );
      return user;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('lineUserId already exists');
      }
      throw error;
    }
  }

  async findByIdOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }

  async findByLineUserId(lineUserId: string) {
    return this.prisma.user.findUnique({ where: { lineUserId } });
  }

  async findOrCreateByLineUserId(
    lineUserId: string,
    profile?: { displayName?: string; pictureUrl?: string },
  ) {
    const existing = await this.findByLineUserId(lineUserId);
    if (existing) {
      return { user: existing, created: false };
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          lineUserId,
          displayName: profile?.displayName,
          pictureUrl: profile?.pictureUrl,
          onboardingState: OnboardingState.NOT_STARTED,
        },
      });
      this.sheetsSync.enqueue('upsertUser', () =>
        this.sheetsSync.upsertUser(user),
      );
      return { user, created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const user = await this.findByLineUserId(lineUserId);
        if (user) {
          return { user, created: false };
        }
      }
      throw error;
    }
  }

  async setOnboardingState(userId: string, onboardingState: OnboardingState) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { onboardingState },
    });
  }

  async updateOnboardingDraft(userId: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async resetOnboardingDraft(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        onboardingState: OnboardingState.NOT_STARTED,
        draftSex: null,
        draftAge: null,
        draftHeightCm: null,
        draftCurrentWeightKg: null,
        draftTargetWeightKg: null,
        draftActivityLevel: null,
        draftGoal: null,
      },
    });
  }

  async completeOnboarding(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        onboardingState: OnboardingState.COMPLETED,
        draftSex: null,
        draftAge: null,
        draftHeightCm: null,
        draftCurrentWeightKg: null,
        draftTargetWeightKg: null,
        draftActivityLevel: null,
        draftGoal: null,
      },
    });
    this.sheetsSync.enqueue('upsertUser', () =>
      this.sheetsSync.upsertUser(user),
    );
    return user;
  }
}
