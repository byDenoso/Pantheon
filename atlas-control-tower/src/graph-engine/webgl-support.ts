/**
 * Pure(ish) WebGL2 capability probe. Takes an injectable canvas factory so it can be
 * unit-tested with a fake canvas/context, rather than only ever being exercisable in
 * a real browser.
 */
export function supportsWebGL2(createCanvas: () => { getContext: (id: string) => unknown } = () => document.createElement('canvas')): boolean {
  try {
    const canvas = createCanvas();
    const context = canvas.getContext('webgl2');
    return context !== null && context !== undefined;
  } catch {
    return false;
  }
}

export type MapRenderMode = 'canvas' | 'table';

/**
 * Decides which surface the map should render. Pure and total: given the same inputs
 * it always returns the same decision, so the actual fallback rule is verifiable
 * without a browser. WebGL2 being unsupported at all takes priority over a
 * not-yet-confirmed context-loss state; a lost context that never gets a restore
 * signal is treated the same as no support at all -- the accessible table, once
 * shown, is never silently swapped back to canvas by a delayed restore event, since
 * a mid-session render-mode swap would be more disorienting than staying on the
 * table for the rest of the session.
 */
export function resolveMapRenderMode(params: { webgl2Supported: boolean; contextLost: boolean }): MapRenderMode {
  if (!params.webgl2Supported) return 'table';
  if (params.contextLost) return 'table';
  return 'canvas';
}
