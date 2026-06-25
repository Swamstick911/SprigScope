import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { framebufferToPngBase64 } from '../src/png';
import { blankScreen, SCREEN_W, SCREEN_H } from '@sprigscope/core';

describe('framebufferToPngBase64', () => {
  it('encodes a valid PNG upscaled by the given factor', () => {
    const fb = { width: SCREEN_W, height: SCREEN_H, data: blankScreen() } as const;
    const b64 = framebufferToPngBase64(fb, 4);
    const buf = Buffer.from(b64, 'base64');
    // PNG signature
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const png = PNG.sync.read(buf);
    expect(png.width).toBe(160 * 4);
    expect(png.height).toBe(128 * 4);
    // top-left pixel is the blank-screen white
    expect([png.data[0], png.data[1], png.data[2]]).toEqual([255, 255, 255]);
  });
});
