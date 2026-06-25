import { describe, it, expect } from 'vitest';
import { EngineBackend, SCREEN_W, SCREEN_H, BUTTONS } from '../src/index';

describe('package entry', () => {
  it('exports the public surface', () => {
    expect(SCREEN_W).toBe(160);
    expect(SCREEN_H).toBe(128);
    expect(BUTTONS).toHaveLength(8);
    expect(new EngineBackend().getStatus().backend).toBe('engine');
  });
});
