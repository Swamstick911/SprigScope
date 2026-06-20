import './styles.css';
import { EngineBackend, BUTTONS, type Button, type Framebuffer } from '@sprigscope/core';
import { mountVirtualSprig3D, type VirtualSprig3D } from './virtual-sprig-3d';
import { mountLanding } from './landing';
import { DEMO_GAMES } from './games';
import { playTune, unlockAudioOnGesture, setMuted, isMuted } from './tune-player';

const GH_URL = 'https://github.com/Swamstick911/SprigScope';

// Boot the landing first; "press start" hands the loaded 3D model to the app.
unlockAudioOnGesture();
mountLanding({
  mount3d: (holder) => mountVirtualSprig3D(holder),
  onLaunch: (vs) => bootApp(vs),
});

function bootApp(vs: VirtualSprig3D): void {
  const app = document.querySelector<HTMLDivElement>('#app')!;

  // ---------------- header ----------------
  const topbar = el('header', 'topbar');
  topbar.innerHTML =
    '<div class="brand"><span class="logo">Sprig<b>Scope</b></span><span class="tag">virtual Sprig · RP2040 emulator</span></div>';
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

  // hand the already-loaded model from the landing into the stage
  vs.reparent(stageWrap);

  const statusEl = el('div', 'status');
  stageWrap.appendChild(statusEl);

  function status(msg: string, err = false): void {
    statusEl.classList.toggle('err', err);
    statusEl.innerHTML = (err ? '' : '<span class="dot"></span>') + escapeHtml(msg);
  }

  // ---------------- backend mode (engine games / chip firmware) ----------------
  const device = new EngineBackend();
  device.setTunePlayer(playTune);
  type Mode = 'engine' | 'chip';
  let mode: Mode = 'engine';
  let chipWorker: Worker | null = null;
  let latestChipFrame: Framebuffer | null = null;

  function ensureWorker(): Worker {
    if (!chipWorker) {
      chipWorker = new Worker(new URL('./chip-worker.ts', import.meta.url), { type: 'module' });
      chipWorker.onmessage = (e: MessageEvent) => {
        const m = e.data as { type: string; data?: ArrayBuffer; message?: string };
        if (m.type === 'frame' && m.data && mode === 'chip') {
          latestChipFrame = { width: 160, height: 128, data: new Uint8ClampedArray(m.data) };
          status('Firmware running');
        } else if (m.type === 'error') {
          status(m.message || 'Firmware error', true);
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
  const soundBtn = mkBtn('🔊 Sound', () => {
    const m = !isMuted();
    setMuted(m);
    soundBtn.textContent = m ? '🔇 Muted' : '🔊 Sound';
  });
  actions.append(
    mkBtn('Reset', () => { if (mode === 'engine') device.reset(); else chipWorker?.postMessage({ type: 'reset' }); status('Reset'); }),
    mkBtn('Screenshot', () => { const a = document.createElement('a'); a.download = 'sprig.png'; a.href = vs.screenshot(); a.click(); }),
    soundBtn,
  );
  deviceCard.appendChild(actions);
  const hint = el('p', 'keymap-hint');
  hint.textContent = 'Tap the pads — or use your keyboard';
  hint.style.marginTop = '14px';
  deviceCard.appendChild(hint);
  const km = el('div', 'keymap');
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

  // Make an on-screen key behave like a physical button: fire on press, auto-repeat
  // while held (as a keyboard would), and release on up / leave / cancel.
  function bindKey(cell: HTMLElement, b: Button): void {
    let holdTimer = 0;
    let repeatTimer = 0;
    const release = (): void => {
      clearTimeout(holdTimer);
      clearInterval(repeatTimer);
      cell.classList.remove('down');
      vs.setActive(b, false);
    };
    cell.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      press(b);
      cell.classList.add('down');
      vs.setActive(b, true);
      holdTimer = window.setTimeout(() => { repeatTimer = window.setInterval(() => press(b), 120); }, 300);
    });
    cell.addEventListener('pointerup', release);
    cell.addEventListener('pointercancel', release);
    cell.addEventListener('pointerleave', release);
  }

  // 3×3 D-pad: up/left/down/right keys around an empty center. Doubles as the
  // keyboard legend and as touch controls (the keys are live buttons).
  function pad(up: string, left: string, down: string, right: string): HTMLElement {
    const p = el('div', 'pad');
    const slots = ['', up, '', left, '', right, '', down, ''];
    for (const k of slots) {
      const c = document.createElement('div');
      if (k) { c.className = 'key'; c.textContent = k.toUpperCase(); bindKey(c, k as Button); }
      else { c.className = 'key spacer'; }
      p.appendChild(c);
    }
    return p;
  }
}

// ---------------- shared helpers ----------------
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
function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
