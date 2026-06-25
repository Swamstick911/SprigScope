/** The 8 Sprig buttons (two diamond clusters: WASD + IJKL). */
export type Button = 'w' | 'a' | 's' | 'd' | 'i' | 'j' | 'k' | 'l';

export const BUTTONS: readonly Button[] = ['w', 'a', 's', 'd', 'i', 'j', 'k', 'l'];

/** A rendered Sprig screen: always 160×128 RGBA (4 bytes/pixel, row-major). */
export interface Framebuffer {
  readonly width: 160;
  readonly height: 128;
  readonly data: Uint8ClampedArray; // length 160*128*4
}

export interface DeviceStatus {
  /** True once content is loaded and the device is producing frames. */
  running: boolean;
  loaded: boolean;
  backend: 'engine' | 'rp2040';
  /** Optional human title (e.g. game name). */
  title?: string;
}

/** A symbolic snapshot of what's on screen — cheap for an AI to reason over. */
export interface GameStateSnapshot {
  dimensions: { width: number; height: number };
  sprites: { type: string; x: number; y: number }[];
  texts: { x: number; y: number; content: string }[];
}

/**
 * Backend-agnostic Sprig device. The engine backend and the future rp2040 chip
 * backend both implement this; the GUI and MCP server depend only on it.
 */
export interface SprigDevice {
  /** Load Sprig game JS source and start producing frames. Throws on load error. */
  loadGame(source: string, title?: string): void;
  /** Re-load the last-loaded content from scratch (clean state). */
  reset(): void;
  /** Press-and-hold semantics. The engine backend treats any `down=true` as one press. */
  setButton(btn: Button, down: boolean): void;
  /** One discrete press (one input tick). */
  pressButton(btn: Button): void;
  /** Snapshot the current 160×128 frame. */
  getFramebuffer(): Framebuffer;
  /** Subscribe to frames (fired after load and after each input). Returns an unsubscribe fn. */
  onFrame(cb: (fb: Framebuffer) => void): () => void;
  getStatus(): DeviceStatus;
  /** Symbolic game state — available on the engine backend; pixel-only backends omit it. */
  getState?(): GameStateSnapshot | null;
}
