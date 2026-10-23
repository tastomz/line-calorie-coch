import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'path';
import { sendWebApp } from '../../web/web-app';

@Controller()
export class AdminPagesController {
  /** Admin pages are rendered by the Angular app; APIs enforce auth. */
  @Get([
    'admin',
    'admin/login',
    'admin/dashboard',
    'admin/users',
    'admin/promos',
    'admin/plans',
    'admin/ai-usage',
    'admin/settings',
  ])
  serve(@Res() res: Response) {
    sendWebApp(res);
  }

  /** Rich-menu image previews for the dashboard (fixed allow-list). */
  @Get('admin/richmenu/:file')
  richMenuImage(@Req() req: Request, @Res() res: Response) {
    const name = String(req.params.file ?? '');
    if (name !== 'coach.jpg' && name !== 'admin.jpg') {
      return res.status(404).send('Not found');
    }
    return res.sendFile(join(process.cwd(), 'public', 'richmenu', name));
  }
}
