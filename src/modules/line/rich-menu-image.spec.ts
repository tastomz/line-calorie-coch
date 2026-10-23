import { readFileSync } from 'fs';
import { join } from 'path';
import {
  RichMenuImageError,
  inspectImage,
  validateRichMenuImage,
} from './rich-menu-image';

function png(width: number, height: number, extra = 0): Buffer {
  const b = Buffer.alloc(33 + extra);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe('rich menu image validation', () => {
  it('reads the shipped JPGs as 2500×1686', () => {
    for (const tab of ['coach', 'admin']) {
      const buf = readFileSync(
        join(process.cwd(), 'public', 'richmenu', `${tab}.jpg`),
      );
      expect(inspectImage(buf)).toEqual({
        mime: 'image/jpeg',
        width: 2500,
        height: 1686,
      });
      expect(() => validateRichMenuImage(buf)).not.toThrow();
    }
  });

  it('accepts a PNG of the exact size', () => {
    expect(validateRichMenuImage(png(2500, 1686))).toMatchObject({
      mime: 'image/png',
    });
  });

  it('rejects wrong size, other formats and files over 1 MB', () => {
    expect(() => validateRichMenuImage(png(2500, 843))).toThrow('2500×1686');
    expect(() => validateRichMenuImage(Buffer.from('GIF89a....'))).toThrow(
      RichMenuImageError,
    );
    expect(() => validateRichMenuImage(Buffer.alloc(0))).toThrow(
      RichMenuImageError,
    );
    expect(() => validateRichMenuImage(png(2500, 1686, 1024 * 1024))).toThrow(
      '1 MB',
    );
  });
});
