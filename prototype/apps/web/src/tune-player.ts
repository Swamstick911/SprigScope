import { playTuneHelper } from 'sprig/web';
import type { TuneHandle } from '@sprigscope/core';

// Web Audio playback for the engine games. Sprig's own helper does the actual
// note scheduling; we just own the AudioContext so we can unlock it on the first
// user gesture (browsers suspend audio until then) and offer a mute toggle.

let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Resume audio on the first click/keypress, as required for autoplay policies. */
export function unlockAudioOnGesture(): void {
  const unlock = (): void => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

/** Plug into EngineBackend.setTunePlayer — plays a Sprig tune through Web Audio. */
export function playTune(tune: unknown, repeats = 1): TuneHandle {
  if (muted || !Array.isArray(tune)) return { end() {}, isPlaying: () => false };
  const c = audio();
  const ref = { playing: true };
  void playTuneHelper(tune, repeats, ref, c, c.destination);
  return { end: () => { ref.playing = false; }, isPlaying: () => ref.playing };
}
