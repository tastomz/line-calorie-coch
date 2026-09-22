import { Controller, Get, Next, Req, Res, UseGuards } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { DevToolsGuard } from './dev-tools.guard';

@Controller()
@UseGuards(DevToolsGuard)
export class DevMembershipPagesController {
  private readonly root = join(process.cwd(), 'public', 'dev');

  @Get([
    'dev/membership',
    'dev/admin',
    'dev/admin/promos',
    'dev/test-scenarios',
    'dev/checkout',
    'dev/chat',
  ])
  serve(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    const path = req.path.replace(/\/$/, '').toLowerCase();
    const map: Record<string, string> = {
      '/dev/membership': 'membership.html',
      '/dev/admin': 'admin.html',
      '/dev/admin/promos': 'promos.html',
      '/dev/test-scenarios': 'test-scenarios.html',
      '/dev/checkout': 'checkout.html',
      '/dev/chat': 'chat.html',
    };
    const file = map[path];
    if (!file) return next();
    const full = join(this.root, file);
    if (!existsSync(full)) return res.status(404).send('Not found');
    return res.sendFile(full);
  }
}
