import { Injectable, Logger } from '@nestjs/common';
import { OnboardingState, User } from '@prisma/client';
import {
  FOOD_COMMANDS,
  FoodLoggingService,
} from '../food/food-logging.service';
import { COMPLETE_PROFILE_FIRST_TEXT } from '../food/food.messages';
import { LineService } from '../line/line.service';
import { calculateNutritionTargets } from '../nutrition/nutrition-calculator';
import { NutritionProfileInput } from '../nutrition/nutrition.types';
import { NutritionProfileService } from '../users/nutrition-profile.service';
import { UsersService } from '../users/users.service';
import {
  ACTIVITY_CHOICES,
  ASK_ACTIVITY_TEXT,
  ASK_AGE_TEXT,
  ASK_CURRENT_WEIGHT_TEXT,
  ASK_GOAL_TEXT,
  ASK_HEIGHT_TEXT,
  ASK_TARGET_WEIGHT_TEXT,
  buildConfirmationText,
  COMPLETED_TEXT,
  CONFIRM_CHOICES,
  FEATURE_WIP_TEXT,
  GOAL_CHOICES,
  INCOMPLETE_MENU_CHOICES,
  INVALID_ACTIVITY_TEXT,
  INVALID_AGE_TEXT,
  INVALID_CONFIRM_TEXT,
  INVALID_CURRENT_WEIGHT_TEXT,
  INVALID_GOAL_TEXT,
  INVALID_HEIGHT_TEXT,
  INVALID_SEX_TEXT,
  INVALID_TARGET_WEIGHT_TEXT,
  MAIN_MENU_CHOICES,
  SEX_CHOICES,
  WELCOME_BACK_TEXT,
  WELCOME_TEXT,
} from './onboarding.messages';
import {
  parseActivityLevel,
  parseAge,
  parseGoal,
  parseHeightCm,
  parseSex,
  parseWeightKg,
} from './onboarding.parser';

export type OutboundMessage =
  | { kind: 'text'; text: string }
  | {
      kind: 'buttons';
      text: string;
      buttons: { label: string; text: string }[];
    };

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly nutritionProfileService: NutritionProfileService,
    private readonly lineService: LineService,
    private readonly foodLoggingService: FoodLoggingService,
  ) {}

  async handleFollow(lineUserId: string, replyToken: string): Promise<void> {
    const existing = await this.usersService.findByLineUserId(lineUserId);
    let user = existing;
    let created = false;

    if (!user) {
      const profile = await this.lineService.getUserProfile(lineUserId);
      const result = await this.usersService.findOrCreateByLineUserId(
        lineUserId,
        profile,
      );
      user = result.user;
      created = result.created;
    }

    this.logger.log(
      `Follow handled created=${created} onboardingState=${user.onboardingState} userIdPrefix=${user.id.slice(0, 8)}`,
    );

    if (created || user.onboardingState === OnboardingState.NOT_STARTED) {
      await this.startOnboarding(user.id, replyToken);
      return;
    }

    if (user.onboardingState === OnboardingState.COMPLETED) {
      await this.sendMainMenu(replyToken, WELCOME_BACK_TEXT);
      return;
    }

    await this.promptForState(user, replyToken);
  }

  async handleTextMessage(
    lineUserId: string,
    replyToken: string,
    text: string,
  ): Promise<void> {
    let user = await this.usersService.findByLineUserId(lineUserId);
    if (!user) {
      const profile = await this.lineService.getUserProfile(lineUserId);
      const result = await this.usersService.findOrCreateByLineUserId(
        lineUserId,
        profile,
      );
      user = result.user;
    }

    if (user.onboardingState === OnboardingState.COMPLETED) {
      await this.handleCompletedUserMessage(replyToken, text, user);
      return;
    }

    if (user.onboardingState === OnboardingState.NOT_STARTED) {
      await this.startOnboarding(user.id, replyToken);
      return;
    }

    const outbound = await this.processOnboardingInput(user, text.trim());
    await this.dispatch(replyToken, outbound);
  }

  async handleImageMessage(
    lineUserId: string,
    replyToken: string,
    messageId: string,
  ): Promise<void> {
    let user = await this.usersService.findByLineUserId(lineUserId);
    if (!user) {
      const profile = await this.lineService.getUserProfile(lineUserId);
      const result = await this.usersService.findOrCreateByLineUserId(
        lineUserId,
        profile,
      );
      user = result.user;
    }

    if (user.onboardingState !== OnboardingState.COMPLETED) {
      await this.lineService.replyButtons(
        replyToken,
        COMPLETE_PROFILE_FIRST_TEXT,
        INCOMPLETE_MENU_CHOICES,
      );
      return;
    }

    await this.foodLoggingService.handleImage(user, replyToken, messageId);
  }

  async startOnboarding(userId: string, replyToken: string): Promise<void> {
    await this.usersService.resetOnboardingDraft(userId);
    await this.usersService.setOnboardingState(
      userId,
      OnboardingState.WAITING_SEX,
    );
    await this.lineService.replyButtons(replyToken, WELCOME_TEXT, SEX_CHOICES);
  }

  /**
   * Pure-ish state transition used by unit tests (no LINE I/O).
   */
  async processOnboardingInput(
    user: User,
    text: string,
  ): Promise<OutboundMessage> {
    switch (user.onboardingState) {
      case OnboardingState.WAITING_SEX:
        return this.handleSex(user, text);
      case OnboardingState.WAITING_AGE:
        return this.handleAge(user, text);
      case OnboardingState.WAITING_HEIGHT:
        return this.handleHeight(user, text);
      case OnboardingState.WAITING_CURRENT_WEIGHT:
        return this.handleCurrentWeight(user, text);
      case OnboardingState.WAITING_TARGET_WEIGHT:
        return this.handleTargetWeight(user, text);
      case OnboardingState.WAITING_ACTIVITY:
        return this.handleActivity(user, text);
      case OnboardingState.WAITING_GOAL:
        return this.handleGoal(user, text);
      case OnboardingState.WAITING_CONFIRMATION:
        return this.handleConfirmation(user, text);
      default:
        this.logger.warn(
          `Unexpected onboarding state: ${user.onboardingState}`,
        );
        return { kind: 'text', text: FEATURE_WIP_TEXT };
    }
  }

  private async handleSex(user: User, text: string): Promise<OutboundMessage> {
    const sex = parseSex(text);
    if (!sex) {
      return { kind: 'buttons', text: INVALID_SEX_TEXT, buttons: SEX_CHOICES };
    }

    await this.usersService.updateOnboardingDraft(user.id, {
      draftSex: sex,
      onboardingState: OnboardingState.WAITING_AGE,
    });
    return { kind: 'text', text: ASK_AGE_TEXT };
  }

  private async handleAge(user: User, text: string): Promise<OutboundMessage> {
    const age = parseAge(text);
    if (age === null) {
      return { kind: 'text', text: INVALID_AGE_TEXT };
    }

    await this.usersService.updateOnboardingDraft(user.id, {
      draftAge: age,
      onboardingState: OnboardingState.WAITING_HEIGHT,
    });
    return { kind: 'text', text: ASK_HEIGHT_TEXT };
  }

  private async handleHeight(
    user: User,
    text: string,
  ): Promise<OutboundMessage> {
    const heightCm = parseHeightCm(text);
    if (heightCm === null) {
      return { kind: 'text', text: INVALID_HEIGHT_TEXT };
    }

    await this.usersService.updateOnboardingDraft(user.id, {
      draftHeightCm: heightCm,
      onboardingState: OnboardingState.WAITING_CURRENT_WEIGHT,
    });
    return { kind: 'text', text: ASK_CURRENT_WEIGHT_TEXT };
  }

  private async handleCurrentWeight(
    user: User,
    text: string,
  ): Promise<OutboundMessage> {
    const currentWeightKg = parseWeightKg(text);
    if (currentWeightKg === null) {
      return { kind: 'text', text: INVALID_CURRENT_WEIGHT_TEXT };
    }

    await this.usersService.updateOnboardingDraft(user.id, {
      draftCurrentWeightKg: currentWeightKg,
      onboardingState: OnboardingState.WAITING_TARGET_WEIGHT,
    });
    return { kind: 'text', text: ASK_TARGET_WEIGHT_TEXT };
  }

  private async handleTargetWeight(
    user: User,
    text: string,
  ): Promise<OutboundMessage> {
    const targetWeightKg = parseWeightKg(text);
    if (targetWeightKg === null) {
      return { kind: 'text', text: INVALID_TARGET_WEIGHT_TEXT };
    }

    await this.usersService.updateOnboardingDraft(user.id, {
      draftTargetWeightKg: targetWeightKg,
      onboardingState: OnboardingState.WAITING_ACTIVITY,
    });
    return {
      kind: 'buttons',
      text: ASK_ACTIVITY_TEXT,
      buttons: ACTIVITY_CHOICES,
    };
  }

  private async handleActivity(
    user: User,
    text: string,
  ): Promise<OutboundMessage> {
    const activityLevel = parseActivityLevel(text);
    if (!activityLevel) {
      return {
        kind: 'buttons',
        text: INVALID_ACTIVITY_TEXT,
        buttons: ACTIVITY_CHOICES,
      };
    }

    await this.usersService.updateOnboardingDraft(user.id, {
      draftActivityLevel: activityLevel,
      onboardingState: OnboardingState.WAITING_GOAL,
    });
    return { kind: 'buttons', text: ASK_GOAL_TEXT, buttons: GOAL_CHOICES };
  }

  private async handleGoal(user: User, text: string): Promise<OutboundMessage> {
    const goal = parseGoal(text);
    if (!goal) {
      return {
        kind: 'buttons',
        text: INVALID_GOAL_TEXT,
        buttons: GOAL_CHOICES,
      };
    }

    const refreshed = await this.usersService.updateOnboardingDraft(user.id, {
      draftGoal: goal,
      onboardingState: OnboardingState.WAITING_CONFIRMATION,
    });

    const input = this.requireDraftInput(refreshed);
    const targets = calculateNutritionTargets(input);

    return {
      kind: 'buttons',
      text: buildConfirmationText({
        currentWeightKg: input.currentWeightKg,
        targetWeightKg: input.targetWeightKg,
        goal: input.goal,
        targets,
      }),
      buttons: CONFIRM_CHOICES,
    };
  }

  private async handleConfirmation(
    user: User,
    text: string,
  ): Promise<OutboundMessage> {
    const normalized = text.trim();

    if (normalized === 'แก้ไข') {
      await this.usersService.resetOnboardingDraft(user.id);
      await this.usersService.setOnboardingState(
        user.id,
        OnboardingState.WAITING_SEX,
      );
      return { kind: 'buttons', text: WELCOME_TEXT, buttons: SEX_CHOICES };
    }

    if (normalized !== 'ยืนยัน') {
      return {
        kind: 'buttons',
        text: INVALID_CONFIRM_TEXT,
        buttons: CONFIRM_CHOICES,
      };
    }

    const input = this.requireDraftInput(user);
    await this.nutritionProfileService.upsert(user.id, input);
    await this.usersService.completeOnboarding(user.id);

    return {
      kind: 'buttons',
      text: COMPLETED_TEXT,
      buttons: MAIN_MENU_CHOICES,
    };
  }

  private async handleCompletedUserMessage(
    replyToken: string,
    text: string,
    user: User,
  ): Promise<void> {
    if ((FOOD_COMMANDS.START as readonly string[]).includes(text.trim())) {
      await this.startOnboarding(user.id, replyToken);
      return;
    }

    await this.foodLoggingService.handleCompletedText(user, replyToken, text);
  }

  private async sendMainMenu(
    replyToken: string,
    preface?: string,
  ): Promise<void> {
    const text = preface
      ? `${preface}\n\nเลือกเมนูได้เลยครับ`
      : 'เลือกเมนูได้เลยครับ';
    await this.lineService.replyButtons(replyToken, text, MAIN_MENU_CHOICES);
  }

  private async promptForState(user: User, replyToken: string): Promise<void> {
    switch (user.onboardingState) {
      case OnboardingState.WAITING_SEX:
        await this.lineService.replyButtons(
          replyToken,
          WELCOME_TEXT,
          SEX_CHOICES,
        );
        break;
      case OnboardingState.WAITING_AGE:
        await this.lineService.replyText(replyToken, ASK_AGE_TEXT);
        break;
      case OnboardingState.WAITING_HEIGHT:
        await this.lineService.replyText(replyToken, ASK_HEIGHT_TEXT);
        break;
      case OnboardingState.WAITING_CURRENT_WEIGHT:
        await this.lineService.replyText(replyToken, ASK_CURRENT_WEIGHT_TEXT);
        break;
      case OnboardingState.WAITING_TARGET_WEIGHT:
        await this.lineService.replyText(replyToken, ASK_TARGET_WEIGHT_TEXT);
        break;
      case OnboardingState.WAITING_ACTIVITY:
        await this.lineService.replyButtons(
          replyToken,
          ASK_ACTIVITY_TEXT,
          ACTIVITY_CHOICES,
        );
        break;
      case OnboardingState.WAITING_GOAL:
        await this.lineService.replyButtons(
          replyToken,
          ASK_GOAL_TEXT,
          GOAL_CHOICES,
        );
        break;
      case OnboardingState.WAITING_CONFIRMATION: {
        try {
          const input = this.requireDraftInput(user);
          const targets = calculateNutritionTargets(input);
          await this.lineService.replyButtons(
            replyToken,
            buildConfirmationText({
              currentWeightKg: input.currentWeightKg,
              targetWeightKg: input.targetWeightKg,
              goal: input.goal,
              targets,
            }),
            CONFIRM_CHOICES,
          );
        } catch {
          await this.startOnboarding(user.id, replyToken);
        }
        break;
      }
      default:
        await this.startOnboarding(user.id, replyToken);
    }
  }

  private requireDraftInput(user: User): NutritionProfileInput {
    if (
      !user.draftSex ||
      user.draftAge == null ||
      user.draftHeightCm == null ||
      user.draftCurrentWeightKg == null ||
      user.draftTargetWeightKg == null ||
      !user.draftActivityLevel ||
      !user.draftGoal
    ) {
      throw new Error('Incomplete onboarding draft');
    }

    return {
      sex: user.draftSex,
      age: user.draftAge,
      heightCm: user.draftHeightCm,
      currentWeightKg: user.draftCurrentWeightKg,
      targetWeightKg: user.draftTargetWeightKg,
      activityLevel: user.draftActivityLevel,
      goal: user.draftGoal,
    };
  }

  private async dispatch(
    replyToken: string,
    outbound: OutboundMessage,
  ): Promise<void> {
    if (outbound.kind === 'text') {
      await this.lineService.replyText(replyToken, outbound.text);
      return;
    }
    await this.lineService.replyButtons(
      replyToken,
      outbound.text,
      outbound.buttons,
    );
  }
}
