import { EngineBackend } from '@sprigscope/core';
import type { VirtualSprig3D } from './virtual-sprig-3d';
import { DEMO_GAMES } from './games';

// A maker's hand-annotated intro: the real Sprig sits on warm graph paper while
// handwritten callouts point at its parts and follow it as it turns. "Boot it up"
// hands the same (already-loaded) model over to the app.

interface Anno { node: string; label: string; side: 'l' | 'r'; }

const ANNOS: Anno[] = [
  // front of the board
  { node: 'screen', label: 'the real 160×128 screen', side: 'l' },
  { node: 'a', label: 'move · W A S D', side: 'l' },
  { node: 'l', label: 'action · I J K L', side: 'r' },
  { node: 'power', label: 'power switch', side: 'r' },
  { node: 'usbc', label: 'USB-C', side: 'l' },
  // flip it over → the back
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
    '<p class="ln-sub">the whole handheld — a real RP2040 and the actual 160×128 screen — running right here in your browser.</p>' +
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
  vs.setFraming(1.4); // leave room around the device for the copy + callouts

  // light up the device's screen with a real game so the hero isn't a dead panel
  const demo = new EngineBackend();
  demo.loadGame(DEMO_GAMES[0].source, DEMO_GAMES[0].name);

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
    if (modelReady) vs.updateScreen(demo.getFramebuffer());
    vs.render();
    for (const L of labels) {
      const an = modelReady ? vs.getAnchor(L.a.node) : null;
      if (!an) { L.el.style.opacity = '0'; L.path.style.opacity = '0'; L.dot.style.opacity = '0'; continue; }
      const off = L.a.side === 'l' ? -160 : 160;
      const lx = an.x + off, ly = an.y;
      L.el.style.transform = `translate(${lx}px, ${ly - 14}px) rotate(${L.a.side === 'l' ? -2 : 2}deg)`;
      const op = an.front ? 1 : 0.1;
      L.el.style.opacity = String(op);
      L.path.style.opacity = String(op);
      L.dot.style.opacity = String(op * 0.9);
      // bow the leader line a little so it reads as hand-drawn
      const ex = L.a.side === 'l' ? lx + L.el.offsetWidth + 6 : lx - 6;
      const ey = ly - 6;
      const cx = (ex + an.x) / 2;
      const cy = (ey + an.y) / 2 - 22;
      L.path.setAttribute('d', `M ${ex} ${ey} Q ${cx} ${cy} ${an.x} ${an.y}`);
      L.dot.setAttribute('cx', String(an.x));
      L.dot.setAttribute('cy', String(an.y));
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
