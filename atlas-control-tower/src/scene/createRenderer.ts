import { SRGBColorSpace, WebGLRenderer } from 'three';

export type AtlasRendererBackend = 'webgpu' | 'webgl2';

// Product contract (locked): WebGL2 is the production default renderer for the map.
// WebGPU is a dev diagnostic, opt-in only -- it must never be selected automatically
// just because navigator.gpu exists. The only way in is an explicit ?gpu=webgpu query
// flag, which a real user session will not carry.
function webgpuExplicitlyRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('gpu') === 'webgpu';
}

function createWebGLRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  // A custom renderer passed to R3F's <Canvas gl={...}> skips R3F's own default
  // color-management setup. Without this, instance/vertex colors (stored in linear
  // space by Three's ColorManagement) are written to the framebuffer without the
  // linear-to-sRGB transfer function applied, so every node/filament rendered
  // severely too dark -- reading as solid black in practice -- confirmed via a real
  // browser repro (instance color buffer verified correct, only the displayed pixels
  // were wrong), not a guess.
  renderer.outputColorSpace = SRGBColorSpace;
  return { renderer, backend: 'webgl2' as const };
}

export async function createAtlasRenderer(
  canvas: HTMLCanvasElement,
  options: { forceWebGL?: boolean; allowWebGPU?: boolean } = {}
) {
  const allowWebGPU = options.allowWebGPU ?? webgpuExplicitlyRequested();
  if (options.forceWebGL || !allowWebGPU) {
    return createWebGLRenderer(canvas);
  }

  try {
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    if (!hasWebGPU) return createWebGLRenderer(canvas);
    // Loaded only on this explicit opt-in path. 'three/webgpu' has module-level side
    // effects that alter how the classic (WebGLRenderer) instanced-vertex-color
    // pipeline behaves even when WebGPU is never actually selected -- confirmed via a
    // real browser repro (every node/filament rendered solid black under the default
    // WebGL2 renderer only while this module was statically imported at the top of
    // this file; removing it fixed the default path without touching the WebGPU one).
    const { WebGPURenderer } = await import('three/webgpu');
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
    await renderer.init();
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    return { renderer, backend: 'webgpu' as const };
  } catch {
    // Init-time failure: fall back to WebGL2. Note this does NOT cover a runtime
    // failure after init (e.g. a depth-attachment/command-buffer error mid-frame) --
    // that class of failure needs a per-frame error boundary in the R3F tree, which
    // is a separate, not-yet-built piece of work (documented as a residual risk).
    return createWebGLRenderer(canvas);
  }
}
