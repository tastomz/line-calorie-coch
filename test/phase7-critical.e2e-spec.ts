import * as crypto from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingState } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { FoodAnalysisService } from '../src/modules/food/food-analysis.service';
import { MessageClassifyService } from '../src/modules/food/message-classify.service';
import { LineService } from '../src/modules/line/line.service';
import { SheetsSyncService } from '../src/modules/sheets/sheets-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Critical-flow E2E with mocked OpenAI/LINE outbound/Sheets.
 * Requires a working DATABASE_URL (SQLite file is fine).
 * Does not call real external APIs.
 */
describe('Phase 7 critical flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const channelSecret = 'e2e-channel-secret';

  const lineServiceMock = {
    verifySignature: jest.fn(),
    replyText: jest.fn().mockResolvedValue(undefined),
    replyButtons: jest.fn().mockResolvedValue(undefined),
    replyTextOrPush: jest.fn().mockResolvedValue(undefined),
    replyButtonsOrPush: jest.fn().mockResolvedValue(undefined),
    pushText: jest.fn().mockResolvedValue(undefined),
    getUserProfile: jest.fn().mockResolvedValue({ displayName: 'E2E' }),
    getMessageContentPreviewBytes: jest.fn(),
    getMessageContentBytes: jest.fn(),
    isMessagingClientReady: jest.fn().mockReturnValue(true),
  };

  const foodAnalysisMock = {
    isConfigured: jest.fn().mockReturnValue(true),
    analyzeText: jest.fn().mockResolvedValue({
      foodName: 'ข้าวผัด',
      estimatedCalories: 550,
      proteinG: 20,
      carbsG: 70,
      fatG: 18,
      confidence: 0.8,
      assumptions: ['1 จาน'],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    }),
    analyzeImage: jest.fn(),
    analyzeCompositionAdjustment: jest.fn(),
  };

  const classifyMock = {
    isConfigured: jest.fn().mockReturnValue(true),
    classify: jest.fn().mockResolvedValue({
      type: 'food',
      weightKg: null,
      weightQuery: null,
      coachHint: null,
    }),
  };

  const sheetsMock = {
    isEnabled: jest.fn().mockReturnValue(false),
    enqueue: jest.fn((label: string, work: () => Promise<void>) => {
      void work().catch(() => undefined);
    }),
    appendFoodLog: jest.fn().mockRejectedValue(new Error('sheets 503')),
    appendWeightLog: jest.fn().mockResolvedValue(undefined),
    updateDailySummary: jest.fn().mockRejectedValue(new Error('sheets 503')),
    upsertUser: jest.fn(),
    upsertNutritionProfile: jest.fn(),
  };

  function sign(body: Buffer): string {
    return crypto
      .createHmac('sha256', channelSecret)
      .update(body)
      .digest('base64');
  }

  function postWebhook(payload: object) {
    const raw = Buffer.from(JSON.stringify(payload));
    return request(app.getHttpServer())
      .post('/line/webhook')
      .set('Content-Type', 'application/json')
      .set('x-line-signature', sign(raw))
      .send(payload);
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./e2e-test.db';
    process.env.LINE_CHANNEL_SECRET = channelSecret;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'e2e-token';
    process.env.OPENAI_API_KEY = 'e2e-openai';

    // Real signature verification for signature tests
    lineServiceMock.verifySignature.mockImplementation(
      (rawBody: Buffer, signature?: string) => {
        if (!signature || !Buffer.isBuffer(rawBody)) return false;
        const expected = sign(rawBody);
        return expected === signature;
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LineService)
      .useValue(lineServiceMock)
      .overrideProvider(FoodAnalysisService)
      .useValue(foodAnalysisMock)
      .overrideProvider(MessageClassifyService)
      .useValue(classifyMock)
      .overrideProvider(SheetsSyncService)
      .useValue(sheetsMock)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    lineServiceMock.verifySignature.mockImplementation(
      (rawBody: Buffer, signature?: string) => {
        if (!signature || !Buffer.isBuffer(rawBody)) return false;
        return sign(rawBody) === signature;
      },
    );
    lineServiceMock.replyText.mockResolvedValue(undefined);
    lineServiceMock.replyButtons.mockResolvedValue(undefined);
    lineServiceMock.replyTextOrPush.mockResolvedValue(undefined);
    lineServiceMock.replyButtonsOrPush.mockResolvedValue(undefined);
    sheetsMock.enqueue.mockImplementation(
      (label: string, work: () => Promise<void>) => {
        void work().catch(() => undefined);
      },
    );
    sheetsMock.appendFoodLog.mockRejectedValue(new Error('sheets 503'));

    await prisma.foodLog.deleteMany();
    await prisma.weightLog.deleteMany();
    await prisma.pendingFoodAnalysis.deleteMany();
    await prisma.nutritionProfile.deleteMany();
    await prisma.lineEvent.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET /health/live is alive without DB dependency', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body as { alive: boolean }).toEqual(
      expect.objectContaining({ alive: true }),
    );
  });

  it('GET /health/ready is ready when DB is up', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(res.body as { ready: boolean }).toEqual(
      expect.objectContaining({ ready: true, database: 'up' }),
    );
  });

  it('rejects invalid LINE webhook signature', async () => {
    const payload = { events: [] };
    await request(app.getHttpServer())
      .post('/line/webhook')
      .set('Content-Type', 'application/json')
      .set('x-line-signature', 'invalid')
      .send(payload)
      .expect(401);
  });

  it('accepts valid LINE webhook signature', async () => {
    const res = await postWebhook({ destination: 'bot', events: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('follow creates user; duplicate event does not re-process', async () => {
    const event = {
      type: 'follow',
      webhookEventId: 'e2e-follow-1',
      replyToken: 'rt-follow',
      source: { userId: 'U-e2e-1', type: 'user' },
      timestamp: Date.now(),
    };

    await postWebhook({ events: [event] }).expect(200);
    const user = await prisma.user.findUnique({
      where: { lineUserId: 'U-e2e-1' },
    });
    expect(user).toBeTruthy();

    await postWebhook({ events: [event] }).expect(200);
    const events = await prisma.lineEvent.findMany({
      where: { lineEventId: 'e2e-follow-1' },
    });
    expect(events).toHaveLength(1);
    expect(lineServiceMock.replyButtons).toHaveBeenCalledTimes(1);
  });

  it('food text → confirm → one FoodLog; second confirm does not duplicate', async () => {
    const user = await prisma.user.create({
      data: {
        lineUserId: 'U-e2e-food',
        onboardingState: OnboardingState.COMPLETED,
        nutritionProfile: {
          create: {
            sex: 'MALE',
            age: 30,
            heightCm: 175,
            currentWeightKg: 80,
            targetWeightKg: 75,
            activityLevel: 'MODERATE',
            goal: 'LOSE_WEIGHT',
            dailyCalories: 2000,
            dailyProteinG: 140,
            dailyCarbsG: 200,
            dailyFatG: 60,
          },
        },
      },
    });

    await postWebhook({
      events: [
        {
          type: 'message',
          webhookEventId: 'e2e-food-1',
          replyToken: 'rt-food',
          source: { userId: 'U-e2e-food', type: 'user' },
          message: { type: 'text', id: 'm1', text: 'ข้าวผัด' },
          timestamp: Date.now(),
        },
      ],
    }).expect(200);

    expect(foodAnalysisMock.analyzeText).toHaveBeenCalled();
    const pending = await prisma.pendingFoodAnalysis.findUnique({
      where: { userId: user.id },
    });
    expect(pending?.foodName).toBe('ข้าวผัด');

    await postWebhook({
      events: [
        {
          type: 'message',
          webhookEventId: 'e2e-confirm-1',
          replyToken: 'rt-confirm',
          source: { userId: 'U-e2e-food', type: 'user' },
          message: { type: 'text', id: 'm2', text: 'บันทึก' },
          timestamp: Date.now(),
        },
      ],
    }).expect(200);

    const logs = await prisma.foodLog.findMany({ where: { userId: user.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].calories).toBe(550);

    await postWebhook({
      events: [
        {
          type: 'message',
          webhookEventId: 'e2e-confirm-2',
          replyToken: 'rt-confirm-2',
          source: { userId: 'U-e2e-food', type: 'user' },
          message: { type: 'text', id: 'm3', text: 'บันทึก' },
          timestamp: Date.now(),
        },
      ],
    }).expect(200);

    const logsAfter = await prisma.foodLog.findMany({
      where: { userId: user.id },
    });
    expect(logsAfter).toHaveLength(1);
  });

  it('cross-user cannot confirm another user pending meal', async () => {
    const owner = await prisma.user.create({
      data: {
        lineUserId: 'U-owner',
        onboardingState: OnboardingState.COMPLETED,
      },
    });
    await prisma.user.create({
      data: {
        lineUserId: 'U-other',
        onboardingState: OnboardingState.COMPLETED,
      },
    });
    await prisma.pendingFoodAnalysis.create({
      data: {
        userId: owner.id,
        foodName: 'secret',
        calories: 100,
        proteinG: 1,
        carbsG: 1,
        fatG: 1,
        confidence: 0.5,
        assumptions: '[]',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await postWebhook({
      events: [
        {
          type: 'message',
          webhookEventId: 'e2e-cross-confirm',
          replyToken: 'rt-x',
          source: { userId: 'U-other', type: 'user' },
          message: { type: 'text', id: 'mx', text: 'บันทึก' },
          timestamp: Date.now(),
        },
      ],
    }).expect(200);

    expect(await prisma.foodLog.count()).toBe(0);
    expect(
      await prisma.pendingFoodAnalysis.findUnique({
        where: { userId: owner.id },
      }),
    ).toBeTruthy();
  });

  it('weight input creates WeightLog and syncs profile currentWeightKg', async () => {
    const user = await prisma.user.create({
      data: {
        lineUserId: 'U-weight',
        onboardingState: OnboardingState.COMPLETED,
        nutritionProfile: {
          create: {
            sex: 'FEMALE',
            age: 28,
            heightCm: 160,
            currentWeightKg: 70,
            targetWeightKg: 65,
            activityLevel: 'LIGHT',
            goal: 'LOSE_WEIGHT',
            dailyCalories: 1600,
            dailyProteinG: 110,
            dailyCarbsG: 180,
            dailyFatG: 50,
          },
        },
      },
    });

    await postWebhook({
      events: [
        {
          type: 'message',
          webhookEventId: 'e2e-weight-1',
          replyToken: 'rt-w',
          source: { userId: 'U-weight', type: 'user' },
          message: { type: 'text', id: 'mw', text: 'น้ำหนัก 84.2' },
          timestamp: Date.now(),
        },
      ],
    }).expect(200);

    const logs = await prisma.weightLog.findMany({
      where: { userId: user.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].weightKg).toBe(84.2);
    const profile = await prisma.nutritionProfile.findUnique({
      where: { userId: user.id },
    });
    expect(profile?.currentWeightKg).toBe(84.2);
    expect(profile?.dailyCalories).toBe(1600);
  });

  it('daily summary uses DB FoodLog totals', async () => {
    const user = await prisma.user.create({
      data: {
        lineUserId: 'U-summary',
        onboardingState: OnboardingState.COMPLETED,
        nutritionProfile: {
          create: {
            sex: 'MALE',
            age: 30,
            heightCm: 175,
            currentWeightKg: 80,
            targetWeightKg: 75,
            activityLevel: 'MODERATE',
            goal: 'LOSE_WEIGHT',
            dailyCalories: 2000,
            dailyProteinG: 140,
            dailyCarbsG: 200,
            dailyFatG: 60,
          },
        },
        foodLogs: {
          create: {
            eatenAt: new Date(),
            foodName: 'ไก่ย่าง',
            calories: 400,
            proteinG: 40,
            carbsG: 10,
            fatG: 12,
          },
        },
      },
    });

    await postWebhook({
      events: [
        {
          type: 'message',
          webhookEventId: 'e2e-today',
          replyToken: 'rt-today',
          source: { userId: 'U-summary', type: 'user' },
          message: { type: 'text', id: 'mt', text: 'วันนี้' },
          timestamp: Date.now(),
        },
      ],
    }).expect(200);

    expect(lineServiceMock.replyText).toHaveBeenCalled();
    const replyArgs = lineServiceMock.replyText.mock.calls[0] as unknown as [
      string,
      string,
    ];
    const reply = replyArgs[1];
    expect(reply).toContain('400');
    expect(reply).toMatch(/2,?000/);
    expect(user.id).toBeTruthy();
  });

  it('Sheets failure does not roll back FoodLog', async () => {
    const user = await prisma.user.create({
      data: {
        lineUserId: 'U-sheets',
        onboardingState: OnboardingState.COMPLETED,
        nutritionProfile: {
          create: {
            sex: 'MALE',
            age: 30,
            heightCm: 175,
            currentWeightKg: 80,
            targetWeightKg: 75,
            activityLevel: 'MODERATE',
            goal: 'LOSE_WEIGHT',
            dailyCalories: 2000,
            dailyProteinG: 140,
            dailyCarbsG: 200,
            dailyFatG: 60,
          },
        },
      },
    });

    await postWebhook({
      events: [
        {
          type: 'message',
          webhookEventId: 'e2e-sheets-food',
          replyToken: 'rt-sf',
          source: { userId: 'U-sheets', type: 'user' },
          message: { type: 'text', id: 'msf', text: 'ข้าวผัด' },
          timestamp: Date.now(),
        },
      ],
    }).expect(200);

    await postWebhook({
      events: [
        {
          type: 'message',
          webhookEventId: 'e2e-sheets-confirm',
          replyToken: 'rt-sc',
          source: { userId: 'U-sheets', type: 'user' },
          message: { type: 'text', id: 'msc', text: 'บันทึก' },
          timestamp: Date.now(),
        },
      ],
    }).expect(200);

    expect(await prisma.foodLog.count({ where: { userId: user.id } })).toBe(1);
    expect(sheetsMock.appendFoodLog).toHaveBeenCalled();
  });
});
