import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { captureLineReplies } from '../line/line-reply-capture';
import { OnboardingService } from '../onboarding/onboarding.service';
import {
  MEMBERSHIP_SESSION_COOKIE,
  MembershipAuthService,
} from '../membership/membership-auth.service';
import { UsersService } from '../users/users.service';
import { DEV_TEST_IDENTITIES, DevIdentityKey } from './dev-identities';

@Injectable()
export class DevChatService {
  constructor(
    private readonly users: UsersService,
    private readonly onboarding: OnboardingService,
    private readonly auth: MembershipAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async ensureIdentity(identityKey: DevIdentityKey) {
    const identity = DEV_TEST_IDENTITIES[identityKey];
    if (!identity) {
      throw new Error('invalid identity');
    }
    const { user } = await this.users.findOrCreateByLineUserId(
      identity.lineUserId,
      { displayName: identity.displayName },
    );
    if (identityKey === 'ADMIN' && user.role !== UserRole.ADMIN) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { role: UserRole.ADMIN },
      });
    }
    return {
      userId: user.id,
      lineUserId: identity.lineUserId,
      displayName: identity.displayName,
      sessionToken: this.auth.signSession(user.id),
    };
  }

  /**
   * Simulate a LINE text message for the given test identity.
   * Captures bot replies without calling the LINE Messaging API.
   */
  async sendText(identityKey: DevIdentityKey, text: string) {
    const identity = DEV_TEST_IDENTITIES[identityKey];
    if (!identity) {
      throw new Error('invalid identity');
    }
    await this.users.findOrCreateByLineUserId(identity.lineUserId, {
      displayName: identity.displayName,
    });

    const replyToken = `dev-reply-${Date.now()}`;
    const { replies } = await captureLineReplies(async () => {
      await this.onboarding.handleTextMessage(
        identity.lineUserId,
        replyToken,
        text.trim(),
      );
    });

    return {
      identity: identityKey,
      lineUserId: identity.lineUserId,
      userText: text.trim(),
      replies,
    };
  }

  /**
   * Simulate LINE follow (start / welcome).
   */
  async follow(identityKey: DevIdentityKey) {
    const identity = DEV_TEST_IDENTITIES[identityKey];
    if (!identity) {
      throw new Error('invalid identity');
    }
    const replyToken = `dev-follow-${Date.now()}`;
    const { replies } = await captureLineReplies(async () => {
      await this.onboarding.handleFollow(identity.lineUserId, replyToken);
    });
    return { identity: identityKey, replies };
  }

  cookieName() {
    return MEMBERSHIP_SESSION_COOKIE;
  }
}
