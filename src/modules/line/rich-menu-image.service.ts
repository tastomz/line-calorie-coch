import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { RichMenuTab } from './rich-menu';
import { validateRichMenuImage } from './rich-menu-image';

export const RICH_MENU_TABS: RichMenuTab[] = ['coach', 'admin'];

export function isRichMenuTab(v: unknown): v is RichMenuTab {
  return v === 'coach' || v === 'admin';
}

export type StoredMenuImage = { data: Buffer; mime: string };

/** Uploaded rich menu images (DB) with the shipped JPGs as the default. */
@Injectable()
export class RichMenuImageService {
  constructor(private readonly prisma: PrismaService) {}

  private defaultPath(tab: RichMenuTab) {
    return join(process.cwd(), 'public', 'richmenu', `${tab}.jpg`);
  }

  async get(tab: RichMenuTab): Promise<StoredMenuImage> {
    const row = await this.prisma.richMenuImage.findUnique({ where: { tab } });
    if (row) return { data: Buffer.from(row.data), mime: row.mime };
    return { data: await readFile(this.defaultPath(tab)), mime: 'image/jpeg' };
  }

  async status() {
    const rows = await this.prisma.richMenuImage.findMany({
      select: {
        tab: true,
        mime: true,
        width: true,
        height: true,
        updatedAt: true,
      },
    });
    const byTab = new Map(rows.map((r) => [r.tab, r]));
    return Object.fromEntries(
      RICH_MENU_TABS.map((tab) => {
        const r = byTab.get(tab);
        return [
          tab,
          r
            ? { custom: true, mime: r.mime, updatedAt: r.updatedAt }
            : { custom: false, mime: 'image/jpeg', updatedAt: null },
        ];
      }),
    ) as Record<
      RichMenuTab,
      { custom: boolean; mime: string; updatedAt: Date | null }
    >;
  }

  async save(tab: RichMenuTab, data: Buffer) {
    const info = validateRichMenuImage(data);
    const bytes = new Uint8Array(data);
    await this.prisma.richMenuImage.upsert({
      where: { tab },
      create: {
        tab,
        mime: info.mime,
        data: bytes,
        width: info.width,
        height: info.height,
      },
      update: {
        mime: info.mime,
        data: bytes,
        width: info.width,
        height: info.height,
      },
    });
    return info;
  }

  async reset(tab: RichMenuTab) {
    await this.prisma.richMenuImage.deleteMany({ where: { tab } });
  }
}
