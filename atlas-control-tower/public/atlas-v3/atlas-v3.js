const state = { snapshot: null, layer: 'SCIENCE', selected: null };
const $ = selector => document.querySelector(selector);
const graphEl = $('#graph');
const emptyEl = $('#empty');
const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function shortId(id) {
  const parts = String(id).split('::');
  const text = parts.at(-1) || id;
  return text.length > 26 ? `${text.slice(0, 23)}…` : text;
}

function graphForLayer(snapshot, layer) {
  const root = snapshot.graph.root;
  if (layer === 'LEARNING') {
    const ids = new Set(snapshot.learning.filaments.map(item => item.id));
    const edges = root.edges.filter(edge => ids.has(edge.source) || ids.has(edge.target));
    edges.forEach(edge => { ids.add(edge.source); ids.add(edge.target); });
    return { nodes: root.nodes.filter(node => ids.has(node.id)), edges };
  }
  if (layer === 'OPERATIONS') {
    const ids = new Set(snapshot.operations.works.map(item => item.id));
    const edges = root.edges.filter(edge => ids.has(edge.source) || ids.has(edge.target));
    edges.forEach(edge => { ids.add(edge.source); ids.add(edge.target); });
    return { nodes: root.nodes.filter(node => ids.has(node.id)), edges };
  }
  if (layer === 'EVIDENCE') {
    const edges = root.edges.filter(edge => /SUPPORT|EVIDENCE/.test(edge.type));
    const ids = new Set(edges.flatMap(edge => [edge.source, edge.target]));
    return { nodes: root.nodes.filter(node => ids.has(node.id)), edges };
  }
  if (layer === 'PROVENANCE' || layer === 'HEALTH') return { nodes: [], edges: [] };
  return root;
}

function positions(nodes, width, height) {
  const center = { x: width * .5, y: height * .52 };
  const radius = Math.min(width, height) * .3;
  const map = new Map();
  const sorted = [...nodes].sort((a,b) => a.id.localeCompare(b.id));
  sorted.forEach((node, index) => {
    if (node.type === 'FILAMENT') { map.set(node.id, center); return; }
    const angle = -Math.PI / 2 + (index / Math.max(1, sorted.length - 1)) * Math.PI * 2;
    const lane = node.domain === 'OLYMPUS' ? 1.12 : node.type === 'REFERENCE' ? .72 : 1;
    map.set(node.id, { x: center.x + Math.cos(angle) * radius * lane, y: center.y + Math.sin(angle) * radius * lane });
  });
  return map;
}

function renderGraph() {
  const snapshot = state.snapshot;
  const { nodes, edges } = graphForLayer(snapshot, state.layer);
  graphEl.replaceChildren();
  const width = Math.max(620, graphEl.clientWidth || 900);
  const height = Math.max(560, graphEl.clientHeight || 560);
  graphEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const pos = positions(nodes, width, height);
  emptyEl.hidden = nodes.length > 0;

  for (const edge of edges) {
    const a = pos.get(edge.source), b = pos.get(edge.target);
    if (!a || !b) continue;
    const bend = (a.y + b.y) / 2 - 28;
    const path = svg('path', { d: `M ${a.x} ${a.y} Q ${(a.x+b.x)/2} ${bend} ${b.x} ${b.y}`, class: `edge ${/METHOD|PROPOSE/.test(edge.type) ? 'learning' : /SUPPORT/.test(edge.type) ? 'evidence' : ''}` });
    graphEl.append(path);
  }

  for (const node of nodes) {
    const p = pos.get(node.id); if (!p) continue;
    const group = svg('g', { class: `node ${node.type.toLowerCase()} ${state.selected === node.id ? 'selected' : ''}`, tabindex: 0, role: 'button', 'aria-label': node.label });
    const r = node.type === 'FILAMENT' ? 16 : node.type === 'WORK' ? 12 : 8;
    group.append(svg('circle', { cx: p.x, cy: p.y, r }));
    const text = svg('text', { x: p.x + r + 7, y: p.y + 3 }); text.textContent = shortId(node.id); group.append(text);
    group.addEventListener('click', () => selectNode(node.id));
    group.addEventListener('keydown', event => { if (event.key === 'Enter') selectNode(node.id); });
    graphEl.append(group);
  }
}

function selectNode(id) {
  state.selected = id;
  const node = state.snapshot.graph.root.nodes.find(item => item.id === id);
  const entity = state.snapshot.entities[id] || node;
  const rels = state.snapshot.graph.root.edges.filter(edge => edge.source === id || edge.target === id);
  $('#inspector').innerHTML = `<h3>${entity?.label || id}</h3><p>${id}</p>
    <div class="kv"><span>tipo</span><span>${entity?.projectedType || node?.type || '—'}</span></div>
    <div class="kv"><span>status</span><span class="status-${entity?.status || ''}">${entity?.status || '—'}</span></div>
    <div class="kv"><span>domínio</span><span>${entity?.domain || node?.domain || '—'}</span></div>
    <div class="kv"><span>versão</span><span>${entity?.entityVersion ?? '—'}</span></div>
    ${entity?.mapping ? `<p>${entity.mapping}</p>` : ''}
    ${rels.map(rel => `<div class="relation">${rel.type}<br>${shortId(rel.source)} → ${shortId(rel.target)}</div>`).join('')}`;
  renderGraph();
}

function renderMeta() {
  const s = state.snapshot;
  const m = s.manifest;
  $('#authority').textContent = m.authority;
  $('#freshness').textContent = `${m.freshness} · ${m.completeness}`;
  $('#fingerprint').textContent = m.fingerprint;
  $('#subline').textContent = `${m.truthOwner} · projeção somente leitura · ${new Date(m.generatedAt).toLocaleString('pt-BR')}`;
  const c = s.universe.counts;
  $('#metrics').innerHTML = [['NÓS',c.nodes],['RELAÇÕES',c.edges],['FILAMENTOS',c.filaments]].map(([label,value]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('#context').innerHTML = [
    ['Autoridade',m.authority],['Completude',m.completeness],['Contrato',m.contractVersion],['Projeção',m.projectionVersion]
  ].map(([a,b]) => `<div class="context-card"><b>${a}</b><small>${b}</small></div>`).join('');
  $('#ops-summary').textContent = `${s.operations.works.length} works publicados`;
  $('#ops-items').innerHTML = s.operations.works.map(work => `<div class="op"><b>${shortId(work.id)}</b><span class="status-${work.status}">${work.ownerRole || '—'} · ${work.status}</span></div>`).join('');
}

function renderLayerSpecial() {
  if (state.layer === 'PROVENANCE') {
    $('#inspector').innerHTML = `<h3>Proveniência</h3><div class="kv"><span>fonte</span><span>${state.snapshot.provenance.source}</span></div><div class="kv"><span>authority</span><span>${state.snapshot.provenance.authority}</span></div><p>${state.snapshot.provenance.sourceVersion}</p>`;
  }
  if (state.layer === 'HEALTH') {
    const h = state.snapshot.health;
    $('#inspector').innerHTML = `<h3>Saúde da projeção</h3><div class="kv"><span>estado</span><span>${h.state}</span></div><div class="kv"><span>authority</span><span>${h.authority}</span></div><div class="kv"><span>completude</span><span>${h.completeness}</span></div><p>${h.fingerprint}</p>`;
  }
}

async function load() {
  const base = new URL('../data/v3/current/manifest.json', window.location.href);
  const manifest = await fetch(base, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`manifest ${r.status}`); return r.json(); });
  const snapshotUrl = new URL(manifest.snapshotPath, base);
  const snapshot = await fetch(snapshotUrl, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`snapshot ${r.status}`); return r.json(); });
  if (snapshot.manifest?.authority !== 'TOWER_V06' || snapshot.manifest?.projectionOnly !== true) throw new Error('Snapshot V3 inválido');
  state.snapshot = snapshot;
  renderMeta(); renderGraph();
}

document.querySelectorAll('[data-layer]').forEach(button => button.addEventListener('click', () => {
  state.layer = button.dataset.layer;
  state.selected = null;
  document.querySelectorAll('[data-layer]').forEach(item => item.classList.toggle('active', item === button));
  $('#stage-title').textContent = state.layer;
  $('#inspector').innerHTML = '<h3>Selecione um nó</h3><p>Clique em uma entidade para ver estado, domínio e relações declaradas.</p>';
  renderGraph(); renderLayerSpecial();
}));
$('#reload').addEventListener('click', () => load().catch(showError));
window.addEventListener('resize', () => state.snapshot && renderGraph());

function showError(error) {
  $('#subline').textContent = `Falha ao carregar projeção V3: ${error.message}`;
  emptyEl.hidden = false;
  emptyEl.textContent = 'Projeção indisponível. O Atlas não inventará um estado substituto.';
}

load().catch(showError);
