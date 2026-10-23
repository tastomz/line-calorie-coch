import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HTTPFetchError,
  messagingApi,
  validateSignature as lineValidateSignature,
} from '@line/bot-sdk';
import { LineOutboundError } from './line-outbound.error';
import { lineReplyCapture } from './line-reply-capture';
import { LineButtonItem, LineQuickReplyItem } from './line.types';
import {
  buildRichMenu,
  RICH_MENU_ALIAS,
  RICH_MENU_NAME_PREFIX,
  RichMenuTab,
} from './rich-menu';

@Injectable()
export class LineService implements OnModuleInit {
  private readonly logger = new Logger(LineService.name);
  private readonly channelSecret: string;
  private readonly hasAccessToken: boolean;
  private readonly accessToken: string;
  private readonly client: messagingApi.MessagingApiClient | null;
  private readonly blobClient: messagingApi.MessagingApiBlobClient | null;

  constructor(private readonly configService: ConfigService) {
    this.channelSecret =
      this.configService.get<string>('LINE_CHANNEL_SECRET') ?? '';
    this.accessToken =
      this.configService.get<string>('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
    this.hasAccessToken = this.accessToken.length > 0;

    this.client = this.hasAccessToken
      ? new messagingApi.MessagingApiClient({
          channelAccessToken: this.accessToken,
        })
      : null;
    this.blobClient = this.hasAccessToken
      ? new messagingApi.MessagingApiBlobClient({
          channelAccessToken: this.accessToken,
        })
      : null;
  }

  onModuleInit(): void {
    this.logger.log(
      `LINE config: secretConfigured=${Boolean(this.channelSecret)} accessTokenConfigured=${this.hasAccessToken} messagingClient=${this.client ? 'ready' : 'disabled'}`,
    );
    if (!this.hasAccessToken) {
      this.logger.error(
        'LINE_CHANNEL_ACCESS_TOKEN is missing — webhook verify may work, but the bot cannot reply to users',
      );
    }
  }

  isMessagingClientReady(): boolean {
    return this.client !== null;
  }

  verifySignature(rawBody: Buffer | string, signature?: string): boolean {
    if (!this.channelSecret) {
      this.logger.error('LINE_CHANNEL_SECRET is not configured');
      return false;
    }
    if (!signature) {
      this.logger.warn('Missing x-line-signature header');
      return false;
    }

    const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      this.logger.warn('LINE signature check received empty body');
      return false;
    }

    try {
      // HMAC-SHA256(channelSecret, rawBody) → Base64, compared to x-line-signature
      return lineValidateSignature(body, this.channelSecret, signature);
    } catch (error) {
      this.logger.warn(
        `Signature validation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }

  async getUserProfile(lineUserId: string): Promise<{
    displayName?: string;
    pictureUrl?: string;
  }> {
    if (!this.client) {
      this.logger.warn(
        'LINE client not configured; skipping profile fetch (access token missing)',
      );
      return {};
    }

    try {
      const profile = await this.client.getProfile(lineUserId);
      return {
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch LINE profile status=${this.extractHttpStatus(error)}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {};
    }
  }

  /**
   * Full-resolution image — needed to read printed nutrition labels and
   * small on-screen digits (LINE's preview image is ~8KB, too small for
   * either).
   */
  async getMessageContentBytes(messageId: string): Promise<Buffer> {
    if (!this.blobClient) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
    }

    try {
      const stream = await this.blobClient.getMessageContent(messageId);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(
          Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk),
        );
      }
      const bytes = Buffer.concat(chunks);
      this.logger.log(
        `Fetched LINE message content messageIdPrefix=${messageId.slice(0, 8)} bytes=${bytes.length}`,
      );
      return bytes;
    } catch (error) {
      this.logger.error(
        `LINE getMessageContent failed status=${this.extractHttpStatus(error)}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Show LINE's "typing…" indicator in a 1:1 chat while the bot works.
   * Free (not a message, no quota). Best-effort: never throws, never blocks.
   * It disappears automatically when the bot replies.
   */
  async showLoadingAnimation(
    chatId: string,
    loadingSeconds: number,
  ): Promise<void> {
    if (!this.client || !chatId) return;
    const seconds = Math.min(
      60,
      Math.max(5, Math.round(loadingSeconds / 5) * 5),
    );
    try {
      await this.client.showLoadingAnimation({
        chatId,
        loadingSeconds: seconds,
      });
    } catch (error) {
      this.logger.warn(
        `LINE showLoadingAnimation failed status=${this.extractHttpStatus(error)}`,
      );
    }
  }

  /**
   * Create the tabbed rich menu (โค้ช / แอดมิน) via the Messaging API, upload
   * both images, point the aliases at them and make โค้ช the default. Old menus
   * from earlier runs are removed afterwards. Overrides the OA Manager menu.
   */
  async setupTabbedRichMenu(params: {
    liffId: string | null;
    images: Record<RichMenuTab, Buffer>;
  }): Promise<Record<RichMenuTab, string>> {
    if (!this.client || !this.blobClient) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
    }
    const client = this.client;
    const before = await client.getRichMenuList();
    const ids = {} as Record<RichMenuTab, string>;
    for (const tab of ['coach', 'admin'] as RichMenuTab[]) {
      const { richMenuId } = await client.createRichMenu(
        buildRichMenu(tab, params.liffId),
      );
      await this.blobClient.setRichMenuImage(
        richMenuId,
        new Blob([new Uint8Array(params.images[tab])], { type: 'image/jpeg' }),
      );
      ids[tab] = richMenuId;
    }
    const aliases = await client.getRichMenuAliasList();
    const existing = new Set(
      (aliases.aliases ?? []).map((a) => a.richMenuAliasId),
    );
    for (const tab of ['coach', 'admin'] as RichMenuTab[]) {
      const richMenuAliasId = RICH_MENU_ALIAS[tab];
      if (existing.has(richMenuAliasId)) {
        await client.updateRichMenuAlias(richMenuAliasId, {
          richMenuId: ids[tab],
        });
      } else {
        await client.createRichMenuAlias({
          richMenuAliasId,
          richMenuId: ids[tab],
        });
      }
    }
    await client.setDefaultRichMenu(ids.coach);
    for (const menu of before.richmenus ?? []) {
      if (menu.name?.startsWith(RICH_MENU_NAME_PREFIX)) {
        try {
          await client.deleteRichMenu(menu.richMenuId);
        } catch {
          // A stale menu left behind is harmless.
        }
      }
    }
    this.logger.log(
      `Tabbed rich menu installed coach=${ids.coach} admin=${ids.admin}`,
    );
    return ids;
  }

  /**
   * Keep a user's menu in sync with handoff state when it changed by typing
   * (tab taps already switch on the device). Best-effort, never throws.
   */
  async showRichMenuTab(lineUserId: string, tab: RichMenuTab): Promise<void> {
    if (!this.client || !lineUserId) return;
    try {
      if (tab === 'coach') {
        await this.client.unlinkRichMenuIdFromUser(lineUserId);
        return;
      }
      const alias = await this.client.getRichMenuAlias(RICH_MENU_ALIAS.admin);
      await this.client.linkRichMenuIdToUser(lineUserId, alias.richMenuId);
    } catch (error) {
      this.logger.warn(
        `LINE rich menu sync failed tab=${tab} status=${this.extractHttpStatus(error)}`,
      );
    }
  }

  async replyText(replyToken: string, text: string): Promise<void> {
    await this.replyMessages(replyToken, [
      { type: 'text', text } satisfies messagingApi.TextMessage,
    ]);
  }

  /**
   * Prefer replyToken; if expired/invalid, fall back to push (no duplicate mutation).
   * Callers must pass lineUserId from the verified webhook event.
   */
  async replyTextOrPush(
    replyToken: string,
    lineUserId: string,
    text: string,
  ): Promise<void> {
    try {
      await this.replyText(replyToken, text);
    } catch (error) {
      if (!(error instanceof LineOutboundError)) {
        throw error;
      }
      this.logger.warn(
        'LINE reply failed; attempting pushMessage fallback (mutation already durable if any)',
      );
      await this.pushText(lineUserId, text);
    }
  }

  async pushText(lineUserId: string, text: string): Promise<void> {
    const capture = lineReplyCapture.getStore();
    if (capture) {
      capture.replies.push({ text });
      return;
    }

    if (!this.client) {
      throw new LineOutboundError(
        'LINE_CHANNEL_ACCESS_TOKEN is not configured',
      );
    }
    if (!lineUserId) {
      throw new LineOutboundError('Missing LINE userId for push');
    }

    try {
      this.logger.log('Calling LINE pushMessage messages=1');
      await this.client.pushMessage({
        to: lineUserId,
        messages: [{ type: 'text', text } satisfies messagingApi.TextMessage],
      });
      this.logger.log('LINE pushMessage succeeded');
    } catch (error) {
      this.logger.error(
        `LINE pushMessage failed status=${this.extractHttpStatus(error)}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new LineOutboundError('LINE pushMessage failed', error);
    }
  }

  async replyQuickActions(
    replyToken: string,
    text: string,
    items: LineQuickReplyItem[],
  ): Promise<void> {
    const message: messagingApi.TextMessage = {
      type: 'text',
      text,
      quickReply: {
        items: items.map((item) => ({
          type: 'action',
          action: {
            type: 'message',
            label: item.label.slice(0, 20),
            text: item.text,
          },
        })),
      },
    };

    await this.replyMessages(replyToken, [message]);
  }

  async replyButtons(
    replyToken: string,
    text: string,
    buttons: LineButtonItem[],
  ): Promise<void> {
    // Prefer quick replies for V1 button-style choices (same UX as prompt examples).
    await this.replyQuickActions(replyToken, text, buttons);
  }

  /** Send a LINE Flex message (altText used for capture / accessibility). */
  async replyFlex(
    replyToken: string,
    flex: { type: 'flex'; altText: string; contents: unknown },
  ): Promise<void> {
    await this.replyMessages(replyToken, [
      flex as unknown as messagingApi.Message,
    ]);
  }

  async replyFlexOrPush(
    replyToken: string,
    lineUserId: string,
    flex: { type: 'flex'; altText: string; contents: unknown },
  ): Promise<void> {
    try {
      await this.replyFlex(replyToken, flex);
    } catch (error) {
      if (!(error instanceof LineOutboundError)) {
        throw error;
      }
      this.logger.warn('LINE replyFlex failed; pushing altText');
      await this.pushText(lineUserId, flex.altText);
    }
  }

  /**
   * Buttons via reply, or plain text push if replyToken is expired.
   * Quick-reply items are dropped on push fallback (LINE push limitation for this V1 path).
   */
  async replyButtonsOrPush(
    replyToken: string,
    lineUserId: string,
    text: string,
    buttons: LineButtonItem[],
  ): Promise<void> {
    try {
      await this.replyButtons(replyToken, text, buttons);
    } catch (error) {
      if (!(error instanceof LineOutboundError)) {
        throw error;
      }
      this.logger.warn(
        'LINE replyButtons failed; pushing text without quick replies',
      );
      await this.pushText(lineUserId, text);
    }
  }

  private async replyMessages(
    replyToken: string,
    messages: messagingApi.Message[],
  ): Promise<void> {
    const capture = lineReplyCapture.getStore();
    if (capture) {
      for (const message of messages) {
        if (message.type === 'text') {
          const textMsg = message;
          const buttons =
            textMsg.quickReply?.items
              ?.map((item) => {
                const action = item.action as
                  { type?: string; label?: string; text?: string } | undefined;
                if (action?.type === 'message' && action.label && action.text) {
                  return { label: action.label, text: action.text };
                }
                return null;
              })
              .filter(
                (b): b is { label: string; text: string } => b !== null,
              ) ?? undefined;
          capture.replies.push({
            text: textMsg.text ?? '',
            buttons: buttons && buttons.length > 0 ? buttons : undefined,
          });
        } else if (message.type === 'flex') {
          const flexMsg = message;
          capture.replies.push({
            text: flexMsg.altText ?? '[flex]',
          });
        } else {
          capture.replies.push({
            text: `[unsupported message type: ${message.type}]`,
          });
        }
      }
      return;
    }

    if (!this.client) {
      // Do not silently succeed — otherwise LineEvent idempotency claims the
      // event and LINE will not deliver a visible reply.
      this.logger.error(
        'Cannot reply: LINE Messaging client is disabled (LINE_CHANNEL_ACCESS_TOKEN missing)',
      );
      throw new LineOutboundError(
        'LINE_CHANNEL_ACCESS_TOKEN is not configured',
      );
    }

    if (!replyToken) {
      throw new LineOutboundError('Missing LINE replyToken');
    }

    try {
      this.logger.log(
        `Calling LINE replyMessage messages=${messages.length} replyTokenPresent=true`,
      );
      await this.client.replyMessage({
        replyToken,
        messages,
      });
      this.logger.log('LINE replyMessage succeeded');
    } catch (error) {
      this.logger.error(
        `LINE replyMessage failed status=${this.extractHttpStatus(error)}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new LineOutboundError('LINE replyMessage failed', error);
    }
  }

  private extractHttpStatus(error: unknown): string {
    if (error instanceof HTTPFetchError) {
      return String(error.status);
    }
    if (typeof error === 'object' && error !== null && 'status' in error) {
      const status = (error as { status?: unknown }).status;
      if (typeof status === 'number' || typeof status === 'string') {
        return String(status);
      }
    }
    return 'n/a';
  }
}
