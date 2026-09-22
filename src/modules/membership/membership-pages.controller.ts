import { Controller, Get, Next, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Serves Thai membership web pages from /public/membership.
 * Aliases: /login /profile /account /upgrade (plus /membership/*).
 * Auth is enforced by APIs + client redirect — HTML itself is static.
 */
@Controller()
export class MembershipPagesController {
  private readonly root = join(process.cwd(), 'public', 'membership');

  @Get([
    'login',
    'profile',
    'account',
    'upgrade',
    'membership',
    'membership/',
    'membership/login',
    'membership/account',
    'membership/upgrade',
    'membership/success',
    'membership/cancel',
    'membership/mock-checkout',
  ])
  serve(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    const path = (req.path.replace(/\/$/, '') || '/membership').toLowerCase();
    const map: Record<string, string> = {
      '/login': 'login.html',
      '/profile': 'account.html',
      '/account': 'account.html',
      '/upgrade': 'upgrade.html',
      '/membership': 'index.html',
      '/membership/login': 'login.html',
      '/membership/account': 'account.html',
      '/membership/upgrade': 'upgrade.html',
      '/membership/success': 'success.html',
      '/membership/cancel': 'cancel.html',
      '/membership/mock-checkout': 'mock-checkout.html',
    };
    const file = map[path];
    if (!file) {
      return next();
    }
    const full = join(this.root, file);
    if (!existsSync(full)) {
      return res.status(404).send('Not found');
    }
    return res.sendFile(full);
  }

  @Get('membership/assets/:file')
  assets(@Req() req: Request, @Res() res: Response) {
    const name = String(req.params.file ?? '').replace(/[^a-zA-Z0-9._-]/g, '');
    const full = join(this.root, 'assets', name);
    if (!existsSync(full)) {
      return res.status(404).send('Not found');
    }
    return res.sendFile(full);
  }
}
