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
