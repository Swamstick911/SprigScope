import { describe, it, expect } from 'vitest';
import { chooseMove, type BotConfig } from '../src/autoplay';
import type { GameStateSnapshot } from '@sprigscope/core';

function state(width: number, height: number, sprites: { type: string; x: number; y: number }[]): GameStateSnapshot {
  return { dimensions: { width, height }, sprites, texts: [] };
}

describe('autoplay bot', () => {
  const collect: BotConfig = { player: 'p', seek: ['o'], walls: ['w'] };

  it('walks straight toward the nearest target', () => {
    const s = state(4, 1, [{ type: 'p', x: 0, y: 0 }, { type: 'o', x: 3, y: 0 }]);
    expect(chooseMove(s, collect)).toBe('d');
  });

  it('paths around a wall instead of into it', () => {
    const s = state(3, 3, [
      { type: 'p', x: 0, y: 0 },
      { type: 'w', x: 1, y: 0 },
      { type: 'o', x: 2, y: 0 },
    ]);
    expect(chooseMove(s, collect)).toBe('s'); // can't go right, so go down and around
  });

  it('picks the nearest of several targets', () => {
    const s = state(7, 1, [
      { type: 'p', x: 3, y: 0 },
      { type: 'o', x: 6, y: 0 },
      { type: 'o', x: 1, y: 0 },
    ]);
    expect(chooseMove(s, collect)).toBe('a'); // x=1 is two away, x=6 is three away
  });

  it('treats things to avoid as blocked while seeking', () => {
    const snake: BotConfig = { player: 'h', seek: ['f'], walls: ['w'], avoid: ['b'] };
    const s = state(3, 3, [
      { type: 'h', x: 0, y: 0 },
      { type: 'b', x: 1, y: 0 },
      { type: 'f', x: 2, y: 0 },
    ]);
    expect(chooseMove(s, snake)).toBe('s'); // body blocks the direct route
  });

  it('steps away from a threat when only dodging', () => {
    const dodge: BotConfig = { player: 'p', avoid: ['o'], moves: ['a', 'd'] };
    const s = state(3, 4, [{ type: 'p', x: 1, y: 3 }, { type: 'o', x: 1, y: 1 }]);
    expect(['a', 'd']).toContain(chooseMove(s, dodge));
  });

  it('returns null when there is no player', () => {
    expect(chooseMove(state(3, 3, [{ type: 'o', x: 1, y: 1 }]), collect)).toBeNull();
  });

  it('returns null when already on the only target', () => {
    expect(chooseMove(state(3, 3, [{ type: 'p', x: 1, y: 1 }, { type: 'o', x: 1, y: 1 }]), collect)).toBeNull();
  });
});
