/** WebMCP tools built on the same Graph Contract V1 the visual Atlas consumes.
 *  There is no second data path. Reads are broad; writes are limited to moving
 *  this browser view. No tool mutates scientific state. */

const SCHEMA = {type:'object', properties:{
 id:{type:'string'}, query:{type:'string'}, domain:{type:'string'},
 status:{type:'string'}, depth:{type:'number'}
}};

const prefixed = (id, prefix) => String(id || '').startsWith(prefix) ? String(id) : prefix + String(id || '');

/** View-moving tools are the only non-read ones; they change nothing on the server. */
export const VIEW_TOOLS = ['atlas_focus_entity', 'atlas_show_lineage', 'atlas_filter_graph', 'atlas_compare', 'atlas_sync'];

export function buildTools({api, session, actions}) {
 return {
  atlas_search: p => api.graph({mode:'search', query:p.query || ''}),
  atlas_get_entity: p => api.entity(p.id),
  atlas_get_test: p => api.entity(prefixed(p.id, 'test:')),
  atlas_get_claim: p => api.entity(prefixed(p.id, 'claim:')),
  atlas_get_hypothesis: p => api.entity(prefixed(p.id, 'claim:')),
  atlas_graph_neighborhood: p => api.graph({focus:p.id, mode:'neighbors', depth:p.depth || 1}),
  atlas_get_health: () => api.state({}),
  atlas_get_automation_runs: () => api.automationRuns(),
  atlas_get_learning: p => p.id ? api.learningFor(p.id) : api.learning(),
  atlas_explain_learning_origin: async p => {
   const {relations} = await api.learningFor(p.id);
   return {
    entity: p.id,
    // Origin is the source's own evidence reference, not an inference by this tool.
    relations: relations.map(r => ({relationType:r.relationType, status:r.status, scope:r.scope, confidence:r.confidence, evidenceRefs:r.evidenceRefs, support:r.support, contradiction:r.contradiction}))
   };
  },
  atlas_get_learning_relations: () => api.learningRelations(),
  atlas_get_migration_issues: () => api.audit(),
  atlas_get_blockers: p => api.graph({focus:p.id || session.state.focus, mode:'critical'}),
  atlas_show_lineage: async p => api.lineage(p.id),
  atlas_focus_entity: async p => {const d = await api.entity(p.id); await actions.focus(d.entity); return {focus:p.id}},
  atlas_filter_graph: async p => {await session.setFilters({query:p.query || '', domain:p.domain || '', status:p.status || ''}); return session.state.graph},
  atlas_compare: async p => {const d = await api.entity(p.id); actions.compare(d.entity); return {id:p.id}},
  atlas_sync: async () => {await actions.sync(); return session.state.summary?.sources}
 };
}

export async function registerWebMcp({api, session, actions, onStatus}) {
 const context = navigator.modelContext || document.modelContext;
 if (!context?.registerTool) {onStatus('WebMCP não disponível neste navegador'); return 0}
 const tools = buildTools({api, session, actions});
 let count = 0;
 for (const [name, execute] of Object.entries(tools)) {
  try {
   await context.registerTool({
    name,
    description: name.replaceAll('_', ' '),
    inputSchema: SCHEMA,
    annotations: {readOnlyHint: !VIEW_TOOLS.includes(name)},
    execute: async p => ({content:[{type:'text', text:JSON.stringify(await execute(p || {}))}]})
   });
   count++;
  } catch {/* one unsupported tool must not drop the rest */}
 }
 onStatus(`WebMCP · ${count} ferramentas`);
 return count;
}
