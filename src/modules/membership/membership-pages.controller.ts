import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { sendWebApp } from '../../web/web-app';

/**
 * Member pages (LIFF): the Angular app renders them. URLs are unchanged so
 * rich-menu / LIFF links and Stripe success/cancel URLs keep working.
 * Auth is enforced by the APIs; the HTML shell is public.
 */
@Controller()
export class MembershipPagesController {
  @Get([
    'login',
    'profile',
    'history',
    'profile/history',
    'account',
    'upgrade',
    'membership',
    'membership/login',
    'membership/account',
    'membership/upgrade',
    'membership/success',
    'membership/cancel',
    'membership/mock-checkout',
  ])
  serve(@Res() res: Response) {
    sendWebApp(res);
  }
}
