import type {Row} from './api.ts';
export type Candidate = {id: string; source: Row};
export type SelectionFilter = 'all' | 'private' | 'selected' | 'changed';
const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
export function filterCandidates<T extends Candidate>(rows: T[], query: string, filter: SelectionFilter, selected: Set<string>, changed: Set<string>, state = ''): T[] {
  const q = fold(query.trim());
  return rows.filter(r => (!q || fold(Object.values(r.source).join(' ')).includes(q))
    && (!state || r.source.status === state)
    && (filter === 'all' || filter === 'selected' && selected.has(r.id) || filter === 'private' && !selected.has(r.id) || filter === 'changed' && changed.has(r.id)));
}
export function newestFirst<T extends Candidate>(rows: T[], field: string): T[] {
  const at = (r: T) => {const n = Date.parse(r.source[field] || ''); return Number.isFinite(n) ? n : 0;};
  return [...rows].sort((a, b) => at(b) - at(a));
}
export function pageRows<T>(rows: T[], requested: number, size = 8): {rows: T[]; page: number; pages: number; total: number} {
  const pages = Math.max(1, Math.ceil(rows.length / size)), page = Math.max(1, Math.min(pages, requested));
  return {rows: rows.slice((page - 1) * size, page * size), page, pages, total: rows.length};
}
export function publicationState(selected: boolean, approved: boolean) {
  return selected ? approved ? 'Publicado' : 'Rascunho' : approved ? 'Retirada pendente' : 'Privado';
}
export function canRefresh(s: {automatic: boolean; dirty: boolean; saving: boolean; loading: boolean; visible: boolean}) {
  return s.automatic && !s.dirty && !s.saving && !s.loading && s.visible;
}
export function reconcileDraft<T>(current: T, previous: T, incoming: T, serialize: (value: T) => string): T {
  return serialize(current) === serialize(previous) ? incoming : current;
}
export function createReadGate() {
  let generation = 0, controller: AbortController | null = null;
  type Ticket = {generation: number; controller: AbortController};
  const valid = (t: Ticket) => generation === t.generation && controller === t.controller;
  return {
    stamp: () => generation,
    start() {if (controller) return null; controller = new AbortController(); return {generation: ++generation, controller};},
    valid,
    finish(t: Ticket) {if (!valid(t)) return false; controller = null; return true;},
    invalidate() {generation++; controller?.abort(); controller = null;},
  };
}
