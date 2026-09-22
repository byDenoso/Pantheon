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
  assert.equal(link.source, 'atlas.domain.nexo');
  assert.equal(link.target, 'atlas.domain.science');
  assert.equal(link.learningKind, 'SCIENTIFIC_LEARNING_PIPELINE');
  assert.equal(link.learningGroup, 'ROBUSTNESS');
  assert.match(link.label, /Peer Detection · Robustness/);
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
  const [app, renderer, index, css] = await Promise.all([
    text('src/atlas3d/Atlas3DApp.tsx'),
    text('src/atlas3d/MetroAtlasRenderer.tsx'),
    text('atlas3d/index.html'),
    text('src/atlas3d/atlas3d.css'),
  ]);

  assert.match(app, /data-atlas-renderer="metro-cluster"/);
  assert.match(app, /dense-science/);
  assert.match(app, /data-atlas-peer-learning-links/);
  assert.match(app, /data-atlas-peer-artifact-nodes/);
  assert.match(app, /atlas-view-switch/);
  assert.match(app, /Modo 3D ativo/);
  assert.match(app, /data-atlas-learning-links/);
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
  const layout = await text('src/atlas3d/metro2dLayout.ts');
  assert.match(layout, /floatingLabelBox/);
  assert.match(layout, /angularCandidates/);
  assert.match(layout, /radialCandidates/);
  assert.match(layout, /atlasUiSafeZones/);
  assert.match(layout, /uiZoneViolations/);
  assert.match(layout, /compactViewport/);
  assert.match(layout, /passive subdomain labels may yield/);
  assert.match(renderer, /atlas-label-leaders/);
  assert.match(renderer, /labelText: ''/);
  assert.match(renderer, /update: 'translate'/);
  assert.match(renderer, /isLearning/);
  assert.match(renderer, /#f59e0b/);
  assert.match(renderer, /threeLearningSynapses/);
  assert.match(renderer, /g6ScientificLearningEdges/);
  assert.match(renderer, /g6PeerLearningEdges/);
  assert.match(renderer, /threeScientificLearningSynapses/);
  assert.match(renderer, /threePeerLearningSynapses/);
  assert.match(renderer, /G6_ZERO_VIEWPORT/);
  assert.match(renderer, /G6_RENDER_FAILED/);
  assert.match(renderer, /WEBGL_INIT_FAILED/);
  assert.match(renderer, /WEBGL_CONTEXT_LOST/);
  assert.match(renderer, /compact-touch/);
  assert.match(renderer, /runtime-skip/);
  assert.match(renderer, /isAtlasReadback/);
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
  assert.match(renderer, /fitThree\(runtime, !initialFit\)/);
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
  assert.doesNotMatch(css, /pointer-events:none;opacity:\.18/);

  assert.match(index, /@antv\/g6@5\/dist\/g6\.min\.js/);
});
