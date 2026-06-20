// sprig-rp2040.ts
// =============================================================================
// A self-contained "universal" Sprig (Hackclub) RP2040 emulator built on
// rp2040js@1.3.2. It boots the STOCK Spade/pico-os firmware unmodified and
// renders the 160x128 ST7735 display to an RGBA framebuffer.
//
// rp2040js@1.3.2 ships several RP2040 peripherals as no-op stubs that the Spade
// firmware deadlocks on. This module patches the three that matter:
//
//   1. XIP_SSI  (0x18000000) -> FlashSSI: emulates a SPI-NOR flash so the boot
//      ROM's bit-bang flash helpers (do_flash_cmd / flash_get_unique_id /
//      connect_internal_flash + status polling) COMPLETE instead of spinning on
//      RXFLR==0.
//   2. IO_QSPI  (0x40018000) -> a shim that forwards the boot ROM's flash CS
//      toggles (GPIO_QSPI_SS_CTRL OUTOVER) to FlashSSI so transactions frame.
//   3. SIO FIFO (0xd0000050/54/58) -> the inter-core mailbox. rp2040js has no
//      core1 and no FIFO; reads returned 0xffffffff so the firmware's FIFO drain
//      loop (PC 0x1000f6c4 in the stock UF2) spun forever. We implement the FIFO
//      and emulate core1's multicore_launch_core1 handshake so the launch
//      completes, then use the same RX FIFO to inject button presses (core1
//      normally polls the buttons and pushes them to core0).
//
// Buttons: core1 pushes the Sprig_Button ENUM INDEX over the FIFO on release.
// Enum order (firmware HAL.h): W,S,A,D,I,K,J,L,None.
// GPIO pins (HAL.c): W=GP5 S=GP7 A=GP6 D=GP8 I=GP12 K=GP14 J=GP13 L=GP15.
//
// Game pre-seeding: writes a saved game into flash exactly the way Spade stores
// it (SPRIG_MAGIC + source at slot 0, plus a metadata entry) so the boot menu
// lists it. Because non-legacy games are parsed in a separate JerryScript scope
// from engine.js (engine globals are lexical `let`s -> invisible to the game),
// we store the game as LEGACY with engine.js bundled into one parse scope.
// =============================================================================

import { RP2040 } from 'rp2040js';
import { decodeBlock } from 'uf2';

// ----------------------------------------------------------------------------
// rp2040js peripheral-key math: findPeripheral(addr) = peripherals[(addr>>>14)<<2]
//   XIP_SSI  0x18000000 -> 0x18000
//   IO_QSPI  0x40018000 -> 0x40018
// The offset passed to a peripheral is (addr & 0x3fff).
// ----------------------------------------------------------------------------
const KEY_XIP_SSI = 0x18000;
const KEY_IO_QSPI = 0x40018;

const FLASH_START = 0x10000000;

// Sprig display pins
export const DISPLAY_PINS = { SCK: 18, MOSI: 19, DC: 22, CS: 20, RST: 26 } as const;

// Sprig_Button enum order (HAL.h) -> index pushed over the FIFO by core1.
export type SprigButton = 'W' | 'S' | 'A' | 'D' | 'I' | 'K' | 'J' | 'L';
const BUTTON_INDEX: Record<SprigButton, number> = { W: 0, S: 1, A: 2, D: 3, I: 4, K: 5, J: 6, L: 7 };
// GPIO pins for reference / direct-GPIO emulation if ever needed (HAL.c button_pins).
export const BUTTON_GPIO: Record<SprigButton, number> = { W: 5, S: 7, A: 6, D: 8, I: 12, K: 14, J: 13, L: 15 };

// =============================================================================
// FlashSSI — emulates a SPI-NOR flash for the boot ROM's bit-bang helpers.
// =============================================================================
class FlashSSI {
  name = 'FLASH_SSI';
  private rp2040: any;
  private ssienr = 0;
  private rxFifo: number[] = [];
  private byteIndex = 0;
  private cmd = -1;
  private addr = 0;
  private csAsserted = false;
  private uniqueId = [0xe6, 0x60, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc];

  // SSI register offsets
  private static SSIENR = 0x08;
  private static TXFLR = 0x20;
  private static RXFLR = 0x24;
  private static SR = 0x28;
  private static ICR = 0x48;
  private static DR0 = 0x60;
  // SR bits
  private static SR_TFNF = 0x02;
  private static SR_TFE = 0x04;
  private static SR_RFNE = 0x08;
  // flash commands
  private static RDID = 0x9f;
  private static RUID = 0x4b;
  private static READ = 0x03;
  private static FASTREAD = 0x0b;
  private static RDSFDP = 0x5a;
  private static PP = 0x02;
  private static SE = 0x20;
  private static BE32 = 0x52;
  private static BE64 = 0xd8;

  constructor(rp2040: any) {
    this.rp2040 = rp2040;
  }

  private reset() {
    this.byteIndex = 0;
    this.cmd = -1;
    this.addr = 0;
  }

  setCS(asserted: boolean) {
    if (this.csAsserted !== asserted) this.reset();
    this.csAsserted = asserted;
  }

  private flashByte(off: number): number {
    const f = this.rp2040?.flash as Uint8Array | undefined;
    if (!f || off < 0 || off >= f.length) return 0x00;
    return f[off] & 0xff;
  }
  private programByte(off: number, val: number) {
    const f = this.rp2040?.flash as Uint8Array | undefined;
    if (!f || off < 0 || off >= f.length) return;
    f[off] = f[off] & val; // NOR program can only clear bits (1->0)
  }
  private eraseRegion(start: number, size: number) {
    const f = this.rp2040?.flash as Uint8Array | undefined;
    if (!f) return;
    const end = Math.min(start + size, f.length);
    for (let a = Math.max(0, start); a < end; a++) f[a] = 0xff;
  }

  private produceRxByte(tx: number): number {
    const i = this.byteIndex;
    let rx = 0x00;
    if (i === 0) {
      this.cmd = tx & 0xff;
      this.addr = 0;
    } else {
      switch (this.cmd) {
        case 0x05: case 0x35: case 0x15: rx = 0x00; break; // RDSR* -> not busy
        case FlashSSI.RDID: rx = i === 1 ? 0xef : i === 2 ? 0x40 : i === 3 ? 0x15 : 0x00; break;
        case FlashSSI.RUID: rx = i >= 5 && i <= 12 ? this.uniqueId[i - 5] : 0x00; break;
        case FlashSSI.READ:
          if (i <= 3) this.addr = (this.addr << 8) | (tx & 0xff);
          else rx = this.flashByte(this.addr + (i - 4));
          break;
        case FlashSSI.FASTREAD:
        case FlashSSI.RDSFDP:
          if (i >= 1 && i <= 3) this.addr = (this.addr << 8) | (tx & 0xff);
          else if (i === 4) rx = 0x00;
          else rx = this.cmd === FlashSSI.RDSFDP ? 0xff : this.flashByte(this.addr + (i - 5));
          break;
        case FlashSSI.PP:
          if (i >= 1 && i <= 3) this.addr = (this.addr << 8) | (tx & 0xff);
          else this.programByte(this.addr + (i - 4), tx & 0xff);
          break;
        case FlashSSI.SE: case FlashSSI.BE32: case FlashSSI.BE64:
          if (i >= 1 && i <= 3) {
            this.addr = (this.addr << 8) | (tx & 0xff);
            if (i === 3) {
              const size = this.cmd === FlashSSI.SE ? 0x1000 : this.cmd === FlashSSI.BE32 ? 0x8000 : 0x10000;
              this.eraseRegion(this.addr & ~(size - 1), size);
            }
          }
          break;
        default: rx = 0x00;
      }
    }
    this.byteIndex++;
    return rx & 0xff;
  }

  readUint32(offset: number): number {
    switch (offset) {
      case FlashSSI.TXFLR: return 0;
      case FlashSSI.RXFLR: return this.rxFifo.length & 0xff;
      case FlashSSI.SR: {
        let sr = FlashSSI.SR_TFE | FlashSSI.SR_TFNF;
        if (this.rxFifo.length > 0) sr |= FlashSSI.SR_RFNE;
        return sr;
      }
      case FlashSSI.SSIENR: return this.ssienr;
      case 0x58: return 0x51535049; // SSI_IDR
      case 0x5c: return 0x3430312a; // SSI_VERSION_ID
      case FlashSSI.DR0: return this.rxFifo.length ? this.rxFifo.shift()! & 0xff : 0x00;
      default: return 0x00;
    }
  }

  writeUint32(offset: number, value: number): void {
    switch (offset) {
      case FlashSSI.SSIENR: {
        const wasEnabled = this.ssienr & 1;
        this.ssienr = value;
        if (!(value & 1) || !wasEnabled) { this.reset(); this.rxFifo.length = 0; }
        return;
      }
      case FlashSSI.ICR: return;
      case FlashSSI.DR0: this.rxFifo.push(this.produceRxByte(value & 0xff)); return;
      default: return;
    }
  }

  writeUint32Atomic(offset: number, value: number, atomicType: number): void {
    if (atomicType === 0) return this.writeUint32(offset, value);
    const cur = this.readUint32(offset);
    let nv = value;
    if (atomicType === 1) nv = cur ^ value;
    else if (atomicType === 2) nv = cur | value;
    else if (atomicType === 3) nv = cur & ~value;
    this.writeUint32(offset, nv);
  }
  debug() {} info() {} warn() {} error() {}
}

// =============================================================================
// IO_QSPI shim — forwards the boot ROM's flash CS toggles to FlashSSI.
// =============================================================================
function makeIoQspi(flashSSI: FlashSSI) {
  return {
    name: 'IO_QSPI_SHIM',
    ssCtrl: 0,
    readUint32(o: number) { return o === 0x0c ? this.ssCtrl : 0; },
    writeUint32(o: number, v: number) {
      if (o === 0x0c) {
        this.ssCtrl = v;
        const outover = (v >> 8) & 0x3; // 0b10 = force low (CS asserted), 0b11 = force high
        if (outover === 0x2) flashSSI.setCS(true);
        else if (outover === 0x3) flashSSI.setCS(false);
      }
    },
    writeUint32Atomic(o: number, v: number, t: number) {
      if (t === 0) return this.writeUint32(o, v);
      const c = this.readUint32(o);
      let nv = v;
      if (t === 1) nv = c ^ v; else if (t === 2) nv = c | v; else if (t === 3) nv = c & ~v;
      this.writeUint32(o, nv);
    },
    debug() {}, info() {}, warn() {}, error() {},
  };
}

// =============================================================================
// Spade on-flash save layout constants (firmware/spade/src/rpi/upload.h).
// =============================================================================
const FLASH_PAGE_SIZE = 256;
const FLASH_SECTOR_SIZE = 4096; // unused directly but documents slot alignment
const METADATA_ENTRY_SIZE = 256;
const METADATA_MAX_ENTRIES = 32;
const FLASH_TARGET_START = 800 * 1024; // 0xC8000 (slot 0 contents)
const METADATA_SIZE = (METADATA_MAX_ENTRIES + 1) * METADATA_ENTRY_SIZE;
const METADATA_VERSION_OFF = FLASH_TARGET_START - METADATA_SIZE;          // idx -1 (version)
const METADATA_IDX0_OFF = METADATA_VERSION_OFF + METADATA_ENTRY_SIZE;     // idx 0
const SPRIG_MAGIC = [1337, 42, 69, 420, 420, 1337];

// =============================================================================
// SprigRp2040 — the vendorable emulator.
// =============================================================================
export interface Frame { width: 160; height: 128; data: Uint8ClampedArray; }

export class SprigRp2040 {
  readonly mcu: RP2040;
  private flashSSI: FlashSSI;

  // SIO FIFO state (core1 mailbox + launch handshake)
  private rxQueue: number[] = []; // core1 -> core0 (button presses + handshake echoes)
  private launchSeq = 0;
  private static LAUNCH_EXPECTED: (number | null)[] = [0, 0, 1, null, null, null];

  // Display decode state
  private static W = 160;
  private static H = 128;
  private fb = new Uint16Array(SprigRp2040.W * SprigRp2040.H); // RGB565
  private curCmd = -1;
  private args: number[] = [];
  private cs = 0; private ce = SprigRp2040.W - 1;
  private rs = 0; private re = SprigRp2040.H - 1;
  private pixHi = -1;
  private mc = 0; private mr = 0; // memory address pointer within the active CASET/RASET window
  private madctl = 0x58;

  // engine source used to bundle legacy games. Set via setEngineScript() if you
  // want loadGameToFlash() to produce a runnable cartridge.
  private engineScript: string | null = null;

  private uf2: Uint8Array | null = null;

  constructor(opts?: { engineScript?: string }) {
    this.mcu = new RP2040();
    // Silence rp2040js logging + the SIO console.warn spam.
    (this.mcu as any).logger = { debug() {}, warn() {}, info() {}, error() {} };
    if (typeof console !== 'undefined') console.warn = () => {};

    this.flashSSI = new FlashSSI(this.mcu);
    (this.mcu.peripherals as any)[KEY_XIP_SSI] = this.flashSSI;
    (this.mcu.peripherals as any)[KEY_IO_QSPI] = makeIoQspi(this.flashSSI);

    this.patchSioFifo();
    this.wireDisplayTap();

    if (opts?.engineScript) this.engineScript = opts.engineScript;
  }

  /** Provide engine.js so loadGameToFlash() can bundle it (legacy cartridge). */
  setEngineScript(src: string) { this.engineScript = src; }

  // --- SIO FIFO + core1 launch handshake ------------------------------------
  private patchSioFifo() {
    const FIFO_ST = 0x050, FIFO_WR = 0x054, FIFO_RD = 0x058;
    const ST_VLD = 1, ST_RDY = 2;
    const sio: any = this.mcu.sio;
    const origRead = sio.readUint32.bind(sio);
    const origWrite = sio.writeUint32.bind(sio);
    sio.readUint32 = (offset: number) => {
      if (offset === FIFO_ST) {
        let st = ST_RDY; // TX always ready
        if (this.rxQueue.length > 0) st |= ST_VLD;
        return st;
      }
      if (offset === FIFO_RD) return this.rxQueue.length ? (this.rxQueue.shift()! >>> 0) : 0;
      return origRead(offset);
    };
    sio.writeUint32 = (offset: number, value: number) => {
      if (offset === FIFO_WR) { this.core1Receive(value >>> 0); return; }
      return origWrite(offset, value);
    };
  }

  // Emulate core1's side of multicore_launch_core1: echo the launch sequence.
  private core1Receive(v: number) {
    const exp = SprigRp2040.LAUNCH_EXPECTED;
    if (this.launchSeq < exp.length) {
      const e = exp[this.launchSeq];
      if (e === null || v === e) { this.rxQueue.push(v >>> 0); this.launchSeq++; }
      else { this.launchSeq = v === 0 ? 1 : 0; this.rxQueue.push(0); }
    }
    // post-launch writes from core0 to core1 are ignored.
  }

  // --- Display tap ----------------------------------------------------------
  private wireDisplayTap() {
    this.mcu.spi[0].onTransmit = (value: number) => {
      const dc = this.mcu.gpio[DISPLAY_PINS.DC].outputValue;
      const b = value & 0xff;
      if (dc) this.onData(b);
      else { this.curCmd = b; this.args.length = 0; if (b === 0x2c) { this.mc = this.cs; this.mr = this.rs; this.pixHi = -1; } }
      this.mcu.spi[0].completeTransmit(0);
    };
  }

  private plot(x: number, y: number, color: number) {
    const W = SprigRp2040.W, H = SprigRp2040.H;
    // Column-major streaming already yields the correct orientation; the panel's
    // MADCTL MX/MY are baked into how the firmware writes, so no extra mirror here.
    if (x >= 0 && x < W && y >= 0 && y < H) this.fb[y * W + x] = color;
  }

  private onData(b: number) {
    const c = this.curCmd;
    if (c === 0x36) { this.madctl = b; }
    else if (c === 0x2a) { this.args.push(b); if (this.args.length === 4) { this.cs = (this.args[0] << 8) | this.args[1]; this.ce = (this.args[2] << 8) | this.args[3]; } }
    else if (c === 0x2b) { this.args.push(b); if (this.args.length === 4) { this.rs = (this.args[0] << 8) | this.args[1]; this.re = (this.args[2] << 8) | this.args[3]; } }
    else if (c === 0x2c) {
      if (this.pixHi < 0) { this.pixHi = b; return; }
      const color = this.pixHi | (b << 8); // RGB565, low byte first
      this.pixHi = -1;
      // Place into the active CASET/RASET window. The ST7735 address pointer
      // advances column-fast, then row. MADCTL's MV bit (0x20) selects how the
      // memory column/row map to the screen: landscape firmware (MV=1, e.g. the
      // Rust st7735-lcd driver) writes screen-space directly, while the stock
      // Spade firmware (MV=0) streams transposed. Honoring the window is what
      // makes set_pixel / partial writes land where the firmware intends.
      if (this.madctl & 0x20) this.plot(this.mc, this.mr, color);
      else this.plot(this.mr, this.mc, color);
      if (++this.mc > this.ce) { this.mc = this.cs; this.mr++; }
    }
  }

  // --- Firmware / flash -----------------------------------------------------
  loadFirmware(uf2: Uint8Array) {
    this.uf2 = uf2;
    this.mcu.loadBootrom(bootromB1);
    for (let off = 0; off + 512 <= uf2.length; off += 512) {
      const block = decodeBlock(uf2.subarray(off, off + 512));
      this.mcu.flash.set(block.payload, block.flashAddress - FLASH_START);
    }
    this.mcu.core.PC = FLASH_START;
  }

  /**
   * Write a game into flash so the boot menu lists & runs it.
   * Stored as a LEGACY cartridge (engine.js bundled into one parse scope), which
   * is required because the stock firmware parses engine and game separately and
   * engine globals are lexical. Call setEngineScript() / pass engineScript first.
   */
  loadGameToFlash(src: string) {
    const flash = this.mcu.flash as Uint8Array;
    const bundle = (this.engineScript ? this.engineScript + '\n' : '') + src + '\n';
    const bytes = new TextEncoder().encode(bundle);

    // 1) SPRIG_MAGIC (uint16[6] LE) at slot 0
    let p = FLASH_TARGET_START;
    for (const w of SPRIG_MAGIC) { flash[p++] = w & 0xff; flash[p++] = (w >> 8) & 0xff; }

    // 2) bundled source after the magic page, NUL-terminated
    flash.set(bytes, FLASH_TARGET_START + FLASH_PAGE_SIZE);
    flash[FLASH_TARGET_START + FLASH_PAGE_SIZE + bytes.length] = 0;

    // 3) version region = "2.0.0" so update_save_version() skips migration and
    //    leaves our metadata intact.
    for (let i = 0; i < METADATA_ENTRY_SIZE; i++) flash[METADATA_VERSION_OFF + i] = 0;
    flash.set(new TextEncoder().encode('2.0.0\0'), METADATA_VERSION_OFF);

    // 4) metadata entry idx0: name[100], location(u32@100), slot(u8@104),
    //    size_b(u32@108), is_legacy(u8@112).
    const meta = new Uint8Array(METADATA_ENTRY_SIZE);
    meta.set(new TextEncoder().encode('Game'), 0);
    meta[104] = 0; // slot 0
    new DataView(meta.buffer).setUint32(108, bytes.length, true);
    meta[112] = 1; // is_legacy = 1 (engine bundled in source)
    flash.set(meta, METADATA_IDX0_OFF);
  }

  /** Reset CPU + display state and re-flash the loaded firmware. */
  reset() {
    if (!this.uf2) throw new Error('loadFirmware() first');
    this.fb.fill(0);
    this.curCmd = -1; this.args.length = 0;
    this.mc = 0; this.mr = 0; this.pixHi = -1; this.madctl = 0x58;
    this.rxQueue.length = 0; this.launchSeq = 0;
    // rp2040js has no public soft-reset; rebuild flash + PC.
    this.loadFirmware(this.uf2);
  }

  // --- Buttons --------------------------------------------------------------
  // core1 normally pushes the button enum index to core0 on release. We push the
  // same value into the RX queue. pressButton then releaseButton == one tap.
  pressButton(key: SprigButton) {
    // No-op on press: the firmware reacts on RELEASE (core1 pushes on key-up).
    void key;
  }
  releaseButton(key: SprigButton) {
    this.rxQueue.push(BUTTON_INDEX[key]);
  }
  /** Convenience: queue a full press+release tap. */
  tapButton(key: SprigButton) { this.rxQueue.push(BUTTON_INDEX[key]); }

  // --- Run / render ---------------------------------------------------------
  private static CYCLE_NS = 1e9 / 125_000_000;

  /** Run a bounded number of CPU instructions. */
  runInstructions(n: number) {
    const core = this.mcu.core;
    const clock = this.mcu.clock as any; // SimulationClock; IClock doesn't expose tick/nanosToNextAlarm
    for (let i = 0; i < n; i++) {
      if (core.waiting) clock.tick(clock.nanosToNextAlarm);
      else clock.tick(core.executeInstruction() * SprigRp2040.CYCLE_NS);
    }
  }

  /**
   * Run for approximately `ms` of *emulated* time. Because the loop advances the
   * clock by real instruction timing, we step in instruction chunks and stop
   * once enough emulated nanoseconds elapsed. Simpler: just run a proportional
   * instruction budget (125 MHz core).
   */
  runFor(ms: number) {
    const budget = Math.max(1, Math.round((ms / 1000) * 125_000_000));
    this.runInstructions(budget);
  }

  /** Snapshot the current framebuffer as RGBA8888. */
  render(): Frame {
    const W = SprigRp2040.W, H = SprigRp2040.H;
    const data = new Uint8ClampedArray(W * H * 4);
    const bgr = (this.madctl & 0x08) !== 0;
    for (let i = 0; i < W * H; i++) {
      const c = this.fb[i];
      let r = (c >> 11) & 0x1f, g = (c >> 5) & 0x3f, b = c & 0x1f;
      if (bgr) { const t = r; r = b; b = t; }
      const o = i * 4;
      data[o] = (r << 3) | (r >> 2);
      data[o + 1] = (g << 2) | (g >> 4);
      data[o + 2] = (b << 3) | (b >> 2);
      data[o + 3] = 255;
    }
    return { width: 160, height: 128, data };
  }
}

// -----------------------------------------------------------------------------
// Bootrom: rp2040js needs the RP2040 B1 boot ROM. Vendor it from the rp2040js
// demo (demo/bootrom.ts) and import here. We re-export the symbol so callers can
// `import { bootromB1 } from './sprig-rp2040'`.
// -----------------------------------------------------------------------------
import { bootromB1 } from './bootrom.js';
export { bootromB1 };
