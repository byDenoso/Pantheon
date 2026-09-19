// URL state for the NEXO ONE galaxy: ?mode=&domain=&subdomain=&entity=&panel=.
// The galaxy never leaves the page for any of this — Atlas.tsx reads this once
// on mount to reconstruct focus/panel, and calls buildGalaxySearch() to keep the
// URL in sync with camera/panel state afterward (history.replaceState, no reload).
export type GalaxyPanelId = 'needs-you' | 'learn' | 'capabilities' | 'changes';
export type GalaxyMode = 'explore' | 'operate';

const PANEL_IDS: readonly GalaxyPanelId[] = ['needs-you', 'learn', 'capabilities', 'changes'];

export interface GalaxyDeepLinkState {
  mode: GalaxyMode;
  domain: string | null;
  subdomain: string | null;
  entity: string | null;
  panel: GalaxyPanelId | null;
}

export const DEFAULT_GALAXY_DEEP_LINK: GalaxyDeepLinkState = {
  mode: 'explore', domain: null, subdomain: null, entity: null, panel: null,
};

export function parseGalaxyDeepLink(search: string): GalaxyDeepLinkState {
  const params = new URLSearchParams(search);
  const panel = params.get('panel');
  return {
    mode: params.get('mode') === 'operate' ? 'operate' : 'explore',
    domain: params.get('domain'),
    subdomain: params.get('subdomain'),
    entity: params.get('entity'),
    panel: PANEL_IDS.includes(panel as GalaxyPanelId) ? (panel as GalaxyPanelId) : null,
  };
}

export function buildGalaxySearch(state: Partial<GalaxyDeepLinkState>): string {
  const params = new URLSearchParams();
  if (state.mode && state.mode !== 'explore') params.set('mode', state.mode);
  if (state.domain) params.set('domain', state.domain);
  if (state.subdomain) params.set('subdomain', state.subdomain);
  if (state.entity) params.set('entity', state.entity);
  if (state.panel) params.set('panel', state.panel);
  const query = params.toString();
  return query ? `?${query}` : '';
}
