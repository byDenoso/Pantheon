/** Tabular view of the same recorte the map is showing. No extra request:
 *  it renders the nodes already returned by the Graph Contract. */
import {$, $$, esc, num} from './dom.mjs';

const COLUMNS = [
 {id:'label',        label:'Entidade',  get:n => n.label || n.canonicalId || n.id},
 {id:'canonicalId',  label:'ID canônico', get:n => n.canonicalId || String(n.id).replace(/^[a-z_]+:/, ''), mono:true},
 {id:'type',         label:'Tipo',      get:n => n.subtype ? `${n.type} · ${n.subtype}` : n.type},
 {id:'domain',       label:'Domínio',   get:n => n.domain || '—'},
 {id:'status',       label:'Estado',    get:n => n.status || '—'},
 {id:'authority',    label:'Autoridade',get:n => n.authority || '—'},
 {id:'updatedAt',    label:'Atualizado',get:n => n.updatedAt || '—'}
];

let sort = {column:'label', dir:1};

export function renderData(graph, {onEntity} = {}) {
 const host = $('#data-panel');
 if (!host) return;
 const nodes = [...(graph?.nodes || [])];
 const count = $('#data-count');
 if (count) count.textContent = `${num(nodes.length)} LINHAS · MESMO RECORTE DO MAPA`;
 if (!nodes.length) {host.innerHTML = '<p class="micro">Nenhuma entidade neste recorte.</p>'; return}
 const col = COLUMNS.find(c => c.id === sort.column) || COLUMNS[0];
 nodes.sort((a, b) => String(col.get(a)).localeCompare(String(col.get(b)), 'pt-BR', {numeric:true}) * sort.dir);
 host.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>${COLUMNS.map(c =>
   `<th><button data-sort="${c.id}" aria-sort="${sort.column === c.id ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(c.label)}${sort.column === c.id ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead>`
  + `<tbody>${nodes.map(n => `<tr data-row="${esc(n.id)}">${COLUMNS.map(c =>
   `<td${c.mono ? ' class="mono"' : ''}>${esc(String(c.get(n) ?? '—').slice(0, 120))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 $$('[data-sort]').forEach(b => b.onclick = () => {
  if (sort.column === b.dataset.sort) sort.dir *= -1; else sort = {column:b.dataset.sort, dir:1};
  renderData(graph, {onEntity});
 });
 $$('[data-row]').forEach(tr => tr.onclick = () => onEntity?.(tr.dataset.row));
}
