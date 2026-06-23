// Live mirror of a real Sprig over WiFi. The device (Pico W) runs an HTTP server
// on the local network: GET /stream returns an endless frame stream in the same
// format the serial mirror uses, and POST /press takes one button letter. The
// browser page must be served over http (not https) to reach the device, because
// browsers block https pages from talking to plain http addresses.
import { createFrameDecoder } from './serial-mirror';

export interface WifiMirrorHandle {
  disconnect(): void;
  sendButton(letter: string): void;
}

export function wifiMirrorAvailable(): boolean {
  return typeof location === 'undefined' || location.protocol !== 'https:';
}

export async function connectWifi(
  ip: string,
  onFrame: (rgba: Uint8ClampedArray) => void,
  onStatus: (msg: string, err?: boolean) => void,
): Promise<WifiMirrorHandle> {
  const base = 'http://' + ip.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const ctrl = new AbortController();
  onStatus('Connecting to ' + ip + '…');

  let frames = 0;
  const decode = createFrameDecoder((rgba) => { frames++; onFrame(rgba); });

  (async () => {
    try {
      const res = await fetch(base + '/stream', { signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      onStatus('Connected, waiting for the screen…');
      const reader = res.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) decode(value);
      }
      if (!ctrl.signal.aborted) onStatus('Stream ended', true);
    } catch (e) {
      if (!ctrl.signal.aborted) {
        onStatus('Could not reach the Sprig at ' + ip + '. Check the IP and that the page is on http, not https. (' + (e as Error).message + ')', true);
      }
    }
  })();

  setTimeout(() => {
    if (!ctrl.signal.aborted && frames === 0) {
      onStatus('Connected but no frames yet. Is the Sprig running mirror firmware?', true);
    }
  }, 3000);

  return {
    disconnect() { ctrl.abort(); },
    sendButton(letter: string) {
      fetch(base + '/press', { method: 'POST', body: letter.toUpperCase() }).catch(() => { /* ignore */ });
    },
  };
}
