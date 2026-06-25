import type { Button, GameStateSnapshot } from '@sprigscope/core';

// A tiny game-playing bot. Given the engine's symbolic state (the same one the
// MCP server exposes to a real AI), it picks the next button to press: walk
// toward things to collect or reach, and step away from things to dodge.
//
// Kept pure and synchronous so the decision logic is unit-testable without a
// browser. The web app just calls chooseMove on a timer.

export interface BotConfig {
  /** sprite type that represents the player */
  player: string;
  /** sprite types to walk toward (nearest first) */
  seek?: string[];
  /** sprite types to keep away from */
  avoid?: string[];
  /** impassable sprite types */
  walls?: string[];
  /** which moves the bot may use (defaults to all four) */
  moves?: Button[];
}

interface Pt { x: number; y: number; }
const DIRS: { b: Button; dx: number; dy: number }[] = [
  { b: 'w', dx: 0, dy: -1 },
  { b: 's', dx: 0, dy: 1 },
  { b: 'a', dx: -1, dy: 0 },
  { b: 'd', dx: 1, dy: 0 },
];
const key = (x: number, y: number): string => x + ',' + y;

export function chooseMove(state: GameStateSnapshot, cfg: BotConfig): Button | null {
  const { width, height } = state.dimensions;
  const player = state.sprites.find((s) => s.type === cfg.player);
  if (!player) return null;

  const walls = cfg.walls ?? [];
  const avoid = cfg.avoid ?? [];
  const allowed = cfg.moves ?? (['w', 's', 'a', 'd'] as Button[]);
  const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;

  // walls and things-to-avoid both block movement during pathfinding
  const blocked = new Set<string>();
  for (const s of state.sprites) if (walls.includes(s.type) || avoid.includes(s.type)) blocked.add(key(s.x, s.y));

  const seek = cfg.seek ?? [];
  if (seek.length) {
    const targets = new Set<string>();
    for (const s of state.sprites) if (seek.includes(s.type)) targets.add(key(s.x, s.y));
    if (targets.size) {
      const step = bfsFirstStep({ x: player.x, y: player.y }, targets, blocked, inBounds, allowed);
      if (step) return step;
    }
  }

  if (avoid.length) {
    const threats = state.sprites.filter((s) => avoid.includes(s.type));
    return safestMove({ x: player.x, y: player.y }, threats, blocked, inBounds, allowed);
  }
  return null;
}

// Breadth-first search from the player to the nearest target; return the first
// step of that shortest path.
function bfsFirstStep(
  start: Pt,
  targets: Set<string>,
  blocked: Set<string>,
  inBounds: (x: number, y: number) => boolean,
  allowed: Button[],
): Button | null {
  if (targets.has(key(start.x, start.y))) return null;
  const seen = new Set<string>([key(start.x, start.y)]);
  const firstMove = new Map<string, Button>();
  const queue: Pt[] = [start];
  while (queue.length) {
    const cur = queue.shift() as Pt;
    const atStart = cur.x === start.x && cur.y === start.y;
    for (const d of DIRS) {
      if (!allowed.includes(d.b)) continue;
      const nx = cur.x + d.dx, ny = cur.y + d.dy, k = key(nx, ny);
      if (!inBounds(nx, ny) || seen.has(k) || blocked.has(k)) continue;
      seen.add(k);
      const move = atStart ? d.b : (firstMove.get(key(cur.x, cur.y)) as Button);
      firstMove.set(k, move);
      if (targets.has(k)) return move;
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

// Pick the move (or staying put) that keeps the player farthest from threats.
function safestMove(
  p: Pt,
  threats: Pt[],
  blocked: Set<string>,
  inBounds: (x: number, y: number) => boolean,
  allowed: Button[],
): Button | null {
  const minDist = (x: number, y: number): number =>
    threats.length ? Math.min(...threats.map((t) => Math.abs(t.x - x) + Math.abs(t.y - y))) : Infinity;
  let best: Button | null = null;
  let bestScore = minDist(p.x, p.y); // score for staying put
  for (const d of DIRS) {
    if (!allowed.includes(d.b)) continue;
    const nx = p.x + d.dx, ny = p.y + d.dy;
    if (!inBounds(nx, ny) || blocked.has(key(nx, ny))) continue;
    const score = minDist(nx, ny);
    if (score > bestScore) { bestScore = score; best = d.b; }
  }
  return best;
}
