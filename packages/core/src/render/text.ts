import { composeText, font } from 'sprig/base';
import { SCREEN_W, SCREEN_H } from '../framebuffer';

/** One text element as stored in the engine's game state. */
export interface TextElement {
  x: number;
  y: number;
  content: string;
  color: number[]; // [r,g,b,a]
}

/**
 * Render the Sprig text layer to a 160×128 RGBA overlay (transparent except lit
 * glyph pixels). Mirrors the engine's getTextImg: 8×8 glyphs from `font`, indexed
 * by char code, laid out on a 20×16 grid by `composeText`.
 */
export function renderTextOverlay(texts: TextElement[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4); // all zero = transparent
  const charGrid = composeText(texts as never);

  for (let row = 0; row < charGrid.length; row++) {
    let xt = 0;
    for (const cell of charGrid[row]) {
      const { char, color } = cell as { char: string; color: number[] };
      const cc = char.charCodeAt(0);
      let y = row * 8;
      for (const bits of font.slice(cc * 8, (cc + 1) * 8)) {
        for (let x = 0; x < 8; x++) {
          const val = (bits >> (7 - x)) & 1;
          const di = (y * SCREEN_W + (xt + x)) * 4;
          out[di] = val * color[0];
          out[di + 1] = val * color[1];
          out[di + 2] = val * color[2];
          out[di + 3] = val * 255;
        }
        y++;
      }
      xt += 8;
    }
  }
  return out;
}
