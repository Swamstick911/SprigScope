import { describe, it, expect } from 'vitest';
import { BOARD_ASPECT, SCREEN_RECT, BUTTON_POS } from '../src/geometry';

describe('geometry', () => {
  it('screen rect is the 5:4 region from the PCB', () => {
    const aspect = (SCREEN_RECT.w * BOARD_ASPECT) / SCREEN_RECT.h;
    expect(aspect).toBeCloseTo(1.25, 2);
  });
  it('has all 8 buttons with fractional positions inside the board', () => {
    const keys = Object.keys(BUTTON_POS).sort().join('');
    expect(keys).toBe('adijklsw');
    for (const p of Object.values(BUTTON_POS)) {
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(1);
    }
  });
  it('left and right clusters are mirrored around center', () => {
    expect(BUTTON_POS.w.x + BUTTON_POS.i.x).toBeCloseTo(BUTTON_POS.s.x + BUTTON_POS.k.x, 3);
    expect(BUTTON_POS.w.y).toBeCloseTo(BUTTON_POS.i.y, 3);
  });
});
