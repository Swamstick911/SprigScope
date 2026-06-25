export const SCREEN_W = 160;
export const SCREEN_H = 128;

/** A fresh opaque-white 160×128 RGBA buffer. */
export function blankScreen(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  return data;
}

/**
 * Composite `overlay` onto `base` in place. Overlay alpha is treated as 0 or 255
 * (the text layer is 1-bit). Mutates and returns `base`.
 */
export function compositeOver(base: Uint8ClampedArray, overlay: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < base.length; i += 4) {
    if (overlay[i + 3] !== 0) {
      base[i] = overlay[i];
      base[i + 1] = overlay[i + 1];
      base[i + 2] = overlay[i + 2];
      base[i + 3] = 255;
    }
  }
  return base;
}
