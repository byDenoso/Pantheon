const state = {
  snapshot: null,
  layer: 'SCIENCE',
  selected: null,
  query: '',
  showLabels: true,
  view: { x: 0, y: 0, scale: 1 },
  dragging: null,
  layout: null
};

const PRESENTATION_CORE = Object.freeze({ id: '__PRESENTATION_NEXO__', label: 'NEXO', presentationOnly: true });
const WIDTH = 1600;
const HEIGHT = 900;
const CENTER = Object.freeze({ x: 800, y: 445 });
const NS = 'http://www.w3.org/2000/svg';
const $ = selector => document.querySelector(selector);
const graphEl = $('#graph');
const graphWorld = $('#graph-world');
const orbitLayer = $('#orbit-layer');
const edgeLayer = $('#edge-layer');
const clusterLayer = $('#cluster-layer');
const nodeLayer = $('#node-layer');
const coreLayer = $('#nexo-core');
const emptyEl = $('#empty');

const CLUSTER_ORDER = ['SCIENCE', 'ENGINEERING', 'INTERDOMAIN', 'OLYMPUS', 'OPERATIONS', 'REFERENCES', 'OTHER'];
const CLUSTER_META = {
  SCIENCE: { label: 'Ciência', color: '#43cfff' },
  ENGINEERING: { label: 'Engenharia', color: '#47e0a3' },
  INTERDOMAIN: { label: 'Interdomínio', color: '#36d8dc' },
  OLYMPUS: { label: 'Olympus', color: '#7488ff' },
  OPERATIONS: { label: 'Operações', color: '#ffb955' },
  REFERENCES: { label: 'Referências', color: '#ff71ad' },
  OTHER: { label: 'Outros', color: '#a879ff' }
};

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null) el.setAttribute(key, String(value));
  }
  return el;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function shortId(id, max = 29) {
  const raw = String(id || '');
  const parts = raw.split('::');
  const text = parts.at(-1) || raw;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function displayLabel(node) {
  const label = String(node?.label || node?.id || '');
  if (label && label !== node.id) return label.length > 32 ? `${label.slice(0, 31)}…` : label;
  return shortId(node?.id, 32);
}

function clusterKey(node) {
  if (node?.type === 'FILAMENT') return 'INTERDOMAIN';
  if (node?.type === 'REFERENCE') return 'REFERENCES';
  if (node?.type === 'PROGRAM' || node?.type === 'CAMPAIGN') return 'SCIENCE';
  const domain = String(node?.domain || '').toUpperCase();
  if (domain.includes('OLYMPUS') || domain.includes('BODYBUILD')) return 'OLYMPUS';
  if (domain.includes('ENGINEER')) return 'ENGINEERING';
  if (domain.includes('SCIENCE') || domain.includes('COSMO')) return 'SCIENCE';
  if (node?.type === 'WORK') return 'OPERATIONS';
  if (node?.type === 'HYPOTHESIS' || node?.type === 'PROCEDURAL_HYPOTHESIS') return 'ENGINEERING';
  return 'OTHER';
}

function graphForLayer(snapshot) {
  // Layers are overlays over one canonical graph. They never replace the base universe.
  return snapshot.graph.root;
}

function clusterPosition(key, index, total) {
  const preferred = CLUSTER_ORDER.indexOf(key);
  const slot = preferred >= 0 ? preferred : index;
  const count = Math.max(total, 6);
  const angle = -Math.PI / 2 + (slot / count) * Math.PI * 2;
  return { x: CENTER.x + Math.cos(angle) * 505, y: CENTER.y + Math.sin(angle) * 292 };
}

function placeRing(items, center, baseRadius, positions, startAngle = -Math.PI / 2, perRing = 9) {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  sorted.forEach((node, index) => {
    const ring = Math.floor(index / perRing);
    const offset = index % perRing;
    const count = Math.min(perRing, sorted.length - ring * perRing);
    const radius = baseRadius + ring * 54;
    const angle = startAngle + (offset / Math.max(1, count)) * Math.PI * 2 + ring * .23;
    positions.set(node.id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius * .72 });
  });
}

function orbitalLayout(nodes) {
  const positions = new Map();
  const clusters = new Map();
  for (const node of nodes) {
    const key = clusterKey(node);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(node);
  }
  const clusterKeys = [...clusters.keys()].sort((a, b) => {
    const ai = CLUSTER_ORDER.indexOf(a), bi = CLUSTER_ORDER.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
  });
  const hubs = new Map();
  clusterKeys.forEach((key, index) => hubs.set(key, clusterPosition(key, index, clusterKeys.length)));

  for (const key of clusterKeys) {
    const members = clusters.get(key);
    const hub = hubs.get(key);
    if (key === 'SCIENCE') {
      const programs = members.filter(node => node.type === 'PROGRAM');
      const campaigns = members.filter(node => node.type === 'CAMPAIGN');
      const rest = members.filter(node => node.type !== 'PROGRAM' && node.type !== 'CAMPAIGN');
      placeRing(programs, hub, 92, positions, -Math.PI / 2, 8);
      const parentPositions = new Map(programs.map(program => [program.id, positions.get(program.id)]));
      const attached = new Set();
      for (const program of programs) {
        const parent = parentPositions.get(program.id);
        const children = campaigns.filter(campaign => campaign.parentId === program.id);
        children.forEach((child, index) => {
          const angle = -Math.PI / 2 + (index / Math.max(1, children.length)) * Math.PI * 2;
          positions.set(child.id, { x: parent.x + Math.cos(angle) * 52, y: parent.y + Math.sin(angle) * 42 });
          attached.add(child.id);
        });
      }
      placeRing(campaigns.filter(item => !attached.has(item.id)), hub, 165, positions, .25, 10);
      placeRing(rest, hub, 190, positions, .7, 10);
    } else {
      placeRing(members, hub, members.length > 12 ? 76 : 86, positions, -.8, key === 'OPERATIONS' ? 9 : 8);
    }
  }
  return { positions, clusters, hubs };
}

function curve(a, b, bend = .16) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const amount = Math.min(70, length * bend);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${(mx + nx * amount).toFixed(1)} ${(my + ny * amount).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function nodeIsActiveForLayer(node) {
  if (state.layer === 'SCIENCE') return true;
  if (state.layer === 'LEARNING') return node.type === 'FILAMENT' || clusterKey(node) === 'INTERDOMAIN';
  if (state.layer === 'OPERATIONS') return node.type === 'WORK' || clusterKey(node) === 'OPERATIONS';
  if (state.layer === 'EVIDENCE') return node.type === 'REFERENCE';
  return true;
}

function edgeClass(edge) {
  const classes = ['canonical-edge'];
  if (/METHOD|PROPOSE|INTERDOMAIN/.test(edge.type)) classes.push('learning');
  if (/SUPPORT|EVIDENCE/.test(edge.type)) classes.push('evidence');
  if (edge.type === 'CONTAINS') classes.push('contains');
  return classes.join(' ');
}

function nodeRadius(node) {
  if (node.type === 'PROGRAM') return 15;
  if (node.type === 'FILAMENT') return 13;
  if (node.type === 'CAMPAIGN') return 9;
  if (node.type === 'WORK') return 10;
  if (node.type === 'REFERENCE') return 6;
  return 8;
}

function importantLabel(node) {
  return node.type === 'PROGRAM' || node.type === 'FILAMENT' || node.type === 'WORK' || node.status === 'ACTIVE' || node.id === state.selected;
}

function renderPresentation(layout) {
  orbitLayer.replaceChildren();
  clusterLayer.replaceChildren();
  coreLayer.replaceChildren();

  for (const [rx, ry, major] of [[155,58,true],[245,92,false],[345,128,false]]) {
    orbitLayer.append(svg('ellipse', { cx:CENTER.x, cy:CENTER.y, rx, ry, class:`orbit-ring ${major ? 'major' : ''}` }));
  }

  for (const [key, hub] of layout.hubs) {
    const meta = CLUSTER_META[key] || CLUSTER_META.OTHER;
    const members = layout.clusters.get(key) || [];
    const spoke = svg('path', { d:curve(CENTER, hub, .08), class:'presentation-spoke' });
    orbitLayer.append(spoke);
    orbitLayer.append(svg('ellipse', { cx:hub.x, cy:hub.y, rx:110, ry:68, class:'orbit-ring cluster', style:`color:${meta.color}` }));
    for (const node of members) {
      const p = layout.positions.get(node.id);
      if (p) orbitLayer.append(svg('path', { d:curve(hub, p, .05), class:'presentation-child', style:`color:${meta.color}` }));
    }

    const group = svg('g', { class:'cluster-hub', transform:`translate(${hub.x} ${hub.y})`, style:`--cluster-color:${meta.color};color:${meta.color}`, 'data-presentation-only':'true' });
    group.append(svg('circle', { class:'hub-halo', r:46 }));
    group.append(svg('circle', { class:'hub-core', r:31 }));
    group.append(svg('circle', { class:'hub-shine', cx:-10, cy:-12, r:6 }));
    group.append(svg('rect', { class:'hub-label-bg', x:-58, y:39, width:116, height:34, rx:7 }));
    const title = svg('text', { class:'hub-label', x:0, y:55 }); title.textContent = meta.label; group.append(title);
    const count = svg('text', { class:'hub-count', x:0, y:67 }); count.textContent = `${members.length} NÓS`; group.append(count);
    clusterLayer.append(group);
  }

  const core = PRESENTATION_CORE;
  coreLayer.setAttribute('transform', `translate(${CENTER.x} ${CENTER.y})`);
  coreLayer.setAttribute('data-presentation-only', String(core.presentationOnly));
  coreLayer.append(svg('circle', { class:'core-halo', r:92 }));
  coreLayer.append(svg('circle', { class:'core-orb', r:61 }));
  coreLayer.append(svg('circle', { class:'core-specular', cx:-20, cy:-23, r:12 }));
  coreLayer.append(svg('rect', { class:'core-label-bg', x:-68, y:73, width:136, height:50, rx:9 }));
  const title = svg('text', { class:'core-label', x:0, y:96 }); title.textContent = core.label; coreLayer.append(title);
  const sub = svg('text', { class:'core-sub', x:0, y:111 }); sub.textContent = 'FOCO ATUAL'; coreLayer.append(sub);
}

function renderEdges(root, layout) {
  edgeLayer.replaceChildren();
  for (const edge of root.edges) {
    const a = layout.positions.get(edge.source);
    const b = layout.positions.get(edge.target);
    if (!a || !b) continue;
    const path = svg('path', { d:curve(a, b), class:edgeClass(edge), 'data-relation':edge.type });
    edgeLayer.append(path);
  }
}

function renderNode(node, point) {
  const key = clusterKey(node);
  const color = (CLUSTER_META[key] || CLUSTER_META.OTHER).color;
  const r = nodeRadius(node);
  const query = state.query.trim().toLocaleLowerCase('pt-BR');
  const haystack = `${node.id} ${node.label || ''} ${node.type || ''} ${node.domain || ''}`.toLocaleLowerCase('pt-BR');
  const matches = !query || haystack.includes(query);
  const classes = ['node', String(node.type || 'entity').toLowerCase()];
  if (state.selected === node.id) classes.push('selected');
  if (!nodeIsActiveForLayer(node)) classes.push('layer-muted');
  if (query && !matches) classes.push('search-muted');
  if (query && matches) classes.push('search-match');

  const group = svg('g', {
    class:classes.join(' '),
    transform:`translate(${point.x} ${point.y})`,
    tabindex:0,
    role:'button',
    'aria-label':node.label || node.id,
    style:`--node-color:${color};color:${color}`,
    'data-entity-id':node.id
  });
  group.append(svg('circle', { class:'node-halo', r:r + 9 }));
  group.append(svg('circle', { class:'node-orb', r }));
  group.append(svg('circle', { class:'node-shine', cx:-r*.32, cy:-r*.36, r:Math.max(2, r*.2) }));

  const labelText = displayLabel(node);
  const labelWidth = Math.max(74, Math.min(194, labelText.length * 5.5 + 16));
  const label = svg('g', { class:`node-label ${importantLabel(node) ? '' : 'secondary'}`, transform:`translate(${r + 8} ${-15})` });
  label.append(svg('rect', { x:0, y:0, width:labelWidth, height:30, rx:6 }));
  const text = svg('text', { x:8, y:13 }); text.textContent = labelText; label.append(text);
  const kind = svg('text', { class:'label-kind', x:8, y:24 }); kind.textContent = String(node.type || 'ENTITY'); label.append(kind);
  group.append(label);

  group.addEventListener('click', event => { event.stopPropagation(); selectNode(node.id, true); });
  group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node.id, true); } });
  return group;
}

function renderGraph() {
  if (!state.snapshot) return;
  const root = graphForLayer(state.snapshot, state.layer);
  const layout = orbitalLayout(root.nodes);
  state.layout = layout;
  renderPresentation(layout);
  renderEdges(root, layout);
  nodeLayer.replaceChildren();
  for (const node of root.nodes) {
    const point = layout.positions.get(node.id);
    if (point) nodeLayer.append(renderNode(node, point));
  }
  emptyEl.hidden = root.nodes.length > 0;
  graphWorld.classList.toggle('hide-secondary-labels', !state.showLabels);
  applyView();
}

function selectNode(id, focus = false) {
  state.selected = id;
  const node = state.snapshot.graph.root.nodes.find(item => item.id === id);
  const entity = state.snapshot.entities[id] || node;
  const rels = state.snapshot.graph.root.edges.filter(edge => edge.source === id || edge.target === id);
  $('#selection-kind').textContent = entity?.projectedType || node?.type || 'CANONICAL';
  $('#inspector').innerHTML = `<h3>${escapeHtml(entity?.label || id)}</h3><p>${escapeHtml(id)}</p>
    <div class="kv"><span>tipo</span><span>${escapeHtml(entity?.projectedType || node?.type || '—')}</span></div>
    <div class="kv"><span>status</span><span class="status-${escapeHtml(entity?.status || '')}">${escapeHtml(entity?.status || '—')}</span></div>
    <div class="kv"><span>domínio</span><span>${escapeHtml(entity?.domain || node?.domain || '—')}</span></div>
    <div class="kv"><span>versão</span><span>${escapeHtml(entity?.entityVersion ?? '—')}</span></div>
    ${entity?.parentId ? `<div class="kv"><span>parent</span><span>${escapeHtml(entity.parentId)}</span></div>` : ''}
    ${entity?.testCount != null ? `<div class="kv"><span>testes</span><span>${escapeHtml(entity.testCount)}</span></div>` : ''}
    ${entity?.mapping ? `<p>${escapeHtml(entity.mapping)}</p>` : ''}
    ${rels.slice(0, 12).map(rel => `<div class="relation">${escapeHtml(rel.type)}<br>${escapeHtml(shortId(rel.source))} → ${escapeHtml(shortId(rel.target))}</div>`).join('')}`;
  if (focus && state.layout?.positions.has(id)) focusPoint(state.layout.positions.get(id));
  renderGraph();
}

function sourceAge(generatedAt) {
  const then = new Date(generatedAt).getTime();
  if (!Number.isFinite(then)) return 'snapshot';
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h atrás`;
  return `${Math.floor(hours / 24)} d atrás`;
}

function sourceRevision(value) {
  const text = String(value || '—');
  const match = text.match(/TOWER_V06@(?:main:)?([a-f0-9]{7,40})/i);
  return match ? `Tower ${match[1].slice(0, 9)}` : shortId(text, 38);
}

function renderMeta() {
  const s = state.snapshot;
  const m = s.manifest;
  $('#authority').textContent = m.authority;
  $('#freshness').textContent = `${m.freshness} · ${m.completeness}`;
  $('#source-age').textContent = `${m.freshness.toLowerCase()} · ${sourceAge(m.generatedAt)}`;
  $('#fingerprint').textContent = m.fingerprint;
  $('#subline').textContent = `${m.truthOwner} · projeção somente leitura · ${new Date(m.generatedAt).toLocaleString('pt-BR')}`;
  $('#runtime-state').textContent = `${m.freshness} validado`;
  $('#source-revision').textContent = sourceRevision(m.sourceVersion);
  const c = s.universe.counts;
  $('#metrics').innerHTML = [['NÓS',c.nodes],['RELAÇÕES',c.edges],['WORKS',c.works]].map(([label,value]) => `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${label}</span></div>`).join('');
  $('#context').innerHTML = [`${m.completeness}`,`${m.contractVersion}`,`${m.projectionVersion}`].map(value => `<span class="context-chip">${escapeHtml(value)}</span>`).join('');
  $('#ops-summary').textContent = `${s.operations.works.length} works publicados`;
}

function renderLayerSpecial() {
  if (state.layer === 'PROVENANCE') {
    $('#selection-kind').textContent = 'PROVENANCE';
    $('#inspector').innerHTML = `<h3>Proveniência</h3><div class="kv"><span>fonte</span><span>${escapeHtml(state.snapshot.provenance.source)}</span></div><div class="kv"><span>authority</span><span>${escapeHtml(state.snapshot.provenance.authority)}</span></div><p>${escapeHtml(state.snapshot.provenance.sourceVersion)}</p>`;
  } else if (state.layer === 'HEALTH') {
    const h = state.snapshot.health;
    $('#selection-kind').textContent = 'HEALTH';
    $('#inspector').innerHTML = `<h3>Saúde da projeção</h3><div class="kv"><span>estado</span><span>${escapeHtml(h.state)}</span></div><div class="kv"><span>authority</span><span>${escapeHtml(h.authority)}</span></div><div class="kv"><span>completude</span><span>${escapeHtml(h.completeness)}</span></div><p>${escapeHtml(h.fingerprint)}</p>`;
  } else if (!state.selected) {
    $('#selection-kind').textContent = 'CANONICAL';
    $('#inspector').innerHTML = '<h3>Selecione um nó</h3><p>Clique em uma entidade real da projeção para ver estado e relações declaradas.</p>';
  }
}

async function load() {
  const base = new URL('../data/v3/current/manifest.json', window.location.href);
  const manifest = await fetch(base, { cache:'no-store' }).then(response => {
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    return response.json();
  });
  const snapshotUrl = new URL(manifest.snapshotPath, base);
  const snapshot = await fetch(snapshotUrl, { cache:'no-store' }).then(response => {
    if (!response.ok) throw new Error(`snapshot ${response.status}`);
    return response.json();
  });
  if (snapshot.manifest?.authority !== 'TOWER_V06' || snapshot.manifest?.projectionOnly !== true) throw new Error('Snapshot V3 inválido');
  if (snapshot.manifest?.fingerprint !== manifest.fingerprint) throw new Error('Fingerprint V3 divergente');
  state.snapshot = snapshot;
  state.selected = null;
  renderMeta();
  renderGraph();
  renderLayerSpecial();
}

function applyView() {
  graphWorld.setAttribute('transform', `translate(${state.view.x.toFixed(2)} ${state.view.y.toFixed(2)}) scale(${state.view.scale.toFixed(4)})`);
}

function setScale(next, anchor = CENTER) {
  const previous = state.view.scale;
  const scale = Math.max(.58, Math.min(2.25, next));
  if (scale === previous) return;
  state.view.x = anchor.x - (anchor.x - state.view.x) * (scale / previous);
  state.view.y = anchor.y - (anchor.y - state.view.y) * (scale / previous);
  state.view.scale = scale;
  applyView();
}

function resetView() {
  state.view = { x:0, y:0, scale:1 };
  applyView();
}

function focusPoint(point) {
  const scale = Math.max(1.12, state.view.scale);
  state.view.scale = scale;
  state.view.x = CENTER.x - point.x * scale;
  state.view.y = CENTER.y - point.y * scale;
  applyView();
}

function svgPoint(event) {
  const rect = graphEl.getBoundingClientRect();
  return { x:(event.clientX - rect.left) * WIDTH / rect.width, y:(event.clientY - rect.top) * HEIGHT / rect.height };
}

function renderSearchResults() {
  const box = $('#search-results');
  if (!state.snapshot || !state.query.trim()) { box.hidden = true; box.replaceChildren(); return; }
  const q = state.query.trim().toLocaleLowerCase('pt-BR');
  const matches = state.snapshot.graph.root.nodes.filter(node => `${node.id} ${node.label || ''} ${node.type || ''} ${node.domain || ''}`.toLocaleLowerCase('pt-BR').includes(q)).slice(0, 8);
  box.innerHTML = matches.map(node => `<button class="search-result" type="button" data-result-id="${escapeHtml(node.id)}"><b>${escapeHtml(displayLabel(node))}</b><small>${escapeHtml(node.type)} · ${escapeHtml(node.status || '—')}</small></button>`).join('');
  box.hidden = matches.length === 0;
  box.querySelectorAll('[data-result-id]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.resultId;
    $('#graph-search').value = displayLabel(state.snapshot.graph.root.nodes.find(node => node.id === id));
    state.query = '';
    box.hidden = true;
    selectNode(id, true);
  }));
}

document.querySelectorAll('[data-layer]').forEach(button => button.addEventListener('click', () => {
  state.layer = button.dataset.layer;
  state.selected = null;
  document.querySelectorAll('[data-layer]').forEach(item => item.classList.toggle('active', item === button));
  $('#stage-title').textContent = state.layer;
  renderGraph();
  renderLayerSpecial();
}));

$('#graph-search').addEventListener('input', event => {
  state.query = event.target.value;
  renderSearchResults();
  renderGraph();
});
$('#graph-search').addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.currentTarget.value = '';
    state.query = '';
    renderSearchResults();
    renderGraph();
    event.currentTarget.blur();
  }
});

$('#reload').addEventListener('click', () => load().catch(showError));
$('#zoom-in').addEventListener('click', () => setScale(state.view.scale * 1.18));
$('#zoom-out').addEventListener('click', () => setScale(state.view.scale / 1.18));
$('#reset-view').addEventListener('click', resetView);
$('#labels-toggle').addEventListener('click', () => { state.showLabels = !state.showLabels; renderGraph(); });

graphEl.addEventListener('wheel', event => {
  event.preventDefault();
  const anchor = svgPoint(event);
  setScale(state.view.scale * (event.deltaY < 0 ? 1.1 : .91), anchor);
}, { passive:false });

graphEl.addEventListener('pointerdown', event => {
  if (event.target.closest?.('.node')) return;
  graphEl.setPointerCapture?.(event.pointerId);
  state.dragging = { x:event.clientX, y:event.clientY, viewX:state.view.x, viewY:state.view.y };
  graphEl.classList.add('dragging');
});
graphEl.addEventListener('pointermove', event => {
  if (!state.dragging) return;
  const rect = graphEl.getBoundingClientRect();
  state.view.x = state.dragging.viewX + (event.clientX - state.dragging.x) * WIDTH / rect.width;
  state.view.y = state.dragging.viewY + (event.clientY - state.dragging.y) * HEIGHT / rect.height;
  applyView();
});
const endDrag = () => { state.dragging = null; graphEl.classList.remove('dragging'); };
graphEl.addEventListener('pointerup', endDrag);
graphEl.addEventListener('pointercancel', endDrag);

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); $('#graph-search').focus();
  }
  if (document.activeElement?.tagName === 'INPUT') return;
  if (event.key === '+' || event.key === '=') setScale(state.view.scale * 1.15);
  if (event.key === '-') setScale(state.view.scale / 1.15);
  if (event.key === '0') resetView();
});

graphEl.addEventListener('click', event => {
  if (event.target === graphEl || event.target.closest?.('#orbit-layer')) {
    state.selected = null;
    renderLayerSpecial();
    renderGraph();
  }
});

function showError(error) {
  $('#subline').textContent = `Falha ao carregar projeção V3: ${error.message}`;
  $('#runtime-state').textContent = 'projeção indisponível';
  emptyEl.hidden = false;
  emptyEl.textContent = 'Projeção indisponível. O Atlas não inventará um estado substituto.';
}

load().catch(showError);
