# SprigScope Engine-Backend Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@sprigscope/core` — a backend-agnostic `SprigDevice` plus an **engine backend** that loads Sprig game JS, renders a pixel-accurate **160×128** framebuffer (scale-to-fit + text overlay), and accepts button input. Fully unit-tested. This is the foundation both the MCP server and the Tauri GUI build on.

**Architecture:** A `SprigDevice` interface (160×128 RGBA frame out, button in) is the seam. `EngineBackend` implements it using the official MIT `sprig` npm engine (`imageDataEngine`, verified headless). Rendering matches the `sprig` web player exactly: `game.render()` → scale-to-fit onto 160×128 → composite a text overlay built from `composeText` + `font` + `palette`.

**Tech Stack:** TypeScript (ESM, `moduleResolution: Bundler`), npm workspaces, Vitest. Dependency: `sprig@^1.1.3` (pure JS, MIT). The engine's only browser dependency is `ImageData`, which we shim in Node.

**Scope:** Engine backend core only. The MCP server and the Tauri GUI are separate follow-on plans. The rp2040js "custom firmware" chip backend is staged (spec §12).

**Key verified facts (from spikes):**
- `import { imageDataEngine } from 'sprig/image-data'` runs headless with only an `ImageData` shim.
- Load a game: `new Function(...Object.keys(game.api), source)(...Object.values(game.api))`.
- `game.render()` → `ImageData` of `mapW*16 × mapH*16` (a 10×8 map → exactly 160×128); palette colors in RGBA order (red `3` = `(235,44,71)`, grey wall `1` = `(145,151,156)`).
- `game.state.texts` is populated but **`render()` does not draw text** — we render it.
- `game.button('w'|'a'|'s'|'d'|'i'|'j'|'k'|'l')` runs `onInput`/`afterInput` synchronously.
- `sprig/base` exports `composeText(texts)`, `font` (glyphs indexed by `char.charCodeAt(0)*8`), `palette`.

---

## File Structure

```
sprigscope/                         (repo root — already a git repo)
├─ package.json                     # npm workspaces root (Task 1)
├─ tsconfig.base.json               # shared TS config (Task 1)
└─ packages/core/
   ├─ package.json                  # @sprigscope/core (Task 1)
   ├─ tsconfig.json                 # extends base (Task 1)
   ├─ vitest.config.ts              # Task 1
   ├─ src/
   │  ├─ device.ts                  # SprigDevice interface + Button/Framebuffer/DeviceStatus (Task 2)
   │  ├─ platform/imagedata.ts      # ImageData shim (Node) (Task 3)
   │  ├─ framebuffer.ts             # SCREEN_W/H, blankScreen(), compositeOver() (Task 4)
   │  ├─ render/scale.ts            # scaleToScreen(src) -> 160×128 RGBA (Task 5)
   │  ├─ render/text.ts             # renderTextOverlay(texts) -> 160×128 RGBA (Task 6)
   │  ├─ backends/engine-backend.ts # EngineBackend implements SprigDevice (Task 7)
   │  └─ index.ts                   # public exports (Task 8)
   └─ test/
      ├─ framebuffer.test.ts        # Task 4
      ├─ scale.test.ts             # Task 5
      ├─ text.test.ts              # Task 6
      └─ engine-backend.test.ts    # Task 7, 8
```

Each file has one responsibility: `device.ts` = the contract; `framebuffer.ts` = the 160×128 buffer primitives; `render/*` = pure transforms (easy to unit-test); `backends/engine-backend.ts` = wiring the `sprig` engine to the contract.

---

## Task 1: Scaffold the npm workspace + core package

**Files:**
- Create: `package.json`, `tsconfig.base.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/test/smoke.test.ts` (temporary)

- [ ] **Step 1: Create the workspace root `package.json`**

```json
{
  "name": "sprigscope",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

(`"lib": ["...","DOM"]` gives us the `ImageData`/`Uint8ClampedArray` types even though we run in Node; we shim `ImageData` at runtime.)

- [ ] **Step 3: Create `packages/core/package.json`**

```json
{
  "name": "@sprigscope/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Create `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Install dependencies** (from the repo root)

Run:
```bash
npm install -w @sprigscope/core sprig
npm install -w @sprigscope/core -D typescript vitest @types/node
```
Expected: installs succeed; `sprig` appears under `packages/core` dependencies (version ~1.1.3). `node_modules` is hoisted to the repo root.

- [ ] **Step 7: Add a temporary smoke test** `packages/core/test/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs the test runner', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Run the smoke test**

Run: `npm test -w @sprigscope/core`
Expected: PASS (1 test passed).

- [ ] **Step 9: Delete the smoke test**

Run: `rm packages/core/test/smoke.test.ts`

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.base.json packages/core/package.json packages/core/tsconfig.json packages/core/vitest.config.ts package-lock.json
git commit -m "chore: scaffold npm workspace and @sprigscope/core package"
```

---

## Task 2: Define the `SprigDevice` contract

**Files:**
- Create: `packages/core/src/device.ts`
- Test: (type-only; exercised via later tasks)

- [ ] **Step 1: Write `packages/core/src/device.ts`**

```ts
/** The 8 Sprig buttons (two diamond clusters: WASD + IJKL). */
export type Button = 'w' | 'a' | 's' | 'd' | 'i' | 'j' | 'k' | 'l';

export const BUTTONS: readonly Button[] = ['w', 'a', 's', 'd', 'i', 'j', 'k', 'l'];

/** A rendered Sprig screen: always 160×128 RGBA (4 bytes/pixel, row-major). */
export interface Framebuffer {
  readonly width: 160;
  readonly height: 128;
  readonly data: Uint8ClampedArray; // length 160*128*4
}

export interface DeviceStatus {
  /** True once content is loaded and the device is producing frames. */
  running: boolean;
  loaded: boolean;
  backend: 'engine' | 'rp2040';
  /** Optional human title (e.g. game name). */
  title?: string;
}

/**
 * Backend-agnostic Sprig device. The engine backend (this plan) and the future
 * rp2040 chip backend both implement this; the GUI and MCP server depend only on it.
 */
export interface SprigDevice {
  /** Load Sprig game JS source and start producing frames. Throws on load error. */
  loadGame(source: string, title?: string): void;
  /** Re-load the last-loaded content from scratch (clean state). */
  reset(): void;
  /** Press-and-hold semantics. The engine backend treats any `down=true` as one press. */
  setButton(btn: Button, down: boolean): void;
  /** One discrete press (one input tick). */
  pressButton(btn: Button): void;
  /** Snapshot the current 160×128 frame. */
  getFramebuffer(): Framebuffer;
  /** Subscribe to frames (fired after load and after each input). Returns an unsubscribe fn. */
  onFrame(cb: (fb: Framebuffer) => void): () => void;
  getStatus(): DeviceStatus;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w @sprigscope/core`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/device.ts
git commit -m "feat(core): add SprigDevice interface and shared types"
```

---

## Task 3: ImageData shim for Node

**Files:**
- Create: `packages/core/src/platform/imagedata.ts`
- Test: `packages/core/test/imagedata.test.ts`

- [ ] **Step 1: Write the failing test** `packages/core/test/imagedata.test.ts`

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @sprigscope/core`
Expected: FAIL ("Failed to resolve import ... imagedata" / module not found).

- [ ] **Step 3: Write `packages/core/src/platform/imagedata.ts`**

```ts
/**
 * The `sprig` engine's only browser dependency is the `ImageData` constructor.
 * In Node it doesn't exist, so install a minimal shim. In a browser/webview the
 * native ImageData is used unchanged.
 */
class NodeImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
    if (a instanceof Uint8ClampedArray) {
      this.data = a;
      this.width = b;
      this.height = c as number;
    } else {
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    }
  }
}

export function installImageDataShim(): void {
  const g = globalThis as { ImageData?: unknown };
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = NodeImageData as unknown as typeof ImageData;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @sprigscope/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/platform/imagedata.ts packages/core/test/imagedata.test.ts
git commit -m "feat(core): add Node ImageData shim for the sprig engine"
```

---

## Task 4: Framebuffer primitives

**Files:**
- Create: `packages/core/src/framebuffer.ts`
- Test: `packages/core/test/framebuffer.test.ts`

- [ ] **Step 1: Write the failing test** `packages/core/test/framebuffer.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { SCREEN_W, SCREEN_H, blankScreen, compositeOver } from '../src/framebuffer';

describe('framebuffer', () => {
  it('blankScreen is opaque white and the right size', () => {
    const fb = blankScreen();
    expect(fb.length).toBe(SCREEN_W * SCREEN_H * 4);
    expect([fb[0], fb[1], fb[2], fb[3]]).toEqual([255, 255, 255, 255]);
    const last = fb.length - 4;
    expect([fb[last], fb[last + 1], fb[last + 2], fb[last + 3]]).toEqual([255, 255, 255, 255]);
  });

  it('compositeOver replaces base pixels only where overlay alpha != 0', () => {
    const base = blankScreen();
    const overlay = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4); // all transparent
    // light pixel 0 red, opaque
    overlay[0] = 255; overlay[1] = 0; overlay[2] = 0; overlay[3] = 255;
    const out = compositeOver(base, overlay);
    expect([out[0], out[1], out[2], out[3]]).toEqual([255, 0, 0, 255]); // replaced
    expect([out[4], out[5], out[6], out[7]]).toEqual([255, 255, 255, 255]); // untouched white
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @sprigscope/core`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `packages/core/src/framebuffer.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @sprigscope/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/framebuffer.ts packages/core/test/framebuffer.test.ts
git commit -m "feat(core): add framebuffer primitives (blank, composite)"
```

---

## Task 5: Scale-to-fit renderer

Replicates the `sprig` web player's scaling: the engine renders at `mapW*16 × mapH*16`; we scale it to fit 160×128 with `scale = min(160/srcW, 128/srcH)`, nearest-neighbor, centered (letterboxed on white). A full 10×8 map (160×128) maps 1:1.

**Files:**
- Create: `packages/core/src/render/scale.ts`
- Test: `packages/core/test/scale.test.ts`

- [ ] **Step 1: Write the failing test** `packages/core/test/scale.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { scaleToScreen } from '../src/render/scale';
import { SCREEN_W, SCREEN_H } from '../src/framebuffer';

// helper: make an ImageData-like source of solid color
function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3];
  }
  return { width: w, height: h, data };
}
const px = (d: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * SCREEN_W + x) * 4;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
};

describe('scaleToScreen', () => {
  it('passes a 160×128 source through 1:1', () => {
    const out = scaleToScreen(solid(160, 128, [10, 20, 30, 255]));
    expect(out.length).toBe(SCREEN_W * SCREEN_H * 4);
    expect(px(out, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(px(out, 159, 127)).toEqual([10, 20, 30, 255]);
  });

  it('scales an 80×64 source up 2× to fill the screen', () => {
    const out = scaleToScreen(solid(80, 64, [200, 100, 50, 255]));
    expect(px(out, 0, 0)).toEqual([200, 100, 50, 255]);
    expect(px(out, 159, 127)).toEqual([200, 100, 50, 255]);
  });

  it('letterboxes a non-matching aspect ratio with white bars', () => {
    // 160×64 source -> scale = min(160/160, 128/64)=1 -> drawn 160×64 centered vertically
    const out = scaleToScreen(solid(160, 64, [5, 5, 5, 255]));
    expect(px(out, 80, 0)).toEqual([255, 255, 255, 255]);   // top bar = white
    expect(px(out, 80, 64)).toEqual([5, 5, 5, 255]);        // centered content
    expect(px(out, 80, 127)).toEqual([255, 255, 255, 255]); // bottom bar = white
  });

  it('returns a blank white screen for an empty (0×0) source', () => {
    const out = scaleToScreen({ width: 0, height: 0, data: new Uint8ClampedArray(0) });
    expect(px(out, 80, 64)).toEqual([255, 255, 255, 255]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @sprigscope/core`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `packages/core/src/render/scale.ts`**

```ts
import { SCREEN_W, SCREEN_H, blankScreen } from '../framebuffer';

export interface SourceImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

/**
 * Scale a map-sized render (mapW*16 × mapH*16) into a 160×128 RGBA buffer,
 * nearest-neighbor, preserving aspect, centered on white — matching the sprig web player.
 */
export function scaleToScreen(src: SourceImage): Uint8ClampedArray {
  const out = blankScreen();
  if (src.width === 0 || src.height === 0) return out;

  const scale = Math.min(SCREEN_W / src.width, SCREEN_H / src.height);
  const dw = Math.round(src.width * scale);
  const dh = Math.round(src.height * scale);
  const ox = Math.floor((SCREEN_W - dw) / 2);
  const oy = Math.floor((SCREEN_H - dh) / 2);

  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(src.height - 1, Math.floor(dy / scale));
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(src.width - 1, Math.floor(dx / scale));
      const si = (sy * src.width + sx) * 4;
      const di = ((oy + dy) * SCREEN_W + (ox + dx)) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = 255;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @sprigscope/core`
Expected: PASS (4 scale tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/render/scale.ts packages/core/test/scale.test.ts
git commit -m "feat(core): add scale-to-fit screen renderer"
```

---

## Task 6: Text overlay renderer

Faithfully replicates the engine's `getTextImg`: `composeText(texts)` gives a 16×20 grid of `{char, color}`; each glyph is 8×8, read from `font` at `charCodeAt(0)*8` (8 bytes, MSB-first per row). Output is a 160×128 RGBA overlay, transparent except lit glyph pixels.

**Files:**
- Create: `packages/core/src/render/text.ts`
- Test: `packages/core/test/text.test.ts`

- [ ] **Step 1: Write the failing test** `packages/core/test/text.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { renderTextOverlay } from '../src/render/text';
import { SCREEN_W } from '../src/framebuffer';

const px = (d: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * SCREEN_W + x) * 4;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
};

describe('renderTextOverlay', () => {
  it('lights red pixels for a glyph in the top-left cell and leaves the rest transparent', () => {
    const out = renderTextOverlay([{ x: 0, y: 0, content: 'A', color: [255, 0, 0, 255] }]);

    // at least one lit pixel inside the first 8×8 cell, colored red, fully opaque
    let lit = 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [r, g, b, a] = px(out, x, y);
        if (a === 255) { lit++; expect([r, g, b]).toEqual([255, 0, 0]); }
      }
    }
    expect(lit).toBeGreaterThan(0);

    // far away from any text => transparent
    expect(px(out, 120, 100)).toEqual([0, 0, 0, 0]);
  });

  it('returns an all-transparent overlay when there is no text', () => {
    const out = renderTextOverlay([]);
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 80, 64)).toEqual([0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @sprigscope/core`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `packages/core/src/render/text.ts`**

```ts
import { composeText, font } from 'sprig/base';
import { SCREEN_W, SCREEN_H } from '../framebuffer';

/** One text element as stored in the engine's game state. */
export interface TextElement {
  x: number;
  y: number;
  content: string;
  color: number[]; // [r,g,b,a]
}

/**
 * Render the Sprig text layer to a 160×128 RGBA overlay (transparent except lit
 * glyph pixels). Mirrors the engine's getTextImg: 8×8 glyphs from `font`, indexed
 * by char code, laid out on a 20×16 grid by `composeText`.
 */
export function renderTextOverlay(texts: TextElement[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4); // all zero = transparent
  const charGrid = composeText(texts as never);

  for (let row = 0; row < charGrid.length; row++) {
    let xt = 0;
    for (const cell of charGrid[row]) {
      const { char, color } = cell as { char: string; color: number[] };
      const cc = char.charCodeAt(0);
      let y = row * 8;
      for (const bits of font.slice(cc * 8, (cc + 1) * 8)) {
        for (let x = 0; x < 8; x++) {
          const val = (bits >> (7 - x)) & 1;
          const di = (y * SCREEN_W + (xt + x)) * 4;
          out[di] = val * color[0];
          out[di + 1] = val * color[1];
          out[di + 2] = val * color[2];
          out[di + 3] = val * 255;
        }
        y++;
      }
      xt += 8;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @sprigscope/core`
Expected: PASS (2 text tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/render/text.ts packages/core/test/text.test.ts
git commit -m "feat(core): add text overlay renderer (composeText + font)"
```

---

## Task 7: The engine backend

Wires the `sprig` engine to `SprigDevice`: load game JS, render (scale + text composite), input via `game.button`, frame subscriptions.

**Files:**
- Create: `packages/core/src/backends/engine-backend.ts`
- Test: `packages/core/test/engine-backend.test.ts`

- [ ] **Step 1: Write the failing test** `packages/core/test/engine-backend.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { EngineBackend } from '../src/backends/engine-backend';
import { SCREEN_W } from '../src/framebuffer';

const RED: [number, number, number] = [235, 44, 71]; // palette '3'
const px = (d: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * SCREEN_W + x) * 4;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
};

// A 10×8 game with a solid-red 16×16 sprite 'r' at tile (0,0); 'd' moves it right.
const GAME = `
const r = bitmap\`
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333\`;
setLegend(['r', r]);
setMap(map\`
r.........
..........
..........
..........
..........
..........
..........
..........\`);
onInput('d', () => { getFirst('r').x += 1; });
`;

describe('EngineBackend', () => {
  it('reports not-loaded before a game and a blank white frame', () => {
    const dev = new EngineBackend();
    expect(dev.getStatus().loaded).toBe(false);
    expect(px(dev.getFramebuffer().data, 8, 8)).toEqual([255, 255, 255, 255]);
  });

  it('loads a game and renders the sprite at tile (0,0) as 160×128', () => {
    const dev = new EngineBackend();
    dev.loadGame(GAME, 'test');
    const fb = dev.getFramebuffer();
    expect(fb.width).toBe(160);
    expect(fb.height).toBe(128);
    expect(dev.getStatus().loaded).toBe(true);
    // center of tile (0,0) is red; far tile is white
    expect(px(fb.data, 8, 8).slice(0, 3)).toEqual(RED);
    expect(px(fb.data, 152, 8)).toEqual([255, 255, 255, 255]);
  });

  it('moves the sprite on pressButton("d") and emits a frame', () => {
    const dev = new EngineBackend();
    dev.loadGame(GAME);
    let frames = 0;
    dev.onFrame(() => { frames++; });
    dev.pressButton('d');
    const fb = dev.getFramebuffer();
    expect(frames).toBeGreaterThan(0);
    expect(px(fb.data, 8, 8)).toEqual([255, 255, 255, 255]); // tile (0,0) now empty
    expect(px(fb.data, 24, 8).slice(0, 3)).toEqual(RED);     // tile (1,0) now red
  });

  it('throws a clear error on broken game JS', () => {
    const dev = new EngineBackend();
    expect(() => dev.loadGame('this is not ( valid javascript')).toThrow(/Failed to load game/);
  });

  it('reset re-runs the last game to a clean state', () => {
    const dev = new EngineBackend();
    dev.loadGame(GAME);
    dev.pressButton('d'); // move right
    dev.reset();
    expect(px(dev.getFramebuffer().data, 8, 8).slice(0, 3)).toEqual(RED); // back at (0,0)
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @sprigscope/core`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `packages/core/src/backends/engine-backend.ts`**

```ts
import { installImageDataShim } from '../platform/imagedata';
installImageDataShim(); // must run before the engine constructs any ImageData

import { imageDataEngine } from 'sprig/image-data';
import type { Button, DeviceStatus, Framebuffer, SprigDevice } from '../device';
import { SCREEN_W, SCREEN_H, blankScreen, compositeOver } from '../framebuffer';
import { scaleToScreen } from '../render/scale';
import { renderTextOverlay, type TextElement } from '../render/text';

type Engine = ReturnType<typeof imageDataEngine>;

export class EngineBackend implements SprigDevice {
  private game: Engine | null = null;
  private source = '';
  private title?: string;
  private readonly listeners = new Set<(fb: Framebuffer) => void>();

  loadGame(source: string, title?: string): void {
    this.source = source;
    this.title = title;
    const game = imageDataEngine();
    try {
      const fn = new Function(...Object.keys(game.api), source);
      fn(...Object.values(game.api));
    } catch (e) {
      this.game = null;
      throw new Error(`Failed to load game: ${(e as Error).message}`);
    }
    this.game = game;
    this.emit();
  }

  reset(): void {
    if (this.source) this.loadGame(this.source, this.title);
  }

  pressButton(btn: Button): void {
    if (!this.game) return;
    this.game.button(btn);
    this.emit();
  }

  setButton(btn: Button, down: boolean): void {
    if (down) this.pressButton(btn);
  }

  getFramebuffer(): Framebuffer {
    const data = this.game ? this.renderFrame(this.game) : blankScreen();
    return { width: SCREEN_W, height: SCREEN_H, data };
  }

  onFrame(cb: (fb: Framebuffer) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getStatus(): DeviceStatus {
    return { running: this.game !== null, loaded: this.game !== null, backend: 'engine', title: this.title };
  }

  private renderFrame(game: Engine): Uint8ClampedArray {
    const img = game.render(); // ImageData: mapW*16 × mapH*16
    const base = scaleToScreen({ width: img.width, height: img.height, data: img.data });
    const overlay = renderTextOverlay(game.state.texts as unknown as TextElement[]);
    return compositeOver(base, overlay);
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const fb = this.getFramebuffer();
    for (const cb of this.listeners) cb(fb);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @sprigscope/core`
Expected: PASS (5 engine-backend tests). If the red-pixel assertion is off by the sprite's exact pixels, confirm the sprite is solid `3` (red) and the tile origin is (0,0); pixel (8,8) is the tile center.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/backends/engine-backend.ts packages/core/test/engine-backend.test.ts
git commit -m "feat(core): add engine backend (load, render, input) implementing SprigDevice"
```

---

## Task 8: Public exports + full-suite green

**Files:**
- Create: `packages/core/src/index.ts`
- Test: (runs the whole suite)

- [ ] **Step 1: Write `packages/core/src/index.ts`**

```ts
export type { Button, Framebuffer, DeviceStatus, SprigDevice } from './device';
export { BUTTONS } from './device';
export { SCREEN_W, SCREEN_H, blankScreen, compositeOver } from './framebuffer';
export { scaleToScreen, type SourceImage } from './render/scale';
export { renderTextOverlay, type TextElement } from './render/text';
export { EngineBackend } from './backends/engine-backend';
```

- [ ] **Step 2: Add an index smoke test** `packages/core/test/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { EngineBackend, SCREEN_W, SCREEN_H, BUTTONS } from '../src/index';

describe('package entry', () => {
  it('exports the public surface', () => {
    expect(SCREEN_W).toBe(160);
    expect(SCREEN_H).toBe(128);
    expect(BUTTONS).toHaveLength(8);
    expect(new EngineBackend().getStatus().backend).toBe('engine');
  });
});
```

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm test -w @sprigscope/core && npm run typecheck -w @sprigscope/core`
Expected: ALL PASS (framebuffer, scale, text, engine-backend, index, imagedata), typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/index.test.ts
git commit -m "feat(core): public exports for @sprigscope/core"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** This plan implements spec §3.1 (`SprigDevice`), §4.1 (engine backend), §4.2 (scale + text + framebuffer), §6 (unit + golden-style pixel tests). MCP (§4.3) and GUI (§4.4) are explicitly separate follow-on plans; the chip backend (§12) is staged.
- **Type consistency:** `Button`, `Framebuffer`, `DeviceStatus`, `SprigDevice` are defined once in `device.ts` and imported everywhere; `SourceImage`/`TextElement` defined where used and re-exported in `index.ts`.
- **No placeholders:** every step has complete code and exact commands.
- **Determinism:** the engine is deterministic for a fixed game + input sequence, so the pixel assertions in Task 7 are stable (this is our golden-frame equivalent, with no committed binary fixtures).

## Next plans (after this one)
1. **MCP server** (`apps/mcp`): tools `get_screen`/`press_button`/`set_button`/`load_game`/`reset`/`get_status` over a headless `EngineBackend`; PNG via `pngjs`.
2. **Tauri GUI** (`apps/desktop`): photo-real virtual Sprig (PCB-derived chassis), screen + 8 buttons at the spec §2.6 coordinates, keyboard input, controls.
3. **Chip backend** (spec §12): rp2040js + peripheral patches + ST7735 decoder behind the same `SprigDevice`.
