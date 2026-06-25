import { SCREEN_W, SCREEN_H, frameFromRgba, FRAME_BYTES_RGBA, type Framebuffer } from './framebuffer';
import type { ScreenSource, StatusFn } from './source';

interface Pt { x: number; y: number; }

type Quad = [Pt, Pt, Pt, Pt];
const DEFAULT_QUAD: Quad = [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.7, y: 0.7}, { x: 0.3, y: 0.7 }];
const QUAD_KEY = 'spr-cam-quad';

const store = {
    get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { } },
};

function quadSample(q: Quad, s: number, t: number): Pt {
    const [tl, tr, br, bl] = q;
    const topX = tl.x + (tr.x - tl.x) * s, topY = tl.y + (tr.y - tl.y) * s;
    const botX = bl.x + (br.x - bl.x) * s, botY = bl.y + (br.y - bl.y) * s;
    return { x: topX + (botX - topX) * t, y: topY + (botY - topY) * t };
}