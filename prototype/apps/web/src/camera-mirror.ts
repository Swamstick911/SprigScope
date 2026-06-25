// Optical mirror of a real Sprig: point the laptop/phone camera at the device and
// SprigScope crops + de-skews the screen onto the virtual Sprig. Nothing runs on
// the hardware, so it works with any firmware, but it is watch-only (no control
// back to the device) and only as sharp as the camera image.
//
// The screen region is marked by four draggable corners (a quad). Each output
// pixel is mapped back into the camera image by bilinear interpolation of the
// quad. That is exact for an axis-aligned screen and a good approximation when
// the camera is roughly square-on (it is not a full perspective homography).
import { MIRROR_W, MIRROR_H } from './serial-mirror';

export interface Pt { x: number; y: number; }
/** Screen corners in normalized [0,1] video coordinates: TL, TR, BR, BL. */
export type Quad = [Pt, Pt, Pt, Pt];

/** A centered default outline, used before the user calibrates. */
export const DEFAULT_QUAD: Quad = [
  { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.7, y: 0.7 }, { x: 0.3, y: 0.7 },
];

export function cameraMirrorAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
}

/** Map a normalized output coordinate (s,t in [0,1]) to a point inside the quad. */
export function quadSample(quad: Quad, s: number, t: number): Pt {
  const [tl, tr, br, bl] = quad;
  const topX = tl.x + (tr.x - tl.x) * s;
  const topY = tl.y + (tr.y - tl.y) * s;
  const botX = bl.x + (br.x - bl.x) * s;
  const botY = bl.y + (br.y - bl.y) * s;
  return { x: topX + (botX - topX) * t, y: topY + (botY - topY) * t };
}

/** Source image as raw RGBA + dimensions (e.g. from ctx.getImageData). */
export interface SrcImage { data: Uint8ClampedArray; width: number; height: number; }

/**
 * Warp the quad region of `src` into a 160x128 RGBA buffer (nearest sampling).
 * Pure and canvas-free so it can be unit-tested without a camera.
 */
export function sampleInto(src: SrcImage, quad: Quad, out: Uint8ClampedArray): void {
  const { data, width: sw, height: sh } = src;
  for (let oy = 0; oy < MIRROR_H; oy++) {
    const t = (oy + 0.5) / MIRROR_H;
    for (let ox = 0; ox < MIRROR_W; ox++) {
      const s = (ox + 0.5) / MIRROR_W;
      const p = quadSample(quad, s, t);
      let sx = Math.round(p.x * sw);
      let sy = Math.round(p.y * sh);
      if (sx < 0) sx = 0; else if (sx >= sw) sx = sw - 1;
      if (sy < 0) sy = 0; else if (sy >= sh) sy = sh - 1;
      const si = (sy * sw + sx) * 4;
      const oi = (oy * MIRROR_W + ox) * 4;
      out[oi] = data[si];
      out[oi + 1] = data[si + 1];
      out[oi + 2] = data[si + 2];
      out[oi + 3] = 255;
    }
  }
}

export interface CameraHandle {
  video: HTMLVideoElement;
  stop(): void;
}

/** Ask for the camera and return a playing <video> plus a stop() that frees it. */
export async function startCamera(): Promise<CameraHandle> {
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) throw new Error('This browser has no camera access (getUserMedia).');
  const stream = await md.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  return {
    video,
    stop() {
      stream.getTracks().forEach((tr) => tr.stop());
      video.srcObject = null;
    },
  };
}

/** Reusable scratch buffers for {@link extractFrame}. */
export interface Scratch { canvas: HTMLCanvasElement; out: Uint8ClampedArray; }

export function makeScratch(): Scratch {
  return { canvas: document.createElement('canvas'), out: new Uint8ClampedArray(MIRROR_W * MIRROR_H * 4) };
}

/**
 * Grab the current camera frame, warp the quad region into 160x128 RGBA, and
 * return it (the shared scratch.out, valid until the next call).
 */
export function extractFrame(video: HTMLVideoElement, quad: Quad, scratch: Scratch): Uint8ClampedArray {
  const sw = video.videoWidth || 1;
  const sh = video.videoHeight || 1;
  const cv = scratch.canvas;
  if (cv.width !== sw) cv.width = sw;
  if (cv.height !== sh) cv.height = sh;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, sw, sh);
  const src = ctx.getImageData(0, 0, sw, sh);
  sampleInto({ data: src.data, width: sw, height: sh }, quad, scratch.out);
  return scratch.out;
}
