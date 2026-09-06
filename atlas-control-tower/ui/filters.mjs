/** Shared filter surface: the selects, the search box and the clear action all
 *  write into the same session filters used by the map, the charts and the list. */
import {$, $$} from './dom.mjs';

const FIELDS = [['type', 'filter-type'], ['status', 'filter-status'], ['authority', 'filter-authority']];

export function installFilters(session) {
 for (const [key, id] of FIELDS) {
  const el = $('#' + id);
  if (!el) continue;
  el.value = session.state.filters[key] || '';
  el.onchange = e => session.setFilters({[key]: e.target.value});
 }
 $('#clear').onclick = () => {
  for (const [, id] of FIELDS) {const el = $('#' + id); if (el) el.value = ''}
  $('#search').value = '';
  session.clearFilters();
 };
 let timer;
 $('#search').oninput = e => {
  clearTimeout(timer);
  timer = setTimeout(() => {
   const raw = e.target.value;
   // "blocked" is a status people type into search; route it to the status filter.
   const blocked = /\bblocked\b/i.test(raw);
   const patch = {query: blocked ? raw.replace(/\bblocked\b/ig, '').trim() : raw};
   if (blocked) {patch.status = 'blocked'; const el = $('#filter-status'); if (el) el.value = 'blocked'}
   session.setFilters(patch);
  }, 300);
 };
}

/** Keeps the visible controls in step when a filter is set from a chart or metric. */
export function syncFilterInputs(filters) {
 for (const [key, id] of FIELDS) {const el = $('#' + id); if (el) el.value = filters[key] || ''}
 const search = $('#search');
 if (search && document.activeElement !== search) search.value = filters.query || '';
}

export function resetFilterInputs() {
 $$('.filters select').forEach(el => el.value = '');
 const search = $('#search');
 if (search) search.value = '';
}
