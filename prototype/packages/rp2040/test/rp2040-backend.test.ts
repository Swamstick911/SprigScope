import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Rp2040Backend } from '../src/rp2040-backend';
import { SprigRp2040, DISPLAY_PINS } from '../src/sprig-rp2040';

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

describe('ST7735 display decode', () => {
  // Drive the SPI display tap directly with a command/data stream.
  function makeChip() {
    const chip = new SprigRp2040();
    let dc = false;
    Object.defineProperty(chip.mcu.gpio[DISPLAY_PINS.DC], 'outputValue', {
      get: () => dc,
      configurable: true,
    });
    const send = (isData: boolean, byte: number) => {
      dc = isData;
      chip.mcu.spi[0].onTransmit!(byte);
    };
    return {
      cmd: (b: number) => send(false, b),
      data: (...bs: number[]) => bs.forEach((b) => send(true, b)),
      pixelAt(x: number, y: number) {
        const d = chip.render().data;
        const o = (y * 160 + x) * 4;
        return [d[o], d[o + 1], d[o + 2]] as const;
      },
    };
  }

  // A firmware using a windowed write (e.g. the Rust st7735-lcd set_pixel) must
  // land its pixel inside the CASET/RASET window — not collapsed onto (0,0).
  it('honors the CASET/RASET address window for partial writes', () => {
    const c = makeChip();
    c.cmd(0x36); c.data(0x60); // MADCTL: MV=1 (landscape), RGB
    c.cmd(0x2a); c.data(0x00, 51, 0x00, 51); // CASET column 51
    c.cmd(0x2b); c.data(0x00, 31, 0x00, 31); // RASET row 31
    c.cmd(0x2c); c.data(0xff, 0xff); // RAMWR one white pixel

    expect(c.pixelAt(51, 31)).toEqual([255, 255, 255]); // landed in the window
    expect(c.pixelAt(0, 0)).toEqual([0, 0, 0]); // not collapsed to the origin
  });

  // The stock firmware (MADCTL MV=0) streams transposed; a full-window write
  // should fill from the top-left going down the first column.
  it('places transposed pixels for the stock (MV=0) orientation', () => {
    const c = makeChip();
    c.cmd(0x36); c.data(0x58); // MADCTL: MV=0, BGR
    c.cmd(0x2a); c.data(0x00, 0, 0x00, 127); // CASET 0..127 (memory columns)
    c.cmd(0x2b); c.data(0x00, 0, 0x00, 159); // RASET 0..159 (memory rows)
    c.cmd(0x2c);
    c.data(0xff, 0xff); // first pixel -> screen (0,0)
    c.data(0xff, 0xff); // second (next memory column) -> screen (0,1)

    expect(c.pixelAt(0, 0)).not.toEqual([0, 0, 0]);
    expect(c.pixelAt(0, 1)).not.toEqual([0, 0, 0]);
    expect(c.pixelAt(1, 0)).toEqual([0, 0, 0]);
  });
});
