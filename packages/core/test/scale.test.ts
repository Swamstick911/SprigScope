import { describe, it, expect } from 'vitest';
import { scaleToScreen } from '../src/render/scale';
import { SCREEN_W, SCREEN_H } from '../src/framebuffer';

// helper: make an ImageData-like source of solid color
function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3];
  }
  return { width: w, height: h, data };
}
const px = (d: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * SCREEN_W + x) * 4;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
};

describe('scaleToScreen', () => {
  it('passes a 160×128 source through 1:1', () => {
    const out = scaleToScreen(solid(160, 128, [10, 20, 30, 255]));
    expect(out.length).toBe(SCREEN_W * SCREEN_H * 4);
    expect(px(out, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(px(out, 159, 127)).toEqual([10, 20, 30, 255]);
  });

  it('scales an 80×64 source up 2× to fill the screen', () => {
    const out = scaleToScreen(solid(80, 64, [200, 100, 50, 255]));
    expect(px(out, 0, 0)).toEqual([200, 100, 50, 255]);
    expect(px(out, 159, 127)).toEqual([200, 100, 50, 255]);
  });

  it('letterboxes a non-matching aspect ratio with white bars', () => {
    // 160×64 source -> scale = min(160/160, 128/64)=1 -> drawn 160×64 centered vertically
    const out = scaleToScreen(solid(160, 64, [5, 5, 5, 255]));
    expect(px(out, 80, 0)).toEqual([255, 255, 255, 255]);   // top bar = white
    expect(px(out, 80, 64)).toEqual([5, 5, 5, 255]);        // centered content
    expect(px(out, 80, 127)).toEqual([255, 255, 255, 255]); // bottom bar = white
  });

  it('returns a blank white screen for an empty (0×0) source', () => {
    const out = scaleToScreen({ width: 0, height: 0, data: new Uint8ClampedArray(0) });
    expect(px(out, 80, 64)).toEqual([255, 255, 255, 255]);
  });
});
