const VALID_STATUSES = new Set(['active', 'attention', 'blocked', 'exploratory', 'archived']);
const DEFAULT_RETIRED_PROJECTS = [
  { id: 'dener-ai-os', aliases: ['AI OS', 'Dener AI OS'], action: 'rename', replacementId: 'project-atlas' },
  { id: 'dener-prime', aliases: ['Dener PRIME', 'Dener Prime'], action: 'retire' },
  { id: 'ui-presets', aliases: ['PRESETS', 'Presets UI/UX'], action: 'retire' },
  { id: 'skylife-guide', aliases: ['SKYLIFE', 'Skylife 114 mm'], action: 'retire' },
];
const clone = (value) => JSON.parse(JSON.stringify(value));

const asSet = (value) => value instanceof Set ? value : new Set(value || []);

export function filterProjects(projects, filters = {}) {
  const search = (filters.search || '').trim().toLocaleLowerCase('pt-BR');
  const domains = asSet(filters.domains);
  const statuses = asSet(filters.statuses);
  const priorities = asSet(filters.priorities);
  return projects.filter((project) => {
    const haystack = [project.name, project.shortName, project.domain, project.summary, project.claim, project.nextAction, ...(project.tags || [])]
      .join(' ').toLocaleLowerCase('pt-BR');
    return (!search || haystack.includes(search))
      && (!domains.size || domains.has(project.domain))
      && (!statuses.size || statuses.has(project.status))
      && (!priorities.size || priorities.has(project.priority));
  });
}

export function getAtlasVisibleProjects(projects, expandedIds = new Set(), revealIds = null) {
  const expanded = asSet(expandedIds);
  const reveal = revealIds ? asSet(revealIds) : null;
  const byId = new Map(projects.map((project) => [project.id, project]));
  const visibleIds = new Set();

  const addWithAncestors = (id) => {
    const seen = new Set();
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      visibleIds.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
  };

  if (reveal?.size) {
    for (const id of reveal) addWithAncestors(id);
  } else {
    for (const project of projects) {
      let current = project;
      let visible = true;
      const seen = new Set([project.id]);
      while (current.parentId) {
        if (!expanded.has(current.parentId)) {
          visible = false;
          break;
        }
        current = byId.get(current.parentId);
        if (!current || seen.has(current.id)) break;
        seen.add(current.id);
      }
      if (visible) visibleIds.add(project.id);
    }
  }

  return projects.filter((project) => visibleIds.has(project.id));
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

  for (const [index, project] of manifest.projects.entries()) {
    const prefix = `Projeto ${index + 1}`;
    if (project?.parentId && !ids.has(project.parentId)) errors.push(`${prefix}: parentId inexistente "${project.parentId}".`);
    if (project?.parentId && project.parentId === project.id) errors.push(`${prefix}: parentId não pode apontar para o próprio projeto.`);
  }

  const byId = new Map(manifest.projects.map((project) => [project.id, project]));
  for (const project of manifest.projects) {
    const seen = new Set([project.id]);
    let current = project;
    while (current?.parentId) {
      if (seen.has(current.parentId)) {
        errors.push(`Projeto "${project.id}": ciclo de parentId detectado.`);
        break;
      }
      seen.add(current.parentId);
      current = byId.get(current.parentId);
    }
  }

  if (manifest.dependencies && !Array.isArray(manifest.dependencies)) {
    errors.push('dependencies deve ser uma lista.');
  } else {
    for (const [index, dependency] of (manifest.dependencies || []).entries()) {
      if (!Array.isArray(dependency) || dependency.length < 2) {
        errors.push(`Dependência ${index + 1}: formato inválido.`);
        continue;
      }
      const [source, target] = dependency;
      if (!ids.has(source) || !ids.has(target)) errors.push(`Dependência ${index + 1}: referência inexistente.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function migrateManifest(manifest, seedProjects, retiredProjects) {
  const seedById = new Map(seedProjects.map((project) => [project.id, project]));
  const retiredById = new Map(retiredProjects.map((entry) => [entry.id, entry]));
  const renameId = (id) => retiredById.get(id)?.action === 'rename' ? retiredById.get(id).replacementId : id;
  const isRetired = (id) => retiredById.get(id)?.action === 'retire';
  const migrated = new Map();

  for (const original of manifest.projects || []) {
    if (isRetired(original.id)) continue;
    const entry = retiredById.get(original.id);
    if (entry?.action === 'rename') {
      const canonical = seedById.get(entry.replacementId);
      if (canonical) migrated.set(canonical.id, clone(canonical));
      continue;
    }

    const canonical = seedById.get(original.id);
    const project = clone(original);
    if (canonical && Object.hasOwn(canonical, 'parentId')) project.parentId = canonical.parentId;
    if (project.parentId) project.parentId = renameId(project.parentId);
    if (isRetired(project.parentId)) project.parentId = null;
    migrated.set(project.id, project);
  }

  for (const entry of retiredProjects) {
    if (entry.action !== 'rename' || migrated.has(entry.replacementId)) continue;
    const canonical = seedById.get(entry.replacementId);
    if (canonical) migrated.set(canonical.id, clone(canonical));
  }

  const validIds = new Set(migrated.keys());
  const dependencyKeys = new Set();
  const dependencies = [];
  for (const dependency of manifest.dependencies || []) {
    if (!Array.isArray(dependency) || dependency.length < 2) continue;
    let [source, target, type = 'related'] = dependency;
    if (isRetired(source) || isRetired(target)) continue;
    source = renameId(source);
    target = renameId(target);
    if (!validIds.has(source) || !validIds.has(target)) continue;
    const key = `${source}\u0000${target}\u0000${type}`;
    if (dependencyKeys.has(key)) continue;
    dependencyKeys.add(key);
    dependencies.push([source, target, type]);
  }

  return { schemaVersion: 2, projects: [...migrated.values()], dependencies, retiredProjects: clone(retiredProjects) };
}

export function createRepository(seedProjects, seedDependencies, storage = null, options = {}) {
  const retiredProjects = clone(options.retiredProjects || DEFAULT_RETIRED_PROJECTS);
  let projectState = clone(seedProjects);
  let dependencyState = clone(seedDependencies);
  let migratedSavedState = false;

  if (storage) {
    try {
      const saved = storage.getItem('dener-project-atlas-manifest');
      if (saved) {
        const parsed = migrateManifest(JSON.parse(saved), seedProjects, retiredProjects);
        if (validateManifest(parsed).ok) {
          projectState = parsed.projects;
          dependencyState = parsed.dependencies || [];
          migratedSavedState = true;
        }
      }
    } catch { /* ignore corrupt local cache and retain seed */ }
  }

  const persist = () => {
    if (!storage) return;
    storage.setItem('dener-project-atlas-manifest', JSON.stringify({
      schemaVersion: 2,
      projects: projectState,
      dependencies: dependencyState,
      retiredProjects,
    }));
  };
  if (migratedSavedState) persist();

  const uniqueId = (base) => {
    let id = base; let suffix = 2;
    while (projectState.some((project) => project.id === id)) id = `${base}-${suffix++}`;
    return id;
  };

  return {
    list: () => clone(projectState),
    dependencies: () => clone(dependencyState),
    retiredProjects: () => clone(retiredProjects),
    get: (id) => clone(projectState.find((project) => project.id === id) || null),
    add(project) {
      const candidate = clone(project);
      candidate.parentId = candidate.parentId || null;
      candidate.id = uniqueId(candidate.id || candidate.name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projeto');
      const check = validateManifest({ projects: [...projectState, candidate], dependencies: dependencyState });
      if (!check.ok) throw new Error(check.errors.join('\n'));
      projectState.push(candidate); persist(); return clone(candidate);
    },
    update(id, patch) {
      const index = projectState.findIndex((project) => project.id === id);
      if (index < 0) throw new Error(`Projeto não encontrado: ${id}`);
      const updated = { ...projectState[index], ...clone(patch), id };
      updated.parentId = updated.parentId || null;
      const next = [...projectState]; next[index] = updated;
      const check = validateManifest({ projects: next, dependencies: dependencyState });
      if (!check.ok) throw new Error(check.errors.join('\n'));
      projectState = next; persist(); return clone(updated);
    },
    remove(id) {
      projectState = projectState
        .filter((project) => project.id !== id)
        .map((project) => project.parentId === id ? { ...project, parentId: null } : project);
      dependencyState = dependencyState.filter(([source, target]) => source !== id && target !== id);
      persist();
    },
    replace(manifest) {
      const migrated = migrateManifest(manifest, seedProjects, retiredProjects);
      const check = validateManifest(migrated);
      if (!check.ok) throw new Error(check.errors.join('\n'));
      projectState = clone(migrated.projects);
      dependencyState = clone(migrated.dependencies || []);
      persist();
    },
    reset() { projectState = clone(seedProjects); dependencyState = clone(seedDependencies); persist(); },
    exportManifest: () => JSON.stringify({
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      projects: projectState,
      dependencies: dependencyState,
      retiredProjects,
    }, null, 2),
  };
}
