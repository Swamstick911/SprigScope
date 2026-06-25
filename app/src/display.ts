import { SCREEN_W, SCREEN_H, blankScreen, type Framebuffer } from './framebuffer';

export class ScreenDisplay {
    readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly image: ImageData;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = SCREEN_W;
        this.canvas.height = SCREEN_H;
        this.canvas.className = 'screen';
        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('This browser has no 2D canvas');
        this.ctx = ctx;
        this.image = ctx.createImageData(SCREEN_W, SCREEN_H);
        this.draw(blankScreen());
    }

    draw(fb: Framebuffer): void {
        this.image.data.set(fb.data);
        this.ctx.putImageData(this.image, 0, 0);
    }
}