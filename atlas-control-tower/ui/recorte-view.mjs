import {esc, num} from './dom.mjs';

const topEntries = (obj={}, limit=5) => Object.entries(obj).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,limit);
const pct = (a,b) => b ? Math.round((Number(a)||0)*100/Number(b)) : 0;

export function renderRecortePanel(graph, summary, {onEntity}={}) {
 const root=document.querySelector('#recorte-panel');
 if(!root)return;
 const nodes=graph?.nodes||[], edges=graph?.edges||[], counts=summary?.counts||{}, statuses=summary?.statuses||{};
 const degree=new Map();
 for(const e of edges){degree.set(e.source,(degree.get(e.source)||0)+1);degree.set(e.target,(degree.get(e.target)||0)+1)}
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const connected=[...degree].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id,n])=>({node:byId.get(id),n})).filter(x=>x.node);
 const relationTypes={}; for(const e of edges) relationTypes[e.type||'RELATION']=(relationTypes[e.type||'RELATION']||0)+1;
 const activity=topEntries(summary?.activity||{},6).sort((a,b)=>String(b[0]).localeCompare(String(a[0])));
 const total=summary?.total||nodes.length;
 const blocked=Number(statuses.blocked||0), unresolved=Number(summary?.projection?.unresolvedDomain||0);
 const cards=[
  ['Composição',`${num(total)} nós`,topEntries(counts,4).map(([k,v])=>`${k} ${num(v)}`).join(' · ')||'Sem composição'],
  ['Relações',`${num(edges.length)} no recorte`,topEntries(relationTypes,3).map(([k,v])=>`${k} ${num(v)}`).join(' · ')||'Sem relações'],
  ['Saúde',blocked||unresolved?`${num(blocked+unresolved)} atenção`:'Sem blockers',`${num(blocked)} bloqueados · ${num(unresolved)} sem domínio`],
  ['Cobertura',`${pct(edges.length,Math.max(1,nodes.length))}%`,`${num(edges.length)} relações / ${num(nodes.length)} nós`]
 ];
 root.innerHTML=`<div class="recorte-grid">${cards.map(([label,value,detail])=>`<article class="recorte-card"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(detail)}</span></article>`).join('')}</div>
 <div class="recorte-split"><article><div class="subhead"><b>Mais conectadas</b><small>NO RECORTE ATUAL</small></div><div class="rank-list">${connected.length?connected.map(({node,n})=>`<button data-recorte-entity="${esc(node.id)}"><span>${esc(node.label||node.id)}<small>${esc(node.type||'ENTITY')}</small></span><b>${num(n)}</b></button>`).join(''):'<p class="empty-note">Nenhuma centralidade calculável neste recorte.</p>'}</div></article>
 <article><div class="subhead"><b>Atividade recente</b><small>OBSERVADA NA FONTE</small></div><div class="activity-list">${activity.length?activity.map(([d,n])=>`<div><span>${esc(d)}</span><b>${num(n)}</b></div>`).join(''):'<p class="empty-note">Sem datas de atividade neste recorte.</p>'}</div></article></div>`;
 root.querySelectorAll('[data-recorte-entity]').forEach(b=>b.onclick=()=>onEntity?.(b.dataset.recorteEntity));
 const count=document.querySelector('#list-count'); if(count)count.textContent=`${num(total)} NO RECORTE`;
}
