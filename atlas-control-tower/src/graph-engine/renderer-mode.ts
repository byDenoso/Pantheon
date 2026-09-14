export type RendererMode = 'canvas' | 'webgl';

export function readRendererModeFromSearch(search: string): RendererMode {
  return new URLSearchParams(search).get('renderer') === 'webgl' ? 'webgl' : 'canvas';
}

export function nextRendererSearch(search: string, next: RendererMode): string {
  const params = new URLSearchParams(search);
  if (next === 'webgl') params.set('renderer', 'webgl');
  else params.delete('renderer');
  return params.toString();
}
