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
  assert.doesNotMatch(scene, /nexo:replay-formation|AfterimagePass|scene\.scale\.setScalar|target\.az \+= dt/);
});
