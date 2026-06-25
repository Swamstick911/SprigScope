import { describe, it, expect } from 'vitest';
import { quadSample, sampleInto, DEFAULT_QUAD, type Quad } from '../src/camera-mirror';
import { MIRROR_W, MIRROR_H } from '../src/serial-mirror';

const IDENTITY: Quad = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
];

describe('quadSample', () => {
  it('maps the unit square through an identity quad to itself', () => {
    expect(quadSample(IDENTITY, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(quadSample(IDENTITY, 1, 0)).toEqual({ x: 1, y: 0 });
    expect(quadSample(IDENTITY, 1, 1)).toEqual({ x: 1, y: 1 });
    expect(quadSample(IDENTITY, 0, 1)).toEqual({ x: 0, y: 1 });
    expect(quadSample(IDENTITY, 0.5, 0.5)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('interpolates inside an offset quad', () => {
    const q: Quad = [
      { x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.6, y: 0.8 }, { x: 0.2, y: 0.8 },
    ];
    expect(quadSample(q, 0.5, 0.5)).toEqual({ x: 0.4, y: 0.5 });
  });
});

describe('sampleInto', () => {
  it('warps a quadrant-colored source so each corner picks the right region', () => {
    // 2x2 source: TL red, TR green, BL blue, BR white.
    const src = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, /**/ 0, 255, 0, 255,
        0, 0, 255, 255, /**/ 255, 255, 255, 255,
      ]),
    };
    const out = new Uint8ClampedArray(MIRROR_W * MIRROR_H * 4);
    sampleInto(src, IDENTITY, out);

    const px = (x: number, y: number): number[] => {
      const i = (y * MIRROR_W + x) * 4;
      return [out[i], out[i + 1], out[i + 2], out[i + 3]];
    };
    expect(px(0, 0)).toEqual([255, 0, 0, 255]); // top-left -> red
    expect(px(MIRROR_W - 1, 0)).toEqual([0, 255, 0, 255]); // top-right -> green
    expect(px(0, MIRROR_H - 1)).toEqual([0, 0, 255, 255]); // bottom-left -> blue
    expect(px(MIRROR_W - 1, MIRROR_H - 1)).toEqual([255, 255, 255, 255]); // bottom-right -> white
  });

  it('fills the whole 160x128 output with opaque pixels', () => {
    const src = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) };
    const out = new Uint8ClampedArray(MIRROR_W * MIRROR_H * 4);
    sampleInto(src, DEFAULT_QUAD, out);
    expect(out.length).toBe(MIRROR_W * MIRROR_H * 4);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255); // alpha
    expect([out[0], out[1], out[2]]).toEqual([10, 20, 30]); // single source color
  });
});
