import { WebGLRenderTarget, NearestFilter, RGBAFormat, UnsignedByteType } from 'three';

export function encodePickId(id: number): [number, number, number, number] {
  if (!Number.isInteger(id) || id <= 0) throw new RangeError('pick id must be a positive integer');
  if (id > 0xFFFFFF) throw new RangeError('pick id must fit in 24-bit RGB');
  return [(id >> 16) & 255, (id >> 8) & 255, id & 255, 255];
}

export function decodePickId(pixel: ArrayLike<number>): number {
  return ((Number(pixel[0]) & 255) << 16) | ((Number(pixel[1]) & 255) << 8) | (Number(pixel[2]) & 255);
}

export type PickRenderer = {
  setRenderTarget(target: WebGLRenderTarget | null): void;
  render(scene: unknown, camera: unknown): void;
  readRenderTargetPixelsAsync?: (
    target: WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array
  ) => Promise<Uint8Array>;
  readRenderTargetPixels?: (
    target: WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array
  ) => void;
};

export class GpuPickingBuffer {
  readonly target: WebGLRenderTarget;
  private readonly pixel = new Uint8Array(4);

  constructor(width = 1, height = 1) {
    this.target = new WebGLRenderTarget(width, height, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      format: RGBAFormat,
      type: UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    });
    this.target.texture.generateMipmaps = false;
  }

  resize(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
  }

  async read(renderer: PickRenderer, x: number, y: number): Promise<number> {
    this.pixel.fill(0);
    if (renderer.readRenderTargetPixelsAsync) {
      await renderer.readRenderTargetPixelsAsync(this.target, x, y, 1, 1, this.pixel);
    } else if (renderer.readRenderTargetPixels) {
      renderer.readRenderTargetPixels(this.target, x, y, 1, 1, this.pixel);
    } else {
      return 0;
    }
    return decodePickId(this.pixel);
  }

  dispose() {
    this.target.dispose();
  }
}

export type GpuPickingProps = {
  enabled: boolean;
  invalidate: () => void;
};

/** Marker interface used by the R3F scene to make the on-demand GPU pass explicit. */
export function GpuPicking({ enabled, invalidate }: GpuPickingProps) {
  if (enabled) invalidate();
  return null;
}
