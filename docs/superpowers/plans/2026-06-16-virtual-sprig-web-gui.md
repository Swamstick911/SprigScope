# Virtual Sprig Web GUI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/web` — an interactive **photo-real-style virtual Sprig** that runs in the browser (and later wraps unchanged in Tauri). It renders a real Sprig screen from `@sprigscope/core`, with 8 clickable buttons + keyboard control positioned on a faithful Sprig-PCB chassis, plus controls to load/reset games and screenshot.

**Architecture:** Vite + vanilla TypeScript (no framework — single screen, zero framework-version risk; wraps in Tauri later untouched). The UI is a board container (aspect 139.70:64.77) holding an SVG chassis, a `<canvas>` at the exact screen rectangle, and 8 button hotspots at the exact PCB coordinates (spec §2.6). An `EngineBackend` from `@sprigscope/core` runs in-page; a `requestAnimationFrame` loop draws its 160×128 framebuffer to the canvas; keyboard + clicks drive `pressButton`.

**Tech Stack:** Vite, TypeScript, `@sprigscope/core` (workspace), `sprig` (transitively). Verification screenshot via `playwright-core` using the installed Edge (`channel: 'msedge'`) — no browser download.

**Why this works in the browser:** the core's `ImageData` shim no-ops when native `ImageData` exists (it does in a browser), and `sprig/image-data` runs natively. A Vite alias maps `@sprigscope/core` to its TS source so Vite compiles it into the app bundle.

**Out of scope (later):** Tauri native shell (needs MSVC tools); audio; the rp2040 chip backend; a true KiCad-rendered/photo chassis (the SVG is upgradeable — overlay coords stay exact).

---

## File Structure

```
apps/web/
├─ package.json            # Task 1
├─ tsconfig.json           # Task 1
├─ vite.config.ts          # Task 1 (alias @sprigscope/core -> source)
├─ index.html              # Task 1, 6
├─ public/
│  └─ sprig-chassis.svg    # Task 4 (faithful Sprig PCB)
├─ src/
│  ├─ geometry.ts          # Task 2 (screen rect + button fractions)
│  ├─ games.ts             # Task 3 (bundled demo game sources)
│  ├─ virtual-sprig.ts     # Task 5 (builds chassis+canvas+buttons DOM)
│  ├─ styles.css           # Task 5
│  └─ main.ts              # Task 6 (device + render loop + input + controls)
└─ test/
   ├─ geometry.test.ts     # Task 2
   └─ games.test.ts        # Task 3
scripts/
└─ screenshot.mjs          # Task 7 (playwright-core + msedge)
```

---

## Task 1: Scaffold `apps/web` (Vite + vanilla TS)

**Files:** Create `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.ts`

- [ ] **Step 1: `apps/web/package.json`**

```json
{
  "name": "@sprigscope/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173",
    "test": "vitest run"
  },
  "dependencies": {
    "@sprigscope/core": "*",
    "sprig": "^1.1.3"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "typescript": "^6.0.0",
    "vitest": "^4.0.0"
  }
}
```

- [ ] **Step 2: `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["vite/client"] },
  "include": ["src", "test", "vite.config.ts"]
}
```

- [ ] **Step 3: `apps/web/vite.config.ts`** (alias core to its TS source so Vite compiles it)

```ts
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@sprigscope/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
});
```

- [ ] **Step 4: `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SprigScope — Virtual Sprig</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: temporary `apps/web/src/main.ts`**

```ts
import { EngineBackend } from '@sprigscope/core';
const dev = new EngineBackend();
document.querySelector('#app')!.textContent =
  `SprigScope web boot OK — backend: ${dev.getStatus().backend}`;
```

- [ ] **Step 6: Install + verify the dev/build pipeline**

Run (from repo root):
```bash
npm install
npm run build -w @sprigscope/web
```
Expected: install succeeds; `vite build` completes with no errors and emits `apps/web/dist/`. (This confirms Vite compiles the core TS via the alias and resolves `sprig`.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html apps/web/src/main.ts package-lock.json package.json
git commit -m "chore(web): scaffold Vite virtual-Sprig app wired to core"
```

---

## Task 2: Geometry config (exact PCB overlay coordinates)

**Files:** Create `apps/web/src/geometry.ts`, `apps/web/test/geometry.test.ts`

- [ ] **Step 1: Write the failing test** `apps/web/test/geometry.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BOARD_ASPECT, SCREEN_RECT, BUTTON_POS } from '../src/geometry';

describe('geometry', () => {
  it('screen rect is the 5:4 region from the PCB', () => {
    // screen px aspect = (w*boardW)/(h*boardH) must be 1.25 (160:128)
    const aspect = (SCREEN_RECT.w * BOARD_ASPECT) / SCREEN_RECT.h;
    expect(aspect).toBeCloseTo(1.25, 2);
  });
  it('has all 8 buttons with fractional positions inside the board', () => {
    const keys = Object.keys(BUTTON_POS).sort().join('');
    expect(keys).toBe('adijklsw');
    for (const p of Object.values(BUTTON_POS)) {
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(1);
    }
  });
  it('left and right clusters are mirrored around center', () => {
    expect(BUTTON_POS.w.x + BUTTON_POS.i.x).toBeCloseTo(BUTTON_POS.s.x + BUTTON_POS.k.x, 3);
    expect(BUTTON_POS.w.y).toBeCloseTo(BUTTON_POS.i.y, 3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @sprigscope/web`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/web/src/geometry.ts`** (values from spec §2.6, extracted from the MIT KiCad PCB)

```ts
import type { Button } from '@sprigscope/core';

/** Board bounding box aspect ratio (139.70mm × 64.77mm). */
export const BOARD_ASPECT = 139.7 / 64.77;

/** Live-screen rectangle as fractions of the board bbox (160×128 area, 5:4). */
export const SCREEN_RECT = { x: 0.3746, y: 0.3506, w: 0.2508, h: 0.4327 };

/** Button cap centers as fractions of the board bbox. */
export const BUTTON_POS: Record<Button, { x: number; y: number }> = {
  w: { x: 0.1364, y: 0.4902 }, // left cluster, up
  a: { x: 0.0455, y: 0.6863 }, // left
  s: { x: 0.1364, y: 0.8824 }, // down
  d: { x: 0.2273, y: 0.6863 }, // right
  i: { x: 0.8273, y: 0.4902 }, // right cluster, up
  j: { x: 0.7364, y: 0.6855 }, // left
  k: { x: 0.8273, y: 0.8816 }, // down
  l: { x: 0.9182, y: 0.6863 }, // right
};

/** Button cap diameter as a fraction of board width (~8mm / 139.7mm). */
export const BUTTON_DIAMETER = 0.057;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @sprigscope/web`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/geometry.ts apps/web/test/geometry.test.ts
git commit -m "feat(web): add exact PCB overlay geometry"
```

---

## Task 3: Bundled demo games

**Files:** Create `apps/web/src/games.ts`, `apps/web/test/games.test.ts`

- [ ] **Step 1: Write the failing test** `apps/web/test/games.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { DEMO_GAMES } from '../src/games';
import { EngineBackend } from '@sprigscope/core';

describe('demo games', () => {
  it('every bundled game loads and renders without throwing', () => {
    expect(DEMO_GAMES.length).toBeGreaterThan(0);
    for (const g of DEMO_GAMES) {
      const dev = new EngineBackend();
      expect(() => dev.loadGame(g.source, g.name)).not.toThrow();
      const fb = dev.getFramebuffer();
      // not entirely blank-white (something drew)
      let nonWhite = 0;
      for (let i = 0; i < fb.data.length; i += 4) {
        if (!(fb.data[i] === 255 && fb.data[i + 1] === 255 && fb.data[i + 2] === 255)) nonWhite++;
      }
      expect(nonWhite).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @sprigscope/web`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/web/src/games.ts`**

```ts
export interface DemoGame { name: string; source: string; }

const MOVER = `
const player = bitmap\`
................
......0000......
.....033330.....
....03333330....
....03.33.30....
....03333330....
....03000030....
....03333330....
.....033330.....
......0000......
................
................
................
................
................
................\`;
const wall = bitmap\`
LLLLLLLLLLLLLLLL
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
L11111111111111L
LLLLLLLLLLLLLLLLL\`;
setLegend(['p', player], ['w', wall]);
setSolids(['p', 'w']);
setMap(map\`
wwwwwwwwww
w........w
w........w
w...p....w
w........w
w........w
w........w
wwwwwwwwww\`);
onInput('w', () => { getFirst('p').y -= 1; });
onInput('s', () => { getFirst('p').y += 1; });
onInput('a', () => { getFirst('p').x -= 1; });
onInput('d', () => { getFirst('p').x += 1; });
onInput('i', () => { getFirst('p').y -= 1; });
onInput('k', () => { getFirst('p').y += 1; });
onInput('j', () => { getFirst('p').x -= 1; });
onInput('l', () => { getFirst('p').x += 1; });
`;

const COLLECT = `
const player = bitmap\`
................
......0000......
.....077770.....
....07777770....
....07.77.70....
....07777770....
....07777770....
.....077770.....
......0000......
................
................
................
................
................
................
................\`;
const coin = bitmap\`
................
................
......6666......
.....666666.....
....66666666....
....66666666....
....66666666....
....66666666....
.....666666.....
......6666......
................
................
................
................
................
................\`;
const wall = bitmap\`
LLLLLLLLLLLLLLLL
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
L00000000000000L
LLLLLLLLLLLLLLLLL\`;
setLegend(['p', player], ['c', coin], ['w', wall]);
setSolids(['p', 'w']);
setMap(map\`
wwwwwwwwww
w..c...c.w
w........w
w...p....w
w.c......w
w....c..cw
w..c.....w
wwwwwwwwww\`);
let score = 0;
const draw = () => { clearText(); addText('Coins: ' + score, { x: 0, y: 0, color: color\`6\` }); };
draw();
const move = (dx, dy) => { const p = getFirst('p'); p.x += dx; p.y += dy; };
onInput('w', () => move(0, -1));
onInput('s', () => move(0, 1));
onInput('a', () => move(-1, 0));
onInput('d', () => move(1, 0));
onInput('i', () => move(0, -1));
onInput('k', () => move(0, 1));
onInput('j', () => move(-1, 0));
onInput('l', () => move(1, 0));
afterInput(() => {
  const p = getFirst('p');
  const coins = getTile(p.x, p.y).filter((s) => s.type === 'c');
  if (coins.length) { coins.forEach((s) => s.remove()); score += coins.length; draw(); }
});
`;

export const DEMO_GAMES: DemoGame[] = [
  { name: 'Mover', source: MOVER },
  { name: 'Collect', source: COLLECT },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @sprigscope/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/games.ts apps/web/test/games.test.ts
git commit -m "feat(web): add bundled demo games (mover, collect)"
```

---

## Task 4: The faithful Sprig-PCB chassis SVG

**Files:** Create `apps/web/public/sprig-chassis.svg`

- [ ] **Step 1: Write `apps/web/public/sprig-chassis.svg`** (viewBox in board mm; geometry matches §2.6)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 139.7 64.77" width="139.7" height="64.77">
  <defs>
    <linearGradient id="pcb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1f8f4e"/>
      <stop offset="1" stop-color="#136b39"/>
    </linearGradient>
    <radialGradient id="cap" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#3a3a3a"/>
      <stop offset="1" stop-color="#141414"/>
    </radialGradient>
  </defs>

  <!-- board -->
  <rect x="0.4" y="0.4" width="138.9" height="63.97" rx="5.08" fill="url(#pcb)" stroke="#0c4f2a" stroke-width="0.8"/>

  <!-- screen bezel (canvas overlays the inner window) -->
  <rect x="50.3" y="20.7" width="39.1" height="32.05" rx="2" fill="#0a0a0a" stroke="#063b20" stroke-width="0.6"/>

  <!-- gold silk: logo + brand -->
  <text x="7" y="11" font-family="Verdana, sans-serif" font-size="7" font-weight="700" fill="#e8c46a">sprig</text>
  <text x="6.6" y="60.5" font-family="Verdana, sans-serif" font-size="3.2" letter-spacing="0.4" fill="#e8c46a">HACK CLUB</text>
  <!-- tiny status LEDs -->
  <circle cx="8.5" cy="15" r="1.1" fill="#7be0a0"/>
  <circle cx="131" cy="15" r="1.1" fill="#7be0a0"/>

  <!-- button caps + silk labels (centers from §2.6 fractions × board mm) -->
  <!-- left cluster -->
  <circle cx="19.05" cy="31.75" r="4" fill="url(#cap)" stroke="#000" stroke-width="0.3"/>
  <text x="19.05" y="25.6" font-family="Verdana" font-size="3" fill="#dfe7df" text-anchor="middle">W</text>
  <circle cx="6.35" cy="44.45" r="4" fill="url(#cap)" stroke="#000" stroke-width="0.3"/>
  <text x="2.0" y="45.4" font-family="Verdana" font-size="3" fill="#dfe7df" text-anchor="middle">A</text>
  <circle cx="19.05" cy="57.15" r="4" fill="url(#cap)" stroke="#000" stroke-width="0.3"/>
  <text x="19.05" y="63.6" font-family="Verdana" font-size="3" fill="#dfe7df" text-anchor="middle">S</text>
  <circle cx="31.75" cy="44.45" r="4" fill="url(#cap)" stroke="#000" stroke-width="0.3"/>
  <text x="36.3" y="45.4" font-family="Verdana" font-size="3" fill="#dfe7df" text-anchor="middle">D</text>
  <!-- right cluster -->
  <circle cx="115.57" cy="31.75" r="4" fill="url(#cap)" stroke="#000" stroke-width="0.3"/>
  <text x="115.57" y="25.6" font-family="Verdana" font-size="3" fill="#dfe7df" text-anchor="middle">I</text>
  <circle cx="102.87" cy="44.4" r="4" fill="url(#cap)" stroke="#000" stroke-width="0.3"/>
  <text x="98.4" y="45.4" font-family="Verdana" font-size="3" fill="#dfe7df" text-anchor="middle">J</text>
  <circle cx="115.57" cy="57.1" r="4" fill="url(#cap)" stroke="#000" stroke-width="0.3"/>
  <text x="115.57" y="63.6" font-family="Verdana" font-size="3" fill="#dfe7df" text-anchor="middle">K</text>
  <circle cx="128.27" cy="44.45" r="4" fill="url(#cap)" stroke="#000" stroke-width="0.3"/>
  <text x="132.8" y="45.4" font-family="Verdana" font-size="3" fill="#dfe7df" text-anchor="middle">L</text>
</svg>
```

- [ ] **Step 2: Verify it's valid XML / loads**

Run: `node -e "const s=require('fs').readFileSync('apps/web/public/sprig-chassis.svg','utf8'); if(!s.includes('</svg>')) process.exit(1); console.log('svg ok', s.length)"`
Expected: prints `svg ok <length>`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/sprig-chassis.svg
git commit -m "feat(web): add faithful Sprig-PCB chassis SVG"
```

---

## Task 5: VirtualSprig component (chassis + canvas + buttons) + styles

**Files:** Create `apps/web/src/virtual-sprig.ts`, `apps/web/src/styles.css`

- [ ] **Step 1: Write `apps/web/src/styles.css`**

```css
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
  gap: 16px; padding: 24px; background: #0e1116; color: #e6e6e6;
  font-family: system-ui, sans-serif;
}
h1 { font-size: 18px; font-weight: 600; margin: 0; letter-spacing: 0.3px; }
.board {
  position: relative; width: min(92vw, 760px); aspect-ratio: 139.7 / 64.77;
  filter: drop-shadow(0 10px 24px rgba(0,0,0,0.55));
}
.board > img.chassis { position: absolute; inset: 0; width: 100%; height: 100%; user-select: none; -webkit-user-drag: none; }
.screen {
  position: absolute; image-rendering: pixelated; background: #000;
  border: 0; padding: 0;
}
.btn {
  position: absolute; transform: translate(-50%, -50%);
  border-radius: 50%; aspect-ratio: 1; border: none; cursor: pointer;
  background: transparent;
}
.btn::after {
  content: ''; position: absolute; inset: -6%; border-radius: 50%;
  box-shadow: 0 0 0 2px transparent; transition: box-shadow 0.05s, background 0.05s;
}
.btn.active::after { box-shadow: 0 0 10px 3px #ffd54a; background: rgba(255,213,74,0.25); }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.toolbar select, .toolbar button, .toolbar label {
  background: #1b2230; color: #e6e6e6; border: 1px solid #2c3647; border-radius: 8px;
  padding: 7px 12px; font-size: 13px; cursor: pointer;
}
.toolbar button:hover, .toolbar label:hover { background: #232c3d; }
.status { font-size: 12px; color: #8b97a8; min-height: 16px; }
.hint { font-size: 12px; color: #6b7686; }
```

- [ ] **Step 2: Write `apps/web/src/virtual-sprig.ts`**

```ts
import { BUTTONS, type Button } from '@sprigscope/core';
import { SCREEN_RECT, BUTTON_POS, BUTTON_DIAMETER } from './geometry';

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;

export interface VirtualSprig {
  canvas: HTMLCanvasElement;
  setActive(btn: Button, active: boolean): void;
  onPress(cb: (btn: Button) => void): void;
}

export function mountVirtualSprig(parent: HTMLElement): VirtualSprig {
  const board = document.createElement('div');
  board.className = 'board';

  const chassis = document.createElement('img');
  chassis.className = 'chassis';
  chassis.src = '/sprig-chassis.svg';
  chassis.alt = 'Sprig';
  board.appendChild(chassis);

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 128;
  canvas.className = 'screen';
  canvas.style.left = pct(SCREEN_RECT.x);
  canvas.style.top = pct(SCREEN_RECT.y);
  canvas.style.width = pct(SCREEN_RECT.w);
  canvas.style.height = pct(SCREEN_RECT.h);
  board.appendChild(canvas);

  const btnEls = {} as Record<Button, HTMLButtonElement>;
  const pressCbs: ((b: Button) => void)[] = [];
  for (const b of BUTTONS) {
    const el = document.createElement('button');
    el.className = 'btn';
    el.style.left = pct(BUTTON_POS[b].x);
    el.style.top = pct(BUTTON_POS[b].y);
    el.style.width = pct(BUTTON_DIAMETER);
    el.setAttribute('aria-label', `Button ${b.toUpperCase()}`);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('active');
      pressCbs.forEach((cb) => cb(b));
    });
    board.appendChild(el);
    btnEls[b] = el;
  }

  parent.appendChild(board);

  return {
    canvas,
    setActive(btn, active) { btnEls[btn].classList.toggle('active', active); },
    onPress(cb) { pressCbs.push(cb); },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/virtual-sprig.ts apps/web/src/styles.css
git commit -m "feat(web): virtual Sprig component (chassis, screen canvas, button hotspots)"
```

---

## Task 6: Wire it together (device + render loop + input + controls)

**Files:** Modify `apps/web/src/main.ts`

- [ ] **Step 1: Replace `apps/web/src/main.ts`**

```ts
import './styles.css';
import { EngineBackend, BUTTONS, type Button } from '@sprigscope/core';
import { mountVirtualSprig } from './virtual-sprig';
import { DEMO_GAMES } from './games';

const app = document.querySelector<HTMLDivElement>('#app')!;

const title = document.createElement('h1');
title.textContent = 'SprigScope — Virtual Sprig';
app.appendChild(title);

const vs = mountVirtualSprig(app);
const ctx = vs.canvas.getContext('2d')!;
const device = new EngineBackend();

// --- toolbar ---
const toolbar = document.createElement('div');
toolbar.className = 'toolbar';
app.appendChild(toolbar);

const select = document.createElement('select');
DEMO_GAMES.forEach((g, i) => {
  const o = document.createElement('option');
  o.value = String(i);
  o.textContent = g.name;
  select.appendChild(o);
});
select.addEventListener('change', () => loadDemo(Number(select.value)));
toolbar.appendChild(select);

const fileLabel = document.createElement('label');
fileLabel.textContent = 'Load .js…';
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.js,.txt';
fileInput.style.display = 'none';
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  try { device.loadGame(await f.text(), f.name); status(`Loaded ${f.name}`); }
  catch (e) { status((e as Error).message); }
});
fileLabel.appendChild(fileInput);
toolbar.appendChild(fileLabel);

toolbar.appendChild(makeButton('Reset', () => device.reset()));
toolbar.appendChild(makeButton('Screenshot', () => {
  const a = document.createElement('a');
  a.download = 'sprig-screen.png';
  a.href = vs.canvas.toDataURL('image/png');
  a.click();
}));

const statusEl = document.createElement('div');
statusEl.className = 'status';
app.appendChild(statusEl);

const hint = document.createElement('div');
hint.className = 'hint';
hint.textContent = 'Controls: W A S D (left pad) and I J K L (right pad), or click the buttons.';
app.appendChild(hint);

function status(msg: string) { statusEl.textContent = msg; }
function makeButton(label: string, onClick: () => void) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function loadDemo(i: number) {
  const g = DEMO_GAMES[i];
  device.loadGame(g.source, g.name);
  status(g.name);
}

// --- input ---
vs.onPress((b) => device.pressButton(b));
const KEYS = new Set<string>(BUTTONS);
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!KEYS.has(k)) return;
  e.preventDefault();
  device.pressButton(k as Button);
  vs.setActive(k as Button, true);
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (KEYS.has(k)) vs.setActive(k as Button, false);
});
window.addEventListener('pointerup', () => BUTTONS.forEach((b) => vs.setActive(b, false)));

// --- render loop ---
function frame() {
  const fb = device.getFramebuffer();
  ctx.putImageData(new ImageData(fb.data, fb.width, fb.height), 0, 0);
  requestAnimationFrame(frame);
}

loadDemo(0);
requestAnimationFrame(frame);
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build -w @sprigscope/web`
Expected: build succeeds, no TS errors.

- [ ] **Step 3: Run the unit tests (geometry + games still green)**

Run: `npm test -w @sprigscope/web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/main.ts
git commit -m "feat(web): wire device, render loop, input, and controls"
```

---

## Task 7: Visual verification (headless screenshot via installed Edge)

**Files:** Create `scripts/screenshot.mjs`

- [ ] **Step 1: Install playwright-core** (uses installed Edge, no browser download)

Run: `npm install -D -w @sprigscope/web playwright-core`

- [ ] **Step 2: Write `scripts/screenshot.mjs`**

```js
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'apps/web/virtual-sprig.png';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500); // let a few frames render
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
```

- [ ] **Step 3: Build, serve, and screenshot**

Run (two steps — start preview in the background, then screenshot):
```bash
npm run build -w @sprigscope/web
npm run preview -w @sprigscope/web &   # serves http://localhost:4173
node scripts/screenshot.mjs http://localhost:4173/ apps/web/virtual-sprig.png
```
Expected: `apps/web/virtual-sprig.png` is written. Open it and confirm: the green Sprig chassis with the live game screen in the centered window, 8 labeled buttons, the toolbar, and a non-blank rendered game. Stop the preview server afterward.

- [ ] **Step 4: Commit** (keep the screenshot as a doc/demo asset)

```bash
git add scripts/screenshot.mjs apps/web/virtual-sprig.png package.json package-lock.json
git commit -m "chore(web): add headless screenshot verification"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** Implements spec §4.4 (virtual Sprig GUI) — chassis from PCB geometry (§2.6), live screen, 8 buttons at exact coords, keyboard+click input, controls. Runs on the `EngineBackend` core (§4.1). Tauri shell deferred (toolchain not ready) — the web app wraps unchanged later.
- **Type consistency:** `Button`/`BUTTONS` imported from `@sprigscope/core`; `geometry.ts` keys `BUTTON_POS` by `Button`; `mountVirtualSprig` returns the `VirtualSprig` interface used by `main.ts`.
- **No placeholders:** complete code for every file incl. the chassis SVG and demo games.
- **Verification:** unit tests for geometry + that every demo game loads and renders non-blank; a headless Edge screenshot for visual confirmation (the framebuffer pixels are already covered by core's tests).
- **Browser fit:** the core's ImageData shim no-ops with native ImageData; Vite alias compiles core TS into the bundle; `sprig` resolves from hoisted node_modules.

## Next plans (after this one)
1. **MCP server** (`apps/mcp`): tools over a headless `EngineBackend` (get_screen PNG, press_button, load_game, reset, get_status).
2. **Tauri shell**: wrap `apps/web` once MSVC build tools are installed (frontend unchanged).
3. **Chip backend** (spec §12): rp2040js + peripheral patches behind the same `SprigDevice`.
