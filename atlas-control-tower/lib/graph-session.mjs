/** Navigation session: what is focused, filtered and loaded.
 *  Graph and summary reads settle independently under one stale-response guard,
 *  so a slow or failed summary can never hold the map hostage. */

const ROOT = {id:'system:NEXO', label:'NEXO'};

export function createSession(api, {limit = 120, depth = 3, onPersist} = {}) {
 const s = {
  focus: ROOT.id, mode: 'children', ui: 'overview', filters: {}, offset: 0, extraLimit: 0, depth,
  path: [{...ROOT}], selected: null, graph: null, summary: null, compare: null, syncing: false
 };
 const listeners = new Set();
 let loadSeq = 0;
 const emit = (event, payload) => {for (const fn of listeners) fn(event, payload)};
 const persist = () => {try {onPersist?.(s.filters)} catch {}};

 async function refresh() {
  const seq = ++loadSeq;
  const filters = {...s.filters};
  const q = {...filters, focus: s.focus, mode: s.mode, offset: s.offset, limit: limit + s.extraLimit, depth: s.depth};
  emit('loading', {focus: s.focus});

  const graphRead = (async () => {
   try {
    const graph = await api.graph(q);
    if (seq !== loadSeq) return null;
    s.graph = graph;
    emit('graph', {graph, summary:s.summary});
    return graph;
   } catch (error) {
    if (seq !== loadSeq) return null;
    emit('graph-error', {error});           // previous graph is intentionally preserved
    return null;
   }
  })();

  const summaryRead = (async () => {
   try {
    const summary = await api.state(filters);
    if (seq !== loadSeq) return null;
    s.summary = summary;
    emit('summary', {summary, graph:s.graph});
    return summary;
   } catch (error) {
    if (seq !== loadSeq) return null;
    emit('summary-error', {error});         // previous summary is intentionally preserved
    return null;
   }
  })();

  const [graphResult] = await Promise.allSettled([graphRead, summaryRead]);
  if (seq !== loadSeq) return null;
  return graphResult.status === 'fulfilled' ? graphResult.value : null;
 }

 return {
  state: s,
  on(fn) {listeners.add(fn); return () => listeners.delete(fn)},
  restoreFilters(filters) {if (filters && typeof filters === 'object') s.filters = {...filters}},
  refresh,
  setDepth(value) {const d = Math.max(1, Math.min(3, Number(value) || 1)); if (d === s.depth) return null; s.depth = d; s.offset = 0; s.extraLimit = 0; return refresh()},
  setMode(mode) {s.mode = mode; s.offset = 0; s.extraLimit = 0; return refresh()},
  setUi(ui) {s.ui = ui; emit('ui', {ui})},
  setFilters(patch) {
   Object.assign(s.filters, patch);
   s.offset = 0; s.extraLimit = 0;
   s.mode = Object.values(s.filters).some(Boolean) ? 'search' : 'children';
   persist();
   return refresh();
  },
  clearFilters() {s.filters = {}; s.offset = 0; s.extraLimit = 0; s.mode = 'children'; persist(); return refresh()},
  /** A layered recorte is capped, not paged: raise the cap. Other modes page by offset. */
  more() {if (s.graph?.truncated) s.extraLimit += limit; else s.offset += limit; return refresh()},
  select(id) {s.selected = id; emit('select', {id})},
  deselect() {s.selected = null; emit('deselect', {})},
  async focusNode(node, push = true) {
   s.selected = null;
   s.focus = node.id; s.mode = 'children'; s.offset = 0; s.extraLimit = 0; s.filters = {};
   persist();
   if (push) {
    const i = s.path.findIndex(p => p.id === node.id);
    s.path = i >= 0 ? s.path.slice(0, i + 1) : [...s.path, {id: node.id, label: node.label}];
   }
   emit('focus', {node, path: s.path});
   return refresh();
  },
  home() {s.path = [{...ROOT}]; return this.focusNode(ROOT)},
  back() {if (s.path.length < 2) return null; s.path.pop(); return this.focusNode(s.path.at(-1), false)},
  async sync() {
   if (s.syncing) return null;
   s.syncing = true; emit('syncing', {on: true});
   try {
    const result = await api.sync();
    await refresh();
    return result;
   } catch {
    return null;
   } finally {
    s.syncing = false; emit('syncing', {on: false});
   }
  }
 };
}
