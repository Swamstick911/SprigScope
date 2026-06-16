# SprigScope — Universal Sprig Emulator: Design Spec

- **Date:** 2026-06-16
- **Status:** Draft for review
- **Working title:** SprigScope (rename freely)

---

## 1. Overview

SprigScope is a cross-platform (Windows / macOS / Linux) desktop application that
**emulates the Sprig handheld console at the hardware level** so that:

1. You can **run and see the Sprig's screen on your PC without owning a Sprig**, and
2. An **AI can read the screen and drive the inputs autonomously** (via an MCP server).

The defining requirement is that it is **universal**: it emulates the RP2040 chip and
the Sprig's board wiring, then boots a **firmware image** into it — exactly like real
hardware. The stock Sprig firmware is just one image that can run; a **user's own custom
firmware or OS** runs the same way. This is *not* a game player; games are merely one
thing a firmware can do.

The desktop GUI presents a **photo-real "virtual Sprig"** — a faithful render of the
real device with the live screen and the 8 buttons overlaid in their exact positions —
so you click/press inputs and watch the screen respond, in the spirit of the MakeCode
micro:bit simulator.

### 1.1 Goals

- Boot **any** RP2040 UF2 firmware (stock `pico-os.uf2` or custom) through the real boot ROM.
- Faithfully reconstruct the **160×128 display** from the emulated SPI stream.
- Inject the **8 Sprig buttons** (WASD + IJKL) via emulated GPIO.
- Present a **photo-real virtual Sprig** GUI (Tauri) driven by click + keyboard.
- Expose an **MCP server** so an AI (Claude or any MCP client) can screenshot + press buttons + control the device.
- Be **cross-platform** and ship a clean, redistributable artifact.

### 1.2 Non-goals (v1)

- **Audio** (I2S via PIO/DMA) — designed-for, deferred to post-v1.
- **Live USB-CDC serial** (device logs + on-device upload protocol) — deferred; v1 pre-seeds games into emulated flash instead.
- **"Watch the AI play in the same GUI window"** shared-instance bridge — deferred to the immediate next step; in v1 the MCP server runs its own headless emulator instance.
- **Richer symbolic game-state for AI** (only meaningful for stock-engine games; conflicts with the universal/pixels-first philosophy) — out of scope.
- **Mirroring a physically-connected real Sprig** — proven impossible with stock firmware (see §3.3); explicitly out of scope.

---

## 2. Background & key research findings

All findings below were verified against a clone of `github.com/hackclub/sprig` and the
relevant emulator repos (not just marketing pages).

### 2.1 The Sprig hardware

- **MCU:** Raspberry Pi Pico (RP2040), 264 KB SRAM, 2 MB flash; firmware overclocks to 270 MHz at runtime.
- **Display:** ST7735 TFT, **160×128**, RGB565 (16-bit), driven over **SPI0 @ 30 MHz**.
- **Buttons:** 8 tactile, active-low with internal pull-ups, in two diamond clusters (WASD + IJKL).
- **Audio:** I2S PCM (mono, 16-bit, 24 kHz) via the Pico audio lib (PIO + DMA) → MAX98357A amp + speaker.
- **USB:** micro-USB exposing either a USB-CDC serial port (running firmware, VID `0x2E8A`/PID `0x000A`, 115200) or a UF2 mass-storage bootloader (`RPI-RP2`) in BOOTSEL mode.

**Exact pin mapping** (from `firmware/sprig_hal`):

| Function | GPIO |
|---|---|
| Display SCK | GP18 |
| Display MOSI (TX) | GP19 |
| Display RX (MISO) | GP16 |
| Display CS | GP20 |
| Display DC (data/command) | GP22 |
| Display RST | GP26 |
| Button W (up, left cluster) | GP5 |
| Button A (left) | GP6 |
| Button S (down) | GP7 |
| Button D (right) | GP8 |
| Button I (up, right cluster) | GP12 |
| Button J (left) | GP13 |
| Button K (down) | GP14 |
| Button L (right) | GP15 |

(Firmware `button_pins[] = {5,7,6,8,12,14,13,15}` indexed by enum order
`W, S, A, D, I, K, J, L` — the table above is the resolved per-key mapping. Pressed = pin driven **low**.)

### 2.2 The Sprig firmware ("Spade")

- Compiled C (Pico SDK) embedding **JerryScript 2.4.0** to run game JS on-device.
- Distributed as a single UF2: `https://sprig.hackclub.com/pico-os.uf2` (MIT-licensed).
- Games are uploaded over USB-CDC and stored in internal flash at **offset `0xC8000` (800 KB)** with a 6-word magic header `{1337, 42, 69, 420, 420, 1337}`; up to 150 slots.

### 2.3 Critical constraint: no live screen readback from real hardware

The stock firmware drives the display **write-only** (no `RAMRD`, no `spi_read`), keeps
**no framebuffer in RAM** (it computes each pixel on the fly straight to SPI), and the USB
serial link is **text-only** (it carries `console.log`, JS errors, and upload status —
never pixels). Therefore **mirroring a physical Sprig's screen over USB is impossible
without custom firmware.** This is why the project is built as an **emulator**, not a screen-capture tool.

### 2.4 Emulation core decision: rp2040js

`rp2040js` (MIT, by Uri Shaked; the engine behind the Wokwi Pi Pico simulator) is the
chosen core. It was selected over alternatives (Renode's RP2040 fork: frozen, partial SPI;
QEMU: no RP2040 machine; PicoSimulator/picosim: too immature) because it:

- Boots **arbitrary** UF2 firmware through the real RP2040 boot ROM (proven: MicroPython, CircuitPython, Arduino, Pico-SDK C apps — Spade is a Pico-SDK C app).
- Has its CPU validated against real silicon (`gdbdiff`).
- Exposes exactly the two hooks we need:
  - `spi[0].onTransmit` — observe each byte the firmware writes to the display.
  - `gpio[n].setInputValue(bool)` — inject button presses; `gpio[n].outputValue` reads firmware-driven pins (DC/CS/RST).
- Has a **directly-writable 16 MB flash `Uint8Array`** for loading UF2 and pre-seeding games.
- Is MIT-licensed and trivially embeddable in JS environments (Node + browser/webview).

**Known limitations we design around:**
- **Performance:** single-threaded interpreter, fixed ~125 MHz clock model, no JIT. Likely ~15–30 fps for Sprig's full-frame blits on a good laptop; **must be de-risked first** (§9, M0).
- **Flash writing (SSI) is stubbed:** the firmware can't persist runtime flash writes, so we **pre-seed games directly** into the flash array instead of using the on-device upload routine.
- **Audio (PIO/DMA/I2S timing)** is approximate — another reason audio is deferred.

### 2.5 ST7735 decoder

Port the MIT `martysweet/st7735-wokwi-chip` state machine (CASET/RASET/RAMWR + windowed
auto-increment + MADCTL handling) to TypeScript, applying the **three verified
Sprig-specific corrections**:

1. **Little-endian RGB565 reassembly:** `pixel = byte0 | (byte1 << 8)` (Sprig sends the low byte first — opposite of the generic decoder).
2. **BGR color order:** Sprig's `MADCTL = 0x58` (MX | ML | BGR `0x08`); high 5 bits → blue, low 5 bits → red.
3. **Zero panel offset** for the stock panel (keep CASET/RASET-driven and an optional offset config for custom firmware on offset-needing panels).

Other verified constants: `COLMOD = 0x05` (RGB565), `INVOFF` (no inversion), logical
output is **160×128**. Exact orientation/MADCTL mapping is locked down by a **golden-frame
integration test** against the real booted firmware (§8) rather than hand-derived, to
avoid subtle transform bugs.

### 2.6 Virtual-Sprig artwork & exact overlay geometry

The real Sprig is a **bare green PCB** (no faceplate). The MIT-licensed
`hardware/mainboard_PCB/kicad/sprig_console.kicad_pcb` is therefore the authoritative,
vector-accurate front face. The board is **139.70 × 64.77 mm**. Extracted geometry (as
fractions of the board bounding box, origin top-left) for pixel-exact overlay:

- **Screen** (35.04 × 28.03 mm, centered): x ≈ **0.3746 → 0.6254**, y ≈ **0.3506 → 0.7833** (center ≈ (0.500, 0.567)). Nudge ~1–2 mm downward to match the real bezel/ribbon asymmetry.
- **Buttons** (12.7 mm pitch, ~7–8 mm caps), fractional centers:

| Key | Cluster / pos | Fraction (x, y) |
|---|---|---|
| W | left, up | (0.1364, 0.4902) |
| A | left, left | (0.0455, 0.6863) |
| S | left, down | (0.1364, 0.8824) |
| D | left, right | (0.2273, 0.6863) |
| I | right, up | (0.8273, 0.4902) |
| J | right, left | (0.7364, 0.6855) |
| K | right, down | (0.8273, 0.8816) |
| L | right, right | (0.9182, 0.6863) |

**Licensing:** Hack Club hardware/PCB files are **MIT** (redistributable with the notice).
The website **product photos/renders have no stated license** — do **not** ship them
without permission. The chassis art is generated from the MIT PCB sources.

---

## 3. Architecture

A single TypeScript monorepo. The emulation logic lives in one **environment-agnostic core
package** consumed by two faces: the Tauri GUI (runs the core in a Web Worker inside the
webview) and the Node MCP server (runs the core headlessly).

```
sprigscope/
├─ packages/
│  └─ core/                     # the emulator brain — runs in BOTH webview and Node
│     ├─ emulator/              #   rp2040js integration, boot, run loop
│     ├─ board/
│     │  ├─ pinout.ts           #   Sprig GPIO/SPI pin constants
│     │  ├─ st7735-decoder.ts   #   SPI bytes + DC pin → 160×128 RGBA framebuffer
│     │  └─ buttons.ts          #   key → GPIO injection (active-low)
│     ├─ flash.ts               #   load UF2; pre-seed game at 0xC8000 + magic header
│     ├─ device.ts              #   SprigDevice control API (the public interface)
│     └─ platform/              #   env adapters (ImageData/PNG: browser vs Node)
├─ apps/
│  ├─ desktop/                  # Tauri app (the GUI you watch)
│  │  ├─ src-tauri/             #   Rust shell
│  │  └─ src/                   #   Vite frontend: virtual-Sprig skin + canvas + input
│  └─ mcp/                      # Node MCP server (the AI's eyes & hands)
├─ firmware/                    # bundled stock pico-os.uf2 (MIT) + "bring your own UF2" docs
├─ assets/                      # generated PCB chassis SVG/PNG + overlay coordinate map
└─ docs/                        # this spec, attributions, build/run docs
```

### 3.1 The `SprigDevice` control API (core public interface)

Both faces talk to the core only through this interface, so behavior is identical:

```ts
interface SprigDevice {
  loadFirmware(uf2: Uint8Array, name?: string): void;   // load + boot any UF2
  loadGame(source: Uint8Array, slot?: number): void;    // pre-seed flash at 0xC8000
  reset(): void;
  start(): void;
  pause(): void;
  step(cycles?: number): void;                          // single-step for debugging
  setButton(btn: Button, down: boolean): void;
  pressButton(btn: Button, holdMs?: number): void;      // convenience press+release
  getFramebuffer(): Framebuffer;                        // 160×128 RGBA snapshot
  onFrame(cb: (fb: Framebuffer) => void): Unsubscribe;  // fires on end-of-frame
  getStatus(): DeviceStatus;                            // running, fps, realtimeRatio, firmwareName
}
type Button = 'w'|'a'|'s'|'d'|'i'|'j'|'k'|'l';
```

### 3.2 Data flow

```
firmware UF2 ─▶ flash[] ─▶ rp2040js CPU executes
                                  │ writes SPI0 bytes + drives DC/CS/RST GPIO
                                  ▼
                        ST7735 decoder ─▶ 160×128 RGBA framebuffer ─▶ onFrame
                                                                        ├─▶ GUI canvas (Tauri webview)
                                                                        └─▶ PNG encode ─▶ MCP get_screen
input (click / key / MCP press) ─▶ setButton ─▶ gpio[n].setInputValue ─▶ firmware reads it
```

### 3.3 AI ↔ emulator topology (v1)

The MCP server instantiates and owns its **own headless `SprigDevice`** (no GUI required,
no coupling). This is robust and decoupled. The "human + AI watch one shared instance via a
local bridge" mode is designed-for (the core API is identical in both contexts) and is the
immediate next step after v1.

---

## 4. Component design

### 4.1 Emulation core (`packages/core/emulator`)

Thin wrapper over `rp2040js`: construct the MCU, `loadBootrom(bootromB1)`, load firmware
into `mcu.flash`, set PC to the XIP base, and drive `simulator.execute()` (its cooperative
batched loop). Owns reset and the run/pause/step controls. Exposes the SPI/GPIO hooks to the
board model.

### 4.2 Sprig board model (`packages/core/board`)

- **`pinout.ts`** — the constants from §2.1.
- **`st7735-decoder.ts`** — fed `(byte, dcHigh)` pairs from `spi[0].onTransmit` (reading
  `gpio[DC].outputValue` at each byte) and reset on `gpio[RST]` low. Maintains the address
  window, write pointer (auto-increment + wrap), and a 160×128 RGBA buffer; applies the
  three corrections (§2.5). Completes each SPI transfer **synchronously** (`completeTransmit(0)`)
  for speed (we don't need MISO). Emits an **end-of-frame** signal on full-screen RAMWR
  completion / SPI idle (~16 ms) to avoid tearing in display + AI capture. Never throws on a
  malformed/unknown stream.
- **`buttons.ts`** — maps a `Button` to its GPIO and drives `setInputValue(false)` on press,
  `true` (idle, pull-up) on release.

### 4.3 Flash / firmware / game loading (`packages/core/flash.ts`)

- **UF2 load:** decode UF2 blocks and write payloads into `mcu.flash` at their target
  addresses (same primitive rp2040js demos use).
- **Game pre-seed:** write the game source (with the 6-word magic header) into `mcu.flash`
  at `0xC8000` so the booted stock firmware finds it as if uploaded — bypassing USB and the
  stubbed SSI write path.

### 4.4 Runtime / control (`packages/core/device.ts`)

Implements `SprigDevice` (§3.1). Owns the framebuffer subscription, status/metrics (fps,
realtime ratio), and lifecycle. In the GUI it runs inside a Web Worker; in the MCP server it
runs in-process (the batched loop yields cooperatively).

### 4.5 GUI — the virtual Sprig (`apps/desktop`)

- **Stack:** Tauri (Rust shell + system webview) + Vite + **Svelte** frontend (chosen for
  reactive control state; the screen is a plain `<canvas>`). `rp2040js`/core run in a
  **Web Worker**; frames `postMessage`'d to the main thread.
- **Chassis:** the generated PCB SVG/PNG (from `assets/`, derived from the MIT KiCad board),
  scaled responsively.
- **Screen overlay:** a `<canvas>` positioned at the §2.6 screen fraction, drawn
  nearest-neighbor (crisp pixels), 5:4.
- **Button overlay:** 8 hotspots at the §2.6 fractional centers; click or keyboard drives
  `setButton`; visual press feedback + live key-state highlight.
- **Controls:** Load firmware… / Load game… / Reset / Pause / Step / Screenshot; status line
  (firmware name, fps, realtime ratio).
- **Calibration:** screen nudge + key↔switch verification against the PCB silkscreen letters
  is a build task, locked by the golden-frame test.

### 4.6 MCP server (`apps/mcp`)

A stdio MCP server wrapping a headless `SprigDevice`. Tools:

| Tool | Args | Returns |
|---|---|---|
| `get_screen` | — | PNG (base64) of current frame |
| `press_button` | `button`, `hold_ms?` | ack |
| `set_button` | `button`, `down` | ack |
| `reset` | — | ack |
| `load_firmware` | `path` | ack / status |
| `load_game` | `path`, `slot?` | ack / status |
| `wait_frames` | `n` | ack after n frames |
| `get_status` | — | `{running, fps, firmwareName, ...}` |

PNG encoding uses a light pure-JS encoder (e.g. `pngjs`) over the RGBA framebuffer. Invalid
args / no-firmware-loaded return structured MCP errors.

---

## 5. Error handling

- **Emulator isolation:** in the GUI the emulator runs in a Web Worker, so a firmware
  hard-fault or infinite loop can't freeze the UI; a watchdog + **Reset** recovers.
- **Bad firmware:** invalid/zero-block UF2 → clear error, no crash.
- **Decoder robustness:** unknown ST7735 commands and partial/odd streams are ignored; the
  decoder never throws.
- **MCP:** invalid tool args, unknown button, or no-firmware-loaded → structured errors.
- **Performance visibility:** the status line / `get_status` surfaces the real-time ratio so
  slow runs are obvious rather than silently wrong.

---

## 6. Testing strategy

- **Unit (highest value, TDD):** feed `st7735-decoder` synthetic SPI streams and assert exact
  framebuffer pixels — covering CASET/RASET windowing, auto-increment + wrap, **little-endian**
  reassembly, and **BGR** order. Flash pre-seed offset + magic-header tests.
- **Integration / golden-frame:** boot the bundled stock `pico-os.uf2` headless, run, capture
  a frame, and assert it matches a committed golden image of the real boot screen (this is
  what validates the end-to-end CPU→SPI→decoder→framebuffer path and the orientation/MADCTL
  mapping). The emulator is deterministic for a given firmware + input sequence, so this is an
  exact-match assertion. Inject a button press and assert the screen changes.
- **MCP:** tool-contract tests (shape of `get_screen` PNG, button acks, error cases).
- **Performance:** a benchmark harness reporting fps for the stock firmware — the M0 spike
  becomes a regression guard.

---

## 7. Project structure & tooling

- **Monorepo:** pnpm workspaces; TypeScript throughout; Vitest for tests.
- **Core** is platform-agnostic with a `platform/` adapter layer (browser uses native
  `ImageData`/canvas; Node uses an `ImageData` shim + `pngjs`).
- **Tauri** app under `apps/desktop`; **Node MCP** under `apps/mcp`; both depend on
  `packages/core`.
- **Asset generation:** a documented one-time step renders the chassis from the KiCad PCB
  (`kicad-cli pcb export svg`, or hand-traced from the extracted coordinates) into `assets/`.

---

## 8. Build milestones

(Detailed task breakdown comes from the writing-plans step; this is the sequence.)

- **M0 — Feasibility/perf spike (de-risk first):** boot stock `pico-os.uf2` headless in Node,
  decode one frame to PNG, confirm it's the real boot screen, **measure fps**. Decide on
  worker/throttle strategy from the numbers.
- **M1 — Core library:** board model + ST7735 decoder (unit-tested), buttons, flash/UF2/game
  pre-seed, `SprigDevice` runtime, golden-frame integration test.
- **M2 — MCP server:** tools, PNG encoding, contract tests.
- **M3 — Tauri GUI:** virtual-Sprig PCB chassis, exact screen + button overlays, click +
  keyboard input, controls, status line.
- **M4 — Polish & packaging:** game-loading UX, firmware picker, attributions/licenses,
  cross-platform builds (Win/macOS/Linux).

---

## 9. Key risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Emulator too slow for interactive fps | Medium | **M0 spike first**; synchronous SPI completion; Web Worker; throttled present; accept 15–30 fps target |
| ST7735 orientation/color subtly wrong | Medium | Port proven decoder + lock with golden-frame test against real boot screen |
| rp2040js flash-write (SSI) stub breaks on-device upload | High (known) | Pre-seed games directly into flash; don't rely on device upload routine |
| Custom firmware uses unimplemented peripheral | Low–Med | Document supported peripheral set; most display/button firmware uses SPI+GPIO which are solid |
| Shipping unlicensed Hack Club photos | — | Build chassis from MIT PCB sources; pursue permission only if a glossy skin is later wanted |

---

## 10. Licensing & attribution

Bundle and honor MIT notices for: **rp2040js** (Uri Shaked), **Hack Club Sprig** engine +
hardware + `pico-os.uf2` (Hack Club), and the **ST7735 wokwi chip** decoder (martysweet).
Do **not** redistribute Hack Club's website product photos/renders without permission. Ship a
clear attributions/licenses page.

---

## 11. Open questions / future work

- **Post-v1:** audio (I2S/PIO), live USB-CDC serial (logs + on-device upload), the shared
  "watch the AI play in the GUI" bridge.
- **Maybe:** save/load emulator snapshots; a built-in game library; a simple on-device
  firmware-build helper for custom-OS developers; optional glossy product-photo skin (pending permission).
