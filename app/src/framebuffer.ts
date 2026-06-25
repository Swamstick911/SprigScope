export const SCREEN_W = 160;
export const SCREEN_H = 128;
export const FRAME_PIXELS = SCREEN_W * SCREEN_H;
export const FRAME_BYTES_RGBA = FRAME_PIXELS * 4;

export interface Framebuffer {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
}

export function blankScreen(): Framebuffer {
    const data = new Uint8ClampedArray(FRAME_BYTES_RGBA);
    for (let o = 3; o < data.length; o += 4) data[o] = 255;
    return { width: SCREEN_W, height: SCREEN_H, data };
}

export function frameFromRgba(data: Uint8ClampedArray): Framebuffer {
    if (data.length !== FRAME_BYTES_RGBA) {
        throw new Error(`expected ${FRAME_BYTES_RGBA} RGBA bytes, got ${data.length}`);
    }
    return { width: SCREEN_W, height: SCREEN_H, data };
}

export function rgb565ToRgba(px: Uint8Array, out: Uint8ClampedArray): void {
    for (let i = 0, o = 0; i < FRAME_PIXELS; i++, o += 4) {
        const c = (px[i * 2] << 8) | px[i * 2 + 1];
        const r = (c >> 11) & 0x1f, g = (c >> 5) & 0x3f, b = c & 0x1f;
        out[o] = (r << 3) | (r >> 2);
        out[o + 1] = (g << 2) | (g >> 4);
        out[o + 2] = (b << 3) | (b >> 2);
        out[o + 3] = 255;
    }
}