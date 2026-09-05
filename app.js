const state = { data: null, previous: null, view: 'now', lastRefresh: null, showHistory: false, presentationIndex: 0 };
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const titles = {
  now: ['OPERATIONAL VIEW', 'NOW'],
  activity: ['FLIGHT RECORDER', 'ACTIVITY'],
  evolution: ['SYSTEM CHANGE', 'EVOLUTION'],
  capabilities: ['PROVEN ABILITY', 'CAPABILITIES'],
  system: ['ARCHITECTURE', 'SYSTEM']
};

const CANONICAL_HOST = 'nexo-research-os-live.vercel.app';
function canonicalizeDeploymentHost() {
  const host = location.hostname;
  if (host !== CANONICAL_HOST && host.startsWith('nexo-research-os-live-') && host.endsWith('.vercel.app')) {
    const url = new URL(location.href);
    url.hostname = CANONICAL_HOST;
    location.replace(url.toString());
    return true;
  }
  return false;
}

async function registerWebMCP() {
  const status = $('#webmcp-status');
  if (!document.modelContext?.registerTool) {
    if (status) status.textContent = 'WebMCP indisponível';
    return false;
  }
  const schema = (properties = {}, required = []) => ({ type: 'object', properties, required });
  const ro = { readOnlyHint: true, consequentialHint: false, untrustedContentHint: false };
  const ui = { readOnlyHint: false, consequentialHint: false, untrustedContentHint: false };
  const result = value => JSON.stringify(value);
  const tools = [
    ['nexo_get_now','Read NEXO now','Read the currently visible operational projection.',schema(),ro,()=>result({source:state.data?.source,sync:state.data?.sync,architecture:state.data?.architecture,lanes:state.data?.lanes,attention:state.data?.attention?.slice(0,10)})],
    ['nexo_get_activity','Read material activity','Read recent material Flight Recorder events.',schema({limit:{type:'number'}},[]),ro,({limit=20})=>result((state.data?.runtime||[]).slice(0,Math.max(1,Math.min(100,limit))))],
    ['nexo_get_evolution','Read NEXO evolution','Read measured before/after system evolution metrics.',schema(),ro,()=>result(state.data?.evolution||[])],
    ['nexo_get_capabilities','Read capabilities','Read the visible capability proof matrix.',schema(),ro,()=>result(state.data?.capabilities||[])],
    ['nexo_set_view','Open NEXO view','Navigate the visible NEXO Console.',schema({view:{type:'string',enum:['now','activity','evolution','capabilities','system']}},['view']),ui,({view})=>{setView(view);return result({view});}],
    ['nexo_present','Open presentation mode','Open the presentation-safe NEXO story mode.',schema(),ui,()=>{openPresentation();return result({presentation:true});}],
    ['nexo_refresh','Refresh visible state','Refresh the public NEXO projection used by this Console.',schema(),ui,async()=>{await refreshData();return result({source:state.data?.source,sync:state.data?.sync});}]
  ];
  for (const [name,title,description,inputSchema,annotations,execute] of tools) {
    await document.modelContext.registerTool({name,title,description,inputSchema,annotations,execute});
  }
  if (status) status.textContent = `WebMCP ativo · ${tools.length} tools`;
  return true;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function short(value, max = 72) { const s = String(value ?? ''); return s.length > max ? s.slice(0, max - 1) + '…' : s; }
function fmtDate(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function statusState(status = '') { const s = status.toUpperCase(); if (s.includes('BLOCK') || s.includes('FAIL') || s.includes('ERROR')) return 'blocked'; if (s.includes('READY') || s.includes('ACTIVE') || s.includes('PASS')) return 'ready'; if (s.includes('NO_ACTIVE') || s.includes('IDLE')) return 'idle'; return 'active'; }
function sourceOf(item) { return item?.source_ref || item?.source_ref === '' ? item.source_ref : item?.source_kind || item?.source || '—'; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }

function setView(view) {
  state.view = view;
  $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  $$('.view').forEach(el => el.classList.remove('active-view'));
  $(`#view-${view}`)?.classList.add('active-view');
  const [eyebrow,title] = titles[view] || titles.now;
  $('#view-eyebrow').textContent = eyebrow;
  $('#view-title').textContent = title;
  renderCurrentView();
}

function renderSync() {
  const data = state.data;
  const sync = data?.sync || {state:'DEGRADED'};
  const pill = $('[data-sync-state]');
  pill.dataset.syncState = sync.state || 'DEGRADED';
  $('#sync-label').textContent = `${sync.state || 'DEGRADED'} · ${data?.source || 'UNKNOWN'}`;
  $('[data-since-refresh]').textContent = sync.lastSyncedAt ? `source ${fmtDate(sync.lastSyncedAt)}` : 'source não verificada';
  const degraded = data?.source === 'EMBEDDED_FALLBACK' || sync.state === 'DEGRADED';
  $('#degraded-banner').hidden = !degraded;
  if (degraded) $('#degraded-reason').textContent = data?.reason || 'Read model degradado; canonical sources devem ser revalidadas.';
}

function computeDeltas(prev, curr) {
  if (!prev) return (curr?.runtime || []).slice(0,4).map(x => ({kind:x.domain || x.component || 'SYSTEM', title:x.status || x.event_type, detail:x.summary || 'Material event'}));
  const deltas = [];
  const oldLanes = new Map((prev.lanes || []).map(x => [x.component, x]));
  for (const lane of curr.lanes || []) {
    const old = oldLanes.get(lane.component);
    if (!old) { deltas.push({kind:lane.component,title:'Novo estado',detail:lane.status}); continue; }
    if (old.status !== lane.status || old.current_action !== lane.current_action) {
      deltas.push({kind:lane.component,title:`${old.status || '—'} → ${lane.status || '—'}`,detail:lane.current_action || 'Sem ação ativa'});
    }
  }
  if (!deltas.length) deltas.push({kind:'SYSTEM',title:'Sem delta material no frontend',detail:'Read model relido; nenhum head de lane mudou.'});
  return deltas;
}

function renderNow() {
  const data = state.data; if (!data) return;
  $('#active-task-count').textContent = data.architecture?.activeTaskCount ?? data.roles?.length ?? 3;
  $('#material-count').textContent = data.runtime?.length ?? 0;
  $('#attention-count').textContent = data.attention?.length ?? 0;

  for (const domain of ['SCIENCE','ENGINEERING','OLYMPUS']) {
    const lane = (data.lanes || []).find(x => x.component === domain) || {};
    const card = $(`.domain-card[data-domain="${domain}"]`);
    card.dataset.state = statusState(lane.status);
    $('.domain-status',card).textContent = lane.status || 'UNKNOWN';
    $('.domain-action',card).textContent = lane.current_action || lane.blocker_code || 'Sem ação material ativa';
    $('.domain-source',card).textContent = `SOURCE ${sourceOf(lane)}`;
    card.onclick = () => openDetail(lane, 'LANE');
  }

  const deltas = computeDeltas(state.previous, data);
  $('#delta-list').innerHTML = deltas.map(d => `<div class="stack-item"><div class="stack-item-top"><span>${esc(d.kind)}</span><span>DELTA</span></div><strong>${esc(d.title)}</strong><p>${esc(d.detail)}</p></div>`).join('');

  const attention = data.attention || [];
  $('#attention-list').innerHTML = attention.length ? attention.slice(0,6).map((a,i) => `<div class="stack-item priority-${esc(a.priority || '')}" data-attn="${i}"><div class="stack-item-top"><span>${esc(a.priority || 'NORMAL')}</span><span>${esc(a.status || '')}</span></div><strong>${esc(a.title || a.action_id || 'Attention item')}</strong><p>${esc(a.action_id || a.blocker_code || sourceOf(a))}</p></div>`).join('') : `<div class="empty">Nenhum item material projetado para atenção.</div>`;
  $$('[data-attn]').forEach(el => el.onclick = () => openDetail(attention[Number(el.dataset.attn)], 'ATTENTION'));

  const flights = data.runtime || [];
  $('#recent-flights').innerHTML = flights.length ? flights.slice(0,6).map((f,i) => flightCard(f,i)).join('') : `<div class="empty">Nenhum evento material no read model atual.</div>`;
  $$('[data-flight]', $('#recent-flights')).forEach(el => el.onclick = () => openDetail(flights[Number(el.dataset.flight)], 'FLIGHT'));
}

function flightCard(f,index) {
  return `<article class="flight-card" data-flight="${index}"><div class="flight-meta"><span>${esc(f.domain || f.component || 'SYSTEM')}</span><span>${esc(fmtDate(f.occurred_at))}</span></div><strong>${esc(f.status || f.event_type || 'MATERIAL')}</strong><p>${esc(f.summary || 'Material event')}</p></article>`;
}

function renderActivity() {
  const root = $('#view-activity'); const events = state.data?.runtime || [];
  root.innerHTML = `<div class="page-intro"><div><span class="section-label">IMPACT-FIRST</span><h2>Flight Recorder</h2><p>Eventos materiais primeiro. Heartbeats e NO_OP de rotina ficam fora do caminho principal.</p></div><span class="section-meta">${events.length} MATERIAL EVENTS</span></div><div class="flight-list">${events.length ? events.map((f,i)=>`<article class="flight-row" data-flight-row="${i}"><div class="flight-time">${esc(fmtDate(f.occurred_at))}<br>${esc(f.domain || 'SYSTEM')}</div><div class="flight-summary"><strong>${esc(f.status || f.event_type)}</strong><p>${esc(f.summary || '')}</p></div><div class="flight-result">${esc(f.action_id || f.source_ref || 'READBACK / EVIDENCE')}</div></article>`).join('') : '<div class="empty">Sem flights materiais no snapshot atual.</div>'}</div>`;
  $$('[data-flight-row]',root).forEach(el => el.onclick = () => openDetail(events[Number(el.dataset.flightRow)], 'FLIGHT'));
}

function renderEvolution() {
  const root = $('#view-evolution'); const rows = state.data?.evolution || [];
  root.innerHTML = `<div class="page-intro"><div><span class="section-label">MEASURED CHANGE</span><h2>Evolution</h2><p>Antes/depois só aparece como ganho quando há evidência fechada. O que ainda está em shadow fica explicitamente como baseline em coleta.</p></div></div><div class="evolution-grid">${rows.map(x=>`<article class="evolution-card" data-evolution-id="${esc(x.id)}" data-baseline-state="${esc(x.state)}"><span class="metric-badge ${x.state === 'PROVEN' ? 'proven' : 'collecting'}">${esc(x.state === 'PROVEN' ? x.delta : 'COLLECTING BASELINE')}</span><h3>${esc(x.label)}</h3><div class="compare"><div><span class="section-label">BEFORE</span><strong>${esc(x.before)}</strong></div><span>→</span><div><span class="section-label">NOW</span><strong>${esc(x.after)}</strong></div></div><small>${esc(x.source)}</small></article>`).join('')}</div>`;
}

function renderCapabilities() {
  const root = $('#view-capabilities'); const rows = state.data?.capabilities || [];
  const counts = rows.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});
  root.innerHTML = `<div class="page-intro"><div><span class="section-label">PROOF MATRIX</span><h2>Capabilities</h2><p>PASS significa capacidade observada com evidência. PENDING e UNVERIFIED continuam fechados, mesmo que sejam tecnicamente plausíveis.</p></div><span class="section-meta">PASS ${counts.PASS||0} · PENDING ${(counts.PENDING_REAL_ACTION||0)+(counts.PENDING_CANARY||0)} · UNVERIFIED ${counts.UNVERIFIED||0}</span></div><div class="capability-grid">${rows.map((c,i)=>`<article class="capability-card" data-cap="${i}" data-capability-id="${esc(c.id)}"><div><strong>${esc(c.label)}</strong><p>${esc(c.id)} · ${esc(c.domain)}</p></div><span class="cap-status ${esc(c.status)}">${esc(c.status)}</span></article>`).join('')}</div>`;
  $$('[data-cap]',root).forEach(el => el.onclick = () => openDetail(rows[Number(el.dataset.cap)], 'CAPABILITY'));
}

function renderSystem() {
  const root = $('#view-system'); const data = state.data || {};
  const role = name => (data.roles || []).find(x=>x.component===name) || {component:name,status:'UNKNOWN'};
  const lane = name => (data.lanes || []).find(x=>x.component===name) || {component:name,status:'UNKNOWN'};
  root.innerHTML = `<div class="page-intro"><div><span class="section-label">CURRENT TOPOLOGY</span><h2>NEXO System</h2><p>O Atlas continua existindo, mas representa a arquitetura atual. Journal e Guardian ficam como histórico de consolidação.</p></div><button id="history-toggle" data-history-toggle class="primary-btn">${state.showHistory?'Ocultar':'Mostrar'} arquitetura histórica</button></div><div class="system-stage"><div class="topology"><div class="topology-row"><div class="topo-node core"><strong>NEXO</strong><span>Unified Cognitive Infrastructure</span></div></div><div class="topology-row">${[role('NEXO Continuity'),role('NEXO Scientific Core'),role('NEXO Executor')].map(r=>`<div class="topo-node ${r.component.includes('Executor')?'executor':''}" data-current-task="${esc(r.component)}"><strong>${esc(r.component.replace('NEXO ',''))}</strong><span>${esc(r.status)}</span></div>`).join('')}</div><div class="topology-row">${['SCIENCE','ENGINEERING','OLYMPUS'].map(n=>{const l=lane(n);return `<div class="topo-node lane"><strong>${n}</strong><span>${esc(l.status)}</span></div>`}).join('')}</div></div><div class="history-panel" ${state.showHistory?'':'hidden'}><div class="section-label">HISTORICAL / MERGED</div><div class="topology-row" style="margin-top:12px">${(data.historicalRoles||[]).map(r=>`<div class="topo-node historical"><strong>${esc(r.component.replace('NEXO ',''))}</strong><span>${esc(r.status)}</span></div>`).join('')}</div></div></div>`;
  $('#history-toggle').onclick = () => { state.showHistory = !state.showHistory; renderSystem(); };
}

function renderCurrentView() {
  if (!state.data) return;
  ({now:renderNow,activity:renderActivity,evolution:renderEvolution,capabilities:renderCapabilities,system:renderSystem}[state.view] || renderNow)();
}

function pipelineStages(item) {
  const payload = item?.payload || {};
  return [
    ['SIGNAL', item?.event_type || item?.domain || 'observed', true],
    ['DECISION', item?.status || payload.outcome || 'available in receipt', Boolean(item?.status)],
    ['ACTION', item?.action_id || 'not reached / not required', Boolean(item?.action_id)],
    ['EFFECT', payload.effect_key || payload.effect || 'not recorded in this event', Boolean(payload.effect_key || payload.effect)],
    ['EVIDENCE', item?.source_ref || item?.source_id || item?.source_kind || 'source pointer unavailable', Boolean(item?.source_ref || item?.source_id || item?.source_kind)]
  ];
}

function openDetail(item = {}, kind = 'DETAIL') {
  const drawer = $('#detail-drawer');
  const stages = pipelineStages(item);
  const keys = ['status','domain','component','action_id','blocker_code','priority','checkpoint','source_kind','source_id','source_ref','observed_at','occurred_at','synced_at','updated_at'];
  $('#drawer-content').innerHTML = `<span class="section-label">${esc(kind)}</span><h2 class="detail-title">${esc(item.title || item.summary || item.label || item.component || item.action_id || 'NEXO detail')}</h2>${kind==='FLIGHT'?`<div class="pipeline">${stages.map(s=>`<div class="stage ${s[2]?'done':'partial'}"><i></i><label>${esc(s[0])}</label><span>${esc(short(s[1],110))}</span></div>`).join('')}</div>`:''}<div class="kv-grid">${keys.filter(k=>item[k]).map(k=>`<b>${esc(k.replaceAll('_',' '))}</b><span>${esc(String(item[k]))}</span>`).join('')}</div>${item.payload?`<div class="section-label" style="margin-top:18px">PAYLOAD / PROVENANCE</div><pre style="white-space:pre-wrap;color:#879aae;font-size:8px;line-height:1.55">${esc(JSON.stringify(item.payload,null,2))}</pre>`:''}`;
  drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false');
}
function closeDetail(){ $('#detail-drawer').classList.remove('open'); $('#detail-drawer').setAttribute('aria-hidden','true'); }

function presentationSlides() {
  const d = state.data || {}; const firstFlight = d.runtime?.[0];
  return [
    `<div class="section-label">NEXO</div><div class="big">OBSERVE → DECIDE → EXECUTE</div><p>Um sistema persistente com fontes canônicas separadas e uma interface única para tornar o trabalho visível.</p>`,
    `<div class="section-label">CURRENT SYSTEM</div><div class="big">${esc(d.architecture?.activeTaskCount ?? 3)}</div><h2>operational tasks</h2><p>Continuity · Scientific Core · Executor, com SCIENCE, ENGINEERING e OLYMPUS como lanes operacionais.</p>`,
    `<div class="section-label">WHAT CHANGED</div><div class="big">5 → 3</div><h2>runtime consolidation</h2><p>Prompts ativos: 40,452 → 18,910 caracteres (-53.3%). Ganho de tool calls continua em coleta prospectiva.</p>`,
    `<div class="section-label">ONE REAL FLIGHT</div><h2>${esc(firstFlight?.status || 'Material work')}</h2><p>${esc(firstFlight?.summary || 'O Flight Recorder conecta evento, decisão, ação e evidência.')}</p>`,
    `<div class="section-label">PROOF, NOT DECORATION</div><div class="big">${esc((d.capabilities||[]).filter(x=>x.status==='PASS').length)}</div><h2>capabilities PASS in this visible snapshot</h2><p>Pending e unverified continuam explicitamente fechados. A interface nunca promove plausibilidade a prova.</p>`
  ];
}
function renderPresentation(){ const slides=presentationSlides(); $('#presentation-slide').innerHTML=slides[state.presentationIndex]; $('#presentation-index').textContent=`${state.presentationIndex+1} / ${slides.length}`; }
function openPresentation(){ state.presentationIndex=0; $('#presentation').hidden=false; renderPresentation(); }
function closePresentation(){ $('#presentation').hidden=true; }

async function refreshData() {
  const btn = $('#refresh-btn'); btn.disabled = true; btn.textContent = 'Atualizando…';
  try {
    const response = await fetch(`/api/nexo?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = await response.json();
    state.previous = state.data;
    state.data = next;
    state.lastRefresh = new Date();
    renderSync(); renderCurrentView();
    if (next.source === 'EMBEDDED_FALLBACK') toast('Estado relido, mas o app continua em fallback degradado.');
    else toast('Read model relido com sucesso.');
  } catch (error) {
    toast(`Falha ao atualizar: ${error.message}`);
    if (!state.data) {
      state.data = { source:'EMBEDDED_FALLBACK', reason:error.message, lanes:[],roles:[],historicalRoles:[],attention:[],runtime:[],evolution:[],capabilities:[],sync:{state:'DEGRADED'},architecture:{activeTaskCount:3} };
      renderSync(); renderCurrentView();
    }
  } finally { btn.disabled = false; btn.textContent = 'Atualizar estado'; }
}

$$('.nav-item').forEach(btn => btn.addEventListener('click',()=>setView(btn.dataset.view)));
$$('[data-jump]').forEach(btn => btn.addEventListener('click',()=>setView(btn.dataset.jump)));
$('#refresh-btn').addEventListener('click',refreshData);
$('#drawer-close').addEventListener('click',closeDetail);
$('#present-btn').addEventListener('click',openPresentation);
$('#presentation-close').addEventListener('click',closePresentation);
$('#presentation-prev').addEventListener('click',()=>{ const n=presentationSlides().length; state.presentationIndex=(state.presentationIndex-1+n)%n; renderPresentation(); });
$('#presentation-next').addEventListener('click',()=>{ const n=presentationSlides().length; state.presentationIndex=(state.presentationIndex+1)%n; renderPresentation(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeDetail(); closePresentation(); } });
if (!canonicalizeDeploymentHost()) {
  refreshData().finally(() => registerWebMCP().catch(() => { const status = $('#webmcp-status'); if (status) status.textContent = 'WebMCP falhou ao registrar'; }));
}
