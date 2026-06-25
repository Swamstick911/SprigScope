import { describe, it, expect } from 'vitest';
import { EngineBackend } from '../src/backends/engine-backend';
import { SCREEN_W } from '../src/framebuffer';

const RED: [number, number, number] = [235, 44, 71]; // palette '3'
const px = (d: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * SCREEN_W + x) * 4;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
};

// A 10×8 game with a solid-red 16×16 sprite 'r' at tile (0,0); 'd' moves it right.
const GAME = `
const r = bitmap\`
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333\`;
setLegend(['r', r]);
setMap(map\`
r.........
..........
..........
..........
..........
..........
..........
..........\`);
onInput('d', () => { getFirst('r').x += 1; });
`;

describe('EngineBackend', () => {
  it('reports not-loaded before a game and a blank white frame', () => {
    const dev = new EngineBackend();
    expect(dev.getStatus().loaded).toBe(false);
    expect(px(dev.getFramebuffer().data, 8, 8)).toEqual([255, 255, 255, 255]);
  });

  it('loads a game and renders the sprite at tile (0,0) as 160×128', () => {
    const dev = new EngineBackend();
    dev.loadGame(GAME, 'test');
    const fb = dev.getFramebuffer();
    expect(fb.width).toBe(160);
    expect(fb.height).toBe(128);
    expect(dev.getStatus().loaded).toBe(true);
    // center of tile (0,0) is red; far tile is white
    expect(px(fb.data, 8, 8).slice(0, 3)).toEqual(RED);
    expect(px(fb.data, 152, 8)).toEqual([255, 255, 255, 255]);
  });

  it('moves the sprite on pressButton("d") and emits a frame', () => {
    const dev = new EngineBackend();
    dev.loadGame(GAME);
    let frames = 0;
    dev.onFrame(() => { frames++; });
    dev.pressButton('d');
    const fb = dev.getFramebuffer();
    expect(frames).toBeGreaterThan(0);
    expect(px(fb.data, 8, 8)).toEqual([255, 255, 255, 255]); // tile (0,0) now empty
    expect(px(fb.data, 24, 8).slice(0, 3)).toEqual(RED);     // tile (1,0) now red
  });

  it('throws a clear error on broken game JS', () => {
    const dev = new EngineBackend();
    expect(() => dev.loadGame('this is not ( valid javascript')).toThrow(/Failed to load game/);
  });

  it('getState reports dimensions and sprite positions', () => {
    const dev = new EngineBackend();
    expect(dev.getState!()).toBeNull(); // nothing loaded
    dev.loadGame(GAME);
    const st = dev.getState!()!;
    expect(st.dimensions).toEqual({ width: 10, height: 8 });
    expect(st.sprites.some((s) => s.type === 'r' && s.x === 0 && s.y === 0)).toBe(true);
  });

  it('reset re-runs the last game to a clean state', () => {
    const dev = new EngineBackend();
    dev.loadGame(GAME);
    dev.pressButton('d'); // move right
    dev.reset();
    expect(px(dev.getFramebuffer().data, 8, 8).slice(0, 3)).toEqual(RED); // back at (0,0)
  });
});
