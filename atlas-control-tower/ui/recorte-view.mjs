import {esc, num} from './dom.mjs';
import {createApi} from '../lib/atlas-api.mjs';

const radarApi=createApi();
const SIGNAL_ORDER=['contradicted','weakening','strengthening','new','promoted'];
const SIGNAL_LABEL={contradicted:'contradito',weakening:'enfraquecendo',strengthening:'fortalecendo',new:'novo',promoted:'promovido'};
const SIGNAL_TONE={contradicted:'bad',weakening:'warn',strengthening:'good',new:'new',promoted:'good'};
const CHANGE_LABEL={RESULT:'Resultado atualizado',CLAIM:'Claim atualizada',TEST:'Teste atualizado',CAMPAIGN:'Campanha atualizada',PUBLICATION:'Publicação atualizada',DOMAIN:'Domínio atualizado'};

function formatWhen(value){
 if(!value)return'';
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return String(value).slice(0,16).replace('T',' ');
 return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',','');
}

function latestChanges(nodes,limit=6){
 return nodes
  .filter(n=>n?.updatedAt&&n.type!=='SYSTEM')
  .map(n=>({node:n,time:new Date(n.updatedAt).getTime()}))
  .filter(x=>Number.isFinite(x.time))
  .sort((a,b)=>b.time-a.time)
  .slice(0,limit);
}

function emergentSignals(payload,limit=5){
 const buckets=new Map((payload?.emergent||[]).map(b=>[b.id,b]));
 const seen=new Set(),out=[];
 for(const id of SIGNAL_ORDER){
  const bucket=buckets.get(id);if(!bucket)continue;
  for(const item of bucket.items||[]){
   const key=item.id||`${item.relationType}:${item.notes}`;if(seen.has(key))continue;
   seen.add(key);out.push({item,bucket:id,label:SIGNAL_LABEL[id]||bucket.label||id,tone:SIGNAL_TONE[id]||'new'});
   if(out.length>=limit)return out;
  }
 }
 return out;
}

function renderChanges(changes){
 if(!changes.length)return '<p class="radar-empty">Nenhuma mudança datada neste recorte.</p>';
 return changes.map(({node})=>`<button class="change-row" data-change-entity="${esc(node.id)}">
  <span class="change-time"><i></i>${esc(formatWhen(node.updatedAt))}</span>
  <span class="change-copy"><b>${esc(CHANGE_LABEL[node.type]||'Entidade atualizada')}</b><small>${esc(node.label||node.id)}${node.status?' · '+esc(node.status):''}</small></span>
  <span class="change-arrow">›</span>
 </button>`).join('');
}

function renderSignals(signals,payload){
 if(!signals.length)return '<p class="radar-empty">Nenhum sinal emergente registrado no Learning.</p>';
 return `<div class="signal-summary">
  <span><b>${num((payload?.emergent||[]).find(x=>x.id==='strengthening')?.count||0)}</b> fortalecendo</span>
  <span><b>${num((payload?.emergent||[]).find(x=>x.id==='new')?.count||0)}</b> novos</span>
  <span><b>${num((payload?.emergent||[]).find(x=>x.id==='weakening')?.count||0)}</b> enfraquecendo</span>
 </div>${signals.map(({item,label,tone})=>`<button class="signal-row" data-signal-id="${esc(item.id||'')}">
  <i class="signal-dot tone-${tone}"></i>
  <span class="signal-copy"><b>${esc(item.relationType||item.title||item.id||'Sinal emergente')}</b><small>${esc(String(item.notes||item.status||'').slice(0,150))}</small></span>
  <span class="signal-chip tone-${tone}">${esc(label)}</span><span class="signal-arrow">›</span>
 </button>`).join('')}`;
}

export async function renderRecortePanel(graph,summary,{onEntity,onLearning}={}){
 const root=document.querySelector('#recorte-panel');if(!root)return;
 const title=document.querySelector('#recorte-section .chart-title span');if(title)title.textContent='Radar do recorte';
 const openLearning=()=>onLearning?onLearning():document.querySelector('[data-mode="learning"]')?.click();
 const nodes=graph?.nodes||[],total=summary?.total||nodes.length;
 const changes=latestChanges(nodes);
 const key=`${graph?.fingerprint||''}:${graph?.focus||''}:${Date.now()}`;
 root.dataset.renderKey=key;
 root.innerHTML=`<div class="radar-grid">
  <article class="radar-card radar-signals"><div class="radar-head"><div><span class="radar-icon">⌁</span><span><b>Sinais emergentes</b><small>padrões e relações que ganharam força</small></span></div><button class="radar-link" data-open-learning>ABRIR LEARNING ›</button></div><div class="radar-body" data-signals><p class="radar-empty">Lendo Learning…</p></div></article>
  <article class="radar-card radar-changes"><div class="radar-head"><div><span class="radar-icon">◷</span><span><b>Últimas mudanças</b><small>eventos observados neste recorte</small></span></div><span class="radar-meta">${num(changes.length)} RECENTES</span></div><div class="radar-body">${renderChanges(changes)}</div></article>
 </div>`;
 root.querySelectorAll('[data-change-entity]').forEach(b=>b.onclick=()=>onEntity?.(b.dataset.changeEntity));
 root.querySelector('[data-open-learning]')?.addEventListener('click',openLearning);
 const count=document.querySelector('#list-count');if(count)count.textContent=`${num(total)} NO RECORTE`;
 try{
  const learning=await radarApi.request('learning',{}, {cacheable:false});
  if(root.dataset.renderKey!==key)return;
  const target=root.querySelector('[data-signals]');if(target)target.innerHTML=renderSignals(emergentSignals(learning),learning);
  root.querySelectorAll('[data-signal-id]').forEach(b=>b.onclick=openLearning);
 }catch{
  if(root.dataset.renderKey!==key)return;
  const target=root.querySelector('[data-signals]');if(target)target.innerHTML='<p class="radar-empty">Learning indisponível neste momento.</p>';
 }
}
