/** The workspace is the map.
 *  Dados, Learning and Auditoria used to be sibling tab panels; the relations
 *  they described are now read on the map itself, so there is a single surface
 *  and a single mode. The module is kept so callers and tests keep a stable
 *  contract, and so an unknown mode can never hide the map. */

const VALID_MODES = new Set(['overview']);

const SURFACES = Object.freeze({map: '.universe'});

export function normalizeMode() {
 return 'overview';
}

export function modeState() {
 return {map: true};
}

export function isValidMode(mode) {
 return VALID_MODES.has(mode);
}

export function applyWorkspaceMode(mode = 'overview', {root = globalThis.document} = {}) {
 const current = normalizeMode(mode);
 const visible = modeState(current);
 if (!root?.querySelector) return {mode: current, visible, target: null};

 if (root.body) root.body.dataset.mode = current;

 const target = root.querySelector(SURFACES.map);
 if (target) {
  target.hidden = false;
  target.setAttribute?.('data-workspace-active', 'true');
 }
 return {mode: current, visible, target};
}
