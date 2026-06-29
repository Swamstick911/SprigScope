import {
    rgb565ToRgba, frameFromRgba, FRAME_PIXELS, FRAME_BYTES_RGBA, type Framebuffer,
} from './framebuffer';
import type { ScreenSource, StatusFn } from './source';
import type { Button } from './buttons';

const MAGIC = [0xa5, 0x5a, 0xc3, 0x3c];
const FRAME_BYTES_565 = FRAME_PIXELS * 2;

export function createFrameDecoder(onFrame: (rgba: Uint8ClampedArray) => void): (chunk: Uint8Array) => void {
    let buf = new Uint8Array(0);
    const rgba = new Uint8ClampedArray(FRAME_BYTES_RGBA);
    const magicAt = (a: Uint8Array, i: number): boolean =>
        a[i] === MAGIC[0] && a[i + 1] === MAGIC[1] && a[i + 2] === MAGIC[2] && a[i + 3] === MAGIC[3];
    
    return (chunk: Uint8Array): void => {
        const merged = new Uint8Array(buf.length + chunk.length);
        merged.set(buf);
        merged.set(chunk, buf.length);
        buf = merged;

        let i = 0;
        while (i + 4 + FRAME_BYTES_565 <= buf.length) {
            if (magicAt(buf, i)) {
                rgb565ToRgba(buf.subarray(i + 4, i + 4 + FRAME_BYTES_565), rgba);
                onFrame(new Uint8ClampedArray(rgba));
                i += 4 + FRAME_BYTES_565;
            } else {
                i++;
            }
        }
        buf = buf.slice(i);
        if (buf.length > 4 + FRAME_BYTES_565) buf = buf.slice(buf.length - (4 + FRAME_BYTES_565));
    };
}

export class SerialSource implements ScreenSource {
    readonly kind = 'serial' as const;
    readonly available = typeof navigator !== 'undefined' && 'serial' in navigator;

    private readonly frameCbs = new Set<(fb: Framebuffer) => void>();
    private readonly statusCbs = new Set<StatusFn>();
    private port: SerialPort | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private stopped = false;

    onFrame(cb: (fb: Framebuffer) => void): () => void { this.frameCbs.add(cb); return () => this.frameCbs.delete(cb); }
    onStatus(cb: StatusFn): () => void { this.statusCbs.add(cb); return () => this.statusCbs.delete(cb); }
    private emitFrame(rgba: Uint8ClampedArray): void { const fb = frameFromRgba(rgba); this.frameCbs.forEach((cb) => cb(fb)); }
    private status(msg: string, err = false): void { this.statusCbs.forEach((c) => c(msg, err)); }

    async start(): Promise<void> {
        if (!this.available) throw new Error('This browser has no WebSerial, try chrome or edge');
        this.stopped = false;
        this.status('Pick your sprig in the popup...');
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        this.port = port;
        this.writer = port.writable ? port.writable.getWriter() : null; 
        this.status('Port open, listening for the Sprig screen...');

        let bytesIn = 0, framesIn = 0;
        const head: number[] = [];
        const hex = (b: number[]): string => b.map((x) => x.toString(16).padStart(2, '0')).join(' ');
        const decode = createFrameDecoder((rgba) => { framesIn++; this.emitFrame(rgba); });

        setTimeout(() => {
            if (this.stopped || framesIn > 0) return;
            if (bytesIn === 0) {
                this.status('Port is open but silent, a stock Sprig runs games, it does not stream its screen. Nothing to mirror without streaming firmware.', true);
            } else {
                this.status(`Recieving ${bytesIn} bytes but no frames (starts with ${hex(head)}). This port is not streaming the framebuffer format the mirror needs`, true);
            }
        }, 3000);

        void (async () => {
            try {
                while (!this.stopped && port.readable) {
                    const reader = port.readable.getReader();
                    this.reader = reader;
                    try {
                        for(;;) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            if (value) {
                                bytesIn += value.length;
                                for (let i = 0; i < value.length && head.length < 16 ; i++) head.push(value[i]);
                                decode(value);
                            }
                        }
                    } finally {
                        reader.releaseLock();
                        this.reader = null;
                    }
                }
            } catch (e) {
                if (!this.stopped) this.status('Sprig connection lost: ' + (e as Error).message, true);
            }
        })();
    }

    sendButton(btn: Button): void {
        if (!this.writer) return;
        void this.writer.write(new Uint8Array([btn.toUpperCase().charCodeAt(0)])).catch(() => { });
    }

    async stop(): Promise<void> {
        this.stopped = true;
        try { await this.reader?.cancel(); } catch { }
        try { await this.port?.close(); } catch { }
        this.reader = null;
        this.writer = null;
        this.port = null;
    }
}