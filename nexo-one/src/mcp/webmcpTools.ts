// Optional read-only WebMCP surface over the compiled GalaxySnapshot.
//
// The site never depends on this. No standard browser WebMCP host exists yet
// (there is no `navigator.modelContext` in any shipping browser as of this
// writing), so `registerGalaxyWebMcpTools` only ever registers anything when a
// host object is actually present on `window`; otherwise it is a documented
// no-op. This keeps the architecture ready for Stage 4+ without adding a
// runtime dependency the public galaxy needs to function.
//
// Every tool is a pure read over the already-compiled GalaxySnapshot or a
// call into the existing camera/tour context (focusEntity/focusDomain/
// startTour) — none of them can write, and none of them bypass NEXO ONE's
// read-only posture.
import type { GalaxySnapshot } from '../contracts/galaxy.ts';

export type GalaxyToolName =
  | 'get_current_system_state' | 'get_needs_you' | 'get_hypotheses' | 'get_capabilities'
  | 'get_changes' | 'find_entity' | 'focus_entity' | 'focus_domain' | 'start_guided_tour';

export interface GalaxyToolContext {
  getSnapshot: () => GalaxySnapshot;
  focusEntity: (id: string) => boolean;
  focusDomain: (id: string) => boolean;
  startTour: (routeId: string) => boolean;
}

export function buildGalaxyReadOnlyTools(context: GalaxyToolContext) {
  return {
    get_current_system_state: () => context.getSnapshot(),
    get_needs_you: () => context.getSnapshot().needs_you,
    get_hypotheses: () => context.getSnapshot().entities.filter(entity => entity.kind === 'HYPOTHESIS'),
    get_capabilities: () => context.getSnapshot().entities.filter(entity => entity.kind === 'CAPABILITY'),
    get_changes: () => context.getSnapshot().changes,
    find_entity: (query: string) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];
      return context.getSnapshot().entities.filter(entity =>
        entity.id.toLowerCase().includes(needle) || entity.title.toLowerCase().includes(needle));
    },
    focus_entity: (id: string) => context.focusEntity(id),
    focus_domain: (id: string) => context.focusDomain(id),
    start_guided_tour: (routeId: string) => context.startTour(routeId),
  } satisfies Record<GalaxyToolName, (...args: never[]) => unknown>;
}

type WebMcpHost = { registerTool?: (name: string, handler: (...args: unknown[]) => unknown) => void };

/** Registers the tool surface only if `window.modelContext` (or an equivalent
 * WebMCP host) already exists. Returns false — a documented, harmless no-op —
 * whenever no such host is present, which is every browser today. */
export function registerGalaxyWebMcpTools(context: GalaxyToolContext): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window as unknown as { modelContext?: WebMcpHost }).modelContext;
  if (!host?.registerTool) return false;
  for (const [name, handler] of Object.entries(buildGalaxyReadOnlyTools(context))) {
    host.registerTool(name, handler as (...args: unknown[]) => unknown);
  }
  return true;
}
