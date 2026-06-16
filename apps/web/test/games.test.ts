import { describe, it, expect } from 'vitest';
import { DEMO_GAMES } from '../src/games';
import { EngineBackend } from '@sprigscope/core';

describe('demo games', () => {
  it('every bundled game loads and renders without throwing', () => {
    expect(DEMO_GAMES.length).toBeGreaterThan(0);
    for (const g of DEMO_GAMES) {
      const dev = new EngineBackend();
      expect(() => dev.loadGame(g.source, g.name)).not.toThrow();
      const fb = dev.getFramebuffer();
      let nonWhite = 0;
      for (let i = 0; i < fb.data.length; i += 4) {
        if (!(fb.data[i] === 255 && fb.data[i + 1] === 255 && fb.data[i + 2] === 255)) nonWhite++;
      }
      expect(nonWhite).toBeGreaterThan(0);
    }
  });
});
