const VALID_MODES = new Set(['overview','explore','learning','audit']);

const SURFACES = Object.freeze({
 map: '.universe',
 data: '#data-section',
 learning: '#learning-section-panel',
 audit: '#audit-section'
});

const MODE_PANEL = Object.freeze({
 overview: 'map',
 explore: 'data',
 learning: 'learning',
 audit: 'audit'
});

export function normalizeMode(mode='overview') {
 return VALID_MODES.has(mode) ? mode : 'overview';
}

export function modeState(mode='overview') {
 const current = normalizeMode(mode);
 return {
  map: current === 'overview',
  data: current === 'explore',
  learning: current === 'learning',
  audit: current === 'audit'
 };
}

function prefersReducedMotion() {
 try {return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true} catch {return false}
}

export function applyWorkspaceMode(mode='overview', {root=globalThis.document, scroll=false, focus=false}={}) {
 const current = normalizeMode(mode);
 const visible = modeState(current);
 if (!root?.querySelector) return {mode:current, visible, target:null};

 if (root.body) root.body.dataset.mode = current;
 root.querySelectorAll?.('[data-mode]')?.forEach?.(button => {
  const selected = button.dataset.mode === current;
  button.classList?.toggle?.('on', selected);
  button.setAttribute?.('aria-selected', String(selected));
  button.setAttribute?.('tabindex', selected ? '0' : '-1');
 });

 for (const [key, selector] of Object.entries(SURFACES)) {
  const node = root.querySelector(selector);
  if (node) node.hidden = !visible[key];
 }

 const targetKey = MODE_PANEL[current];
 const target = root.querySelector(SURFACES[targetKey]);
 if (target) {
  target.setAttribute?.('data-workspace-active', 'true');
  for (const [key, selector] of Object.entries(SURFACES)) {
   if (key === targetKey) continue;
   root.querySelector(selector)?.removeAttribute?.('data-workspace-active');
  }
  if (focus) target.setAttribute?.('tabindex', '-1');
  if (scroll) {
   const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
   globalThis.requestAnimationFrame?.(() => target.scrollIntoView?.({behavior, block:'start'}));
  }
  if (focus) globalThis.requestAnimationFrame?.(() => target.focus?.({preventScroll:true}));
 }
 return {mode:current, visible, target};
}
