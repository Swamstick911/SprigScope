import './styles.css';
import { EngineBackend, BUTTONS, type Button, type Framebuffer } from '@sprigscope/core';
import { mountVirtualSprig3D } from './virtual-sprig-3d';
import { DEMO_GAMES } from './games';

const app = document.querySelector<HTMLDivElement>('#app')!;

const title = document.createElement('h1');
title.textContent = 'SprigScope — Virtual Sprig';
app.appendChild(title);

const vs = mountVirtualSprig3D(app);
const device = new EngineBackend();

// --- backend mode: engine (Sprig games) or chip (raw RP2040 firmware, in a Worker) ---
type Mode = 'engine' | 'chip';
let mode: Mode = 'engine';
let chipWorker: Worker | null = null;
let latestChipFrame: Framebuffer | null = null;

function ensureWorker(): Worker {
  if (!chipWorker) {
    chipWorker = new Worker(new URL('./chip-worker.ts', import.meta.url), { type: 'module' });
    chipWorker.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; data?: ArrayBuffer };
      if (m.type === 'frame' && m.data) {
        latestChipFrame = { width: 160, height: 128, data: new Uint8ClampedArray(m.data) };
        status('Firmware running.');
      }
    };
  }
  return chipWorker;
}

function bootFirmware(bytes: ArrayBuffer, label: string): void {
  mode = 'chip';
  latestChipFrame = null;
  ensureWorker().postMessage({ type: 'loadFirmware', uf2: bytes }, [bytes]);
  status(`Booting firmware: ${label}…`);
}

function press(b: Button): void {
  if (mode === 'engine') device.pressButton(b);
  else chipWorker?.postMessage({ type: 'press', button: b });
}

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
  try { mode = 'engine'; device.loadGame(await f.text(), f.name); status(`Loaded ${f.name}`); }
  catch (e) { status((e as Error).message); }
});
fileLabel.appendChild(fileInput);
toolbar.appendChild(fileLabel);

toolbar.appendChild(makeButton('Boot stock OS', async () => {
  status('Fetching stock firmware…');
  try {
    const buf = await (await fetch('/pico-os.uf2')).arrayBuffer();
    bootFirmware(buf, 'pico-os');
  } catch (e) { status((e as Error).message); }
}));

const fwLabel = document.createElement('label');
fwLabel.textContent = 'Load firmware (.uf2)…';
const fwInput = document.createElement('input');
fwInput.type = 'file';
fwInput.accept = '.uf2';
fwInput.style.display = 'none';
fwInput.addEventListener('change', async () => {
  const f = fwInput.files?.[0];
  if (!f) return;
  bootFirmware(await f.arrayBuffer(), f.name);
});
fwLabel.appendChild(fwInput);
toolbar.appendChild(fwLabel);

toolbar.appendChild(makeButton('Reset', () => {
  if (mode === 'engine') device.reset();
  else chipWorker?.postMessage({ type: 'reset' });
}));
toolbar.appendChild(makeButton('Screenshot', () => {
  const a = document.createElement('a');
  a.download = 'sprig-screen.png';
  a.href = vs.screenshot();
  a.click();
}));

const statusEl = document.createElement('div');
statusEl.className = 'status';
app.appendChild(statusEl);

const hint = document.createElement('div');
hint.className = 'hint';
hint.textContent = 'Drag to orbit · W A S D / I J K L or click the buttons · load a game (.js) or firmware (.uf2)';
app.appendChild(hint);

function status(msg: string): void { statusEl.textContent = msg; }
function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function loadDemo(i: number): void {
  mode = 'engine';
  const g = DEMO_GAMES[i];
  device.loadGame(g.source, g.name);
  status(g.name);
}

// --- input ---
vs.onPress(press);
const KEYS = new Set<string>(BUTTONS);
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!KEYS.has(k)) return;
  e.preventDefault();
  press(k as Button);
  vs.setActive(k as Button, true);
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (KEYS.has(k)) vs.setActive(k as Button, false);
});
window.addEventListener('pointerup', () => BUTTONS.forEach((b) => vs.setActive(b, false)));

// --- render loop ---
function frame(): void {
  if (mode === 'engine') vs.updateScreen(device.getFramebuffer());
  else if (latestChipFrame) vs.updateScreen(latestChipFrame);
  vs.render();
  requestAnimationFrame(frame);
}

loadDemo(0);
requestAnimationFrame(frame);
