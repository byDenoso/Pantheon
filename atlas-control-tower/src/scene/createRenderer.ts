import { WebGPURenderer } from 'three/webgpu';

export type AtlasRendererBackend = 'webgpu' | 'webgl2';

export async function createAtlasRenderer(canvas: HTMLCanvasElement, options: { forceWebGL?: boolean } = {}) {
  if (options.forceWebGL) {
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: true });
    await renderer.init();
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    return { renderer, backend: 'webgl2' as const };
  }

  try {
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: false });
    await renderer.init();
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    const backend: AtlasRendererBackend = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'webgl2';
    return { renderer, backend };
  } catch {
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: true });
    await renderer.init();
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    return { renderer, backend: 'webgl2' as const };
  }
}
