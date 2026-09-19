import { OnboardingState } from '@prisma/client';
import { FoodLoggingService } from '../food/food-logging.service';
import { calculateNutritionTargets } from '../nutrition/nutrition-calculator';
import { LineService } from '../line/line.service';
import { NutritionProfileService } from '../users/nutrition-profile.service';
import { UsersService } from '../users/users.service';
import {
  ASK_AGE_TEXT,
  ASK_HEIGHT_TEXT,
  COMPLETED_TEXT,
  INVALID_AGE_TEXT,
  SEX_CHOICES,
  WELCOME_TEXT,
} from './onboarding.messages';
import { OnboardingService } from './onboarding.service';

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    lineUserId: 'U1',
    displayName: 'Test',
    pictureUrl: null,
    onboardingState: OnboardingState.WAITING_SEX,
    draftSex: null,
    draftAge: null,
    draftHeightCm: null,
    draftCurrentWeightKg: null,
    draftTargetWeightKg: null,
    draftActivityLevel: null,
    draftGoal: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('OnboardingService', () => {
  const usersService = {
    findByLineUserId: jest.fn(),
    findOrCreateByLineUserId: jest.fn(),
    resetOnboardingDraft: jest.fn(),
    setOnboardingState: jest.fn(),
    updateOnboardingDraft: jest.fn(),
    completeOnboarding: jest.fn(),
  };
  const nutritionProfileService = {
    upsert: jest.fn(),
  };
  const lineService = {
    getUserProfile: jest.fn(),
    replyText: jest.fn(),
    replyButtons: jest.fn(),
  };
  const foodLoggingService = {
    handleCompletedText: jest.fn(),
    handleImage: jest.fn(),
  };

  const service = new OnboardingService(
    usersService as unknown as UsersService,
    nutritionProfileService as unknown as NutritionProfileService,
    lineService as unknown as LineService,
    foodLoggingService as unknown as FoodLoggingService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.updateOnboardingDraft.mockImplementation(
      (_id: string, data: Record<string, unknown>) =>
        Promise.resolve(baseUser({ ...data })),
    );
  });

  it('creates a new LINE user and starts onboarding on follow', async () => {
    usersService.findByLineUserId.mockResolvedValue(null);
    lineService.getUserProfile.mockResolvedValue({
      displayName: 'A',
      pictureUrl: 'http://img',
    });
    usersService.findOrCreateByLineUserId.mockResolvedValue({
      user: baseUser({ onboardingState: OnboardingState.NOT_STARTED }),
      created: true,
    });
    usersService.resetOnboardingDraft.mockResolvedValue(baseUser());
    usersService.setOnboardingState.mockResolvedValue(
      baseUser({ onboardingState: OnboardingState.WAITING_SEX }),
    );

    await service.handleFollow('U1', 'token');

    expect(usersService.findOrCreateByLineUserId).toHaveBeenCalledWith('U1', {
      displayName: 'A',
      pictureUrl: 'http://img',
    });
    expect(lineService.replyButtons).toHaveBeenCalledWith(
      'token',
      WELCOME_TEXT,
      expect.any(Array),
    );
  });

  it('reuses an existing completed user and shows main menu', async () => {
    usersService.findByLineUserId.mockResolvedValue(
      baseUser({ onboardingState: OnboardingState.COMPLETED }),
    );

    await service.handleFollow('U1', 'token');

    expect(usersService.findOrCreateByLineUserId).not.toHaveBeenCalled();
    expect(lineService.replyButtons).toHaveBeenCalled();
  });

  it('transitions through valid onboarding inputs', async () => {
    let user = baseUser({ onboardingState: OnboardingState.WAITING_SEX });

    usersService.updateOnboardingDraft.mockImplementation(
      (_id: string, data: Record<string, unknown>) => {
        user = baseUser({ ...user, ...data });
        return Promise.resolve(user);
      },
    );

    expect((await service.processOnboardingInput(user, 'ชาย')).kind).toBe(
      'text',
    );
    expect(usersService.updateOnboardingDraft).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining({
        draftSex: 'MALE',
        onboardingState: OnboardingState.WAITING_AGE,
      }),
    );

    user = baseUser({
      onboardingState: OnboardingState.WAITING_AGE,
      draftSex: 'MALE',
    });
    const ageResult = await service.processOnboardingInput(user, 'อายุ 29');
    expect(ageResult).toEqual({ kind: 'text', text: ASK_HEIGHT_TEXT });

    user = baseUser({
      onboardingState: OnboardingState.WAITING_HEIGHT,
      draftSex: 'MALE',
      draftAge: 29,
    });
    await service.processOnboardingInput(user, '181');

    user = baseUser({
      onboardingState: OnboardingState.WAITING_CURRENT_WEIGHT,
      draftSex: 'MALE',
      draftAge: 29,
      draftHeightCm: 181,
    });
    await service.processOnboardingInput(user, '84');

    user = baseUser({
      onboardingState: OnboardingState.WAITING_TARGET_WEIGHT,
      draftSex: 'MALE',
      draftAge: 29,
      draftHeightCm: 181,
      draftCurrentWeightKg: 84,
    });
    await service.processOnboardingInput(user, '74');

    user = baseUser({
      onboardingState: OnboardingState.WAITING_ACTIVITY,
      draftSex: 'MALE',
      draftAge: 29,
      draftHeightCm: 181,
      draftCurrentWeightKg: 84,
      draftTargetWeightKg: 74,
    });
    await service.processOnboardingInput(user, 'ปานกลาง');

    user = baseUser({
      onboardingState: OnboardingState.WAITING_GOAL,
      draftSex: 'MALE',
      draftAge: 29,
      draftHeightCm: 181,
      draftCurrentWeightKg: 84,
      draftTargetWeightKg: 74,
      draftActivityLevel: 'MODERATE',
    });
    usersService.updateOnboardingDraft.mockResolvedValue(
      baseUser({
        onboardingState: OnboardingState.WAITING_CONFIRMATION,
        draftSex: 'MALE',
        draftAge: 29,
        draftHeightCm: 181,
        draftCurrentWeightKg: 84,
        draftTargetWeightKg: 74,
        draftActivityLevel: 'MODERATE',
        draftGoal: 'LOSE_WEIGHT',
      }),
    );

    const confirmation = await service.processOnboardingInput(
      user,
      'ลดน้ำหนัก',
    );
    expect(confirmation.kind).toBe('buttons');
    if (confirmation.kind === 'buttons') {
      expect(confirmation.text).toContain('🎯 เป้าหมายของคุณ');
      const expected = calculateNutritionTargets({
        sex: 'MALE',
        age: 29,
        heightCm: 181,
        currentWeightKg: 84,
        targetWeightKg: 74,
        activityLevel: 'MODERATE',
        goal: 'LOSE_WEIGHT',
      });
      expect(confirmation.text).toContain(
        expected.dailyCalories.toLocaleString('en-US'),
      );
    }
  });

  it('rejects invalid age input', async () => {
    const user = baseUser({ onboardingState: OnboardingState.WAITING_AGE });
    const result = await service.processOnboardingInput(user, 'อายุ abc');
    expect(result).toEqual({ kind: 'text', text: INVALID_AGE_TEXT });
    expect(usersService.updateOnboardingDraft).not.toHaveBeenCalled();
  });

  it('saves profile on confirmation and shows main menu', async () => {
    const user = baseUser({
      onboardingState: OnboardingState.WAITING_CONFIRMATION,
      draftSex: 'MALE',
      draftAge: 29,
      draftHeightCm: 181,
      draftCurrentWeightKg: 84,
      draftTargetWeightKg: 74,
      draftActivityLevel: 'MODERATE',
      draftGoal: 'LOSE_WEIGHT',
    });

    nutritionProfileService.upsert.mockResolvedValue({});
    usersService.completeOnboarding.mockResolvedValue(
      baseUser({ onboardingState: OnboardingState.COMPLETED }),
    );

    const result = await service.processOnboardingInput(user, 'ยืนยัน');
    expect(nutritionProfileService.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        sex: 'MALE',
        age: 29,
        goal: 'LOSE_WEIGHT',
      }),
    );
    expect(usersService.completeOnboarding).toHaveBeenCalledWith('user-1');
    expect(result.kind).toBe('buttons');
    if (result.kind === 'buttons') {
      expect(result.text).toBe(COMPLETED_TEXT);
    }
  });

  it('restarts onboarding when user chooses แก้ไข', async () => {
    const user = baseUser({
      onboardingState: OnboardingState.WAITING_CONFIRMATION,
      draftSex: 'MALE',
      draftAge: 29,
      draftHeightCm: 181,
      draftCurrentWeightKg: 84,
      draftTargetWeightKg: 74,
      draftActivityLevel: 'MODERATE',
      draftGoal: 'LOSE_WEIGHT',
    });

    const result = await service.processOnboardingInput(user, 'แก้ไข');
    expect(usersService.resetOnboardingDraft).toHaveBeenCalledWith('user-1');
    expect(usersService.setOnboardingState).toHaveBeenCalledWith(
      'user-1',
      OnboardingState.WAITING_SEX,
    );
    expect(result).toEqual({
      kind: 'buttons',
      text: WELCOME_TEXT,
      buttons: SEX_CHOICES,
    });
  });

  it('routes completed user messages to food logging', async () => {
    usersService.findByLineUserId.mockResolvedValue(
      baseUser({ onboardingState: OnboardingState.COMPLETED }),
    );

    await service.handleTextMessage('U1', 'token', 'ข้าวกะเพรา');
    expect(foodLoggingService.handleCompletedText).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingState: OnboardingState.COMPLETED }),
      'token',
      'ข้าวกะเพรา',
    );
  });

  it('blocks image logging for non-completed users', async () => {
    usersService.findByLineUserId.mockResolvedValue(
      baseUser({ onboardingState: OnboardingState.WAITING_AGE }),
    );

    await service.handleImageMessage('U1', 'token', 'msg-1');
    expect(foodLoggingService.handleImage).not.toHaveBeenCalled();
    expect(lineService.replyButtons).toHaveBeenCalled();
  });

  it('asks age after valid sex', async () => {
    const user = baseUser({ onboardingState: OnboardingState.WAITING_SEX });
    const result = await service.processOnboardingInput(user, 'ชาย');
    expect(result).toEqual({ kind: 'text', text: ASK_AGE_TEXT });
  });
});
