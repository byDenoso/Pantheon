/** Navigation session: what is focused, filtered and loaded.
 * Fast path owns one graph read per recorte; compatible older backends fall back
 * to one separate summary read. Keeps stale-response protection and UI events. */

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
  emit('loading', {focus: s.focus});
  try {
   const q = {...s.filters, focus: s.focus, mode: s.mode, offset: s.offset, limit: limit + s.extraLimit, depth: s.depth};
   const graph = await api.graph(q);
   const summary = graph?.summary ?? graph?.extra?.summary ?? await api.state(s.filters);
   if (seq !== loadSeq) return null;
   s.graph = graph; s.summary = summary;
   emit('graph', {graph, summary});
   return graph;
  } catch (error) {
   if (seq !== loadSeq) return null;
   emit('error', {error});
   return null;
  }
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
