/** Pixel clarity is independent of geometric detail: a phone may draw fewer strands
 * without making labels or the whole cloud a 1× bitmap on its Retina display.
 * Budgets cap supersampling, never reduce the native 1× backing size. */
export const PIXEL_BUDGET = {overlay: 4_000_000, high: 4_000_000, low: 1_800_000} as const;
export function canvasResolution(w: number, h: number, deviceDpr: number, quality: 'low' | 'high', slowFrame = false) {
  const native = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1;
  const area = Math.max(1, w) * Math.max(1, h);
  const bounded = (cap: number, pixels: number) => Math.min(native, cap, Math.max(1, Math.sqrt(pixels / area)));
  return {
    overlayDpr: bounded(2, PIXEL_BUDGET.overlay),
    glDpr: bounded(slowFrame ? 1 : quality === 'high' ? 2 : 1.5, PIXEL_BUDGET[quality]),
  };
}
