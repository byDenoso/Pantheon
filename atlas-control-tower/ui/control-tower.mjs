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
 const healthGood=model.health.filter(h=>h.state==='good').length;
 const healthWarn=model.health.filter(h=>h.state==='warn').length;
 const healthUnknown=model.health.filter(h=>h.state==='unknown').length;
 const healthTotal=model.health.length||0;
 const statusLabel=healthUnknown===healthTotal&&healthTotal?'Leitura parcial':healthWarn?'Atenção operacional':model.attention.blockedCount?'Operacional com bloqueios':'Sistema estável';
 const statusTone=healthWarn?'warn':healthUnknown===healthTotal?'unknown':model.attention.blockedCount?'warn':'good';
 const healthSummary=healthTotal?`${healthGood}/${healthTotal} sinais verificados`:'Sem leitura de health';
 const recent=model.recent.items.length?model.recent.items.map(e=>`<button class="ct-activity-row" data-ct-focus="system:AUTOMATION"><i class="ct-activity-dot"></i><span><b>${esc(e.label||e.id)}</b><small>${esc(e.metadata?.event_type||e.status||'runtime')}</small></span><time>${esc(dateLabel(e.updatedAt))}</time></button>`).join(''):`<p class="ct-empty">${model.recent.hasPreviousVisit?'Nenhuma mudança operacional desde a última visita.':'A próxima visita mostrará as mudanças observadas.'}</p>`;
 const priorities=model.attention.blockers.length?model.attention.blockers.map(a=>`<button class="ct-priority-row" data-ct-focus="system:AUTOMATION"><span><b>${esc(a.label||a.id)}</b><small>${esc(a.domain||'global')} · ${esc(a.status||'BLOCKED')}</small><em>${esc(shortText(a.summary||a.metadata?.blocker_reason||'',116))}</em></span><strong>→</strong></button>`).join(''):'<p class="ct-empty">Nenhum blocker material publicado.</p>';
 const corpusValue=model.corpus.total==null?'—':num(model.corpus.total);
 const testsValue=model.corpus.tests==null?'—':num(model.corpus.tests);

 root.innerHTML=`
  <div class="ct-observatory-grid">
   <article class="ct-console ct-status-console">
    <div class="ct-console-title"><span>Status operacional</span>${statusDot(statusTone)}</div>
    <strong class="ct-status-label">${esc(statusLabel)}</strong>
    <p>${esc(healthSummary)}</p>
    <div class="ct-status-list">
     <div><span>Readback</span><b>${esc(model.attention.readbackLabel)}</b></div>
     <div><span>Blockers</span><b class="${model.attention.blockedCount?'ct-alert':''}">${num(model.attention.blockedCount)}</b></div>
    </div>
   </article>
   <article class="ct-console ct-overview-console">
    <div class="ct-console-title"><span>Visão geral</span><small>ESTADO ATUAL</small></div>
    <div class="ct-overview-metrics">
     <div><small>ENTIDADES</small><strong>${corpusValue}</strong><span>no recorte científico</span></div>
     <div><small>TESTES</small><strong>${testsValue}</strong><span>indexados</span></div>
     <div><small>BLOCKERS</small><strong class="${model.attention.blockedCount?'ct-alert':''}">${num(model.attention.blockedCount)}</strong><span>exigem ação</span></div>
     <div><small>READBACK</small><strong>${esc(model.attention.readbackLabel)}</strong><span>${model.attention.runs?`${num(model.attention.readbackPercent)}% verificado`:'indisponível'}</span></div>
    </div>
   </article>
   <article class="ct-console ct-recent-console">
    <div class="ct-console-title"><span>Atividade recente</span><small>${model.recent.newCount?`${num(model.recent.newCount)} NOVA${model.recent.newCount===1?'':'S'}`:'ÚLTIMOS EVENTOS'}</small></div>
    <div class="ct-activity-list">${recent}</div>
   </article>
  </div>
  <section class="ct-console ct-priorities-console">
   <div class="ct-console-title"><span>Prioridades operacionais</span><small>${num(model.attention.blockedCount)} BLOCKER${model.attention.blockedCount===1?'':'S'}</small></div>
   <div class="ct-priority-list">${priorities}</div>
  </section>`;

 root.querySelectorAll('[data-ct-focus]').forEach(button=>button.onclick=()=>onFocus?.(button.dataset.ctFocus));
 root.querySelector('[data-ct-map]')?.addEventListener('click',()=>onMap?.());
}
