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

function sampleInto(src: ImageData, q: Quad, out: Uint8ClampedArray): void {
    const { data, width: sw, height: sh } = src;
    for (let oy = 0; oy < SCREEN_H; oy++) {
        const t = (oy + 0.5) / SCREEN_H;
        for (let ox = 0; ox < SCREEN_W; ox++) {
            const p = quadSample(q, (ox + 0.5) / SCREEN_W, t);
            let sx = Math.round(p.x * sw), sy = Math.round(p.y * sh);
            sx = sx < 0 ? 0 : sx >= sw ? sw - 1 : sx;
            sy = sy < 0 ? 0 : sy >= sh ? sh - 1 : sy;
            const si = (sy * sw + sx) * 4, oi = (oy * SCREEN_W + ox) * 4;
            out[oi] = data[si]; out[oi + 1] = data[si + 1]; out[oi + 2] = data[si + 2]; out[oi + 3] = 255;
        }
    }
}

function loadQuad(): Quad {
    try {
        const raw = store.get(QUAD_KEY);
        if (raw) {
            const q = JSON.parse(raw);
            if (Array.isArray(q) && q.length === 4 && q.every((p) => typeof p?.x === 'number')) return q as Quad;
        } 
    } catch { }
    return DEFAULT_QUAD.map((p) => ({ ...p })) as Quad;
}

export class CameraSource implements ScreenSource {
    readonly kind = 'camera' as const;
    readonly available = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

    private readonly frameCbs = new Set<(fb: Framebuffer) => void>();
    private readonly statusCbs = new Set<StatusFn>();
    private stream: MediaStream | null = null;
    private video: HTMLVideoElement | null = null;
    private readonly canvas = document.createElement('canvas');
    private readonly out = new Uint8ClampedArray(FRAME_BYTES_RGBA);
    private quad: Quad = loadQuad();
    private raf = 0;

    onFrame(cb: (fb: Framebuffer) => void): () => void { this.frameCbs.add(cb); return () => this.frameCbs.delete(cb); }
    onStatus(cb: StatusFn): () => void { this.statusCbs.add(cb); return () => this.statusCbs.delete(cb); }
    private status(msg: string, err = false): void { this.statusCbs.forEach((c) => c(msg, err)); }

    async start(): Promise<void> {
        if (!this.available) throw new Error('This browser has no camera access (getUserMedia)');
        this.status('Allow camera access...');
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
        });
        this.video = document.createElement('video');
        this.video.playsInline = true; this.video.muted = true;
        this.video.srcObject = this.stream;
        await this.video.play();
        await this.calibrate();
        this.status('Mirroring your Sprig (view only)');
        this.pump();
    }

    async stop(): Promise<void> {
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        if (this.video) { this.video.srcObject = null; this.video = null; }
    }

    private pump = (): void => {
        const video = this.video;
        if (!video) return;
        const sw = video.videoWidth || 1, sh = video.videoHeight || 1;
        if (this.canvas.width !== sw) this.canvas.width = sw;
        if (this.canvas.height !== sh) this.canvas.height = sh;
        try {
            const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(video, 0, 0, sw, sh);
            sampleInto(ctx.getImageData(0, 0, sw, sh), this.quad, this.out);
            this.frameCbs.forEach((c) => c(frameFromRgba(new Uint8ClampedArray(this.out))));
        } catch { }
        this.raf = requestAnimationFrame(this.pump);
    };

    private calibrate(): Promise<void> {
        return new Promise((resolve, reject) => {
            const video = this.video!;
            const SVGNS = 'http://www.w3.org/2000/svg';
            const overlay = div('cam-overlay'), stage = div('cam-stage');
            video.className = 'cam-video';
            const svg = document.createElementNS(SVGNS, 'svg');
            svg.setAttribute('class', 'cam-poly'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
            const poly = document.createElementNS(SVGNS, 'polygon');
            svg.appendChild(poly);
            stage.append(video, svg);

            const handles = this.quad.map((_, i) => { const h = div('cam-handle'); h.dataset.i = String(i); stage.appendChild(h); return h; });
            const draw = (): void => {
                poly.setAttribute('points', this.quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' '));
                handles.forEach((h, i) => { h.style.left = this.quad[i].x * 100 + '%'; h.style.top = this.quad[i].y * 100 + '%'; });
            };
            draw();

            let dragging = -1;
            const onMove = (e: PointerEvent): void => {
                if (dragging < 0) return;
                const r = stage.getBoundingClientRect();
                this.quad[dragging] = {
                    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
                    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
                };
                draw();
            };
            handles.forEach((h, i) => {
                h.addEventListener('pointerdown', (e) => { e.preventDefault(); dragging = i; h.setPointerCapture(e.pointerId); });
                h.addEventListener('pointerup', (e) => { dragging = -1; h.releasePointerCapture(e.pointerId); store.set(QUAD_KEY, JSON.stringify(this.quad)); }); 
            });
            window.addEventListener('pointermove', onMove);

            const bar = div('cam-bar'), tip = document.createElement('p');
            tip.className = 'cam-tip'; tip.textContent = 'Drag the four dots onto your Sprig screen corners';
            const startB = btn('Start Mirroring', () => { close(); resolve(); }); startB.classList.add('primary');
            const cancelB = btn('Cancel', () => { close(); reject(new Error('Camera cancelled')); });
            bar.append(tip, startB, cancelB);
            overlay.append(stage, bar);
            document.body.appendChild(overlay);

            function close(): void { window.removeEventListener('pointermove', onMove); overlay.remove(); }
        });
    }
}

function div(cls: string): HTMLDivElement { const d = document.createElement('div'); d.className = cls; return d; }
function btn(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.addEventListener('click', onClick); return b;
}