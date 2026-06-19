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

export const DEMO_GAMES: DemoGame[] = [
  { name: 'Sokoban', source: SOKOBAN },
  { name: 'Collector', source: COLLECTOR },
];
