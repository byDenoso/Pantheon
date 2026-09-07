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
 const actions=[...(ops?.actions||[])].sort((a,b)=>asTime(b.updatedAt)-asTime(a.updatedAt));
 const blockers=actions.filter(a=>blocked(a.status));
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
  generatedAt:String(now),health:healthItems,
  attention:{blockedCount:blockers.length,blockers:blockers.slice(0,5),runs,readbackVerified:readback,readbackPercent:pct(readback,runs),readbackLabel:runs?`${readback}/${runs}`:'—',success:Number(counts.success)||0,events:Number(counts.events)||0},
  corpus:{total:summary?.total??null,tests:summary?.counts?.TEST??null,results:summary?.counts?.RESULT??null,claims:summary?.counts?.CLAIM??null,sourceVersion:summary?.projection?.sourceVersion||''},
  recent:{newCount:changed.length,items:(lastSeen?changed:events).slice(0,5),hasPreviousVisit:!!lastSeen},
  promoted,priorities:actions.slice(0,5),decisions:blockers.slice(0,3)
 };
}

export async function loadControlTower(api,{summary=null,lastSeenAt=null,now=new Date().toISOString()}={}){
 const [healthResult,opsResult,learningResult]=await Promise.allSettled([api.health(),api.ops(),api.learning()]);
 return buildControlTowerModel({health:healthResult.status==='fulfilled'?healthResult.value:null,ops:opsResult.status==='fulfilled'?opsResult.value:null,learning:learningResult.status==='fulfilled'?learningResult.value:null,summary,lastSeenAt,now});
}

const statusDot=state=>`<i class="ct-dot ct-${esc(state)}"></i>`;
const shortText=(value,max=132)=>{const s=String(value||'').trim();return s.length>max?s.slice(0,max-1)+'…':s};
const dateLabel=value=>{const d=new Date(value||'');return Number.isNaN(d.valueOf())?'sem data':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
const row=(item,index,{blocker=false}={})=>`<button class="ct-ref-row${blocker?' ct-blocker-row':''}" data-ct-focus="system:AUTOMATION"><i>${index+1}</i><span><b>${esc(item.label||item.id||'Registro')}</b><small>${esc(item.domain||item.metadata?.event_type||item.status||'NEXO')}</small></span><em>${esc(shortText(item.status||'',18))}</em></button>`;

export function renderControlTower(root,model,{onFocus,onMap}={}){
 if(!root)return;
 const healthGood=model.health.filter(h=>h.state==='good').length, healthTotal=model.health.length||0;
 const nominal=healthTotal&&healthGood===healthTotal&&!model.attention.blockedCount;
 const priorities=model.priorities.length?model.priorities.map((a,i)=>row(a,i)).join(''):'<p class="ct-empty">Nenhuma prioridade publicada.</p>';
 const recent=model.recent.items.length?model.recent.items.map((e,i)=>`<button class="ct-ref-row" data-ct-focus="system:AUTOMATION"><i>•</i><span><b>${esc(e.label||e.id)}</b><small>${esc(e.metadata?.event_type||e.status||'runtime')}</small></span><time>${esc(dateLabel(e.updatedAt))}</time></button>`).join(''):'<p class="ct-empty">Nenhuma atividade recente publicada.</p>';
 const blockers=model.attention.blockers.length?model.attention.blockers.map((a,i)=>row(a,i,{blocker:true})).join(''):'<p class="ct-empty">Nenhum blocker material.</p>';
 const rb=model.attention.readbackPercent;
 const readbackText=model.attention.runs?`Readback verificado em ${num(rb)}% das execuções registradas. ${model.attention.blockedCount?`${num(model.attention.blockedCount)} blocker${model.attention.blockedCount===1?' segue':'s seguem'} exigindo ação.`:'Fluxo operacional sem blocker material publicado.'}`:'Black Box sem runs suficientes para calcular readback.';
 const statusLabel=nominal?'SISTEMA NOMINAL':model.attention.blockedCount?'SISTEMA OPERACIONAL':'LEITURA PARCIAL';

 root.innerHTML=`<div class="ct-reference-grid">
  <article class="ct-reference-console ct-status-console"><div class="ct-reference-title"><span>Status operacional</span>${statusDot(nominal?'good':model.attention.blockedCount?'warn':'unknown')}</div><div class="ct-status-body"><strong class="ct-nominal"><i></i>${esc(statusLabel)}</strong><p>${healthTotal?`${healthGood}/${healthTotal} sinais verificados`:'Health indisponível'}</p><div class="ct-mini-metrics"><div><strong>${num(model.attention.success)}</strong><small>Execuções com sucesso</small></div><div><strong>${num(model.attention.runs)}</strong><small>Runs registrados</small></div><div><strong>${num(model.attention.blockedCount)}</strong><small>Blockers atuais</small></div></div></div></article>
  <article class="ct-reference-console ct-priorities-console"><div class="ct-reference-title"><span>Prioridades</span><small>Ver todas →</small></div><div class="ct-ref-list">${priorities}</div></article>
  <article class="ct-reference-console ct-recent-console"><div class="ct-reference-title"><span>Atividade recente</span><small>Ver todas →</small></div><div class="ct-ref-list">${recent}</div></article>
  <article class="ct-reference-console ct-blockers-console"><div class="ct-reference-title"><span>Blockers</span><small>${num(model.attention.blockedCount)} ativos</small></div><div class="ct-ref-list">${blockers}</div></article>
  <article class="ct-reference-console ct-readback-console"><div class="ct-reference-title"><span>Readback</span><small>${esc(model.attention.readbackLabel)}</small></div><div class="ct-readback-body"><blockquote>“${esc(readbackText)}”</blockquote><small>Black Box · ${esc(model.generatedAt.slice(0,16).replace('T',' '))}</small><div class="ct-readback-meter"><strong>${model.attention.runs?num(rb)+'%':'—'}</strong><i style="--readback:${model.attention.runs?rb:0}%"></i></div></div></article>
 </div>`;
 root.querySelectorAll('[data-ct-focus]').forEach(button=>button.onclick=()=>onFocus?.(button.dataset.ctFocus));
 root.querySelector('[data-ct-map]')?.addEventListener('click',()=>onMap?.());
}
