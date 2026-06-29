import type { Framebuffer } from './framebuffer';
import type { Button } from './buttons';

export type SourceKind = 'serial' | 'camera';
export type StatusFn = (message: string, isError?: boolean) => void;

export interface ScreenSource {
    readonly kind: SourceKind;
    readonly available: boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
    onFrame(cb: (fb: Framebuffer) => void): () => void;
    onStatus(cb: StatusFn): () => void;
    sendButton?(btn: Button): void;
}