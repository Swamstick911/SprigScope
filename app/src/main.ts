import './style.css';
import { ScreenDisplay } from './display';
import { SerialSource } from './serial-source';
import { CameraSource } from './camera-source';
import { blankScreen } from './framebuffer';
import type { ScreenSource } from './source';

const app = document.querySelector<HTMLDivElement>('#app');
app.innerHTML = `
  <header class="topbar">
    <span class="logo">Sprig<b>Scope</b></span>
    <span class="tag">mirror a real Sprig screen to your laptop</span>
  </header>
  <main class="layout">
    <div class="stage"></div>
    <aside class="panel">
      <section class="card">
        <h2>Connect</h2>
        <p class="muted">Plug a Sprig running streaming firmware in over USB, or point a camera at any sprig</p>
        <button class="btn primary" id="serial">Connect over USB</button>
        <button class="btn" id="camera">Mirror with camera</button>
        <button class="btn ghost" id="stop">Stop</button>
      </section>
      <div class="status" id="status"><span class="dot"></span>Idle - pick a source above.</div>
    </aside>
  </main>
`;

const display = new ScreenDisplay();
app.querySelector('.stage')!.appendChild(display.canvas);

const statusEl = app.querySelector<HTMLDivElement>('#status')!;
function status(msg: string, err = false): void {
  statusEl.classList.toggle('err', err);
  statusEl.innerHTML = (err ? '' : '<span class="dot"></span>') + escapeHtml(msg);
}

let active: ScreenSource | null = null;
let cleanup: Array<() => void> = [];

async function activate(src: ScreenSource): Promise<void> {
  if (!src.available) { status(`${src.kind} capture isn't available in this browser`, true); return; }
  await deactivate();
  active = src;
  cleanup.push(src.onFrame((fb) => display.draw(fb)));
  cleanup.push(src.onStatus(status));
  try { await src.start(); }
  catch (e) { status((e as Error).message, true); await deactivate(); }
}

async function deactivate(): Promise<void> {
  cleanup.forEach((fn) => fn()); cleanup = [];
  if (active) { await active.stop(); active = null; }
  display.draw(blankScreen());
}

app.querySelector('#serial')!.addEventListener('click', () => void activate(new SerialSource()));
app.querySelector('#camera')!.addEventListener('click', () => void activate(new CameraSource()));
app.querySelector('#stop')!.addEventListener('click', () => { void deactivate(); status('Stopped'); });

function escapeHtml(s: string): string { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }