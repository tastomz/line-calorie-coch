import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OnboardingState } from '@prisma/client';
import { SheetsSyncService } from '../sheets/sheets-sync.service';

describe('UsersService LINE helpers', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const sheetsSync = {
    enqueue: jest.fn((label: string, work: () => Promise<void>) => {
      void work();
    }),
    upsertUser: jest.fn().mockResolvedValue(undefined),
  };

  const service = new UsersService(
    prisma as unknown as PrismaService,
    sheetsSync as unknown as SheetsSyncService,
    { get: () => '' } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing LINE user without creating a duplicate', async () => {
    const existing = {
      id: '1',
      lineUserId: 'U1',
      onboardingState: OnboardingState.COMPLETED,
    };
    prisma.user.findUnique.mockResolvedValue(existing);

    const result = await service.findOrCreateByLineUserId('U1');
    expect(result).toEqual({ user: existing, created: false });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a new LINE user when missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const created = {
      id: '2',
      lineUserId: 'U2',
      displayName: 'Bob',
      onboardingState: OnboardingState.NOT_STARTED,
    };
    prisma.user.create.mockResolvedValue(created);

    const result = await service.findOrCreateByLineUserId('U2', {
      displayName: 'Bob',
      pictureUrl: 'http://x',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        lineUserId: 'U2',
        displayName: 'Bob',
        pictureUrl: 'http://x',
        role: 'USER',
        onboardingState: OnboardingState.NOT_STARTED,
      },
    });
    expect(result).toEqual({ user: created, created: true });
  });
});
