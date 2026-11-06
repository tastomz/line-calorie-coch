import { Prisma } from '@prisma/client';
import { withLineEventContext } from '../../common/line-event-context';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { FoodLogService } from '../food/food-log.service';
import { WeightLogService } from '../weight/weight-log.service';

const duplicate = () =>
  new Prisma.PrismaClientKnownRequestError('duplicate event effect', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('LINE event-scoped business mutation idempotency', () => {
  it('tags a FoodLog with its verified event and returns the existing row on replay', async () => {
    const existing = { id: 'food-1', userId: 'user-1' };
    const foodLog = {
      create: jest.fn().mockResolvedValueOnce(existing).mockRejectedValueOnce(
        duplicate(),
      ),
      findUnique: jest.fn().mockResolvedValue(existing),
    };
    const service = new FoodLogService({
      foodLog,
    } as unknown as PrismaService);
    const input = {
      foodName: 'ข้าว',
      calories: 200,
      proteinG: 4,
      carbsG: 44,
      fatG: 1,
    };
    await withLineEventContext('evt-food', () =>
      service.createForUser('user-1', input),
    );
    const replay = await withLineEventContext('evt-food', () =>
      service.createForUser('user-1', input),
    );
    expect(replay).toBe(existing);
    expect(foodLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceLineEventId: 'evt-food',
        userId: 'user-1',
      }) as unknown,
    });
    expect(foodLog.findUnique).toHaveBeenCalledWith({
      where: { sourceLineEventId: 'evt-food' },
    });
  });

  it('does not update the weight profile again on duplicate event replay', async () => {
    const existing = { id: 'weight-1', userId: 'user-1', weightKg: 75 };
    const tx = {
      weightLog: { create: jest.fn().mockRejectedValue(duplicate()) },
      nutritionProfile: { updateMany: jest.fn() },
    };
    const prisma = {
      weightLog: { findUnique: jest.fn().mockResolvedValue(existing) },
      $transaction: jest.fn(
        (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const users = {
      findByIdOrThrow: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    const service = new WeightLogService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
    );
    const replay = await withLineEventContext('evt-weight', () =>
      service.createForUser('user-1', 75),
    );
    expect(replay).toBe(existing);
    expect(tx.nutritionProfile.updateMany).not.toHaveBeenCalled();
    expect(prisma.weightLog.findUnique).toHaveBeenCalledWith({
      where: { sourceLineEventId: 'evt-weight' },
    });
  });
});
