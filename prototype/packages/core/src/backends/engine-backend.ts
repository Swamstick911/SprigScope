import { installImageDataShim } from '../platform/imagedata';
installImageDataShim(); // must run before the engine constructs any ImageData

import { imageDataEngine } from 'sprig/image-data';
import type { Button, DeviceStatus, Framebuffer, GameStateSnapshot, SprigDevice } from '../device';
import { SCREEN_W, SCREEN_H, blankScreen, compositeOver } from '../framebuffer';
import { scaleToScreen } from '../render/scale';
import { renderTextOverlay, type TextElement } from '../render/text';

type Engine = ReturnType<typeof imageDataEngine>;

/** Handle returned by a tune player, matching the sprig engine's playTune() contract. */
export interface TuneHandle {
  end(): void;
  isPlaying(): boolean;
}

/** A host-supplied player for game audio. The browser wires this to Web Audio; on
 *  Node (the MCP server) it's left unset and tunes are silently dropped. */
export type TunePlayer = (tune: unknown, repeats: number) => TuneHandle;

const SILENT: TuneHandle = { end() {}, isPlaying: () => false };

export class EngineBackend implements SprigDevice {
  private game: Engine | null = null;
  private source = '';
  private title?: string;
  private tunePlayer: TunePlayer | null = null;
  private readonly listeners = new Set<(fb: Framebuffer) => void>();

  /** Route the running game's playTune() calls to a host audio player. */
  setTunePlayer(player: TunePlayer | null): void {
    this.tunePlayer = player;
  }

  loadGame(source: string, title?: string): void {
    this.source = source;
    this.title = title;
    const game = imageDataEngine();
    // The headless engine stubs playTune to a no-op; route it to the host player
    // (if any) so the game can actually make sound.
    game.api.playTune = ((tune: unknown, repeats = 1) =>
      this.tunePlayer ? this.tunePlayer(tune, repeats) : SILENT) as typeof game.api.playTune;
    try {
      const fn = new Function(...Object.keys(game.api), source);
      fn(...Object.values(game.api));
    } catch (e) {
      this.game = null;
      throw new Error(`Failed to load game: ${(e as Error).message}`);
    }
    this.game = game;
    this.emit();
  }

  reset(): void {
    if (this.source) this.loadGame(this.source, this.title);
  }

  pressButton(btn: Button): void {
    if (!this.game) return;
    this.game.button(btn);
    this.emit();
  }

  setButton(btn: Button, down: boolean): void {
    if (down) this.pressButton(btn);
  }

  getFramebuffer(): Framebuffer {
    const data = this.game ? this.renderFrame(this.game) : blankScreen();
    return { width: SCREEN_W, height: SCREEN_H, data };
  }

  onFrame(cb: (fb: Framebuffer) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getStatus(): DeviceStatus {
    return { running: this.game !== null, loaded: this.game !== null, backend: 'engine', title: this.title };
  }

  getState(): GameStateSnapshot | null {
    if (!this.game) return null;
    const s = this.game.state;
    return {
      dimensions: { width: s.dimensions.width, height: s.dimensions.height },
      sprites: s.sprites.map((sp) => ({ type: sp.type, x: sp.x, y: sp.y })),
      texts: s.texts.map((t) => ({ x: t.x, y: t.y, content: t.content })),
    };
  }

  private renderFrame(game: Engine): Uint8ClampedArray {
    const img = game.render(); // ImageData: mapW*16 × mapH*16
    const base = scaleToScreen({ width: img.width, height: img.height, data: img.data });
    const overlay = renderTextOverlay(game.state.texts as unknown as TextElement[]);
    return compositeOver(base, overlay);
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const fb = this.getFramebuffer();
    for (const cb of this.listeners) cb(fb);
  }
}
