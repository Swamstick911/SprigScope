import { PLAYER, WALL, CRATE, GOAL, COIN, BODY, FOOD, ROCK } from './sprites';

export interface DemoGame { name: string; source: string; }

const SOKOBAN = `
const player = bitmap\`${PLAYER}\`;
const crate = bitmap\`${CRATE}\`;
const goal = bitmap\`${GOAL}\`;
const wall = bitmap\`${WALL}\`;
setLegend(['p', player], ['c', crate], ['g', goal], ['w', wall]);
setSolids(['p', 'w', 'c']);
setPushables({ p: ['c'] });
setMap(map\`
wwwwwwwwww
wp.......w
w........w
w..c.g...w
w........w
w..c.g...w
w........w
wwwwwwwwww\`);
const goals = getAll('g').length;
const hud = (m) => { clearText(); addText(m, { x: 0, y: 0, color: color\`4\` }); };
hud('Push crates onto the rings');
const move = (dx, dy) => { const p = getFirst('p'); p.x += dx; p.y += dy; };
onInput('w', () => move(0, -1)); onInput('s', () => move(0, 1));
onInput('a', () => move(-1, 0)); onInput('d', () => move(1, 0));
onInput('i', () => move(0, -1)); onInput('k', () => move(0, 1));
onInput('j', () => move(-1, 0)); onInput('l', () => move(1, 0));
afterInput(() => { if (tilesWith('c', 'g').length === goals) hud('Solved! Nice.'); });
`;

const COLLECTOR = `
const player = bitmap\`${PLAYER}\`;
const coin = bitmap\`${COIN}\`;
const wall = bitmap\`${WALL}\`;
setLegend(['p', player], ['o', coin], ['w', wall]);
setSolids(['p', 'w']);
setMap(map\`
wwwwwwwwww
w.o....o.w
w...ww...w
w.p..o...w
w..ww..o.w
w.o....o.w
w...o....w
wwwwwwwwww\`);
const total = getAll('o').length;
let got = 0;
const hud = () => { clearText(); addText('Coins ' + got + '/' + total, { x: 0, y: 0, color: color\`6\` }); };
hud();
const move = (dx, dy) => { const p = getFirst('p'); p.x += dx; p.y += dy; };
onInput('w', () => move(0, -1)); onInput('s', () => move(0, 1));
onInput('a', () => move(-1, 0)); onInput('d', () => move(1, 0));
onInput('i', () => move(0, -1)); onInput('k', () => move(0, 1));
onInput('j', () => move(-1, 0)); onInput('l', () => move(1, 0));
afterInput(() => {
  const p = getFirst('p');
  const here = getTile(p.x, p.y).filter((s) => s.type === 'o');
  if (here.length) { here.forEach((s) => s.remove()); got += here.length; hud(); }
  if (got === total) { clearText(); addText('All collected!', { x: 0, y: 1, color: color\`4\` }); }
});
`;

const SNAKE = `
const head = bitmap\`${PLAYER}\`;
const body = bitmap\`${BODY}\`;
const apple = bitmap\`${FOOD}\`;
const wall = bitmap\`${WALL}\`;
setLegend(['h', head], ['b', body], ['f', apple], ['w', wall]);
setMap(map\`
wwwwwwwwww
w........w
w........w
w........w
w........w
w........w
w........w
wwwwwwwwww\`);
const W = width(), H = height();
let snake = [{ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
let dir = { x: 1, y: 0 }, next = { x: 1, y: 0 }, dead = false, score = 0;
let fx = 7, fy = 2;
const free = () => {
  for (let t = 0; t < 300; t++) {
    const x = 1 + Math.floor(Math.random() * (W - 2));
    const y = 1 + Math.floor(Math.random() * (H - 2));
    if (!snake.some((s) => s.x === x && s.y === y)) return { x, y };
  }
  return { x: 1, y: 1 };
};
const hud = () => { clearText(); addText((dead ? 'Game over  ' : '') + 'Score ' + score, { x: 0, y: 0, color: color\`6\` }); };
const draw = () => {
  getAll('h').forEach((s) => s.remove());
  getAll('b').forEach((s) => s.remove());
  getAll('f').forEach((s) => s.remove());
  snake.forEach((s, i) => addSprite(s.x, s.y, i === 0 ? 'h' : 'b'));
  addSprite(fx, fy, 'f');
};
const turn = (x, y) => { if (dir.x + x !== 0 || dir.y + y !== 0) next = { x, y }; };
onInput('w', () => turn(0, -1)); onInput('s', () => turn(0, 1));
onInput('a', () => turn(-1, 0)); onInput('d', () => turn(1, 0));
onInput('i', () => turn(0, -1)); onInput('k', () => turn(0, 1));
onInput('j', () => turn(-1, 0)); onInput('l', () => turn(1, 0));
const tick = () => {
  if (dead) return;
  dir = next;
  const nx = snake[0].x + dir.x, ny = snake[0].y + dir.y;
  if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || snake.slice(0, -1).some((s) => s.x === nx && s.y === ny)) {
    dead = true; hud(); return;
  }
  snake.unshift({ x: nx, y: ny });
  if (nx === fx && ny === fy) { score++; const f = free(); fx = f.x; fy = f.y; } else { snake.pop(); }
  draw(); hud();
};
draw(); hud();
setInterval(tick, 180);
`;

const DODGE = `
const player = bitmap\`${PLAYER}\`;
const rock = bitmap\`${ROCK}\`;
const wall = bitmap\`${WALL}\`;
setLegend(['p', player], ['o', rock], ['w', wall]);
setMap(map\`
wwwwwwwwww
w........w
w........w
w........w
w........w
w........w
w...p....w
wwwwwwwwww\`);
const W = width(), H = height();
let dead = false, score = 0;
const hud = () => { clearText(); addText((dead ? 'Crashed!  ' : '') + 'Score ' + score, { x: 0, y: 0, color: color\`6\` }); };
const move = (dx) => { if (dead) return; const p = getFirst('p'); const nx = p.x + dx; if (nx >= 1 && nx < W - 1) p.x = nx; };
onInput('a', () => move(-1)); onInput('d', () => move(1));
onInput('j', () => move(-1)); onInput('l', () => move(1));
const tick = () => {
  if (dead) return;
  getAll('o').forEach((o) => { if (o.y + 1 >= H - 1) o.remove(); else o.y += 1; });
  const p = getFirst('p');
  if (getTile(p.x, p.y).some((s) => s.type === 'o')) { dead = true; hud(); return; }
  if (Math.random() < 0.7) { const x = 1 + Math.floor(Math.random() * (W - 2)); addSprite(x, 1, 'o'); }
  score++; hud();
};
hud();
setInterval(tick, 320);
`;

export const DEMO_GAMES: DemoGame[] = [
  { name: 'Sokoban', source: SOKOBAN },
  { name: 'Collector', source: COLLECTOR },
  { name: 'Snake', source: SNAKE },
  { name: 'Dodge', source: DODGE },
];
