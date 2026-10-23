import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { sendWebApp } from '../../web/web-app';
import {
  RichMenuImageService,
  isRichMenuTab,
} from '../line/rich-menu-image.service';

@Controller()
export class AdminPagesController {
  constructor(private readonly menuImages: RichMenuImageService) {}

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

  /** Rich-menu image previews (uploaded image, else the shipped one). */
  @Get('admin/richmenu/:file')
  async richMenuImage(@Req() req: Request, @Res() res: Response) {
    const name = String(req.params.file ?? '');
    const tab = name.replace(/\.(jpg|png)$/, '');
    if (!isRichMenuTab(tab)) {
      return res.status(404).send('Not found');
    }
    const img = await this.menuImages.get(tab);
    res.setHeader('Cache-Control', 'no-cache');
    return res.type(img.mime).send(img.data);
  }
}
