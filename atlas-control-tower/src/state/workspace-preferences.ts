export const WORKSPACE_PREFERENCES_KEY = 'nexo-atlas-workspace';

export type WorkspaceStartArea = 'graphs' | 'observatory' | 'cockpit';

export type WorkspacePreferences = {
  startArea: WorkspaceStartArea;
  showResearch: boolean;
  showOperations: boolean;
  showLearning: boolean;
};

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  startArea: 'graphs',
  showResearch: true,
  showOperations: true,
  showLearning: true
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function isStartArea(value: unknown): value is WorkspaceStartArea {
  return value === 'graphs' || value === 'observatory' || value === 'cockpit';
}

function sanitize(value: unknown): WorkspacePreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_WORKSPACE_PREFERENCES };
  const candidate = value as Partial<WorkspacePreferences>;
  return {
    startArea: isStartArea(candidate.startArea) ? candidate.startArea : DEFAULT_WORKSPACE_PREFERENCES.startArea,
    showResearch: typeof candidate.showResearch === 'boolean' ? candidate.showResearch : DEFAULT_WORKSPACE_PREFERENCES.showResearch,
    showOperations: typeof candidate.showOperations === 'boolean' ? candidate.showOperations : DEFAULT_WORKSPACE_PREFERENCES.showOperations,
    showLearning: typeof candidate.showLearning === 'boolean' ? candidate.showLearning : DEFAULT_WORKSPACE_PREFERENCES.showLearning
  };
}

export function readWorkspacePreferences(storage?: StorageLike): WorkspacePreferences {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return { ...DEFAULT_WORKSPACE_PREFERENCES };
  try {
    return sanitize(JSON.parse(target.getItem(WORKSPACE_PREFERENCES_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_WORKSPACE_PREFERENCES };
  }
}

export function writeWorkspacePreferences(storage: StorageLike, preferences: WorkspacePreferences): void {
  storage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(sanitize(preferences)));
}
