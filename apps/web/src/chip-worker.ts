// Runs the RP2040 chip emulator (firmware) off the main thread so the 3D stays smooth.
import { Rp2040Backend } from '@sprigscope/rp2040';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

let backend: Rp2040Backend | null = null;
let running = false;

function loop(): void {
  if (!running || !backend) return;
  const fb = backend.getFramebuffer(); // advances the emulation and renders one frame
  const buf = fb.data.buffer; // fresh buffer each frame — safe to transfer
  ctx.postMessage({ type: 'frame', data: buf, width: fb.width, height: fb.height }, [buf]);
  setTimeout(loop, 0);
}

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type: string; uf2?: ArrayBuffer; button?: Parameters<Rp2040Backend['pressButton']>[0] };
  switch (msg.type) {
    case 'loadFirmware':
      backend = new Rp2040Backend();
      backend.loadFirmware(new Uint8Array(msg.uf2!));
      if (!running) { running = true; loop(); }
      break;
    case 'press':
      if (msg.button) backend?.pressButton(msg.button);
      break;
    case 'reset':
      backend?.reset();
      break;
    case 'stop':
      running = false;
      break;
  }
};
