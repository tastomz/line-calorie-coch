import { HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = { $queryRaw: jest.fn() };
  const googleSheets = { isEnabled: jest.fn().mockReturnValue(false) };
  const controller = new HealthController(
    prisma as never,
    googleSheets as never,
  );

  beforeEach(() => {
    prisma.$queryRaw.mockReset();
  });

  it('live does not query the database', () => {
    const result = controller.live();
    expect(result.alive).toBe(true);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('ready returns 200 payload when DB is up', async () => {
    prisma.$queryRaw.mockResolvedValue(1);
    const res = { status: jest.fn() };
    const body = await controller.ready(res as never);
    expect(body).toEqual({ ready: true, database: 'up' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('ready returns 503 when DB is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('down'));
    const res = { status: jest.fn() };
    const body = await controller.ready(res as never);
    expect(body).toEqual({ ready: false, database: 'down' });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
