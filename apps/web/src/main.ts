import './styles.css';
import { EngineBackend, BUTTONS, type Button, type Framebuffer } from '@sprigscope/core';
import { mountVirtualSprig3D } from './virtual-sprig-3d';
import { DEMO_GAMES } from './games';

const GH_URL = 'https://github.com/Swamstick911/SprigScope';

const app = document.querySelector<HTMLDivElement>('#app')!;

// ---------------- header ----------------
const topbar = el('header', 'topbar');
topbar.innerHTML =
  '<div class="brand"><span class="logo">Sprig<b>Scope</b></span><span class="tag">a virtual Sprig in your browser</span></div>';
const gh = document.createElement('a');
gh.className = 'gh';
gh.href = GH_URL;
gh.target = '_blank';
gh.rel = 'noopener';
gh.textContent = 'GitHub ↗';
topbar.appendChild(gh);
app.appendChild(topbar);

// ---------------- layout ----------------
const layout = el('main', 'layout');
const stageWrap = el('div', 'stage-wrap');
const panel = el('aside', 'panel');
layout.append(stageWrap, panel);
app.appendChild(layout);

// ---------------- 3D stage ----------------
const vs = mountVirtualSprig3D(stageWrap);
const device = new EngineBackend();

const statusEl = el('div', 'status');
stageWrap.appendChild(statusEl);
const overlay = el('div', 'overlay');
overlay.innerHTML = '<div class="spinner"></div><div class="lbl">Loading the Sprig…</div>';
stageWrap.appendChild(overlay);
vs.onReady(() => overlay.classList.add('hidden'));

function status(msg: string, err = false): void {
  statusEl.classList.toggle('err', err);
  statusEl.innerHTML = (err ? '' : '<span class="dot"></span>') + escapeHtml(msg);
}

// ---------------- backend mode (engine games / chip firmware) ----------------
type Mode = 'engine' | 'chip';
let mode: Mode = 'engine';
let chipWorker: Worker | null = null;
let latestChipFrame: Framebuffer | null = null;

function ensureWorker(): Worker {
  if (!chipWorker) {
    chipWorker = new Worker(new URL('./chip-worker.ts', import.meta.url), { type: 'module' });
    chipWorker.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; data?: ArrayBuffer };
      if (m.type === 'frame' && m.data && mode === 'chip') {
        latestChipFrame = { width: 160, height: 128, data: new Uint8ClampedArray(m.data) };
        status('Firmware running');
      }
    };
  }
  return chipWorker;
}
function bootFirmware(bytes: ArrayBuffer, label: string): void {
  mode = 'chip';
  latestChipFrame = null;
  clearActiveGame();
  ensureWorker().postMessage({ type: 'loadFirmware', uf2: bytes }, [bytes]);
  status(`Booting ${label}…`);
}
function toEngine(): void {
  mode = 'engine';
  chipWorker?.postMessage({ type: 'stop' });
}
function press(b: Button): void {
  if (mode === 'engine') device.pressButton(b);
  else chipWorker?.postMessage({ type: 'press', button: b });
}

// ---------------- panel: games ----------------
const gamesCard = el('section', 'card');
gamesCard.innerHTML = '<h2>Play a game</h2>';
const gallery = el('div', 'gallery');
const gameBtns: HTMLButtonElement[] = [];
DEMO_GAMES.forEach((g, i) => {
  const b = document.createElement('button');
  b.className = 'game-btn';
  b.textContent = g.name;
  b.addEventListener('click', () => loadGame(i));
  gallery.appendChild(b);
  gameBtns.push(b);
});
gamesCard.appendChild(gallery);
gamesCard.appendChild(
  fileLabel('Load your .js…', '.js,.txt', async (f) => {
    try { toEngine(); clearActiveGame(); device.loadGame(await f.text(), f.name); status(`Loaded ${f.name}`); }
    catch (e) { status((e as Error).message, true); }
  }),
);
panel.appendChild(gamesCard);

function clearActiveGame(): void { gameBtns.forEach((b) => b.classList.remove('active')); }
function loadGame(i: number): void {
  toEngine();
  device.loadGame(DEMO_GAMES[i].source, DEMO_GAMES[i].name);
  clearActiveGame();
  gameBtns[i].classList.add('active');
  status(DEMO_GAMES[i].name);
}

// ---------------- panel: firmware ----------------
const fwCard = el('section', 'card');
fwCard.innerHTML =
  '<h2>Run firmware</h2><p class="muted">Boot any RP2040 <code>.uf2</code> — the real binary runs in an emulator on a background thread.</p>';
const bootBtn = document.createElement('button');
bootBtn.className = 'btn primary';
bootBtn.textContent = 'Boot stock OS';
bootBtn.addEventListener('click', async () => {
  status('Fetching firmware…');
  try {
    const buf = await (await fetch(import.meta.env.BASE_URL + 'pico-os.uf2')).arrayBuffer();
    bootFirmware(buf, 'stock OS');
  } catch (e) { status((e as Error).message, true); }
});
fwCard.appendChild(bootBtn);
const uf2Label = fileLabel('Load .uf2…', '.uf2', async (f) => bootFirmware(await f.arrayBuffer(), f.name));
uf2Label.style.marginTop = '8px';
fwCard.appendChild(uf2Label);
panel.appendChild(fwCard);

// ---------------- panel: device actions + keymap ----------------
const deviceCard = el('section', 'card');
deviceCard.innerHTML = '<h2>Device</h2>';
const actions = el('div', 'row');
actions.append(
  mkBtn('Reset', () => { if (mode === 'engine') device.reset(); else chipWorker?.postMessage({ type: 'reset' }); status('Reset'); }),
  mkBtn('Screenshot', () => { const a = document.createElement('a'); a.download = 'sprig.png'; a.href = vs.screenshot(); a.click(); }),
);
deviceCard.appendChild(actions);
const km = el('div', 'keymap');
km.style.marginTop = '14px';
km.append(pad('w', 'a', 's', 'd'), pad('i', 'j', 'k', 'l'));
deviceCard.appendChild(km);
panel.appendChild(deviceCard);

// ---------------- footer ----------------
const foot = el('footer', 'foot');
foot.innerHTML =
  `Built on Hack Club's open-source <a href="https://sprig.hackclub.com" target="_blank" rel="noopener">Sprig</a> · ` +
  `3D &amp; emulation via three.js + rp2040js · MIT licensed · ` +
  `<a href="${GH_URL}" target="_blank" rel="noopener">source</a>`;
app.appendChild(foot);

// ---------------- input ----------------
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

// ---------------- render loop ----------------
function frame(): void {
  if (mode === 'engine') vs.updateScreen(device.getFramebuffer());
  else if (latestChipFrame) vs.updateScreen(latestChipFrame);
  vs.render();
  requestAnimationFrame(frame);
}

loadGame(0);
requestAnimationFrame(frame);

// ---------------- helpers ----------------
function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
function mkBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function fileLabel(label: string, accept: string, onFile: (f: File) => void): HTMLLabelElement {
  const l = document.createElement('label');
  l.className = 'btn-file';
  l.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.addEventListener('change', () => { const f = inp.files?.[0]; if (f) onFile(f); inp.value = ''; });
  l.appendChild(inp);
  return l;
}
// 3×3 D-pad diagram: up/left/down/right keys around an empty center.
function pad(up: string, left: string, down: string, right: string): HTMLElement {
  const p = el('div', 'pad');
  const slots = ['', up, '', left, '', right, '', down, ''];
  for (const k of slots) {
    const c = document.createElement('div');
    if (k) { c.className = 'key'; c.textContent = k.toUpperCase(); } else { c.className = 'key spacer'; }
    p.appendChild(c);
  }
  return p;
}
function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
