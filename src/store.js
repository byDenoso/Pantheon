const VALID_STATUSES = new Set(['active', 'attention', 'blocked', 'exploratory', 'archived']);

export function filterProjects(projects, filters = {}) {
  const search = (filters.search || '').trim().toLocaleLowerCase('pt-BR');
  const domains = filters.domains instanceof Set ? filters.domains : new Set(filters.domains || []);
  const statuses = filters.statuses instanceof Set ? filters.statuses : new Set(filters.statuses || []);
  const priorities = filters.priorities instanceof Set ? filters.priorities : new Set(filters.priorities || []);
  return projects.filter((project) => {
    const haystack = [project.name, project.shortName, project.domain, project.summary, project.claim, project.nextAction, ...(project.tags || [])]
      .join(' ').toLocaleLowerCase('pt-BR');
    return (!search || haystack.includes(search))
      && (!domains.size || domains.has(project.domain))
      && (!statuses.size || statuses.has(project.status))
      && (!priorities.size || priorities.has(project.priority));
  });
}

export function summarizeProjects(projects) {
  return projects.reduce((summary, project) => {
    summary.projects += 1;
    summary.artifacts += Number(project.metrics?.artifacts || 0);
    summary.repositories += Number(project.metrics?.repositories || 0);
    summary.documents += Number(project.metrics?.documents || 0);
    summary.runs += Number(project.metrics?.runs || 0);
    summary.datasets += Number(project.metrics?.datasets || 0);
    summary.status[project.status] = (summary.status[project.status] || 0) + 1;
    return summary;
  }, { projects: 0, artifacts: 0, repositories: 0, documents: 0, runs: 0, datasets: 0, status: {} });
}

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || !Array.isArray(manifest.projects)) return { ok: false, errors: ['Manifesto sem projects[].'] };
  const ids = new Set();
  for (const [index, project] of manifest.projects.entries()) {
    const prefix = `Projeto ${index + 1}`;
    if (!project?.id || !project?.name) errors.push(`${prefix}: id e name são obrigatórios.`);
    if (ids.has(project?.id)) errors.push(`${prefix}: id duplicado "${project.id}".`);
    ids.add(project?.id);
    if (!VALID_STATUSES.has(project?.status)) errors.push(`${prefix}: status inválido "${project?.status}".`);
    if (!Number.isInteger(project?.priority) || project.priority < 1 || project.priority > 5) errors.push(`${prefix}: prioridade deve estar entre 1 e 5.`);
  }
  if (manifest.dependencies && !Array.isArray(manifest.dependencies)) errors.push('dependencies deve ser uma lista.');
  return { ok: errors.length === 0, errors };
}

export function createRepository(seedProjects, seedDependencies, storage = null) {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  let projectState = clone(seedProjects);
  let dependencyState = clone(seedDependencies);

  if (storage) {
    try {
      const saved = storage.getItem('dener-project-atlas-manifest');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (validateManifest(parsed).ok) {
          projectState = parsed.projects;
          dependencyState = parsed.dependencies || [];
        }
      }
    } catch { /* ignore corrupt local cache and retain seed */ }
  }

  const persist = () => {
    if (!storage) return;
    storage.setItem('dener-project-atlas-manifest', JSON.stringify({ projects: projectState, dependencies: dependencyState }));
  };
  const uniqueId = (base) => {
    let id = base; let suffix = 2;
    while (projectState.some((project) => project.id === id)) id = `${base}-${suffix++}`;
    return id;
  };

  return {
    list: () => clone(projectState),
    dependencies: () => clone(dependencyState),
    get: (id) => clone(projectState.find((project) => project.id === id) || null),
    add(project) {
      const candidate = clone(project);
      candidate.id = uniqueId(candidate.id || candidate.name.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projeto');
      const check = validateManifest({ projects: [...projectState, candidate], dependencies: dependencyState });
      if (!check.ok) throw new Error(check.errors.join('\n'));
      projectState.push(candidate); persist(); return clone(candidate);
    },
    update(id, patch) {
      const index = projectState.findIndex((project) => project.id === id);
      if (index < 0) throw new Error(`Projeto não encontrado: ${id}`);
      const updated = { ...projectState[index], ...clone(patch), id };
      const next = [...projectState]; next[index] = updated;
      const check = validateManifest({ projects: next, dependencies: dependencyState });
      if (!check.ok) throw new Error(check.errors.join('\n'));
      projectState = next; persist(); return clone(updated);
    },
    remove(id) {
      projectState = projectState.filter((project) => project.id !== id);
      dependencyState = dependencyState.filter(([source, target]) => source !== id && target !== id);
      persist();
    },
    replace(manifest) {
      const check = validateManifest(manifest);
      if (!check.ok) throw new Error(check.errors.join('\n'));
      projectState = clone(manifest.projects);
      dependencyState = clone(manifest.dependencies || []);
      persist();
    },
    reset() { projectState = clone(seedProjects); dependencyState = clone(seedDependencies); persist(); },
    exportManifest: () => JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), projects: projectState, dependencies: dependencyState }, null, 2),
  };
}
