import test from 'node:test';
import assert from 'node:assert/strict';
import { projects, dependencies, retiredProjects } from '../src/data.js';
import {
  createRepository,
  filterProjects,
  getAtlasVisibleProjects,
  summarizeProjects,
  validateManifest,
} from '../src/store.js';

const projectIds = () => new Set(projects.map((project) => project.id));

test('canonical seed contains 18 unique current projects and excludes retired aliases', () => {
  assert.equal(projects.length, 18);
  assert.equal(projectIds().size, 18);
  assert.ok(projectIds().has('project-atlas'));

  for (const retired of retiredProjects) {
    assert.equal(projectIds().has(retired.id), false, `${retired.id} must not be indexed`);
  }

  for (const project of projects) {
    assert.ok(project.name);
    assert.ok(project.domain);
    assert.ok(project.status);
    assert.ok(project.updatedAt);
    assert.ok(Array.isArray(project.sources));
  }
});

test('atlas starts with roots and reveals a subtree only after its parent is expanded', () => {
  const collapsed = getAtlasVisibleProjects(projects, new Set());
  const collapsedIds = new Set(collapsed.map((project) => project.id));
  assert.ok(collapsedIds.has('olympus'));
  assert.equal(collapsedIds.has('project-natalia'), false);
  assert.equal(collapsedIds.has('miqueias-v3'), false);
  assert.equal(collapsedIds.has('renilde'), false);
  assert.equal(collapsedIds.has('peer-paper'), false);

  const olympusExpanded = getAtlasVisibleProjects(projects, new Set(['olympus']));
  const expandedIds = new Set(olympusExpanded.map((project) => project.id));
  assert.ok(expandedIds.has('project-natalia'));
  assert.ok(expandedIds.has('miqueias-v3'));
  assert.ok(expandedIds.has('renilde'));
  assert.equal(expandedIds.has('peer-paper'), false);
});

test('atlas search reveals the matching child and its ancestors without expanding unrelated trees', () => {
  const matches = filterProjects(projects, { search: 'natália' });
  const visible = getAtlasVisibleProjects(projects, new Set(), new Set(matches.map((project) => project.id)));
  const ids = new Set(visible.map((project) => project.id));
  assert.deepEqual(ids, new Set(['olympus', 'project-natalia']));
});

test('filters combine search, domain, status and priority', () => {
  const result = filterProjects(projects, {
    search: 'peer',
    domains: new Set(['Cosmologia']),
    statuses: new Set(['active']),
    priorities: new Set([5]),
  });
  assert.ok(result.length >= 1);
  assert.ok(result.every((project) => project.domain === 'Cosmologia' && project.status === 'active' && project.priority === 5));
});

test('summary is derived from current projects rather than retired entries', () => {
  const summary = summarizeProjects(projects);
  assert.equal(summary.projects, 18);
  assert.equal(summary.artifacts, projects.reduce((sum, project) => sum + project.metrics.artifacts, 0));
  assert.equal(summary.runs, projects.reduce((sum, project) => sum + project.metrics.runs, 0));
  assert.ok(summary.repositories >= 4);
});

test('repository migrates the old AI OS id and removes retired projects from saved state', () => {
  const oldAiOs = {
    ...projects.find((project) => project.id === 'project-atlas'),
    id: 'dener-ai-os',
    name: 'Dener AI OS',
    shortName: 'AI OS',
  };
  const retiredSeed = retiredProjects
    .filter((entry) => entry.action === 'retire')
    .map((entry, index) => ({
      ...projects[0],
      id: entry.id,
      name: entry.aliases[0],
      shortName: entry.aliases[0],
      position: { x: index, z: index },
    }));
  const storage = {
    value: JSON.stringify({
      schemaVersion: 1,
      projects: [oldAiOs, ...retiredSeed, ...projects.filter((project) => project.id !== 'project-atlas')],
      dependencies: [['dener-ai-os', 'olympus', 'control'], ['dener-prime', 'dener-agent-os', 'knowledge']],
    }),
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; },
  };

  const repo = createRepository(projects, dependencies, storage, { retiredProjects });
  const ids = new Set(repo.list().map((project) => project.id));
  assert.ok(ids.has('project-atlas'));
  assert.equal(ids.has('dener-ai-os'), false);
  assert.equal(ids.has('dener-prime'), false);
  assert.equal(ids.has('ui-presets'), false);
  assert.equal(ids.has('skylife-guide'), false);
  assert.ok(repo.dependencies().some(([source, target]) => source === 'project-atlas' && target === 'olympus'));
  assert.equal(repo.dependencies().some(([source]) => source === 'dener-prime'), false);
});

test('repository supports add, update, remove and export without mutating seed', () => {
  const repo = createRepository(projects, dependencies, null, { retiredProjects });
  const before = repo.list().length;
  repo.add({
    id: 'new-project', name: 'Novo Projeto', domain: 'IA / Automação', status: 'exploratory',
    priority: 2, summary: 'Teste', claim: '', nextAction: 'Definir escopo', updatedAt: '2026-08-02',
    metrics: { artifacts: 0, repositories: 0, documents: 0, runs: 0, datasets: 0, complexity: 2 },
    sources: [], position: { x: 0, z: 0 }, tags: ['novo'], activity: [], parentId: 'project-atlas',
  });
  assert.equal(repo.list().length, before + 1);
  repo.update('new-project', { status: 'active' });
  assert.equal(repo.get('new-project').status, 'active');
  repo.remove('project-atlas');
  assert.equal(repo.get('new-project').parentId, null);
  assert.equal(projects.length, 18);
  const exported = JSON.parse(repo.exportManifest());
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.retiredProjects.length, retiredProjects.length);
  assert.equal(validateManifest(exported).ok, true);
});

test('manifest validation rejects duplicate ids, invalid status and broken parents', () => {
  const invalid = { projects: [
    { ...projects[0], id: 'dup', parentId: 'missing-parent' },
    { ...projects[1], id: 'dup', status: 'mystery' },
  ], dependencies: [] };
  const result = validateManifest(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('duplicado')));
  assert.ok(result.errors.some((error) => error.includes('status')));
  assert.ok(result.errors.some((error) => error.includes('parentId')));
});
