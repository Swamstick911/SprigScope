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
const screen = new ImageData(160, 128);
function frame() {
  const fb = device.getFramebuffer();
  screen.data.set(fb.data);
  ctx.putImageData(screen, 0, 0);
  requestAnimationFrame(frame);
}

loadDemo(0);
requestAnimationFrame(frame);
