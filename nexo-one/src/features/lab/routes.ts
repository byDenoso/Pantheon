import type { ScenePage } from './ObservatoryScene.tsx';

export interface LabRoute { page: ScenePage; id?: string; q?: string }
export const LAB_PAGES: Array<[ScenePage, string]> = [
  ['agora', 'Agora'], ['ciclo', 'Ciclo'], ['roadmaps', 'Roadmaps'], ['evidencia', 'Evidência'], ['saude', 'Saúde'],
];
export function parseLabRoute(hash: string): LabRoute | null {
  const raw = hash.replace(/^#\/?/, '');
  if (raw === '' ) return { page: 'agora' };
  const [path = '', query = ''] = raw.split('?', 2);
  const [head, ...rest] = path.split('/');
  const id = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  const q = new URLSearchParams(query).get('v') ?? undefined;
  switch (head) {
    case 'galaxia': return { page: 'agora' };
    case 'agora': case 'ciclo': case 'roadmaps': case 'evidencia': case 'saude': return { page: head, q };
    case 'roadmap': return id ? { page: 'roadmap', id } : { page: 'roadmaps' };
    case 'e': return id ? { page: 'entidade', id } : { page: 'evidencia' };
    default: return null;
  }
}
export const labHref = (page: ScenePage, id?: string) =>
  page === 'roadmap' ? `#/roadmap/${encodeURIComponent(id!)}` : page === 'entidade' ? `#/e/${encodeURIComponent(id!)}` : `#/${page}`;

