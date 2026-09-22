import { Controller, Get, Next, Req, Res } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';

@Controller()
export class AdminPagesController {
  private readonly root = join(process.cwd(), 'public', 'admin');

  @Get(['admin', 'admin/', 'admin/login', 'admin/dashboard', 'admin/promos'])
  serve(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    const path = (req.path.replace(/\/$/, '') || '/admin').toLowerCase();
    const map: Record<string, string> = {
      '/admin': 'dashboard.html',
      '/admin/login': 'login.html',
      '/admin/dashboard': 'dashboard.html',
      '/admin/promos': 'promos.html',
    };
    const file = map[path];
    if (!file) return next();
    const full = join(this.root, file);
    if (!existsSync(full)) return res.status(404).send('Not found');
    return res.sendFile(full);
  }

  @Get('admin/assets/:file')
  assets(@Req() req: Request, @Res() res: Response) {
    const name = String(req.params.file ?? '').replace(/[^a-zA-Z0-9._-]/g, '');
    const full = join(this.root, 'assets', name);
    if (!existsSync(full)) return res.status(404).send('Not found');
    return res.sendFile(full);
  }
}
