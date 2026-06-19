import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Rp2040Backend } from '../src/rp2040-backend';

const stock = new Uint8Array(
  readFileSync(fileURLToPath(new URL('../../../firmware/pico-os.uf2', import.meta.url))),
);

function countNonBlack(d: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) n++;
  return n;
}

describe('Rp2040Backend (universal chip backend)', () => {
  it('boots the stock Sprig firmware and renders the boot screen', () => {
    const dev = new Rp2040Backend();
    dev.loadFirmware(stock, 'pico-os');
    expect(dev.getStatus()).toMatchObject({ loaded: true, backend: 'rp2040' });
    const fb = dev.getFramebuffer();
    expect(fb.width).toBe(160);
    expect(fb.height).toBe(128);
    // the "Please upload a game." boot screen text rendered
    expect(countNonBlack(fb.data)).toBeGreaterThan(200);
  });

  it('accepts button input without crashing', () => {
    const dev = new Rp2040Backend();
    dev.loadFirmware(stock);
    expect(() => {
      dev.pressButton('w');
      dev.pressButton('s');
    }).not.toThrow();
    expect(countNonBlack(dev.getFramebuffer().data)).toBeGreaterThan(0);
  });

  it('loadGame directs callers to loadFirmware / the engine backend', () => {
    const dev = new Rp2040Backend();
    expect(() => dev.loadGame('whatever')).toThrow(/loadFirmware/);
  });

  it('rejects a non-UF2 file with a clear error', () => {
    const dev = new Rp2040Backend();
    expect(() => dev.loadFirmware(new Uint8Array(512).fill(0x42))).toThrow(/UF2/);
  });
});
