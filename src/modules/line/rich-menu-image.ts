import { RICH_MENU_SIZE } from './rich-menu';

/** LINE accepts JPEG/PNG up to 1 MB for rich menu images. */
export const RICH_MENU_IMAGE_MAX_BYTES = 1024 * 1024;

export type ImageInfo = {
  mime: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
};

export class RichMenuImageError extends Error {}

/** Reads type and pixel size from PNG / JPEG headers (no image library). */
export function inspectImage(buf: Buffer): ImageInfo | null {
  if (
    buf.length > 24 &&
    buf.readUInt32BE(0) === 0x89504e47 &&
    buf.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return {
      mime: 'image/png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC) carry the frame size.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        return {
          mime: 'image/jpeg',
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        };
      }
      if (
        marker === 0xd8 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        i += 2;
        continue;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * Must be exactly the menu size: the tap areas are fixed coordinates on a
 * 2500×1686 canvas, so a different size would put buttons in the wrong place.
 */
export function validateRichMenuImage(buf: Buffer): ImageInfo {
  if (!buf.length) throw new RichMenuImageError('ไม่พบไฟล์รูป');
  if (buf.length > RICH_MENU_IMAGE_MAX_BYTES) {
    throw new RichMenuImageError(
      `รูปใหญ่เกิน 1 MB (${(buf.length / 1024 / 1024).toFixed(2)} MB) — ลดคุณภาพ JPG แล้วลองใหม่`,
    );
  }
  const info = inspectImage(buf);
  if (!info) throw new RichMenuImageError('รองรับเฉพาะไฟล์ JPG หรือ PNG');
  const { width, height } = RICH_MENU_SIZE;
  if (info.width !== width || info.height !== height) {
    throw new RichMenuImageError(
      `ขนาดรูปต้องเป็น ${width}×${height} px (ไฟล์นี้ ${info.width}×${info.height})`,
    );
  }
  return info;
}
