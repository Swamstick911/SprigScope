// Live mirror of a real Sprig over USB (WebSerial).
//
// Emulating WiFi is impractical, so instead the real hardware does the
// networking and the page just shows its screen. A connected Sprig streams its
// 160x128 framebuffer over USB serial; we decode it and draw it on the 3D model.
//
// Wire protocol (device -> page), repeated per frame:
//   magic:  A5 5A C3 3C
//   pixels: 160*128 * 2 bytes, row-major (top-left first), RGB565 big-endian
// Optional (page -> device): one ASCII byte per button press (W A S D I J K L).

export const MIRROR_W = 160;
export const MIRROR_H = 128;
const FRAME_BYTES = MIRROR_W * MIRROR_H * 2;
const MAGIC = [0xa5, 0x5a, 0xc3, 0x3c];

export function serialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Streaming decoder: feed it raw serial chunks, it finds frames and calls
 * onFrame with RGBA pixel data. Pure and synchronous, so it's unit-testable
 * without any hardware.
 */
export function createFrameDecoder(onFrame: (rgba: Uint8ClampedArray) => void): (chunk: Uint8Array) => void {
  let buf = new Uint8Array(0);
  const rgba = new Uint8ClampedArray(MIRROR_W * MIRROR_H * 4);

  const decode = (px: Uint8Array): void => {
    for (let i = 0, o = 0; i < MIRROR_W * MIRROR_H; i++, o += 4) {
      const c = (px[i * 2] << 8) | px[i * 2 + 1]; // big-endian RGB565
      const r = (c >> 11) & 0x1f, g = (c >> 5) & 0x3f, b = c & 0x1f;
      rgba[o] = (r << 3) | (r >> 2);
      rgba[o + 1] = (g << 2) | (g >> 4);
      rgba[o + 2] = (b << 3) | (b >> 2);
      rgba[o + 3] = 255;
    }
    onFrame(new Uint8ClampedArray(rgba));
  };
  const magicAt = (a: Uint8Array, i: number): boolean =>
    a[i] === MAGIC[0] && a[i + 1] === MAGIC[1] && a[i + 2] === MAGIC[2] && a[i + 3] === MAGIC[3];

  return (chunk: Uint8Array): void => {
    const merged = new Uint8Array(buf.length + chunk.length);
    merged.set(buf);
    merged.set(chunk, buf.length);
    buf = merged;

    let i = 0;
    while (i + 4 + FRAME_BYTES <= buf.length) {
      if (magicAt(buf, i)) {
        decode(buf.subarray(i + 4, i + 4 + FRAME_BYTES));
        i += 4 + FRAME_BYTES;
      } else {
        i++;
      }
    }
    // keep the unconsumed tail (it may hold a partial magic or frame)
    buf = buf.slice(i);
    if (buf.length > 4 + FRAME_BYTES) buf = buf.slice(buf.length - (4 + FRAME_BYTES));
  };
}

export interface MirrorHandle {
  disconnect(): Promise<void>;
  sendButton(letter: string): void;
}

/** Ask the user to pick a serial port, then stream + decode the Sprig screen. */
export async function connectSprig(
  onFrame: (rgba: Uint8ClampedArray) => void,
  onStatus: (msg: string, err?: boolean) => void,
): Promise<MirrorHandle> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serial = (navigator as any).serial;
  if (!serial) throw new Error('This browser has no WebSerial. Try Chrome or Edge.');

  const port = await serial.requestPort();
  await port.open({ baudRate: 115200 }); // USB CDC ignores the rate, but it's required
  onStatus('Sprig connected, waiting for its screen…');

  let stopped = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reader: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer: any = port.writable ? port.writable.getWriter() : null;
  const feed = createFrameDecoder(onFrame);

  (async () => {
    try {
      while (!stopped && port.readable) {
        reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) feed(value as Uint8Array);
          }
        } finally {
          reader.releaseLock();
          reader = null;
        }
      }
    } catch (e) {
      if (!stopped) onStatus('Sprig connection lost: ' + (e as Error).message, true);
    }
  })();

  return {
    async disconnect() {
      stopped = true;
      try { await reader?.cancel(); } catch { /* ignore */ }
      try { writer?.releaseLock(); } catch { /* ignore */ }
      try { await port.close(); } catch { /* ignore */ }
    },
    sendButton(letter: string) {
      if (!writer) return;
      writer.write(new Uint8Array([letter.toUpperCase().charCodeAt(0)])).catch(() => { /* ignore */ });
    },
  };
}
