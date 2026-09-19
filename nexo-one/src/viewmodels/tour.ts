// Manual tour route definitions for the NEXO ONE galaxy. Routes only ever move
// the camera or open an existing HUD panel — they never fabricate content, and
// nothing here autoplays: a route only runs when the person picks it from the
// Tour menu (Atlas.tsx wires TOUR_ROUTES to galaxyRef/panel state).
import type { Domain } from '../contracts/system.ts';

export const TOUR_ROUTE_IDS = [
  'SYSTEM_OVERVIEW', 'SCIENCE', 'ENGINEERING', 'OLYMPUS', 'WHAT_NEEDS_YOU', 'LEARNING', 'WHAT_CHANGED',
] as const;
export type TourRouteId = (typeof TOUR_ROUTE_IDS)[number];

export interface TourRoute {
  id: TourRouteId;
  label: string;
  description: string;
}

export const TOUR_ROUTES: TourRoute[] = [
  { id: 'SYSTEM_OVERVIEW', label: 'System Overview', description: 'Volta ao núcleo NEXO com os três braços visíveis.' },
  { id: 'SCIENCE', label: 'Science', description: 'Voa até o braço SCIENCE.' },
  { id: 'ENGINEERING', label: 'Engineering', description: 'Voa até o braço ENGINEERING.' },
  { id: 'OLYMPUS', label: 'Olympus', description: 'Voa até o braço OLYMPUS.' },
  { id: 'WHAT_NEEDS_YOU', label: 'What needs you', description: 'Abre o painel Needs You e foca a primeira pendência.' },
  { id: 'LEARNING', label: 'Learning', description: 'Abre o painel de hipóteses/aprendizado.' },
  { id: 'WHAT_CHANGED', label: 'What changed', description: 'Abre o painel de mudanças recentes.' },
];

export const tourRouteById = (id: string): TourRoute | null =>
  TOUR_ROUTES.find(route => route.id === id) ?? null;

export type TourAction =
  | { kind: 'RESET' }
  | { kind: 'FOCUS_DOMAIN'; domain: Extract<Domain, 'SCIENCE' | 'ENGINEERING' | 'OLYMPUS'> }
  | { kind: 'OPEN_PANEL'; panel: 'needs-you' | 'learn' | 'changes'; focusEntityId: string | null };

/** Pure resolver: a route id plus minimal context (only what the route needs)
 * becomes one camera/panel action. No route can trigger a write. */
export function resolveTourAction(
  route: TourRoute,
  context: { needsYouFirstId: string | null },
): TourAction {
  switch (route.id) {
    case 'SYSTEM_OVERVIEW': return { kind: 'RESET' };
    case 'SCIENCE': return { kind: 'FOCUS_DOMAIN', domain: 'SCIENCE' };
    case 'ENGINEERING': return { kind: 'FOCUS_DOMAIN', domain: 'ENGINEERING' };
    case 'OLYMPUS': return { kind: 'FOCUS_DOMAIN', domain: 'OLYMPUS' };
    case 'WHAT_NEEDS_YOU': return { kind: 'OPEN_PANEL', panel: 'needs-you', focusEntityId: context.needsYouFirstId };
    case 'LEARNING': return { kind: 'OPEN_PANEL', panel: 'learn', focusEntityId: null };
    case 'WHAT_CHANGED': return { kind: 'OPEN_PANEL', panel: 'changes', focusEntityId: null };
  }
}
