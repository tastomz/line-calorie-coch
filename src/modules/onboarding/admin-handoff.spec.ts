import { OnboardingState } from '@prisma/client';
import { FoodLoggingService } from '../food/food-logging.service';
import { LineService } from '../line/line.service';
import { NutritionProfileService } from '../users/nutrition-profile.service';
import { UsersService } from '../users/users.service';
import {
  ADMIN_CHAT_ENDED_TEXT,
  ADMIN_CHAT_STARTED_TEXT,
  isAdminChatEnter,
  isAdminChatExit,
  isMenuCommand,
} from './admin-handoff';
import { OnboardingService } from './onboarding.service';

describe('admin handoff keywords', () => {
  it.each(['คุยกับแอดมิน', ' คุยกับ แอดมิน ', 'ติดต่อแอดมิน', 'Admin'])(
    'enters on %j',
    (t) => expect(isAdminChatEnter(t)).toBe(true),
  );
  it.each(['คุยกับบอท', 'กลับไปคุยกับบอท', 'BOT'])('exits on %j', (t) =>
    expect(isAdminChatExit(t)).toBe(true),
  );
  it('does not treat food text as a keyword', () => {
    expect(isAdminChatEnter('ข้าวมันไก่ แอดมินว่าไง')).toBe(false);
    expect(isAdminChatExit('ข้าวผัด')).toBe(false);
  });
  it('recognises rich-menu commands', () => {
    expect(isMenuCommand('วันนี้')).toBe(true);
    expect(isMenuCommand('สมาชิก')).toBe(true);
    expect(isMenuCommand('หมูพริกไทยดำ')).toBe(false);
  });
});

describe('OnboardingService admin handoff', () => {
  const baseUser = {
    id: 'user-12345678',
    lineUserId: 'U1',
    onboardingState: OnboardingState.COMPLETED,
    adminChatSince: null as Date | null,
  };
  const usersService = {
    findByLineUserId: jest.fn(),
    setAdminChat: jest.fn(),
  };
  const lineService = {
    replyText: jest.fn(),
    replyButtons: jest.fn(),
    showRichMenuTab: jest.fn(),
  };
  const foodLoggingService = {
    handleCompletedText: jest.fn(),
    handleImage: jest.fn(),
  };
  const service = new OnboardingService(
    usersService as unknown as UsersService,
    {} as NutritionProfileService,
    lineService as unknown as LineService,
    foodLoggingService as unknown as FoodLoggingService,
  );
  const handleCompleted = jest
    .spyOn(
      service as unknown as { handleCompletedUserMessage: () => Promise<void> },
      'handleCompletedUserMessage',
    )
    .mockResolvedValue(undefined);

  beforeEach(() => jest.clearAllMocks());

  it('"คุยกับแอดมิน" turns handoff on and tells the user how to come back', async () => {
    usersService.findByLineUserId.mockResolvedValue({ ...baseUser });
    await service.handleTextMessage('U1', 'tok', 'คุยกับแอดมิน');
    expect(usersService.setAdminChat).toHaveBeenCalledWith(
      'user-12345678',
      expect.any(Date),
    );
    expect(lineService.replyButtons).toHaveBeenCalledWith(
      'tok',
      ADMIN_CHAT_STARTED_TEXT,
      [{ label: 'คุยกับบอท', text: 'คุยกับบอท' }],
    );
    expect(handleCompleted).not.toHaveBeenCalled();
  });

  it('stays quiet on free text and photos while an admin handles the chat', async () => {
    usersService.findByLineUserId.mockResolvedValue({
      ...baseUser,
      adminChatSince: new Date(),
    });
    await service.handleTextMessage('U1', 'tok', 'สมัคร pro ยังไงครับ');
    await service.handleImageMessage('U1', 'tok', 'img-1');
    expect(lineService.replyText).not.toHaveBeenCalled();
    expect(lineService.replyButtons).not.toHaveBeenCalled();
    expect(handleCompleted).not.toHaveBeenCalled();
    expect(foodLoggingService.handleImage).not.toHaveBeenCalled();
  });

  it('still answers rich-menu commands during handoff', async () => {
    usersService.findByLineUserId.mockResolvedValue({
      ...baseUser,
      adminChatSince: new Date(),
    });
    await service.handleTextMessage('U1', 'tok', 'วันนี้');
    expect(handleCompleted).toHaveBeenCalledTimes(1);
  });

  it('"คุยกับบอท" hands back to the bot', async () => {
    usersService.findByLineUserId.mockResolvedValue({
      ...baseUser,
      adminChatSince: new Date(),
    });
    await service.handleTextMessage('U1', 'tok', 'คุยกับบอท');
    expect(usersService.setAdminChat).toHaveBeenCalledWith(
      'user-12345678',
      null,
    );
    expect(lineService.replyText).toHaveBeenCalledWith(
      'tok',
      ADMIN_CHAT_ENDED_TEXT,
    );
  });

  it('isAdminChatActive reflects the stored flag', async () => {
    usersService.findByLineUserId.mockResolvedValueOnce({
      ...baseUser,
      adminChatSince: new Date(),
    });
    await expect(service.isAdminChatActive('U1')).resolves.toBe(true);
    usersService.findByLineUserId.mockResolvedValueOnce({ ...baseUser });
    await expect(service.isAdminChatActive('U1')).resolves.toBe(false);
  });

  it('typing a keyword also switches the rich menu tab', async () => {
    usersService.findByLineUserId.mockResolvedValue({ ...baseUser });
    await service.handleTextMessage('U1', 'tok', 'คุยกับแอดมิน');
    expect(lineService.showRichMenuTab).toHaveBeenCalledWith('U1', 'admin');
  });

  it('tapping the แอดมิน tab starts handoff with a short reply, once', async () => {
    usersService.findByLineUserId.mockResolvedValueOnce({ ...baseUser });
    await service.handleTextMessage('U1', 'tok', 'richmenu:admin');
    expect(usersService.setAdminChat).toHaveBeenCalledWith(
      'user-12345678',
      expect.any(Date),
    );
    expect(lineService.replyText).toHaveBeenCalledTimes(1);

    usersService.findByLineUserId.mockResolvedValueOnce({
      ...baseUser,
      adminChatSince: new Date(),
    });
    await service.handleTextMessage('U1', 'tok2', 'richmenu:admin');
    expect(lineService.replyText).toHaveBeenCalledTimes(1);
    expect(handleCompleted).not.toHaveBeenCalled();
  });

  it('tapping the โค้ช tab ends handoff; silent when already with the bot', async () => {
    usersService.findByLineUserId.mockResolvedValueOnce({
      ...baseUser,
      adminChatSince: new Date(),
    });
    await service.handleTextMessage('U1', 'tok', 'richmenu:coach');
    expect(usersService.setAdminChat).toHaveBeenCalledWith(
      'user-12345678',
      null,
    );
    expect(lineService.replyText).toHaveBeenCalledWith(
      'tok',
      ADMIN_CHAT_ENDED_TEXT,
    );

    usersService.findByLineUserId.mockResolvedValueOnce({ ...baseUser });
    await service.handleTextMessage('U1', 'tok2', 'richmenu:coach');
    expect(lineService.replyText).toHaveBeenCalledTimes(1);
    expect(handleCompleted).not.toHaveBeenCalled();
  });
});
