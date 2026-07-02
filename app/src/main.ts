import './style.css';
import { ScreenDisplay } from './display';
import { SerialSource } from './serial-source';
import { CameraSource } from './camera-source';
import { blankScreen } from './framebuffer';
import { BUTTONS, type Button } from './buttons';
import type { ScreenSource } from './source';
import { mountLanding, GH_URL } from './landing';
import { FAQS } from './faq';

const root = document.querySelector<HTMLDivElement>('#app')!;
mountLanding(root, mountMirror);

function mountMirror(): void {
  root.innerHTML = mirrorHTML();

  const display = new ScreenDisplay();
  root.querySelector('.screen-box')!.appendChild(display.canvas);

  const statusEl = root.querySelector<HTMLDivElement>('#status')!;
  const status = (msg: string, err = false): void => {
    statusEl.classList.toggle('err', err);
    statusEl.innerHTML = (err ? '' : '<span class="dot"></span>') + escapeHtml(msg);
  };

  let active: ScreenSource | null = null;
  let cleanup: Array<() => void> = [];

  async function activate(src: ScreenSource): Promise<void> {
    if (!src.available) { status(`${src.kind} capture isn't available in this browser.`, true); return; }
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
  const press = (btn: Button): void => { active?.sendButton?.(btn); };

  root.querySelector('#connect')!.addEventListener('click', () => void activate(new SerialSource()));
  root.querySelector('#camera')!.addEventListener('click', () => void activate(new CameraSource()));
  root.querySelector('#stop')!.addEventListener('click', () => { void deactivate(); status('Stopped'); });
  root.querySelector('#screenshot')!.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'sprig-screen.png';
    a.href = display.canvas.toDataURL('image/png');
    a.click();
  });

  const padKeys = new Set<string>(BUTTONS);
  root.querySelectorAll<HTMLElement>('.key[data-key]').forEach((cell) => {
    const b = cell.dataset.key as Button;
    const down = (e: PointerEvent): void => { e.preventDefault(); press(b); cell.classList.add('down'); };
    const up = (): void => cell.classList.remove('down');
    cell.addEventListener('pointerdown', down);
    cell.addEventListener('pointerup', up);
    cell.addEventListener('pointerleave', up);
    cell.addEventListener('pointercancel', up);
  });
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!padKeys.has(k)) return;
    e.preventDefault();
    press(k as Button);
    root.querySelector(`.key[data-key="${k}"]`)?.classList.add('down');
  });
  window.addEventListener('keyup', (e) => {
    root.querySelector(`.key[data-key="${e.key.toLowerCase()}"]`)?.classList.remove('down');
  });

  root.querySelectorAll<HTMLElement>('.faq-item').forEach((item) => {
    item.querySelector('.faq-q')!.addEventListener('click', () => item.classList.toggle('open'));
  });

  display.draw(blankScreen());
  status('Idle - Pick a source above');
}

function pad (up: string, left: string, down: string, right: string): string {
  const cells = ['', up, '', left, '', right, '', down, ''];
  return `<div class="pad">` + cells.map((k) =>
    k ? `<div class="key" data-key="${k}">${k.toUpperCase()}</div>` : '<div class="key spacer"></div>',
  ).join('') + '</div>';
}

function mirrorHTML(): string {
  const faqs = FAQS.map((qa, i) => `
    <div class="faq-item">
      <button class="faq-q"><span class="faq-num">${i + 1}</span><span class="faq-text">${escapeHtml(qa.q)}</span><span class="faq-chev">⌄</span></button>
      <div class="faq-a">${escapeHtml(qa.a)}</div>
    </div>
  `).join('');

  return `
    <header class="topbar">
      <span class="logo">Sprig<b>Scope</b></span>
      <a class="gh" href="${GH_URL}" target="_blank" rel="noopener">GitHub ↗</a>
    </header>
    <main class="mirror">
      <div class="console">
        ${pad('w', 'a', 's', 'd')}
        <div class="screen-wrap">
          <div class="screen-box"></div>
          <div class="screen-controls">
            <button class="btn-mini" id="screenshot">Screenshot</button>
            <button class="btn-mini" id="stop">Stop</button>
          </div>
          <div class="status" id="status"><span class="dot"></span>Idle</div>
        </div>
        ${pad('i', 'j', 'k', 'l')}
      </div>
      <div class="actions">
        <button class="btn primary" id="connect">Connect a Real Sprig</button>
        <button class="btn primary" id="camera">Mirror with a Camera</button>
        <label class="btn secondary">Upload a .uf2<input type="file" id="uf2-input" accept=".uf2" hidden></label>
      </div>
      <section class="faqs">
        <h2>Frequently Asked Questions (FAQs)</h2>
        ${faqs}
      </section>
    </main>
    <footer class="foot">Made by a Hackclubber for Hack Club!</footer>
  `;
}

function escapeHtml(s: string): string { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }