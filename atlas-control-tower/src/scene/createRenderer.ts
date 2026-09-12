import { WebGPURenderer } from 'three/webgpu';
import { WebGLRenderer } from 'three';

export type AtlasRendererBackend = 'webgpu' | 'webgl2';

function createWebGLRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  return { renderer, backend: 'webgl2' as const };
}

export async function createAtlasRenderer(canvas: HTMLCanvasElement, options: { forceWebGL?: boolean } = {}) {
  if (options.forceWebGL) {
    return createWebGLRenderer(canvas);
  }

  try {
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    if (!hasWebGPU) return createWebGLRenderer(canvas);
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
    await renderer.init();
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    if (hasWebGPU) return { renderer, backend: 'webgpu' as const };
    return { renderer, backend: 'webgl2' as const };
  } catch {
    return createWebGLRenderer(canvas);
  }
}
