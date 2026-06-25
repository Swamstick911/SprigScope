import { describe, it, expect } from 'vitest';
import { SCREEN_W, SCREEN_H, blankScreen, compositeOver } from '../src/framebuffer';

describe('framebuffer', () => {
  it('blankScreen is opaque white and the right size', () => {
    const fb = blankScreen();
    expect(fb.length).toBe(SCREEN_W * SCREEN_H * 4);
    expect([fb[0], fb[1], fb[2], fb[3]]).toEqual([255, 255, 255, 255]);
    const last = fb.length - 4;
    expect([fb[last], fb[last + 1], fb[last + 2], fb[last + 3]]).toEqual([255, 255, 255, 255]);
  });

  it('compositeOver replaces base pixels only where overlay alpha != 0', () => {
    const base = blankScreen();
    const overlay = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4); // all transparent
    // light pixel 0 red, opaque
    overlay[0] = 255; overlay[1] = 0; overlay[2] = 0; overlay[3] = 255;
    const out = compositeOver(base, overlay);
    expect([out[0], out[1], out[2], out[3]]).toEqual([255, 0, 0, 255]); // replaced
    expect([out[4], out[5], out[6], out[7]]).toEqual([255, 255, 255, 255]); // untouched white
  });
});
