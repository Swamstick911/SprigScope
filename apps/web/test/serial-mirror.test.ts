import { describe, it, expect } from 'vitest';
import { createFrameDecoder, MIRROR_W, MIRROR_H } from '../src/serial-mirror';

const FRAME_BYTES = MIRROR_W * MIRROR_H * 2;
const MAGIC = [0xa5, 0x5a, 0xc3, 0x3c];

function makeFrame(): Uint8Array {
  const f = new Uint8Array(FRAME_BYTES);
  // pixel 0 = red (0xF800), 1 = green (0x07E0), 2 = blue (0x001F), big-endian
  f[0] = 0xf8; f[1] = 0x00;
  f[2] = 0x07; f[3] = 0xe0;
  f[4] = 0x00; f[5] = 0x1f;
  return f;
}

describe('serial mirror frame decoder', () => {
  it('finds a frame after garbage and decodes RGB565 to RGBA', () => {
    const frames: Uint8ClampedArray[] = [];
    const feed = createFrameDecoder((rgba) => frames.push(rgba));

    const stream = new Uint8Array([0x11, 0x22, 0x33, ...MAGIC, ...makeFrame()]);
    feed(stream);

    expect(frames).toHaveLength(1);
    const px = frames[0];
    expect([px[0], px[1], px[2], px[3]]).toEqual([255, 0, 0, 255]); // red
    expect([px[4], px[5], px[6], px[7]]).toEqual([0, 255, 0, 255]); // green
    expect([px[8], px[9], px[10], px[11]]).toEqual([0, 0, 255, 255]); // blue
    expect(px.length).toBe(MIRROR_W * MIRROR_H * 4);
  });

  it('reassembles a frame split across chunks', () => {
    const frames: Uint8ClampedArray[] = [];
    const feed = createFrameDecoder((rgba) => frames.push(rgba));

    const stream = new Uint8Array([...MAGIC, ...makeFrame()]);
    feed(stream.subarray(0, 5000));
    expect(frames).toHaveLength(0); // not enough yet
    feed(stream.subarray(5000));
    expect(frames).toHaveLength(1);
    expect([frames[0][0], frames[0][1], frames[0][2]]).toEqual([255, 0, 0]);
  });

  it('decodes two back-to-back frames', () => {
    const frames: Uint8ClampedArray[] = [];
    const feed = createFrameDecoder((rgba) => frames.push(rgba));
    feed(new Uint8Array([...MAGIC, ...makeFrame(), ...MAGIC, ...makeFrame()]));
    expect(frames).toHaveLength(2);
  });
});
