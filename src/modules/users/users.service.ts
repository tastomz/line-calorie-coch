import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnboardingState, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SheetsSyncService } from '../sheets/sheets-sync.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sheetsSync: SheetsSyncService,
    private readonly config: ConfigService,
  ) {}

  /** Bootstrap ADMIN by LINE user id (comma-separated). No public promote endpoint. */
  private bootstrapAdminLineIds(): Set<string> {
    const raw = (
      this.config.get<string>('ADMIN_BOOTSTRAP_LINE_USER_IDS') ?? ''
    ).trim();
    if (!raw) return new Set();
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  private roleForLineUserId(lineUserId: string): UserRole {
    return this.bootstrapAdminLineIds().has(lineUserId)
      ? UserRole.ADMIN
      : UserRole.USER;
  }

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
      const desired = this.roleForLineUserId(lineUserId);
      if (desired === UserRole.ADMIN && existing.role !== UserRole.ADMIN) {
        const user = await this.prisma.user.update({
          where: { id: existing.id },
          data: { role: UserRole.ADMIN },
        });
        return { user, created: false };
      }
      return { user: existing, created: false };
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          lineUserId,
          displayName: profile?.displayName,
          pictureUrl: profile?.pictureUrl,
          role: this.roleForLineUserId(lineUserId),
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

  async isAdminUserId(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return user?.role === UserRole.ADMIN;
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
