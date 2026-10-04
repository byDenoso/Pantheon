import type { TestEntity } from './model.ts';
import { normDomain } from './domains.ts';

export type ObservatoryScale = 'overview' | 'research' | 'operational';
export type SceneEntityKind = 'region' | 'project' | 'hypothesis' | 'test';

export interface SceneProject {
  id: string;
  label: string;
  domain: string;
  testIds: readonly string[];
}

export interface SceneHypothesis {
  id: string;
  label: string;
  testIds: readonly string[];
}

export interface ScenePosition {
  x: number;
  y: number;
  z: number;
}

export interface SceneEntity {
  key: string;
  id: string;
  kind: SceneEntityKind;
  label: string;
  domain: string;
  position: ScenePosition;
  test?: TestEntity;
}

export interface SceneDependency {
  id: string;
  sourceTestId: string;
  targetTestId: string;
  attenuated: boolean;
}

export interface SceneMembership {
  id: string;
  sourceKey: string;
  targetKey: string;
}

export interface ObservatoryLayout {
  entities: SceneEntity[];
  entityByKey: Map<string, SceneEntity>;
  keyByTestId: Map<string, string>;
  projectForTest: Map<string, string>;
  hypothesisForTest: Map<string, string>;
  dependencies: SceneDependency[];
  memberships: SceneMembership[];
  projectCount: number;
  hypothesisCount: number;
  testCount: number;
}

const DOMAIN_ANCHORS: Record<string, ScenePosition> = {
  SCIENCE: { x: -6.5, y: 1.5, z: -2 },
  ENGINEERING: { x: 6, y: -1, z: 3 },
  OLYMPUS: { x: 1.5, y: 5, z: 7 },
};

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  result = Math.imul(result, 0xc2b2ae35);
  result ^= result >>> 16;
  return result >>> 0;
}

/** Stable, well-spread 3D offset: independent of input order and later additions. */
export function stableSceneOffset(key: string, radius: number): ScenePosition {
  const seed = hash(key);
  const u = (seed + 0.5) / 4294967296;
  const v = (hash(`${key}#angle`) + 0.5) / 4294967296;
  const y = 2 * u - 1;
  const angle = 2 * Math.PI * v;
  const planar = Math.sqrt(Math.max(0, 1 - y * y));
  const radial = radius * (0.68 + ((hash(`${key}#radius`) % 10_000) / 10_000) * 0.32);
  return {
    x: Math.cos(angle) * planar * radial,
    y: y * radial,
    z: Math.sin(angle) * planar * radial,
  };
}

function add(a: ScenePosition, b: ScenePosition): ScenePosition {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function bareId(value: string): string {
  return value.replace(/^(?:test|hypothesis|campaign|roadmap):/i, '');
}

function projectKey(id: string): string {
  return `project:${bareId(id)}`;
}

function hypothesisKey(id: string): string {
  return `hypothesis:${bareId(id)}`;
}

function testKey(id: string): string {
  return `test:${bareId(id)}`;
}

function domainKey(id: string): string {
  return `domain:${normDomain(id)}`;
}

function domainAnchor(domain: string): ScenePosition {
  const normalized = normDomain(domain);
  const known = DOMAIN_ANCHORS[normalized];
  if (known) return known;
  return add({ x: 0, y: 0, z: 0 }, stableSceneOffset(`domain:${normalized}`, 9.5));
}

function projectIdForTest(test: TestEntity): string | null {
  return test.roadmapId || test.campaignId || null;
}

/**
 * Build a stable semantic layout from only published entities and relations.
 * Projects form the large regions, hypotheses sit within those regions, and
 * tests remain individually addressable. The only graph edges are explicit
 * parent/child dependencies present on the published test records.
 */
export function buildObservatoryLayout(
  tests: readonly TestEntity[],
  projects: readonly SceneProject[] = [],
  hypotheses: readonly SceneHypothesis[] = [],
): ObservatoryLayout {
  const testById = new Map(tests.map(test => [bareId(test.id), test]));
  const projectRecords = new Map<string, SceneProject>();
  for (const project of projects) {
    const id = bareId(project.id);
    if (!id) continue;
    projectRecords.set(id, { ...project, id, domain: normDomain(project.domain) });
  }

  // Fill omitted labels from canonical test metadata while retaining the
  // projection's actual project identifier. No anonymous project is invented.
  for (const test of tests) {
    const id = projectIdForTest(test);
    if (!id) continue;
    const normalizedId = bareId(id);
    if (!projectRecords.has(normalizedId)) {
      projectRecords.set(normalizedId, {
        id: normalizedId,
        label: normalizedId,
        domain: normDomain(test.domain),
        testIds: [],
      });
    }
  }

  const hypothesisRecords = new Map<string, SceneHypothesis>();
  for (const hypothesis of hypotheses) {
    const id = bareId(hypothesis.id);
    if (id) hypothesisRecords.set(id, { ...hypothesis, id });
  }
  for (const test of tests) {
    if (!test.hypothesisId) continue;
    const id = bareId(test.hypothesisId);
    if (!hypothesisRecords.has(id)) hypothesisRecords.set(id, { id, label: id, testIds: [] });
  }

  const entities: SceneEntity[] = [];
  const entityByKey = new Map<string, SceneEntity>();
  const projectForTest = new Map<string, string>();
  const hypothesisForTest = new Map<string, string>();
  const keyByTestId = new Map<string, string>();
  const addEntity = (entity: SceneEntity) => {
    entities.push(entity);
    entityByKey.set(entity.key, entity);
  };

  const unprojectedDomains = [...new Set(tests.filter(test => !projectIdForTest(test)).map(test => normDomain(test.domain)))].sort();
  for (const domain of unprojectedDomains) {
    const key = `region:${domain}`;
    const title = domain.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase());
    addEntity({ key, id: domain, kind: 'region', label: title + ' · sem projeto atribuído', domain, position: domainAnchor(domain) });
  }

  for (const project of [...projectRecords.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = projectKey(project.id);
    const domain = normDomain(project.domain);
    const position = add(domainAnchor(domain), stableSceneOffset(key, 4.8));
    addEntity({ key, id: project.id, kind: 'project', label: project.label, domain, position });
  }

  // A hypothesis position depends on its ID and domain only. It stays put when
  // a new test is added or when the input collection is reordered.
  const hypothesisDomains = new Map<string, string>();
  const hypothesisClusters = new Map<string, string>();
  for (const test of tests) {
    if (!test.hypothesisId) continue;
    const id = bareId(test.hypothesisId);
    const domain = normDomain(test.domain);
    const existing = hypothesisDomains.get(id);
    hypothesisDomains.set(id, existing && existing < domain ? existing : domain);
    const projectId = projectIdForTest(test);
    const cluster = projectId ? projectKey(projectId) : `region:${domain}`;
    const previousCluster = hypothesisClusters.get(id);
    if (!previousCluster || cluster.localeCompare(previousCluster) < 0) hypothesisClusters.set(id, cluster);
  }
  for (const hypothesis of [...hypothesisRecords.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const domain = hypothesisDomains.get(hypothesis.id);
    if (!domain) continue;
    const key = hypothesisKey(hypothesis.id);
    const clusterKey = hypothesisClusters.get(hypothesis.id) || `region:${domain}`;
    const cluster = entityByKey.get(clusterKey);
    const position = add(cluster?.position || domainAnchor(domain), stableSceneOffset(key, 2.5));
    addEntity({ key, id: hypothesis.id, kind: 'hypothesis', label: hypothesis.label || hypothesis.id, domain, position });
  }

  for (const test of [...tests].sort((a, b) => bareId(a.id).localeCompare(bareId(b.id)))) {
    const id = bareId(test.id);
    const key = testKey(id);
    const projectId = projectIdForTest(test);
    const project = projectId ? projectKey(projectId) : `region:${normDomain(test.domain)}`;
    const hypothesis = test.hypothesisId ? hypothesisKey(test.hypothesisId) : null;
    const parent = hypothesis && entityByKey.has(hypothesis) ? entityByKey.get(hypothesis)!
      : project && entityByKey.has(project) ? entityByKey.get(project)!
        : null;
    const base = parent?.position || domainAnchor(test.domain);
    const position = add(base, stableSceneOffset(key, parent?.kind === 'hypothesis' ? 1.05 : 1.8));
    addEntity({ key, id, kind: 'test', label: test.name || id, domain: normDomain(test.domain), position, test });
    keyByTestId.set(id, key);
    if (entityByKey.has(project)) projectForTest.set(id, project);
    if (hypothesis && entityByKey.has(hypothesis)) hypothesisForTest.set(id, hypothesis);
  }

  const dependencies = new Map<string, SceneDependency>();
  const addDependency = (sourceId: string, targetId: string) => {
    const source = bareId(sourceId), target = bareId(targetId);
    if (!source || !target || source === target || !testById.has(source) || !testById.has(target)) return;
    const id = `${source}->${target}`;
    const targetTest = testById.get(target)!;
    dependencies.set(id, {
      id,
      sourceTestId: source,
      targetTestId: target,
      attenuated: ['BLOCKED', 'REJECTED', 'DISCARDED'].includes(targetTest.verdict),
    });
  };
  for (const test of tests) {
    const target = bareId(test.id);
    for (const parent of test.parents || []) addDependency(parent, target);
    for (const child of test.children || []) addDependency(target, child);
  }

  const memberships = new Map<string, SceneMembership>();
  for (const test of tests) {
    const id = bareId(test.id);
    const project = projectForTest.get(id);
    const hypothesis = hypothesisForTest.get(id);
    if (project && hypothesis && project !== hypothesis) {
      const edgeId = `${project}->${hypothesis}`;
      memberships.set(edgeId, { id: edgeId, sourceKey: project, targetKey: hypothesis });
    }
    if (hypothesis && keyByTestId.has(id)) {
      const edgeId = `${hypothesis}->${keyByTestId.get(id)}`;
      memberships.set(edgeId, { id: edgeId, sourceKey: hypothesis, targetKey: keyByTestId.get(id)! });
    } else if (project && keyByTestId.has(id)) {
      const edgeId = `${project}->${keyByTestId.get(id)}`;
      memberships.set(edgeId, { id: edgeId, sourceKey: project, targetKey: keyByTestId.get(id)! });
    }
  }

  return {
    entities,
    entityByKey,
    keyByTestId,
    projectForTest,
    hypothesisForTest,
    dependencies: [...dependencies.values()].sort((a, b) => a.id.localeCompare(b.id)),
    memberships: [...memberships.values()].sort((a, b) => a.id.localeCompare(b.id)),
    projectCount: projectRecords.size,
    hypothesisCount: hypothesisRecords.size,
    testCount: tests.length,
  };
}

export function scaleForDistance(distance: number): ObservatoryScale {
  if (!Number.isFinite(distance) || distance >= 24) return 'overview';
  if (distance >= 13) return 'research';
  return 'operational';
}

export const SCALE_DISTANCE: Record<ObservatoryScale, number> = {
  overview: 32,
  research: 19,
  operational: 10.5,
};

export function sceneNodeKeyForScale(
  layout: ObservatoryLayout,
  testId: string,
  scale: ObservatoryScale,
): string | null {
  const normalizedId = bareId(testId);
  const testKeyValue = layout.keyByTestId.get(normalizedId);
  if (scale === 'operational') return testKeyValue || null;
  const hypothesisKeyValue = layout.hypothesisForTest.get(normalizedId);
  if (scale === 'research') return hypothesisKeyValue || layout.projectForTest.get(normalizedId) || null;
  return layout.projectForTest.get(normalizedId) || null;
}

/** Coalesces only real dependency records when coarser levels hide their tests. */
export function dependenciesAtScale(
  layout: ObservatoryLayout,
  tests: readonly TestEntity[],
  scale: ObservatoryScale,
  sourceCurrent = true,
): Array<{ id: string; sourceKey: string; targetKey: string; count: number; activeExecution: boolean; attenuated: boolean }> {
  const byId = new Map(tests.map(test => [bareId(test.id), test]));
  const aggregated = new Map<string, { id: string; sourceKey: string; targetKey: string; count: number; activeExecution: boolean; attenuated: boolean }>();
  for (const dependency of layout.dependencies) {
    const sourceKey = sceneNodeKeyForScale(layout, dependency.sourceTestId, scale);
    const targetKey = sceneNodeKeyForScale(layout, dependency.targetTestId, scale);
    if (!sourceKey || !targetKey || sourceKey === targetKey) continue;
    const key = `${sourceKey}->${targetKey}`;
    const record = aggregated.get(key) || { id: key, sourceKey, targetKey, count: 0, activeExecution: false, attenuated: false };
    record.count += 1;
    const target = byId.get(dependency.targetTestId);
    record.activeExecution ||= sourceCurrent && target?.status === 'RUNNING';
    record.attenuated ||= dependency.attenuated;
    aggregated.set(key, record);
  }
  return [...aggregated.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function isRecentSceneResult(test: TestEntity, hotIds: ReadonlySet<string>, sourceCurrent: boolean): boolean {
  return sourceCurrent
    && hotIds.has(bareId(test.id))
    && ['CONFIRMED', 'REFUTED', 'REVIEW', 'PROVISIONAL', 'CHECKPOINTED'].includes(test.verdict);
}
