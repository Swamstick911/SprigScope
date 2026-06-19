import type { Button } from '@sprigscope/core';

/** Board bounding box aspect ratio (139.70mm × 64.77mm). */
export const BOARD_ASPECT = 139.7 / 64.77;

/** Live-screen rectangle as fractions of the board bbox (160×128 area, 5:4). */
export const SCREEN_RECT = { x: 0.3746, y: 0.3506, w: 0.2508, h: 0.4327 };

/** Button cap centers as fractions of the board bbox. */
export const BUTTON_POS: Record<Button, { x: number; y: number }> = {
  w: { x: 0.1364, y: 0.4902 }, // left cluster, up
  a: { x: 0.0455, y: 0.6863 }, // left
  s: { x: 0.1364, y: 0.8824 }, // down
  d: { x: 0.2273, y: 0.6863 }, // right
  i: { x: 0.8273, y: 0.4902 }, // right cluster, up
  j: { x: 0.7364, y: 0.6855 }, // left
  k: { x: 0.8273, y: 0.8816 }, // down
  l: { x: 0.9182, y: 0.6863 }, // right
};

/** Button cap diameter as a fraction of board width (~8mm / 139.7mm). */
export const BUTTON_DIAMETER = 0.057;

/** Map a board fraction (0..1, origin top-left) to model-local coords (origin center, +y up). */
export function boardFractionToLocal(fx: number, fy: number, bodyW: number, bodyH: number): { x: number; y: number } {
  return { x: (fx - 0.5) * bodyW, y: (0.5 - fy) * bodyH };
}
