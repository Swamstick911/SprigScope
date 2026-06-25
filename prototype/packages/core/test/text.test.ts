import { describe, it, expect } from 'vitest';
import { renderTextOverlay } from '../src/render/text';
import { SCREEN_W } from '../src/framebuffer';

const px = (d: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * SCREEN_W + x) * 4;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
};

describe('renderTextOverlay', () => {
  it('lights red pixels for a glyph in the top-left cell and leaves the rest transparent', () => {
    const out = renderTextOverlay([{ x: 0, y: 0, content: 'A', color: [255, 0, 0, 255] }]);

    // at least one lit pixel inside the first 8×8 cell, colored red, fully opaque
    let lit = 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [r, g, b, a] = px(out, x, y);
        if (a === 255) { lit++; expect([r, g, b]).toEqual([255, 0, 0]); }
      }
    }
    expect(lit).toBeGreaterThan(0);

    // far away from any text => transparent
    expect(px(out, 120, 100)).toEqual([0, 0, 0, 0]);
  });

  it('returns an all-transparent overlay when there is no text', () => {
    const out = renderTextOverlay([]);
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 80, 64)).toEqual([0, 0, 0, 0]);
  });
});
