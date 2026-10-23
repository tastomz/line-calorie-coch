import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  MembershipSessionGuard,
  MembershipUserId,
} from '../membership/membership-session.guard';
import { membershipRateLimiter } from '../membership/membership-rate-limiter';
import { HistoryService } from './history.service';

@Controller('api/membership')
export class HistoryApiController {
  constructor(private readonly history: HistoryService) {}

  /** Last 7 days + weight progress for the history page. */
  @Get('history')
  @UseGuards(MembershipSessionGuard)
  getHistory(@MembershipUserId() userId: string) {
    return this.history.getHistory(userId, 7);
  }

  @Post('weight')
  @UseGuards(MembershipSessionGuard)
  async logWeight(
    @MembershipUserId() userId: string,
    @Body() body: { weightKg?: unknown },
  ) {
    const log = await this.history.logWeight(userId, body?.weightKg);
    return { ok: true, weightKg: log.weightKg, recordedAt: log.recordedAt };
  }

  /** Destructive: wipes health data and restarts onboarding. */
  @Post('reset-goal')
  @UseGuards(MembershipSessionGuard)
  async resetGoal(
    @MembershipUserId() userId: string,
    @Body() body: { confirm?: unknown },
  ) {
    if (!membershipRateLimiter.tryConsume(userId, 'reset_goal')) {
      throw new HttpException(
        'Too many attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.history.resetGoal(userId, body?.confirm);
    return { ok: true };
  }
}
