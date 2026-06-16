# SprigScope — Universal Sprig Emulator: Design Spec

- **Date:** 2026-06-16
- **Status:** Approved (rev 2 — hybrid, engine-first, after the rp2040js boot spike)
- **Working title:** SprigScope (rename freely)

---

## 1. Overview

SprigScope is a cross-platform (Windows / macOS / Linux) desktop app that puts a
**virtual Sprig on your PC** — a photo-real, interactive replica of the handheld whose
screen and 8 buttons behave like the real device — so that:

1. You can **run and see Sprig content on your PC without owning a Sprig**, and
2. An **AI can read the screen and drive the inputs autonomously** (via an MCP server).

### 1.1 Two backends behind one device interface

A boot-feasibility spike (see §2.4) showed the cleanest path is a **hybrid** with two
interchangeable backends behind a single `SprigDevice` interface (160×128 framebuffer out,
button input in). The GUI, the photo-real preview, and the MCP server all sit on top of
that interface and don't care which backend is running.

- **Engine backend (v1, ships first):** runs **Sprig game JS** via the official
  open-source `sprig` engine. Verified working headless; pixel-accurate; exposes clean game
  state; fast and reliable. This is the MakeCode-micro:bit-simulator equivalent (MakeCode is
  itself a high-level simulator, not a chip emulator).
- **Chip backend (staged, post-v1):** runs **arbitrary RP2040 firmware** (a custom OS,
  your own firmware) on the `rp2040js` hardware emulator. This delivers the "universal"
  goal. The spike proved the approach is viable but needs incremental emulator work
  (peripheral patching) — captured in §12 as a roadmap, not v1 scope.

This satisfies both stated goals: ship the working virtual Sprig + AI now, and keep true
"run any firmware" universality on the roadmap with a known path.

### 1.2 Goals

- A **photo-real virtual Sprig** GUI (Tauri) driven by click + keyboard, screen responding live.
- **Pixel-accurate 160×128** rendering of Sprig content.
- An **MCP server** so an AI (Claude or any MCP client) can screenshot + press buttons + control the device.
- A clean **`SprigDevice` interface** so the chip backend can drop in later without touching GUI/MCP.
- **Cross-platform**, redistributable.

### 1.3 Non-goals (v1)

- **Chip backend / custom-firmware mode** — designed-for via the interface, built post-v1 (§12).
- **Audio** — the engine's `playTune` is stubbed headless; deferred.
- **"Watch the AI play in the same GUI window"** shared-instance bridge — deferred; in v1 the MCP server runs its own headless device.
- **Mirroring a physically-connected real Sprig** — proven impossible with stock firmware (§2.4); out of scope.

---

## 2. Background & research findings

All findings verified against a clone of `github.com/hackclub/sprig` and by running real spikes.

### 2.1 The Sprig hardware (for the GUI replica + the future chip backend)

- **MCU:** Raspberry Pi Pico (RP2040), 264 KB SRAM, 2 MB flash; firmware overclocks to 270 MHz.
- **Display:** ST7735 TFT, **160×128**, RGB565, over SPI0 @ 30 MHz.
- **Buttons:** 8 tactile, active-low, two diamond clusters (WASD + IJKL). GPIO map: W=GP5, A=GP6, S=GP7, D=GP8, I=GP12, J=GP13, K=GP14, L=GP15.
- **Audio:** I2S PCM via PIO/DMA → MAX98357A + speaker.
- The real device is a **bare green PCB** (no faceplate); the MIT KiCad PCB is the authoritative artwork for the GUI replica.

### 2.2 The Sprig software stack

- **Stock firmware "Spade":** C (Pico SDK) embedding JerryScript 2.4.0 to run game JS on-device; shipped as `pico-os.uf2` (MIT). Relevant only to the future chip backend.
- **The `sprig` engine (npm `sprig`, v1.1.3, MIT):** pure TypeScript, three entry points — `sprig/base` (headless logic + `palette`, `font`, `composeText`), `sprig/image-data` (headless renderer `imageDataEngine`), `sprig/web` (browser canvas engine). **This is the v1 backend.**

### 2.3 Engine backend — verified by spike (this is what we build on)

Ran `sprig@1.1.3` headless in Node with a one-class `ImageData` shim (the engine's only
browser dependency). Confirmed:

- `imageDataEngine()` runs a game with **no DOM / no native deps**.
- Load a game: `new Function(...Object.keys(game.api), source)(...Object.values(game.api))` — game source is plain JS calling the API as globals.
- `game.render()` → an `ImageData` of size **mapWidth*16 × mapHeight*16** (a full 10×8 map → exactly **160×128**). Palette colors come out correct in RGBA order (e.g. wall grey `(145,151,156)`, red `(235,44,71)`).
- `game.state` exposes `{ sprites, dimensions, legend, texts, solids, pushable, background }` — clean, token-cheap data for the AI.
- Input: `game.button('w'|'a'|'s'|'d'|'i'|'j'|'k'|'l')` runs `onInput`/`afterInput` synchronously (verified: a player sprite moved on `button('d')`).
- **`render()` does NOT draw text** — `state.texts` is populated but text is not rasterized into the frame. The core must render text itself using `composeText(state.texts)` + `font` (8×8 glyphs) + `palette` from `sprig/base`.
- `setTimeout`/`setInterval` in the api map to real host timers, so animated (non-turn-based) games advance in real time when the event loop runs.

### 2.4 Chip backend — spike findings (informs §12, not v1)

Ran `rp2040js@1.3.2` headless booting the stock `pico-os.uf2`:

- **API fully verified working:** `new RP2040()`, `loadBootrom(bootromB1)` (bootrom is **not** in npm — vendor `demo/bootrom.ts` from the rp2040js repo, MIT), UF2 load via `uf2`'s `decodeBlock` + `mcu.flash.set(payload, addr-0x10000000)`, bounded stepping via `core.executeInstruction()` + `clock.tick()`, SPI tap `spi[0].onTransmit` + `gpio[n].outputValue` (read DC=GP22), input `gpio[n].setInputValue(false)`.
- **Display pipeline sound:** firmware emits the complete, correct ST7735 init sequence (21 commands) — so a SPI→160×128 decoder (little-endian RGB565, MADCTL 0x58/BGR) is the right approach.
- **BUT stock firmware does not cleanly boot:** it hangs on rp2040js's unimplemented peripherals — first a boot-ROM **flash/SSI** helper (a spike patch got past it), then again deeper (PC `0x1000f6ca`, almost certainly the **ROSC-based RNG**). Making it run = patching the emulator's peripheral coverage, peripheral by peripheral (open-ended but tractable).
- **Performance:** ~12.6M instr/s ≈ **~0.1× real-time** on a low-end laptop; tens of FPS for full-frame blits. Acceptable but not great; faster on desktops.
- **No live readback from real hardware** (write-only display, text-only USB serial) → physical-device mirroring is impossible; emulation is the only route.

### 2.5 Color palette (for text rendering + the GUI)

`sprig/base` `palette`, char → RGB: `0`#000000, `L`#495057, `1`#91979C, `2`#F8F9FA,
`3`#EB2C47, `C`#8B412E, `7`#19B1F8, `5`#1315E0, `6`#FEE610, `F`#958C32, `4`#2DE13E,
`D`#1D9410, `8`#F56DBB, `H`#AA3AC5, `9`#F57117, `.`=transparent.

### 2.6 Virtual-Sprig artwork & exact overlay geometry (GUI)

The real Sprig is a bare green PCB; the MIT `hardware/mainboard_PCB/kicad/sprig_console.kicad_pcb`
is the authoritative front face. Board = 139.70 × 64.77 mm. Overlay positions as fractions
of the board bounding box (origin top-left):

- **Screen** (35.04 × 28.03 mm, centered): x ≈ **0.3746 → 0.6254**, y ≈ **0.3506 → 0.7833** (center ≈ (0.500, 0.567); nudge ~1–2 mm down for bezel/ribbon asymmetry).
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

**Licensing:** Hack Club hardware/engine files are **MIT** (redistributable with notice). The
website **product photos have no stated license** — do not ship them without permission; build
the chassis from the MIT PCB geometry.

---

## 3. Architecture

Single TypeScript monorepo (npm workspaces). The `SprigDevice` interface is the seam; the engine
backend implements it for v1; the GUI (Tauri webview, runs the device in a Web Worker) and
the MCP server (Node, headless) are both clients.

```
sprigscope/
├─ packages/
│  └─ core/                       # backend-agnostic device + the engine backend
│     ├─ device.ts                #   SprigDevice interface + Button/Framebuffer/DeviceStatus types
│     ├─ backends/
│     │  └─ engine-backend.ts     #   sprig imageDataEngine: load game, tick, raw frame + state
│     ├─ render/
│     │  ├─ scale.ts              #   map-sized ImageData → 160×128 (scale-to-fit, letterbox)
│     │  └─ text.ts               #   composeText + font + palette → 160×128 text overlay
│     ├─ framebuffer.ts           #   160×128 RGBA buffer + compositing + PNG-ready bytes
│     └─ platform/imagedata.ts    #   ImageData shim (Node) / native (browser)
├─ apps/
│  ├─ mcp/                        # Node MCP server over a headless SprigDevice
│  └─ desktop/                    # Tauri + Svelte photo-real virtual Sprig (post-core plan)
├─ assets/                        # PCB-derived chassis SVG + overlay coordinate map
└─ docs/                          # this spec, plans, attributions
```

### 3.1 The `SprigDevice` interface (the seam)

```ts
type Button = 'w'|'a'|'s'|'d'|'i'|'j'|'k'|'l';
interface Framebuffer { width: 160; height: 128; data: Uint8ClampedArray; } // RGBA
interface DeviceStatus { running: boolean; loaded: boolean; fps: number; backend: 'engine'|'rp2040'; title?: string; }

interface SprigDevice {
  loadGame(source: string): void;          // engine backend (game JS)
  reset(): void;
  setButton(btn: Button, down: boolean): void;
  pressButton(btn: Button): void;          // one discrete press (one tick)
  getFramebuffer(): Framebuffer;           // current 160×128 RGBA
  onFrame(cb: (fb: Framebuffer) => void): () => void;
  getStatus(): DeviceStatus;
  // staged (chip backend): loadFirmware(uf2: Uint8Array)
}
```

The engine's input model is discrete presses (`onInput` fires per press), so `pressButton`
and `setButton(btn,true)` both translate to one `game.button(key)` tick. The GUI turns a
held key into repeated presses (matching the web player's keydown-repeat behavior).

### 3.2 Data flow

```
game JS ─▶ imageDataEngine ─▶ game.render() (map*16 ImageData) ─▶ scale→160×128 ─┐
                           └▶ game.state.texts ─▶ composeText+font ─▶ text overlay ┼▶ 160×128 framebuffer ─▶ onFrame
input (click / key / MCP) ─▶ setButton/pressButton ─▶ game.button(key)            │      ├─▶ GUI canvas
                                                                                   │      └─▶ PNG ─▶ MCP get_screen
```

---

## 4. Component design

### 4.1 Engine backend (`packages/core/backends/engine-backend.ts`)

- Installs the `ImageData` shim (via `platform/imagedata`), constructs `imageDataEngine()`.
- `loadGame(source)`: `new Function(...apiKeys, source)(...apiValues)` inside a try/catch; a
  game error surfaces as a structured load error, never a crash. Re-instantiates the engine on
  reload so state is clean.
- `tick`/frame production: read `game.render()` + `game.state`, build the 160×128 framebuffer
  (§4.2), emit via `onFrame`. The GUI drives this on a render loop (~30 fps); the MCP server
  pulls on demand.
- `pressButton(btn)` → `game.button(btn)`.

### 4.2 Rendering to 160×128 (`render/scale.ts`, `render/text.ts`, `framebuffer.ts`)

- **Scale-to-fit:** the engine renders at `mapW*16 × mapH*16`. Composite onto a 160×128
  white buffer with `scale = min(160/(mapW*16), 128/(mapH*16))`, nearest-neighbor, centered
  (letterboxed) — replicating the web player / device behavior. A full 10×8 map maps 1:1.
- **Text overlay:** `composeText(state.texts)` → a 20×16 grid of `{char, color}`; rasterize
  each glyph from `font` (8×8, 1 bit/px) at 8 px cells → a 160×128 overlay; composite on top
  of the scaled game frame (text is full-screen, not scaled with the map).
- **Framebuffer:** a 160×128 RGBA `Uint8ClampedArray`; helpers for snapshot + PNG bytes.

### 4.3 MCP server (`apps/mcp`)

Stdio MCP server wrapping a headless `SprigDevice`. Tools: `get_screen` (PNG base64),
`press_button(button)`, `set_button(button, down)`, `load_game(path)`, `reset`, `get_status`.
PNG via a light pure-JS encoder (`pngjs`). Invalid args / no-game-loaded → structured errors.

### 4.4 GUI — the photo-real virtual Sprig (`apps/desktop`, separate plan)

Tauri (Rust shell + webview) + Vite + Svelte. Runs the core in a Web Worker; renders the
framebuffer to a `<canvas>` placed at the §2.6 screen rect on the **PCB-derived chassis**;
8 clickable button hotspots at the §2.6 coordinates; keyboard input (with key-repeat);
controls (Load game / Reset / Screenshot); status line. Chassis asset is generated from the
MIT PCB geometry (upgradeable to a KiCad render or licensed photo later — overlay coords are
already exact).

---

## 5. Error handling

- Game JS errors (parse/run) → structured load/runtime errors; the device stays alive, the
  frame shows last-good or a clear error state.
- GUI runs the device in a Web Worker so a runaway game can't freeze the UI; Reset recovers.
- MCP: invalid tool args / no-game-loaded / unknown button → structured MCP errors.

## 6. Testing

- **Unit (TDD):** `scale.ts` (letterbox math on known sizes), `text.ts` (a known string →
  expected lit pixels), framebuffer compositing.
- **Golden-frame:** load a fixed tiny game, render, assert the 160×128 framebuffer matches a
  committed golden image (the engine is deterministic). Assert a button press changes the frame.
- **MCP:** tool-contract tests (PNG shape, button acks, error cases).

## 7. Project structure & tooling

npm workspaces (npm 11 present; pnpm not installed); TypeScript; Vitest. `packages/core` is platform-agnostic via
`platform/imagedata` (Node shim vs browser native). `apps/mcp` (Node) and `apps/desktop`
(Tauri) depend on `core`.

## 8. Milestones (engine-first)

- **M1 — Core engine backend:** scaffold monorepo; `SprigDevice` + `EngineBackend`; render
  (scale + text) → 160×128; input; full test suite incl. golden-frame. *(This plan.)*
- **M2 — MCP server:** tools over a headless device; PNG; contract tests.
- **M3 — Tauri GUI:** photo-real virtual Sprig, overlays, input, controls.
- **M4 — Polish:** example games, attributions, cross-platform packaging.
- **M5+ — Chip backend (universal mode):** see §12.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Text rendering diverges from device | Reuse `sprig`'s own `composeText` + `font` + `palette`; lock with golden-frame test |
| Scale/letterbox not matching web player | Replicate web engine's exact scale formula; golden-frame on a sub-full map |
| Running arbitrary game JS (`new Function`) | Local-only, same trust model as the official editor; wrap in try/catch; document |
| Chip backend turns out deep (universal mode) | It's staged/optional; v1 value doesn't depend on it; spike already mapped the next fixes |

## 10. Licensing & attribution

Bundle/honor MIT notices for `sprig` (Hack Club) and, when the chip backend lands, `rp2040js`
(Uri Shaked) + the ST7735 decoder (martysweet). Do not ship Hack Club product photos without
permission. Ship an attributions page.

## 11. Open questions

- Held-button semantics: confirm key-repeat rate for the GUI to match the device feel.
- Whether to expose `game.state` (symbolic) to the AI in addition to the screen PNG (cheap, engine-only — likely yes in M2).

## 12. Future work — chip backend (the "universal" mode)

Roadmap from the §2.4 spike, behind the same `SprigDevice` interface (`loadFirmware(uf2)`):

1. Vendor `rp2040js` + `bootromB1`; boot `pico-os.uf2`.
2. Patch peripheral gaps so it renders: a flash-emulating **SSI** + **IO_QSPI/PADS_QSPI**
   shims (boot-ROM flash helpers), then **ROSC** (RNG), iterating until RAMWR pixels appear.
3. Port the **ST7735 SPI→framebuffer decoder** (little-endian RGB565, MADCTL 0x58/BGR, zero
   offset) feeding the same 160×128 framebuffer.
4. Map buttons to GPIO injection; optionally pre-seed a game into flash at `0xC8000`.
5. Run the emulator in a worker; throttle present (perf ~0.1× real-time).

When this lands, the GUI/MCP get a "load firmware" path with zero changes to their code.
