import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildObservatoryLayout,
  dependenciesAtScale,
  isRecentSceneResult,
  scaleForDistance,
  stableSceneOffset,
} from '../src/features/lab/sceneModel.ts';
import { allocateConnectionSamples, buildCosmicWebGeometry } from '../src/features/lab/cosmicWebGeometry.ts';

const sampleTest = (id, overrides = {}) => ({
  id,
  name: id,
  historical: false,
  question: null,
  meaning: null,
  summary: null,
  method: null,
  status: null,
  review: null,
  verdict: 'PROVISIONAL',
  hypothesisId: null,
  campaignId: null,
  roadmapId: null,
  domain: 'SCIENCE',
  subdomainId: null,
  topicId: null,
  subdomain: null,
  topic: null,
  blocker: null,
  contestOf: null,
  contests: [],
  createdAt: null,
  prereg: { metric: null, threshold: null, prediction: null, null_model: null, rival: null, hash: null, at: null, success: [], kill: [], ref: null },
  createdSource: null,
  executedAt: null,
  execution: null,
  parents: [],
  children: [],
  verdictRaw: null,
  result: null,
  statistics: null,
  robustness: null,
  datasets: null,
  artifacts: null,
  limitations: null,
  claimBoundary: null,
  claimLevel: null,
  reviews: [],
  ...overrides,
});

const projects = [
  { id: 'RM-A', label: 'Projeto A', domain: 'SCIENCE', testIds: ['A'] },
  { id: 'RM-B', label: 'Projeto B', domain: 'SCIENCE', testIds: ['B'] },
];
const hypotheses = [
  { id: 'H-A', label: 'Hipótese A', testIds: ['A'] },
  { id: 'H-B', label: 'Hipótese B', testIds: ['B'] },
];
const baseTests = [
  sampleTest('A', { roadmapId: 'RM-A', hypothesisId: 'H-A' }),
  sampleTest('B', { roadmapId: 'RM-B', hypothesisId: 'H-B', parents: ['test:A'] }),
  sampleTest('C', { roadmapId: 'RM-B', hypothesisId: 'H-B' }),
];

test('layout placement is deterministic and existing entities do not move when records are added', () => {
  const first = buildObservatoryLayout(baseTests, projects, hypotheses);
  const reversed = buildObservatoryLayout([...baseTests].reverse(), [...projects].reverse(), [...hypotheses].reverse());
  const extended = buildObservatoryLayout([
    ...baseTests,
    sampleTest('D', { roadmapId: 'RM-B', hypothesisId: 'H-B' }),
  ], projects, hypotheses);

  for (const entity of first.entities) {
    assert.deepEqual(reversed.entityByKey.get(entity.key)?.position, entity.position, entity.key + ' changed after reorder');
    assert.deepEqual(extended.entityByKey.get(entity.key)?.position, entity.position, entity.key + ' moved after adding a record');
  }
});

test('unassigned tests stay in explicit domain regions with visible project, hypothesis, and test membership', () => {
  const unassigned = [
    sampleTest('U-A', { hypothesisId: 'H-U' }),
    sampleTest('U-B', { hypothesisId: 'H-U', domain: 'SCIENCE' }),
  ];
  const layout = buildObservatoryLayout(unassigned, [], [{ id: 'H-U', label: 'Hipótese órfã', testIds: ['U-A', 'U-B'] }]);
  assert.ok(layout.entityByKey.has('region:SCIENCE'));
  assert.ok(layout.entityByKey.has('hypothesis:H-U'));
  assert.ok(layout.entityByKey.has('test:U-A'));
  assert.deepEqual(layout.memberships.map(link => [link.sourceKey, link.targetKey]), [
    ['hypothesis:H-U', 'test:U-A'],
    ['hypothesis:H-U', 'test:U-B'],
    ['region:SCIENCE', 'hypothesis:H-U'],
  ]);
  assert.equal(layout.projectCount, 0, 'a fallback region is not mislabeled as a project');
});

test('shared hypothesis placement chooses a stable project cluster regardless of record order', () => {
  const shared = [
    sampleTest('Z', { roadmapId: 'RM-Z', hypothesisId: 'H-SHARED' }),
    sampleTest('A', { roadmapId: 'RM-A', hypothesisId: 'H-SHARED' }),
  ];
  const first = buildObservatoryLayout(shared, projects, [{ id: 'H-SHARED', label: 'Shared', testIds: ['Z', 'A'] }]);
  const reversed = buildObservatoryLayout([...shared].reverse(), [...projects].reverse(), [{ id: 'H-SHARED', label: 'Shared', testIds: ['A', 'Z'] }]);
  assert.deepEqual(first.entityByKey.get('hypothesis:H-SHARED').position, reversed.entityByKey.get('hypothesis:H-SHARED').position);
  const anchor = first.entityByKey.get('project:RM-A').position;
  const offset = stableSceneOffset('hypothesis:H-SHARED', 2.5);
  assert.deepEqual(first.entityByKey.get('hypothesis:H-SHARED').position, { x: anchor.x + offset.x, y: anchor.y + offset.y, z: anchor.z + offset.z });
});

test('dependencies come only from explicit published parent/child relations', () => {
  const layout = buildObservatoryLayout(baseTests, projects, hypotheses);
  assert.deepEqual(layout.dependencies.map(link => [link.sourceTestId, link.targetTestId]), [['A', 'B']]);

  const withoutRelation = buildObservatoryLayout(baseTests.map(entity => ({ ...entity, parents: [], children: [] })), projects, hypotheses);
  assert.deepEqual(withoutRelation.dependencies, []);
});

test('coarser scales aggregate true dependencies while operational scale retains exact tests', () => {
  const layout = buildObservatoryLayout(baseTests, projects, hypotheses);
  const overview = dependenciesAtScale(layout, baseTests, 'overview');
  const research = dependenciesAtScale(layout, baseTests, 'research');
  const operational = dependenciesAtScale(layout, baseTests, 'operational');

  assert.equal(overview.length, 1);
  assert.deepEqual([overview[0].sourceKey, overview[0].targetKey], ['project:RM-A', 'project:RM-B']);
  assert.deepEqual([research[0].sourceKey, research[0].targetKey], ['hypothesis:H-A', 'hypothesis:H-B']);
  assert.deepEqual([operational[0].sourceKey, operational[0].targetKey], ['test:A', 'test:B']);
  assert.equal(layout.dependencies.length, 1, 'aggregation does not create additional relations');
});

test('stale execution state cannot pulse dependencies and blocked targets are attenuated', () => {
  const runningTests = [
    sampleTest('A'),
    sampleTest('B', { verdict: 'RUNNING', status: 'RUNNING', parents: ['A'] }),
  ];
  const layout = buildObservatoryLayout(runningTests, projects, hypotheses);
  assert.equal(dependenciesAtScale(layout, runningTests, 'operational', false)[0].activeExecution, false);
  assert.equal(dependenciesAtScale(layout, runningTests, 'operational', true)[0].activeExecution, true);
  const queuedTests = [
    sampleTest('A'),
    sampleTest('B', { verdict: 'RUNNING', status: 'QUEUED', parents: ['A'] }),
  ];
  const queuedLayout = buildObservatoryLayout(queuedTests, projects, hypotheses);
  assert.equal(dependenciesAtScale(queuedLayout, queuedTests, 'operational', true)[0].activeExecution, false);
  const blockedTests = [
    sampleTest('A'),
    sampleTest('B', { verdict: 'BLOCKED', parents: ['A'] }),
  ];
  const blockedLayout = buildObservatoryLayout(blockedTests, projects, hypotheses);
  assert.equal(dependenciesAtScale(blockedLayout, blockedTests, 'operational')[0].attenuated, true);
  assert.equal(isRecentSceneResult(blockedTests[1], new Set(['B']), true), false);
});

test('cinematic web geometry is deterministic, budgeted, and separates density from dependency arrows', () => {
  const layout = buildObservatoryLayout(baseTests, projects, hypotheses);
  const low = buildCosmicWebGeometry(layout, 'low');
  const lowAgain = buildCosmicWebGeometry(layout, 'low');
  const medium = buildCosmicWebGeometry(layout, 'medium');
  const positions = low.particles.getAttribute('position').array;
  const repeated = lowAgain.particles.getAttribute('position').array;
  assert.ok(low.particleCount > 0);
  assert.ok(low.particleCount <= 20_000);
  assert.deepEqual(Array.from(positions), Array.from(repeated), 'static dust must not change on re-render');
  assert.ok(medium.particleCount > low.particleCount, 'quality tier increases structural detail');
  assert.ok(low.filaments.getAttribute('position').count > 0);
  assert.ok(low.connections.some(connection => connection.relation === 'membership'));
  assert.ok(low.connections.some(connection => connection.relation === 'domain-density'));
  assert.equal(low.connections.some(connection => connection.id.includes('A->B')), false, 'dependency direction is rendered in its separate arrow layer');
  assert.ok(low.connections.filter(connection => connection.relation === 'domain-density').every(connection => {
    const source = layout.entityByKey.get(connection.sourceKey);
    const target = layout.entityByKey.get(connection.targetKey);
    return source && target && source.domain === target.domain;
  }));
});

test('cosmic filament samples follow 3D path length while retaining a floor for short relations', () => {
  const origin = { key: 'project:origin', position: { x: 0, y: 0, z: 0 } };
  const near = { key: 'hypothesis:near', position: { x: 0.5, y: 0, z: 0 } };
  const far = { key: 'project:far', position: { x: 100, y: 0, z: 0 } };
  const entityByKey = new Map([[origin.key, origin], [near.key, near], [far.key, far]]);
  const connections = Array.from({ length: 500 }, (_, index) => ({
    id: `short-${String(index).padStart(3, '0')}`,
    sourceKey: origin.key,
    targetKey: near.key,
    relation: 'membership',
  }));
  connections.push({ id: 'long-domain-fiber', sourceKey: origin.key, targetKey: far.key, relation: 'domain-density' });
  const allocation = allocateConnectionSamples({ entityByKey }, connections, 'medium');

  assert.equal(allocation.length, connections.length);
  assert.ok(allocation[500] >= allocation[0] * 2, 'long inter-region paths receive denser samples');
  assert.ok(allocation.every(samples => samples >= 10), 'short published relations retain a visible density floor');
  assert.ok(allocation.every(samples => samples <= 176 * 2), 'per-path detail stays bounded');
});

test('large cosmic layouts honor per-quality particle and connection budgets', () => {
  const entities = [];
  const entityByKey = new Map();
  const memberships = [];
  const count = 2_200;
  for (let index = 0; index < count; index += 1) {
    const id = String(index).padStart(4, '0');
    const angle = index / count * Math.PI * 2;
    const projectKey = `project:P-${id}`;
    const testKey = `test:T-${id}`;
    const project = { key: projectKey, id: `P-${id}`, kind: 'project', label: `Projeto ${id}`, domain: 'SCIENCE', position: { x: Math.cos(angle) * 12, y: Math.sin(angle) * 4, z: Math.sin(angle) * 9 } };
    const test = { key: testKey, id: `T-${id}`, kind: 'test', label: `Teste ${id}`, domain: 'SCIENCE', position: { x: project.position.x + 0.4, y: project.position.y, z: project.position.z } };
    entities.push(project, test);
    entityByKey.set(projectKey, project);
    entityByKey.set(testKey, test);
    memberships.push({ id: `${projectKey}->${testKey}`, sourceKey: projectKey, targetKey: testKey });
  }
  const largeLayout = { entities, entityByKey, memberships, dependencies: [], keyByTestId: new Map(), projectForTest: new Map(), hypothesisForTest: new Map(), projectCount: count, hypothesisCount: 0, testCount: count };
  const low = buildCosmicWebGeometry(largeLayout, 'low');
  const high = buildCosmicWebGeometry(largeLayout, 'high');
  assert.ok(low.connections.length <= 2_048);
  assert.ok(high.connections.length <= 2_048);
  assert.ok(low.particleCount <= 20_000);
  assert.ok(high.particleCount <= 60_000);
});

test('scale thresholds and recent-result brightness reflect explicit state only', () => {
  assert.equal(scaleForDistance(30), 'overview');
  assert.equal(scaleForDistance(18), 'research');
  assert.equal(scaleForDistance(10), 'operational');

  const testEntity = sampleTest('A');
  assert.equal(isRecentSceneResult(testEntity, new Set(['A']), true), true);
  assert.equal(isRecentSceneResult(testEntity, new Set(['A']), false), false);
  assert.equal(isRecentSceneResult(testEntity, new Set(), true), false);
});

test('primary scene has no synthetic formation, decorative orbit or temporal afterimage', async () => {
  const scene = await readFile(new URL('../src/features/lab/ObservatoryScene.tsx', import.meta.url), 'utf8');
  assert.match(scene, /data-scene-model="cosmic-web"/);
  assert.match(scene, /scale\?: ObservatoryScale/);
  assert.match(scene, /onScaleChange\?:/);
  assert.match(scene, /onProjectSelect\?: \(id: string \| null\)/);
  assert.match(scene, /activeExecution\(\)/);
  assert.match(scene, /element\.tabIndex = -1/);
  assert.match(scene, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(scene, /published-membership/);
  assert.match(scene, /#include <colorspace_fragment>/);
  assert.match(scene, /dataset\.cosmicParticles/);
  assert.match(scene, /dataset\.cosmicFilaments/);
  assert.match(scene, /buildCosmicWebGeometry/);
  assert.doesNotMatch(scene, /nexo:replay-formation|AfterimagePass|scene\.scale\.setScalar|target\.az \+= dt/);
});
