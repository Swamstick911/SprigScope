import './styles.css';
import { EngineBackend, BUTTONS, type Button, type Framebuffer } from '@sprigscope/core';
import { mountVirtualSprig3D, type VirtualSprig3D } from './virtual-sprig-3d';
import { mountLanding } from './landing';
import { DEMO_GAMES } from './games';
import { playTune, unlockAudioOnGesture, setMuted, isMuted } from './tune-player';
import { connectSprig, serialSupported, type MirrorHandle } from './serial-mirror';
import { chooseMove, type BotConfig } from './autoplay';

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
  type Mode = 'engine' | 'chip' | 'mirror';
  let mode: Mode = 'engine';
  let chipWorker: Worker | null = null;
  let latestChipFrame: Framebuffer | null = null;
  let latestMirrorFrame: Framebuffer | null = null;
  let mirror: MirrorHandle | null = null;
  let currentBot: BotConfig | null = null;
  let autoTimer = 0;

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
    stopAutoplay();
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
    else if (mode === 'mirror') mirror?.sendButton(b);
    else chipWorker?.postMessage({ type: 'press', button: b });
  }

  // Mirror a real Sprig over USB: the hardware does the WiFi, the page shows its screen.
  async function toggleMirror(): Promise<void> {
    if (mirror) {
      await mirror.disconnect();
      mirror = null;
      mirrorBtn.textContent = 'Connect a real Sprig';
      loadGame(0);
      status('Sprig disconnected');
      return;
    }
    if (!serialSupported()) {
      status('Mirroring needs Chrome or Edge (WebSerial).', true);
      return;
    }
    status('Pick your Sprig in the popup…');
    try {
      mirror = await connectSprig(
        (rgba) => { latestMirrorFrame = { width: 160, height: 128, data: rgba }; },
        (msg, err) => status(msg, err),
      );
      mode = 'mirror';
      latestMirrorFrame = null;
      clearActiveGame();
      stopAutoplay();
      chipWorker?.postMessage({ type: 'stop' });
      mirrorBtn.textContent = 'Disconnect Sprig';
    } catch (e) {
      mirror = null;
      status((e as Error).message, true);
    }
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
      try { stopAutoplay(); toEngine(); clearActiveGame(); device.loadGame(await f.text(), f.name); currentBot = null; status(`Loaded ${f.name}`); }
      catch (e) { status((e as Error).message, true); }
    }),
  );
  const autoBtn = mkBtn('Watch it play', () => toggleAutoplay());
  autoBtn.style.marginTop = '8px';
  gamesCard.appendChild(autoBtn);
  panel.appendChild(gamesCard);

  function clearActiveGame(): void { gameBtns.forEach((b) => b.classList.remove('active')); }
  function loadGame(i: number): void {
    stopAutoplay();
    toEngine();
    device.loadGame(DEMO_GAMES[i].source, DEMO_GAMES[i].name);
    currentBot = DEMO_GAMES[i].bot ?? null;
    clearActiveGame();
    gameBtns[i].classList.add('active');
    status(DEMO_GAMES[i].name);
    store.set('spr-game', String(i));
  }

  // The bot: read the game state a few times a second and press a button.
  function stopAutoplay(): void {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = 0; }
    autoBtn.textContent = 'Watch it play';
  }
  function toggleAutoplay(): void {
    if (autoTimer) { stopAutoplay(); status(device.getStatus().title ?? 'Paused'); return; }
    if (mode !== 'engine' || !currentBot) { status('Load one of the games to watch it play.', true); return; }
    autoBtn.textContent = 'Stop watching';
    status('the bot is playing by itself');
    autoTimer = window.setInterval(() => {
      if (mode !== 'engine' || !currentBot) { stopAutoplay(); return; }
      const snapshot = device.getState();
      if (!snapshot) return;
      const move = chooseMove(snapshot, currentBot);
      if (move) press(move);
    }, 240);
  }

  // ---------------- panel: firmware ----------------
  const fwCard = el('section', 'card');
  fwCard.innerHTML =
    '<h2>Run firmware</h2><p class="muted">Boot any RP2040 <code>.uf2</code> file. The real binary runs in an emulator on a background thread.</p>';
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
  const mirrorNote = el('p', 'muted');
  mirrorNote.style.margin = '14px 0 8px';
  mirrorNote.textContent = 'Got a real Sprig? Plug it in over USB and mirror its screen here.';
  const mirrorBtn = mkBtn('Connect a real Sprig', () => { void toggleMirror(); });
  fwCard.append(mirrorNote, mirrorBtn);
  panel.appendChild(fwCard);

  // ---------------- panel: device actions + keymap ----------------
  const deviceCard = el('section', 'card');
  deviceCard.innerHTML = '<h2>Device</h2>';
  const actions = el('div', 'row');
  const soundBtn = mkBtn('Sound', () => {
    const m = !isMuted();
    setMuted(m);
    soundBtn.textContent = m ? 'Muted' : 'Sound';
    store.set('spr-muted', String(m));
  });
  if (store.get('spr-muted') === 'true') { setMuted(true); soundBtn.textContent = 'Muted'; }
  actions.append(
    mkBtn('Reset', () => { if (mode === 'engine') device.reset(); else chipWorker?.postMessage({ type: 'reset' }); status('Reset'); }),
    mkBtn('Screenshot', () => { const a = document.createElement('a'); a.download = 'sprig.png'; a.href = vs.screenshot(); a.click(); }),
    soundBtn,
  );
  deviceCard.appendChild(actions);
  const hint = el('p', 'keymap-hint');
  hint.textContent = 'Tap the pads, or use your keyboard';
  hint.style.marginTop = '14px';
  deviceCard.appendChild(hint);
  const km = el('div', 'keymap');
  km.append(pad('w', 'a', 's', 'd'), pad('i', 'j', 'k', 'l'));
  deviceCard.appendChild(km);
  panel.appendChild(deviceCard);

  // ---------------- about / human content ----------------
  const about = el('section', 'about');
  about.innerHTML =
    '<div>' +
    '<h2>so, what is this?</h2>' +
    "<p>I love the Hack Club Sprig, the tiny handheld you solder together yourself. I did not always have one on my desk though, so I rebuilt the whole thing in a browser tab. it boots the real RP2040 firmware, runs actual Sprig games, and draws the true 160 by 128 screen, pixel for pixel.</p>" +
    '<p>poke the buttons with a mouse, tap them on a phone, or use your keyboard. spin the board around and peek at the back. drop in your own firmware and see if it runs. no cable, no cartridge, nothing to plug in.</p>' +
    '<p class="sig">made with way too much coffee and a soft spot for tiny computers.</p>' +
    '</div>' +
    '<div class="try"><h3>things to try</h3><ul>' +
    '<li>play one of the five little games</li>' +
    '<li>press boot stock OS and watch real firmware wake up</li>' +
    '<li>drag your own .uf2 onto the page</li>' +
    '<li>flip the board over and find the Pico</li>' +
    '</ul></div>';
  app.appendChild(about);

  // ---------------- footer ----------------
  const foot = el('footer', 'foot');
  foot.innerHTML =
    `Built on Hack Club's open source <a href="https://sprig.hackclub.com" target="_blank" rel="noopener">Sprig</a> · ` +
    `3D and emulation via three.js and rp2040js · MIT licensed · ` +
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
    else if (mode === 'chip' && latestChipFrame) vs.updateScreen(latestChipFrame);
    else if (mode === 'mirror' && latestMirrorFrame) vs.updateScreen(latestMirrorFrame);
    vs.render();
    requestAnimationFrame(frame);
  }

  const saved = Number(store.get('spr-game'));
  loadGame(Number.isInteger(saved) && saved >= 0 && saved < DEMO_GAMES.length ? saved : 0);
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

// small localStorage wrapper that won't throw in private mode
const store = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
