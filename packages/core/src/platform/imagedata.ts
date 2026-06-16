/**
 * The `sprig` engine's only browser dependency is the `ImageData` constructor.
 * In Node it doesn't exist, so install a minimal shim. In a browser/webview the
 * native ImageData is used unchanged.
 */
class NodeImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
    if (a instanceof Uint8ClampedArray) {
      this.data = a;
      this.width = b;
      this.height = c as number;
    } else {
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    }
  }
}

export function installImageDataShim(): void {
  const g = globalThis as { ImageData?: unknown };
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = NodeImageData as unknown as typeof ImageData;
  }
}
