import {esc,num} from './dom.mjs';

const blocked = status => /BLOCK|FAIL|ERROR/i.test(String(status||''));
const good = (ok,known) => !known?'unknown':ok?'good':'warn';
const asTime = value => {const n=Date.parse(value||'');return Number.isFinite(n)?n:0};
const pct = (n,d) => d?Math.round((Number(n)||0)/(Number(d)||1)*100):0;
const focusForHealth={science:'system:SCIENCE',semantic:'system:NEXO',blackbox:'system:AUTOMATION',learning:'system:LEARNING'};

export function buildControlTowerModel({health=null,ops=null,learning=null,summary=null,lastSeenAt=null,now=new Date().toISOString()}={}){
 const ds=health?.dataSource, v1=ds?.v1Health, semantic=health?.semanticIndex;
 const counts=ops?.counts||{};
 const runs=Number(counts.runs)||0, readback=Number(counts.readbackVerified)||0;
 const blockers=(ops?.actions||[]).filter(a=>blocked(a.status)).sort((a,b)=>asTime(b.updatedAt)-asTime(a.updatedAt));
 const events=[...(ops?.events||[])].sort((a,b)=>asTime(b.updatedAt)-asTime(a.updatedAt));
 const lastSeen=asTime(lastSeenAt), changed=lastSeen?events.filter(e=>asTime(e.updatedAt)>lastSeen):[];
 const promoted=((learning?.emergent||[]).find(x=>x.id==='promoted')?.items||[]).slice(0,4);
 const healthItems=[
  {id:'science',label:'Science',state:good(!!(health?.ok&&ds?.effective==='v1'&&v1?.ok),!!health),detail:health?`${v1?.version||ds?.effective||'science_v1'} · ${ds?.freshness||'—'}`:'indisponível'},
  {id:'semantic',label:'Semantic',state:good(!!semantic?.available,!!health),detail:semantic?.available?`${num(semantic.count||0)} entradas · ${semantic.indexVersion||'índice ativo'}`:'indisponível'},
  {id:'blackbox',label:'Black Box',state:good(!!ops,!!ops),detail:ops?`${num(runs)} runs · ${num(counts.events||0)} eventos`:'indisponível'},
  {id:'learning',label:'Learning',state:good(!!learning,!!learning),detail:learning?`${num(learning.total||0)} objetos publicados`:'indisponível'}
 ].map(item=>({...item,focus:focusForHealth[item.id]}));

 return{
  generatedAt:String(now),
  health:healthItems,
  attention:{
   blockedCount:blockers.length,
   blockers:blockers.slice(0,4),
   runs,
   readbackVerified:readback,
   readbackPercent:pct(readback,runs),
   readbackLabel:runs?`${readback}/${runs}`:'—',
   success:Number(counts.success)||0
  },
  corpus:{
   total:summary?.total??null,
   tests:summary?.counts?.TEST??null,
   results:summary?.counts?.RESULT??null,
   claims:summary?.counts?.CLAIM??null,
   sourceVersion:summary?.projection?.sourceVersion||''
  },
  recent:{
   newCount:changed.length,
   items:(lastSeen?changed:events).slice(0,4),
   hasPreviousVisit:!!lastSeen
  },
  promoted,
  decisions:blockers.slice(0,3)
 };
}

export async function loadControlTower(api,{summary=null,lastSeenAt=null,now=new Date().toISOString()}={}){
 const [healthResult,opsResult,learningResult]=await Promise.allSettled([api.health(),api.ops(),api.learning()]);
 return buildControlTowerModel({
  health:healthResult.status==='fulfilled'?healthResult.value:null,
  ops:opsResult.status==='fulfilled'?opsResult.value:null,
  learning:learningResult.status==='fulfilled'?learningResult.value:null,
  summary,lastSeenAt,now
 });
}

const statusDot=state=>`<i class="ct-dot ct-${esc(state)}"></i>`;
const shortText=(value,max=132)=>{const s=String(value||'').trim();return s.length>max?s.slice(0,max-1)+'…':s};
const dateLabel=value=>{
 const d=new Date(value||'');
 return Number.isNaN(d.valueOf())?'sem data':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
};

export function renderControlTower(root,model,{onFocus,onMap}={}){
 if(!root)return;
 const healthHtml=model.health.map(h=>`<button class="ct-health" data-ct-focus="${esc(h.focus)}">${statusDot(h.state)}<span><b>${esc(h.label)}</b><small>${esc(h.detail)}</small></span></button>`).join('');
 const blockers=model.attention.blockers.length?model.attention.blockers.map(a=>`<button class="ct-row ct-blocker" data-ct-focus="system:AUTOMATION"><span><b>${esc(a.label||a.id)}</b><small>${esc(a.domain||'global')} · ${esc(a.status||'BLOCKED')}</small><em>${esc(shortText(a.summary||a.metadata?.blocker_reason||'',108))}</em></span><strong>→</strong></button>`).join(''):'<p class="ct-empty">Nenhum blocker material publicado na Black Box.</p>';
 const recent=model.recent.items.length?model.recent.items.map(e=>`<button class="ct-row" data-ct-focus="system:AUTOMATION"><time>${esc(dateLabel(e.updatedAt))}</time><span><b>${esc(e.label||e.id)}</b><small>${esc(e.metadata?.event_type||e.status||'runtime')}</small><em>${esc(shortText(e.summary,118))}</em></span></button>`).join(''):`<p class="ct-empty">${model.recent.hasPreviousVisit?'Nenhuma mudança operacional desde a última visita.':'Sem histórico de visita anterior; o próximo acesso mostrará apenas deltas.'}</p>`;
 const promoted=model.promoted.length?model.promoted.map(x=>`<button class="ct-learning" data-ct-focus="system:LEARNING"><span>${esc(x.status||'')}</span><b>${esc(shortText(x.relationType||x.title||x.id,82))}</b></button>`).join(''):'<p class="ct-empty">Nenhuma promoção de Learning disponível.</p>';
 const corpus=model.corpus.total==null?'Resumo científico pendente':`${num(model.corpus.total)} entidades · ${num(model.corpus.tests||0)} testes · ${num(model.corpus.claims||0)} claims`;
 const decisionTitle=model.attention.blockedCount?`${num(model.attention.blockedCount)} blocker${model.attention.blockedCount===1?'':'s'} exigem atenção`:'Nenhum blocker material agora';

 root.innerHTML=`
  <div class="ct-head">
   <div><p class="eyebrow">CONTROL TOWER / AGORA</p><h2>O que merece atenção <span>neste momento.</span></h2><p>${esc(corpus)}</p></div>
   <button class="ct-map-cta" data-ct-map>Explorar mapa <span>↓</span></button>
  </div>
  <div class="ct-health-grid">${healthHtml}</div>
  <div class="ct-kpis">
   <article><small>BLOCKERS</small><strong class="${model.attention.blockedCount?'ct-alert':''}">${num(model.attention.blockedCount)}</strong><span>${esc(decisionTitle)}</span></article>
   <article><small>READBACK</small><strong>${esc(model.attention.readbackLabel)}</strong><span>${model.attention.runs?`${num(model.attention.readbackPercent)}% das execuções materializadas`:'Black Box indisponível'}</span></article>
   <article><small>MUDOU</small><strong>${num(model.recent.newCount)}</strong><span>${model.recent.hasPreviousVisit?'eventos desde a última visita':'cursor local inicializado'}</span></article>
   <article><small>CORPUS</small><strong>${model.corpus.tests==null?'—':num(model.corpus.tests)}</strong><span>testes científicos indexados</span></article>
  </div>
  <div class="ct-grid">
   <section class="ct-panel"><div class="ct-title"><span>PRÓXIMAS DECISÕES</span><small>BLACK BOX · DERIVED_NOT_EVIDENCE</small></div>${blockers}</section>
   <section class="ct-panel"><div class="ct-title"><span>MUDOU DESDE A ÚLTIMA VISITA</span><small>RUNTIME EVENTS</small></div>${recent}</section>
   <section class="ct-panel ct-learning-panel"><div class="ct-title"><span>LEARNING PROMOVIDO</span><small>APRENDIZADO · NÃO É EVIDÊNCIA CIENTÍFICA</small></div><div class="ct-learning-list">${promoted}</div></section>
  </div>`;

 root.querySelectorAll('[data-ct-focus]').forEach(button=>button.onclick=()=>onFocus?.(button.dataset.ctFocus));
 root.querySelector('[data-ct-map]')?.addEventListener('click',()=>onMap?.());
}
