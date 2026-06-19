import { describe, it, expect } from 'vitest';
import { DEMO_GAMES } from '../src/games';
import { EngineBackend, BUTTONS } from '@sprigscope/core';

describe('demo games', () => {
  for (const g of DEMO_GAMES) {
    it(`${g.name} loads, renders something, and accepts every button`, () => {
      const dev = new EngineBackend();
      expect(() => dev.loadGame(g.source, g.name)).not.toThrow();

      const fb = dev.getFramebuffer();
      let nonWhite = 0;
      for (let i = 0; i < fb.data.length; i += 4) {
        if (!(fb.data[i] === 255 && fb.data[i + 1] === 255 && fb.data[i + 2] === 255)) nonWhite++;
      }
      expect(nonWhite).toBeGreaterThan(0);

      for (const b of BUTTONS) expect(() => dev.pressButton(b)).not.toThrow();
    });
  }
});
