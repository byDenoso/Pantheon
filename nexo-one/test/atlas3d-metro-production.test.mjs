import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scenarioById, DEFAULT_SCENARIO_ID } from '../src/data/fixtures/scenarios.ts';
import {
  ATLAS_METRO_ROOTS,
  atlasPathTo,
  buildAtlasMetroModel,
  visibleAtlasIds,
} from '../src/atlas3d/atlasAdapter.ts';
import {
  buildMetroScreenLabelLayout,
  metroLayoutPositions,
} from '../src/atlas3d/metro2dLayout.ts';
import {
  LEARNING_ANCHORS,
  learningSemanticRoute,
} from '../src/atlas3d/learningSemantics.ts';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');
const state = () => scenarioById(DEFAULT_SCENARIO_ID).build();

test('production Metro adapter materializes Nexo, Science and Olympus simultaneously', () => {
  const model = buildAtlasMetroModel(state());
  assert.deepEqual(model.roots, ATLAS_METRO_ROOTS);
  assert.equal(model.roots.length, 3);
  for (const rootId of model.roots) {
    const hub = model.nodeMap.get(rootId);
    assert.ok(hub, `missing hub ${rootId}`);
    assert.equal(hub.entityType, 'hub');
    assert.ok(hub.childCount > 0, `${hub.name} has no initial stations`);
  }

  const expanded = new Set(model.roots);
  const visible = visibleAtlasIds(model, expanded);
  assert.ok(visible.length > 3, 'initial view must contain stations in addition to the three hubs');
  assert.ok(model.roots.every(id => visible.includes(id)));
  assert.ok(visible.some(id => model.nodeMap.get(id)?.depth === 1), 'initial view must expose named subdomains');
});

test('an empty public domain still gets an honest operational station from its lane', () => {
  const source = state();
  source.graph.nodes = source.graph.nodes.filter(node => node.domain !== 'OLYMPUS' || node.type === 'DOMAIN');
  source.graph.edges = source.graph.edges.filter(edge =>
    source.graph.nodes.some(node => node.id === edge.from) &&
    source.graph.nodes.some(node => node.id === edge.to)
  );
  source.lanes = source.lanes.map(lane => lane.domain === 'OLYMPUS'
    ? { ...lane, current_state: '0 WORK · 0 TEST in sanctioned projection', next_action: 'Await next canonical projection.' }
    : lane
  );

  const model = buildAtlasMetroModel(source);
  const olympus = model.nodeMap.get('atlas.domain.olympus');
  assert.ok(olympus);
  assert.equal(olympus.childCount, 1);
  const child = model.nodeMap.get(model.childrenMap.get(olympus.id)[0]);
  assert.equal(child.name, 'Estado operacional');
  assert.match(child.summary, /0 WORK/);
  assert.equal(child.synthetic, true);
});

test('entities stay below subdomain stations and preserve production provenance', () => {
  const model = buildAtlasMetroModel(state());
  const canonical = model.nodes.find(node => !node.synthetic);
  assert.ok(canonical);
  assert.equal(canonical.depth, 2);
  assert.ok(canonical.parentId?.startsWith('atlas.subdomain.'));
  assert.ok(canonical.sourceId);
  assert.ok(canonical.fingerprint);
  const path = atlasPathTo(model, canonical.id);
  assert.equal(path.length, 3);
  assert.equal(path[0].entityType, 'hub');
  assert.equal(path[1].entityType, 'subdomain');
});

test('canonical graph relations become Metro bridge data instead of a second force layout', () => {
  const source = state();
  const model = buildAtlasMetroModel(source);
  assert.ok(model.crossLinks.length > 0);
  assert.ok(model.crossLinks.some(link => !link.aggregated));
  assert.ok(model.crossLinks.every(link => model.nodeMap.has(link.source) && model.nodeMap.has(link.target)));
});

test('Learning preserves parallel semantic filaments between existing stations, never as a Learning cluster', () => {
  const source = state();
  for (const [suffix, weight] of [['a', .82], ['b', .91]]) {
    source.graph.edges.push({
      id: 'learning:test-interdomain-' + suffix,
      from: 'domain:SCIENCE',
      to: 'domain:OLYMPUS',
      kind: 'SUPPORTS',
      weight,
      explanation: 'test learning bridge ' + suffix,
      is_learning: true,
      learning_scope: 'INTER_DOMAIN',
    });
  }

  const model = buildAtlasMetroModel(source);
  const learning = model.crossLinks
    .filter(link => link.id.startsWith('entity:learning:test-interdomain-'))
    .sort((left, right) => left.id.localeCompare(right.id));
  assert.equal(learning.length, 2);
  assert.ok(learning.every(link => link.source === 'atlas.domain.science'));
  assert.ok(learning.every(link => link.target === 'atlas.domain.olympus'));
  assert.ok(learning.every(link => link.isLearning && link.learningScope === 'INTER_DOMAIN'));
  assert.deepEqual(learning.map(link => link.bundleIndex), [0, 1]);
  assert.deepEqual(learning.map(link => link.bundleCount), [2, 2]);
  assert.equal(model.nodes.some(node => /Learning & governança/i.test(node.name)), false);
});

test('Learning semantic identity survives graph projection into Atlas links', () => {
  const source = state();
  source.filaments.push({
    id: 'PEER-DETECTION-GROUP-ROBUSTNESS',
    label: 'Peer Detection · Robustness',
    domain: 'SCIENCE',
    kind: 'SCIENTIFIC_LEARNING_PIPELINE',
    weight: .91,
    support: 3,
    contradiction: 0,
    status: 'TESTING',
    evidence: [],
    source_ref: 'tower://test/peer-battery',
    boundary: 'Scientific test architecture, not a verdict.',
    from_label: 'NEXO execution · Robustness',
    to_label: 'Science · PEER inference',
    from_domain: 'NEXO',
    to_domain: 'SCIENCE',
    scope: 'INTER_DOMAIN',
    peer_detection_group: 'ROBUSTNESS',
  });
  source.graph.edges.push({
    id: 'learning:peer-robustness',
    from: 'domain:NEXO',
    to: 'domain:SCIENCE',
    kind: 'SUPPORTS',
    weight: .91,
    explanation: 'Peer robustness bundle',
    is_learning: true,
    learning_scope: 'INTER_DOMAIN',
    learning_ref: 'PEER-DETECTION-GROUP-ROBUSTNESS',
  });

  const model = buildAtlasMetroModel(source);
  const link = model.crossLinks.find(item => item.learningRef === 'PEER-DETECTION-GROUP-ROBUSTNESS');
  assert.ok(link);
  assert.equal(model.nodeMap.get(link.source)?.name, 'Robustez & reprodutibilidade');
  assert.equal(model.nodeMap.get(link.target)?.name, 'Reprodutibilidade científica · Robustez');
  assert.equal(model.nodeMap.get(link.source)?.entityType, 'subdomain');
  assert.equal(model.nodeMap.get(link.target)?.entityType, 'subdomain');
  assert.equal(link.sourceAnchor, 'SEMANTIC_SUBDOMAIN');
  assert.equal(link.targetAnchor, 'SEMANTIC_SUBDOMAIN');
  assert.equal(link.learningKind, 'SCIENTIFIC_LEARNING_PIPELINE');
  assert.equal(link.learningGroup, 'ROBUSTNESS');
  assert.equal(link.learningTheme, 'reproducibility');
  assert.equal(link.learningBasis, 'STRUCTURED_GROUP');
  assert.match(link.label, /Peer Detection · Robustness/);
});

test('Learning preserves an explicit canonical entity as a leaf endpoint', () => {
  const source = state();
  const target = source.graph.nodes.find(node =>
    node.type !== 'DOMAIN' && node.type !== 'FILAMENT'
  );
  assert.ok(target, 'fixture needs at least one canonical entity leaf');

  source.filaments.push({
    id: 'LEARNING-EXACT-ENTITY-1',
    label: 'Writer recovery applied to explicit canonical entity',
    domain: 'NEXO',
    kind: 'PROCEDURAL',
    weight: .84,
    support: 2,
    contradiction: 0,
    status: 'ESTABLISHED',
    evidence: [target.id],
    source_ref: 'tower://meta/exact-entity',
    boundary: 'Exact target comes from an explicit canonical reference.',
    from_label: 'NEXO writer recovery',
    to_label: target.label,
    from_domain: 'NEXO',
    to_domain: target.domain,
    to_id: target.id,
    scope: target.domain === 'NEXO' || target.domain === 'ENGINEERING' ? 'INTRA_DOMAIN' : 'INTER_DOMAIN',
    links: [{ id: target.id, domain: target.domain, label: target.label }],
  });

  const model = buildAtlasMetroModel(source);
  const link = model.crossLinks.find(item => item.learningRef === 'LEARNING-EXACT-ENTITY-1');
  assert.ok(link);
  assert.equal(link.target, target.id);
  assert.equal(link.targetAnchor, 'EXACT_ENTITY');
  assert.equal(model.nodeMap.get(link.target)?.synthetic, false);
  assert.equal(model.nodeMap.get(link.target)?.depth, 2);
  assert.equal(model.nodeMap.get(link.target)?.parentId?.startsWith('atlas.subdomain.'), true);
});

test('raw Peer Detection runtime artifacts never materialize as Atlas stations', () => {
  const source = state();
  const template = source.graph.nodes.find(node => node.type !== 'DOMAIN' && node.type !== 'FILAMENT');
  assert.ok(template, 'fixture needs a canonical node template');
  source.graph.nodes.push(
    { ...template, id: 'work:PEER-DETECTION-D99-runtime', label: 'Peer runtime work' },
    { ...template, id: 'test:PEER-DETECTION-D99-runtime', label: 'Peer runtime test' },
    { ...template, id: 'capability:peer.detection.runtime', label: 'Peer runtime capability', type: 'CAPABILITY' },
  );

  const model = buildAtlasMetroModel(source);
  assert.equal(model.nodes.some(node => /^work:PEER-DETECTION-D\d+/i.test(String(node.sourceId || ''))), false);
  assert.equal(model.nodes.some(node => /^test:PEER-DETECTION-D\d+/i.test(String(node.sourceId || ''))), false);
  assert.equal(model.nodes.some(node => /^capability:peer\.detection\./i.test(String(node.sourceId || ''))), false);
});

test('Learning uses a unique canonical linked entity as an inter-domain leaf endpoint', () => {
  const source = state();
  const target = source.graph.nodes.find(node =>
    node.type !== 'DOMAIN'
    && node.type !== 'FILAMENT'
    && (node.domain === 'SCIENCE' || node.domain === 'OLYMPUS')
  );
  assert.ok(target, 'fixture needs an inter-domain canonical entity leaf');

  source.filaments.push({
    id: 'LEARNING-LINKED-ENTITY-1',
    label: 'Cross-domain learning with sanctioned entity link',
    domain: 'NEXO',
    kind: 'SEMANTIC',
    weight: .81,
    support: 2,
    contradiction: 0,
    status: 'ESTABLISHED',
    evidence: [target.id],
    source_ref: 'tower://meta/linked-entity',
    boundary: 'Linked target is canonical routing metadata.',
    from_label: 'NEXO method',
    to_label: target.label,
    from_domain: 'NEXO',
    to_domain: target.domain,
    scope: 'INTER_DOMAIN',
    links: [{ id: target.id, domain: target.domain, label: target.label }],
  });

  const model = buildAtlasMetroModel(source);
  const link = model.crossLinks.find(item => item.learningRef === 'LEARNING-LINKED-ENTITY-1');
  assert.ok(link);
  assert.equal(link.target, target.id);
  assert.equal(link.targetAnchor, 'EXACT_ENTITY');
  assert.equal(model.nodeMap.get(link.target)?.synthetic, false);
  assert.equal(model.nodeMap.get(link.target)?.depth, 2);
});

test('Peer Detection semantic groups fan out across scientific areas instead of one mega-subdomain', () => {
  const groups = [
    'GOVERNANCE',
    'BASELINE_PROFILE',
    'ANCHOR',
    'DATA_SPLITS',
    'GLOBAL_NULL',
    'CALIBRATION',
    'BAYES_PRIORS',
    'RIVALS',
    'PREDICTION',
    'ROBUSTNESS',
    'SYNTHESIS',
  ];
  const routes = groups.map(group => learningSemanticRoute({
    id: `PEER-DETECTION-GROUP-${group}`,
    label: `Peer Detection · ${group}`,
    domain: 'SCIENCE',
    kind: 'SCIENTIFIC_LEARNING_PIPELINE',
    weight: .8,
    support: 1,
    contradiction: 0,
    status: 'TESTING',
    evidence: [],
    source_ref: 'tower://peer',
    boundary: 'Scientific pipeline.',
    from_label: `NEXO execution · ${group}`,
    to_label: 'Science · PEER inference',
    from_domain: 'NEXO',
    to_domain: 'SCIENCE',
    scope: 'INTER_DOMAIN',
    peer_detection_group: group,
  })).filter(Boolean);

  assert.equal(routes.length, groups.length);
  const scienceTargets = new Set(routes.map(route => route.target?.subdomain).filter(Boolean));
  const nexoSources = new Set(routes.map(route => route.source?.subdomain).filter(Boolean));
  assert.ok(scienceTargets.size >= 7, `Peer target semantics collapsed to ${scienceTargets.size} areas`);
  assert.ok(nexoSources.size >= 5, `Peer source semantics collapsed to ${nexoSources.size} areas`);
  assert.ok(scienceTargets.has(LEARNING_ANCHORS.SCIENCE.bayes));
  assert.ok(scienceTargets.has(LEARNING_ANCHORS.SCIENCE.robustness));
  assert.ok(scienceTargets.has(LEARNING_ANCHORS.SCIENCE.h0));
  assert.ok(scienceTargets.has(LEARNING_ANCHORS.SCIENCE.growth));
});

test('procedural Learning separates execution, inference, data and causal semantics', () => {
  const base = {
    domain: 'NEXO',
    kind: 'PROCEDURAL',
    weight: .72,
    support: 1,
    contradiction: 0,
    status: 'PROVISIONAL',
    evidence: [],
    source_ref: 'tower://meta',
    boundary: 'Procedural only.',
    from_label: 'NEXO Learning',
    to_label: 'NEXO',
    from_domain: 'NEXO',
    to_domain: 'NEXO',
    scope: 'INTRA_DOMAIN',
  };
  const cases = [
    ['writer-rebase', 'Writer recovery after rebase', 'Execução & confiabilidade', 'Robustez & reprodutibilidade'],
    ['global-null', 'Global null calibration and covariance', 'Dados, agregação & incerteza', 'Inferência, nulls & calibração'],
    ['averaging', 'Averaging aggregation and low-N uncertainty', 'Dados, agregação & incerteza', 'Inferência, nulls & calibração'],
    ['causal', 'Localization is not causation', 'Dados, agregação & incerteza', 'Causalidade & interpretação'],
  ];
  for (const [id, label, expectedSource, expectedTarget] of cases) {
    const route = learningSemanticRoute({ ...base, id, label });
    assert.ok(route, `missing procedural route for ${id}`);
    assert.equal(route.source?.subdomain, expectedSource);
    assert.equal(route.target?.subdomain, expectedTarget);
  }
});

test('dense Science expansion keeps stations spaced and labels collision-free', () => {
  const model = buildAtlasMetroModel(state());
  const scienceRoot = model.roots.find(id => model.nodeMap.get(id)?.domain === 'SCIENCE');
  assert.ok(scienceRoot);

  const densest = (model.childrenMap.get(scienceRoot) || [])
    .map(id => model.nodeMap.get(id))
    .filter(Boolean)
    .sort((a, b) => b.childCount - a.childCount)[0];
  assert.ok(densest);
  assert.ok(densest.childCount > 0);

  const expanded = new Set([...model.roots, densest.id]);
  const visible = visibleAtlasIds(model, expanded);
  const positions = metroLayoutPositions(model, visible, 1200, 760);
  const labels = buildMetroScreenLabelLayout(
    model,
    visible,
    positions,
    1200,
    760,
    .62,
    densest.id,
    null,
  );

  assert.equal(labels.collisions, 0);
  assert.ok(labels.visible > 3);

  const children = (model.childrenMap.get(densest.id) || []).map(id => positions.get(id)).filter(Boolean);
  let minimumDistance = Infinity;
  for (let left = 0; left < children.length; left += 1) {
    for (let right = left + 1; right < children.length; right += 1) {
      minimumDistance = Math.min(
        minimumDistance,
        Math.hypot(
          children[left][0] - children[right][0],
          children[left][1] - children[right][1],
        ),
      );
    }
  }
  assert.ok(minimumDistance > 62, `dense sibling spacing collapsed to ${minimumDistance}px`);
});

test('dedicated Atlas production page uses Metro renderer, G6 and deterministic Three mode', async () => {
  const [app, renderer, index, css, main] = await Promise.all([
    text('src/atlas3d/Atlas3DApp.tsx'),
    text('src/atlas3d/MetroAtlasRenderer.tsx'),
    text('atlas3d/index.html'),
    text('src/atlas3d/atlas3d.css'),
    text('src/atlas3d/main.tsx'),
  ]);

  assert.match(app, /data-atlas-renderer="metro-cluster"/);
  assert.match(app, /dense-science/);
  assert.match(app, /learning-leaf/);
  assert.match(app, /data-atlas-learning-exact-entity-records/);
  assert.match(app, /data-atlas-learning-distinct-exact-entities/);
  assert.match(app, /data-atlas-peer-learning-links/);
  assert.match(app, /data-atlas-learning-subdomain-endpoints/);
  assert.match(app, /data-atlas-learning-distinct-subdomains/);
  assert.match(app, /data-atlas-learning-max-subdomain-share/);
  assert.match(app, /data-atlas-peer-target-subdomains/);
  assert.match(app, /data-atlas-learning-hub-endpoints/);
  assert.match(app, /data-atlas-peer-subdomain-links/);
  assert.match(app, /data-atlas-semantic-subdomain-links/);
  assert.match(app, /data-atlas-procedural-subdomain-links/);
  assert.match(app, /data-atlas-peer-artifact-nodes/);
  assert.match(app, /atlas-view-switch/);
  assert.match(app, /Modo 3D ativo/);
  assert.match(app, /data-atlas-learning-links/);
  assert.match(app, /data-atlas-learning-records/);
  assert.match(app, /data-atlas-learning-themes/);
  assert.match(app, /aprendizados canônicos/);
  assert.match(app, /atlas-learning-route/);
  assert.match(app, /onSelectNode/);
  assert.match(app, /data-atlas-learning-scientific/);
  assert.match(app, /data-atlas-learning-procedural/);
  assert.match(app, /data-atlas-learning-semantic/);
  assert.match(app, /learningRef/);
  assert.match(app, /navigationRevision !== model\.revision/);
  assert.match(app, /activeExpanded = navigationStale \? new Set\(initialExpanded\) : expanded/);
  assert.match(app, /URLSearchParams/);
  assert.match(app, /mode.*=== '3d'/);
  assert.match(app, /<strong>3D<\/strong><small>Explorar<\/small>/);
  assert.match(app, /<strong>2D<\/strong><small>Metro<\/small>/);
  assert.match(app, /3D EXPLORAR ATIVO/);
  assert.match(app, /2D METRO ATIVO/);
  assert.match(app, /atlas-mobile-details-toggle/);
  assert.match(app, /atlas-sidebar-backdrop/);
  assert.match(app, /mobile-open/);
  assert.doesNotMatch(app, /kind: 'ROOT'/);
  assert.doesNotMatch(app, /GalaxyThree3D/);

  assert.match(renderer, /window\.G6\?\.Graph/);
  assert.match(renderer, /metroLayoutPositions/);
  assert.match(renderer, /buildMetroScreenLabelLayout/);
  assert.match(renderer, /getViewportByCanvas/);
  assert.match(renderer, /g6LabelDomCollisions/);
  assert.match(renderer, /viewport-adaptive-v2/);
  const galaxyCompiler = await text('src/viewmodels/galaxyCompiler.ts');
  const graph2d = await text('src/viewmodels/graph.ts');
  const graph3d = await text('src/viewmodels/graph3d.ts');
  const layered = await text('src/viewmodels/layeredGraph.ts');
  assert.match(galaxyCompiler, /SUBDOMAIN: 'SUBDOMAIN'/);
  assert.match(graph2d, /SUBDOMAIN: 1/);
  assert.match(graph3d, /SUBDOMAIN: 0\.09/);
  assert.match(layered, /SUBDOMAIN: 'ENTITY'/);
    const taxonomy = await text('src/viewmodels/atlasTaxonomy.ts');
  assert.match(taxonomy, /atlasSubdomainHint/);
  assert.match(taxonomy, /Conservative semantic router/);
  const semantics = await text('src/atlas3d/learningSemantics.ts');
  assert.match(semantics, /STRUCTURED_GROUP/);
  assert.match(semantics, /learningSignalOf/);
  assert.match(semantics, /peerRoutes/);
  assert.match(semantics, /Governança científica & decisão/);
  assert.match(semantics, /Inferência bayesiana · Priors & evidência/);
  const adapter = await text('src/atlas3d/atlasAdapter.ts');
  assert.match(adapter, /resolveLearningEndpoint/);
  assert.match(adapter, /descendantCounts/);
  assert.match(adapter, /ENTITY_SUBDOMAIN/);
  assert.match(adapter, /SEMANTIC_SUBDOMAIN/);
  assert.match(adapter, /DOMAIN_HUB/);
  assert.match(adapter, /EXACT_ENTITY/);
    const layout = await text('src/atlas3d/metro2dLayout.ts');
  assert.match(layout, /floatingLabelBox/);
  assert.match(layout, /angularCandidates/);
  assert.match(layout, /radialCandidates/);
  assert.match(layout, /atlasUiSafeZones/);
  assert.match(layout, /uiZoneViolations/);
  assert.match(layout, /compactViewport/);
  assert.match(layout, /!compactViewport && node\.entityType === 'subdomain'/);
  assert.match(renderer, /atlas-label-leaders/);
  assert.match(renderer, /labelText: ''/);
  assert.match(renderer, /update: 'translate'/);
  assert.match(renderer, /isLearning/);
  assert.match(renderer, /#f59e0b/);
  assert.match(renderer, /threeLearningSynapses/);
  assert.match(renderer, /g6ScientificLearningEdges/);
  assert.match(renderer, /g6PeerLearningEdges/);
  assert.match(renderer, /g6SubdomainLearningEdges/);
  assert.match(renderer, /projectVisualCrossLinks/);
  assert.match(renderer, /g6LearningRecords/);
  assert.match(renderer, /g6LearningRelations/);
  assert.match(renderer, /g6DirectExactEntityLearningEdges/);
  assert.match(renderer, /threeDirectExactEntityLearningSynapses/);
  const learningVisuals = await text('src/atlas3d/learningVisuals.ts');
  assert.match(learningVisuals, /visual-record:/);
  assert.match(learningVisuals, /visual-learning:/);
  assert.match(learningVisuals, /theme:/);
  assert.match(learningVisuals, /learningRef \|\| link\.id/);
  assert.match(learningVisuals, /canonical Learning relations/);
  assert.match(learningVisuals, /nearestVisibleAtlasAncestor/);
  assert.match(learningVisuals, /logicalTarget/);
  assert.match(learningVisuals, /sourceCollapsed/);
  assert.match(learningVisuals, /targetCollapsed/);
  assert.match(renderer, /threeLearningVisualSynapses/);
  assert.match(renderer, /threeLearningRecords/);
  assert.match(renderer, /threeLearningRelations/);
  assert.match(renderer, /document\.hidden/);
  assert.match(renderer, /g6PeerSubdomainEdges/);
  assert.match(renderer, /threeSubdomainLearningSynapses/);
  assert.match(renderer, /threePeerSubdomainSynapses/);
  assert.match(renderer, /threeScientificLearningSynapses/);
  assert.match(renderer, /threePeerLearningSynapses/);
  assert.match(renderer, /G6_ZERO_VIEWPORT/);
  assert.match(renderer, /G6_RENDER_FAILED/);
  assert.match(renderer, /refreshSequence/);
  assert.match(renderer, /initializedRef/);
  assert.match(renderer, /refreshRef/);
  assert.match(renderer, /fitDuration = isAtlasReadback\(\) \? 0/);
  assert.match(renderer, /Promise\.race\(\[fitTask, fitTimeout\]\)/);
  assert.doesNotMatch(renderer, /G6_UPDATE_FAILED/);
  assert.match(renderer, /WEBGL_INIT_FAILED/);
  assert.match(renderer, /WEBGL_CONTEXT_LOST/);
  assert.match(renderer, /compact-touch/);
  assert.match(renderer, /reduced-gpu/);
  assert.match(renderer, /compact \? 2 : 3/);
  assert.match(renderer, /compact \? 4 : 5/);
  assert.match(renderer, /node\.entityType === 'hub'.*node\.entityType === 'subdomain'.*id === selectedId/s);
  assert.match(renderer, /props\.viewMode === '2d' \?/);
  assert.match(renderer, /onReadyRef\.current\?\.\(\)/);
  assert.match(renderer, /runtime-skip/);
  assert.match(renderer, /isAtlasReadback/);
  assert.match(renderer, /sharedGlowTexture/);
  assert.match(renderer, /atlasSharedTexture/);
  assert.match(renderer, /minimumFrameMs/);
  assert.match(renderer, /showLeafLabels/);
  assert.match(renderer, /threeFocusIds/);
  assert.match(renderer, /preserveDrawingBuffer: isAtlasReadback\(\)/);
  assert.match(renderer, /learningColor/);
  assert.match(renderer, /SCIENTIFIC_LEARNING_PIPELINE/);
  assert.match(renderer, /bundleIndex/);
  assert.match(renderer, /bundleCount/);
  assert.match(renderer, /curveOffset/);
  assert.match(renderer, /g6NodeCount/);
  assert.match(renderer, /querySelector\('canvas'\)/);
  assert.match(renderer, /OrbitControls/);
  assert.match(renderer, /threeNodeCount/);
  assert.match(renderer, /threeReady/);
  assert.match(renderer, /threePaintSamples/);
  assert.match(renderer, /preserveDrawingBuffer/);
  assert.match(renderer, /renderAndMeasureThree/);
  assert.match(renderer, /data-three-visual="neural-synapse"/);
  assert.match(renderer, /IcosahedronGeometry/);
  assert.match(renderer, /TubeGeometry/);
  assert.match(renderer, /AdditiveBlending/);
  assert.match(renderer, /createGlowSprite/);
  assert.match(renderer, /updateSynapsePulses/);
  assert.match(renderer, /synapseCurve/);
  assert.doesNotMatch(renderer, /TorusGeometry|RingGeometry/);
  assert.match(renderer, /fitThree\(/);
  assert.match(renderer, /threeFitInsets/);
  assert.match(renderer, /selection-safe-area-v5/);
  assert.match(renderer, /threeFitScope/);
  assert.match(renderer, /threeFitNodeCount/);
  assert.match(renderer, /threeFitCoverage/);
  assert.doesNotMatch(renderer, /\[model\.revision, expansionKey, showBeams, fitNonce\]/);
  assert.match(renderer, /NEXO: -520/);
  assert.match(renderer, /depthStep = 150/);
  assert.match(renderer, /siblingZ/);
  assert.match(renderer, /threeSameLevelZSpan/);
  assert.match(renderer, /domain-depth-sibling-v3/);
  assert.doesNotMatch(renderer, /forceSimulation|forceManyBody|forceLink/);

  assert.match(css, /height:100dvh/);
  assert.match(css, /\.atlas-workspace\{position:absolute;inset:0;width:100%;height:100%/);
  assert.match(css, /\.atlas-sidebar\.mobile-open/);
  assert.match(css, /touch-action:none/);
  assert.match(css, /grid-template-columns:minmax\(116px,1fr\) auto auto auto auto/);
  assert.match(css, /atlas-mobile-details-toggle::after/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /\.g6-minimap/);
  assert.match(css, /contain:layout paint/);
  assert.match(css, /backdrop-filter:none/);
  assert.doesNotMatch(css, /pointer-events:none;opacity:\.18/);

  assert.doesNotMatch(index, /@antv\/g6@5\/dist\/g6\.min\.js/);
  assert.match(main, /G6_SOURCES/);
  assert.match(main, /unpkg\.com\/\@antv\/g6/);
  assert.match(main, /cdn\.jsdelivr\.net\/npm\/\@antv\/g6/);
  assert.match(main, /g6Fallback/);
  assert.match(main, /data-atlas-bootstrap/);
  assert.match(main, /atlasG6Source/);
});
