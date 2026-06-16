import { PNG } from 'pngjs';
import type { Framebuffer } from '@sprigscope/core';

/**
 * Encode a 160×128 framebuffer to a base64 PNG, nearest-neighbor upscaled by
 * `scale` so an AI vision model sees crisp, readable pixels.
 */
export function framebufferToPngBase64(fb: Framebuffer, scale = 4): string {
  const w = fb.width * scale;
  const h = fb.height * scale;
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (Math.floor(y / scale) * fb.width + Math.floor(x / scale)) * 4;
      const di = (y * w + x) * 4;
      png.data[di] = fb.data[si];
      png.data[di + 1] = fb.data[si + 1];
      png.data[di + 2] = fb.data[si + 2];
      png.data[di + 3] = 255;
    }
  }
  return PNG.sync.write(png).toString('base64');
}
