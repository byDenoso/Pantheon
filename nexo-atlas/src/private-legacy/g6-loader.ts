// Swapped in for atlas3d/g6-loader.ts: bundled module only, no CDN or script fallback.
export const G6_SOURCES = [] as const;
let loading: Promise<void> | null = null;
export function ensureAtlasG6(): Promise<void> {
  if (document.documentElement.dataset.atlasG6Source === 'module' && (window as any).G6?.Graph) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const module = await import('@antv/g6');
      if (module.Graph) { (window as any).G6 = module; document.documentElement.dataset.atlasG6Source = 'module'; return; }
    } catch (error) { console.error('Atlas G6 dependency unavailable', error); }
    document.documentElement.dataset.atlasG6Source = 'unavailable';
  })().finally(() => { loading = null; });
  return loading;
}
