import test from 'node:test';
import assert from 'node:assert/strict';
import { projects, dependencies } from '../src/data.js';
import { createRepository, filterProjects, summarizeProjects, validateManifest } from '../src/store.js';

test('canonical seed contains 21 unique projects with source metadata', () => {
  assert.equal(projects.length, 21);
  assert.equal(new Set(projects.map((project) => project.id)).size, 21);
  for (const project of projects) {
    assert.ok(project.name);
    assert.ok(project.domain);
    assert.ok(project.status);
    assert.ok(project.updatedAt);
    assert.ok(Array.isArray(project.sources));
  }
});

test('filters combine search, domain, status and priority', () => {
  const result = filterProjects(projects, {
    search: 'peer', domains: new Set(['Cosmologia']), statuses: new Set(['active']), priorities: new Set([5]),
  });
  assert.ok(result.length >= 1);
  assert.ok(result.every((project) => project.domain === 'Cosmologia' && project.status === 'active' && project.priority === 5));
});

test('summary is derived from projects rather than hard-coded UI values', () => {
  const summary = summarizeProjects(projects);
  assert.equal(summary.projects, 21);
  assert.equal(summary.artifacts, projects.reduce((sum, project) => sum + project.metrics.artifacts, 0));
  assert.equal(summary.runs, projects.reduce((sum, project) => sum + project.metrics.runs, 0));
  assert.ok(summary.repositories >= 4);
});

test('repository supports add, update, remove and export without mutating seed', () => {
  const repo = createRepository(projects, dependencies);
  const before = repo.list().length;
  repo.add({ id: 'new-project', name: 'Novo Projeto', domain: 'IA / Automação', status: 'exploratory', priority: 2, summary: 'Teste', claim: '', nextAction: 'Definir escopo', updatedAt: '2026-08-02', metrics: { artifacts: 0, repositories: 0, documents: 0, runs: 0, datasets: 0, complexity: 2 }, sources: [], position: { x: 0, z: 0 }, tags: ['novo'], activity: [] });
  assert.equal(repo.list().length, before + 1);
  repo.update('new-project', { status: 'active' });
  assert.equal(repo.get('new-project').status, 'active');
  repo.remove('new-project');
  assert.equal(repo.list().length, before);
  assert.equal(projects.length, 21);
  assert.equal(validateManifest(JSON.parse(repo.exportManifest())).ok, true);
});

test('manifest validation rejects duplicate ids and invalid status', () => {
  const invalid = { projects: [{ ...projects[0], id: 'dup' }, { ...projects[1], id: 'dup', status: 'mystery' }], dependencies: [] };
  const result = validateManifest(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('duplicado')));
  assert.ok(result.errors.some((error) => error.includes('status')));
});
