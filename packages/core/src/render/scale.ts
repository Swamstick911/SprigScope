import { SCREEN_W, SCREEN_H, blankScreen } from '../framebuffer';

export interface SourceImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

/**
 * Scale a map-sized render (mapW*16 × mapH*16) into a 160×128 RGBA buffer,
 * nearest-neighbor, preserving aspect, centered on white — matching the sprig web player.
 */
export function scaleToScreen(src: SourceImage): Uint8ClampedArray {
  const out = blankScreen();
  if (src.width === 0 || src.height === 0) return out;

  const scale = Math.min(SCREEN_W / src.width, SCREEN_H / src.height);
  const dw = Math.round(src.width * scale);
  const dh = Math.round(src.height * scale);
  const ox = Math.floor((SCREEN_W - dw) / 2);
  const oy = Math.floor((SCREEN_H - dh) / 2);

  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(src.height - 1, Math.floor(dy / scale));
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(src.width - 1, Math.floor(dx / scale));
      const si = (sy * src.width + sx) * 4;
      const di = ((oy + dy) * SCREEN_W + (ox + dx)) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = 255;
    }
  }
  return out;
}
