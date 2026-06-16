import { describe, it, expect } from 'vitest';
import { installImageDataShim } from '../src/platform/imagedata';

describe('installImageDataShim', () => {
  it('provides a global ImageData that supports (w,h) and (data,w,h)', () => {
    installImageDataShim();
    const a = new ImageData(160, 128);
    expect(a.width).toBe(160);
    expect(a.height).toBe(128);
    expect(a.data.length).toBe(160 * 128 * 4);

    const buf = new Uint8ClampedArray(2 * 2 * 4);
    const b = new ImageData(buf, 2, 2);
    expect(b.width).toBe(2);
    expect(b.height).toBe(2);
    expect(b.data).toBe(buf);
  });
});
