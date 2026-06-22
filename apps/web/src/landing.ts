import { EngineBackend } from '@sprigscope/core';
import type { VirtualSprig3D } from './virtual-sprig-3d';
import { DEMO_GAMES } from './games';
import { chooseMove } from './autoplay';

// A maker's hand-annotated intro: the real Sprig sits on warm graph paper while
// handwritten callouts point at its parts and follow it as it turns. "Boot it up"
// hands the same (already-loaded) model over to the app.

interface Anno { node: string; label: string; side: 'l' | 'r'; }

const ANNOS: Anno[] = [
  // front of the board
  { node: 'a', label: 'move · W A S D', side: 'l' },
  { node: 'l', label: 'action · I J K L', side: 'r' },
  { node: 'usbc', label: 'micro USB', side: 'l' },
  // flip it over for the back
  { node: 'rp2040', label: 'Raspberry Pi Pico', side: 'r' },
  { node: 'speaker', label: 'speaker', side: 'l' },
];

const SVGNS = 'http://www.w3.org/2000/svg';

export function mountLanding(opts: {
  mount3d: (holder: HTMLElement) => VirtualSprig3D;
  onLaunch: (vs: VirtualSprig3D) => void;
}): void {
  const root = document.createElement('div');
  root.className = 'landing';
  root.innerHTML =
    '<div class="ln-3d"></div>' +
    '<svg class="ln-lines"></svg>' +
    '<div class="ln-copy">' +
    '<div class="ln-kicker">a Hack Club Sprig, reimagined</div>' +
    '<h1 class="ln-h">no Sprig?<br /><span class="u">no problem.</span></h1>' +
    '<p class="ln-sub">a real RP2040 and the actual 160×128 screen, running right here in your browser.</p>' +
    '<button class="ln-start" type="button" hidden>boot it up →</button>' +
    '<div class="ln-loading">warming up the chip…</div>' +
    '</div>' +
    '<span class="ln-sticker s1">RP2040 inside</span>' +
    '<span class="ln-sticker s2">made @ hack club</span>' +
    '<span class="ln-sticker s3">MIT · v1.0</span>';
  document.body.appendChild(root);

  const holder = root.querySelector('.ln-3d') as HTMLElement;
  const svg = root.querySelector('.ln-lines') as SVGSVGElement;
  const startBtn = root.querySelector('.ln-start') as HTMLButtonElement;
  const loadingEl = root.querySelector('.ln-loading') as HTMLElement;

  const vs = opts.mount3d(holder);
  vs.setFraming(1.5); // fill the right-hand area the device is given (copy lives to its left)

  // Light up the hero with a game the bot plays on its own, so the first thing a
  // visitor sees is an AI actually playing the Sprig. Collector is input-driven
  // (no timers to leak on restart) and the coin grabbing reads clearly.
  const demoGame = DEMO_GAMES[1];
  const demo = new EngineBackend();
  demo.loadGame(demoGame.source, demoGame.name);
  let botFrame = 0;
  let reloading = false;

  const labels = ANNOS.map((a) => {
    const el = document.createElement('div');
    el.className = 'ln-anno ln-' + a.side;
    el.textContent = a.label;
    root.appendChild(el);
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('class', 'ln-line');
    const dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('class', 'ln-dot');
    dot.setAttribute('r', '9');
    svg.append(path, dot);
    return { a, el, path, dot };
  });

  let modelReady = false;
  vs.onReady(() => {
    modelReady = true;
    loadingEl.style.display = 'none';
    startBtn.hidden = false;
  });

  let live = true;
  const tick = (): void => {
    if (!live) return;
    if (modelReady) {
      if (!reloading && botFrame++ % 14 === 0 && demoGame.bot) {
        const snap = demo.getState();
        if (snap && snap.texts.some((t) => /collected/i.test(t.content))) {
          reloading = true; // board cleared: restart shortly so it keeps playing
          setTimeout(() => { demo.loadGame(demoGame.source, demoGame.name); reloading = false; }, 1800);
        } else if (snap) {
          const m = chooseMove(snap, demoGame.bot);
          if (m) demo.pressButton(m);
        }
      }
      vs.updateScreen(demo.getFramebuffer());
    }
    vs.render();
    // Anchors come back in the 3D holder's own pixels; the labels + leader lines
    // live in the full-page overlay, so shift everything by the holder's offset
    // (the device sits in a right-hand column on desktop).
    const hr = holder.getBoundingClientRect();
    for (const L of labels) {
      const an = modelReady ? vs.getAnchor(L.a.node) : null;
      if (!an) { L.el.style.opacity = '0'; L.path.style.opacity = '0'; L.dot.style.opacity = '0'; continue; }
      const ax = hr.left + an.x, ay = hr.top + an.y;
      const off = L.a.side === 'l' ? -160 : 160;
      const lx = ax + off, ly = ay;
      L.el.style.transform = `translate(${lx}px, ${ly - 14}px) rotate(${L.a.side === 'l' ? -2 : 2}deg)`;
      const op = an.front ? 1 : 0.1;
      L.el.style.opacity = String(op);
      L.path.style.opacity = String(op);
      L.dot.style.opacity = String(op * 0.9);
      // bow the leader line a little so it reads as hand-drawn
      const ex = L.a.side === 'l' ? lx + L.el.offsetWidth + 6 : lx - 6;
      const ey = ly - 6;
      const cx = (ex + ax) / 2;
      const cy = (ey + ay) / 2 - 22;
      L.path.setAttribute('d', `M ${ex} ${ey} Q ${cx} ${cy} ${ax} ${ay}`);
      L.dot.setAttribute('cx', String(ax));
      L.dot.setAttribute('cy', String(ay));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const launch = (): void => {
    if (!live || startBtn.hidden) return;
    live = false;
    root.classList.add('out');
    window.removeEventListener('keydown', onKey);
    setTimeout(() => {
      labels.forEach((L) => L.el.remove());
      opts.onLaunch(vs); // hands the loaded model to the app (it re-parents + refits it)
      root.remove();
    }, 500);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launch(); }
  };
  startBtn.addEventListener('click', launch);
  window.addEventListener('keydown', onKey);
}
