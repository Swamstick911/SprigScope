import { describe, it, expect, vi, afterEach } from 'vitest';
import { connectWifi, wifiMirrorAvailable } from '../src/wifi-mirror';
import { MIRROR_W, MIRROR_H } from '../src/serial-mirror';

const FRAME = 4 + MIRROR_W * MIRROR_H * 2;
function frameBytes(): Uint8Array {
  const b = new Uint8Array(FRAME);
  b.set([0xa5, 0x5a, 0xc3, 0x3c], 0);
  return b;
}
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(c) { if (i < chunks.length) c.enqueue(chunks[i++]); else c.close(); },
  });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('wifi-mirror', () => {
  it('decodes streamed frames and reports status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: streamOf([frameBytes(), frameBytes()]) })));
    const frames: Uint8ClampedArray[] = [];
    const statuses: string[] = [];
    await connectWifi('192.168.1.50', (f) => frames.push(f), (m) => statuses.push(m));
    await new Promise((r) => setTimeout(r, 20));
    expect(frames.length).toBe(2);
    expect(frames[0].length).toBe(MIRROR_W * MIRROR_H * 4);
    expect(statuses.some((s) => /connect/i.test(s))).toBe(true);
  });

  it('sendButton POSTs the letter to /press', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, body: streamOf([]) }));
    vi.stubGlobal('fetch', fetchMock);
    const h = await connectWifi('10.0.0.7', () => {}, () => {});
    h.sendButton('w');
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/press'));
    expect(call).toBeTruthy();
    expect(String(call![0])).toBe('http://10.0.0.7/press');
    expect((call![1] as RequestInit).method).toBe('POST');
    expect((call![1] as RequestInit).body).toBe('W');
  });

  it('wifiMirrorAvailable is false on https pages', () => {
    vi.stubGlobal('location', { protocol: 'https:' } as Location);
    expect(wifiMirrorAvailable()).toBe(false);
  });
});
