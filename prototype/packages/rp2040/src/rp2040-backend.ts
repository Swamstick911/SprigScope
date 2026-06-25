import type { Button, DeviceStatus, Framebuffer, SprigDevice } from '@sprigscope/core';
import { SprigRp2040, type SprigButton } from './sprig-rp2040.js';
import { ENGINE_SCRIPT } from './engine-script.js';

const KEY_TO_SPRIG: Record<Button, SprigButton> = {
  w: 'W', a: 'A', s: 'S', d: 'D', i: 'I', j: 'J', k: 'K', l: 'L',
};

export interface Rp2040BackendOptions {
  /** Emulated ms advanced per framebuffer snapshot (default 20). */
  frameMs?: number;
  /** Emulated ms advanced after a button press so the firmware reacts (default 80). */
  inputMs?: number;
  /** Emulated ms run after loading firmware to reach a first rendered frame (default 160). */
  bootMs?: number;
}

/**
 * A hardware-level Sprig backend: boots arbitrary RP2040 firmware on rp2040js and
 * reconstructs the ST7735 screen. Implements the same SprigDevice interface as the
 * engine backend, so the GUI/MCP can drive it identically — the difference is this
 * one runs *real firmware* (the "universal" mode), not a game on the JS engine.
 */
export class Rp2040Backend implements SprigDevice {
  private readonly chip: SprigRp2040;
  private readonly frameMs: number;
  private readonly inputMs: number;
  private readonly bootMs: number;
  private title?: string;
  private loaded = false;
  private readonly listeners = new Set<(fb: Framebuffer) => void>();

  constructor(options: Rp2040BackendOptions = {}) {
    this.chip = new SprigRp2040({ engineScript: ENGINE_SCRIPT });
    this.frameMs = options.frameMs ?? 20;
    this.inputMs = options.inputMs ?? 80;
    this.bootMs = options.bootMs ?? 160;
  }

  /** Boot an arbitrary RP2040 firmware image (the universal capability). */
  loadFirmware(uf2: Uint8Array, title?: string): void {
    // Reject anything that isn't a UF2 (magic 'UF2\n' = 0x0A324655, little-endian).
    if (uf2.byteLength < 512 || new DataView(uf2.buffer, uf2.byteOffset, 4).getUint32(0, true) !== 0x0a324655) {
      throw new Error('Not a valid UF2 firmware file.');
    }
    this.chip.loadFirmware(uf2);
    this.chip.runFor(this.bootMs);
    this.title = title;
    this.loaded = true;
    this.emit();
  }

  /**
   * The chip backend runs firmware images, not game JS. Sprig games run on the
   * engine backend (pixel-perfect, with symbolic state); to exercise a game on
   * the real firmware emulation, flash firmware that bundles it. For ad-hoc
   * experiments the underlying SprigRp2040.loadGameToFlash() is exported.
   */
  loadGame(_source: string): void {
    throw new Error(
      'Rp2040Backend runs firmware images: use loadFirmware(uf2). For Sprig games, use the engine backend (@sprigscope/core EngineBackend).',
    );
  }

  reset(): void {
    this.chip.reset();
    this.chip.runFor(this.bootMs);
    this.emit();
  }

  setButton(btn: Button, down: boolean): void {
    if (down) this.pressButton(btn);
  }

  pressButton(btn: Button): void {
    this.chip.tapButton(KEY_TO_SPRIG[btn]);
    this.chip.runFor(this.inputMs);
    this.emit();
  }

  getFramebuffer(): Framebuffer {
    this.chip.runFor(this.frameMs);
    const f = this.chip.render();
    return { width: 160, height: 128, data: f.data };
  }

  onFrame(cb: (fb: Framebuffer) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getStatus(): DeviceStatus {
    return { running: this.loaded, loaded: this.loaded, backend: 'rp2040', title: this.title };
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const fb = this.getFramebuffer();
    for (const cb of this.listeners) cb(fb);
  }
}
