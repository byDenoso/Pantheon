/** WebMCP tools built on the same Graph Contract V1 the visual Atlas consumes.
 *  There is no second data path. Reads are broad; writes are limited to moving
 *  this browser view. No tool mutates scientific state. */

const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const text={type:'string'},id={type:'string',minLength:1};
const empty=schema(),optionalId=schema({id}),requiredId=schema({id},['id']);
export const TOOL_SCHEMAS=Object.freeze({
 atlas_search:schema({query:text}),atlas_get_entity:requiredId,atlas_get_test:requiredId,
 atlas_get_claim:requiredId,atlas_get_hypothesis:requiredId,
 atlas_graph_neighborhood:schema({id,depth:{type:'integer',minimum:1}},['id']),
 atlas_get_health:empty,atlas_get_automation_runs:empty,atlas_get_learning:optionalId,
 atlas_explain_learning_origin:requiredId,atlas_get_learning_relations:empty,
 atlas_get_migration_issues:empty,atlas_get_blockers:optionalId,atlas_show_lineage:requiredId,
 atlas_get_learning_lineage:requiredId,atlas_get_provenance:empty,atlas_focus_entity:requiredId,
 atlas_filter_graph:schema({query:text,domain:text,status:text}),atlas_compare:requiredId,atlas_sync:empty
});
function validateInput(name,value={}) {
 const spec=TOOL_SCHEMAS[name];
 const invalid=()=>{throw new TypeError('ATLAS_TOOL_INPUT_INVALID')};
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();
 if(spec.required.some(key=>!Object.hasOwn(value,key)))invalid();
 for(const [key,item] of Object.entries(value)) {
  const property=spec.properties[key];
  if(!property)invalid();
  if(property.type==='string'&&(typeof item!=='string'||(property.minLength&&!item.trim())))invalid();
  if(property.type==='integer'&&(!Number.isInteger(item)||item<property.minimum))invalid();
 }
 return value;
}
export function browserModelContext(documentLike=globalThis.document,navigatorLike=globalThis.navigator) {
 // Current WebMCP lives on document; retain the historical navigator fallback.
 for(const context of [documentLike?.modelContext,navigatorLike?.modelContext])
  if(typeof context?.registerTool==='function')return context;
 return undefined;
}

const prefixed = (id, prefix) => String(id || '').startsWith(prefix) ? String(id) : prefix + String(id || '');

/** View-moving tools are the only non-read ones; they change nothing on the server. */
export const VIEW_TOOLS = ['atlas_focus_entity', 'atlas_filter_graph', 'atlas_compare', 'atlas_sync'];

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
  atlas_get_learning_lineage: p => api.learningLineage(p.id),
  atlas_get_provenance: async () => {const h = await api.health(); return {...h, client: api.provenance}},
  atlas_focus_entity: async p => {const d = await api.entity(p.id); await actions.focus(d.entity); return {focus:p.id}},
  atlas_filter_graph: async p => {await session.setFilters({query:p.query || '', domain:p.domain || '', status:p.status || ''}); return session.state.graph},
  atlas_compare: async p => {const d = await api.entity(p.id); actions.compare(d.entity); return {id:p.id}},
  atlas_sync: async () => {await actions.sync(); return session.state.summary?.sources}
 };
}

export async function registerWebMcp({api,session,actions,onStatus=()=>{},signal,
 documentLike=globalThis.document,navigatorLike=globalThis.navigator}) {
 const context=browserModelContext(documentLike,navigatorLike);
 if(!context){onStatus('WebMCP n\u00e3o dispon\u00edvel neste navegador');return 0}
 const tools=buildTools({api,session,actions});
 let count=0,failed=0;
 for(const [name,execute] of Object.entries(tools)) {
  if(signal?.aborted)break;
  try {
   await context.registerTool({
    name,description:name.replaceAll('_',' '),inputSchema:TOOL_SCHEMAS[name],
    annotations:{readOnlyHint:!VIEW_TOOLS.includes(name),consequentialHint:false,untrustedContentHint:true},
    execute:async(p,execution={})=>{
     signal?.throwIfAborted();execution.signal?.throwIfAborted();
     const result=await execute(validateInput(name,p));
     signal?.throwIfAborted();execution.signal?.throwIfAborted();
     return {content:[{type:'text',text:JSON.stringify(result)}]};
    }
   },signal?{signal}:undefined);
   count++;
  } catch {
   if(signal?.aborted)break;
   failed++;
  }
 }
 if(signal?.aborted){onStatus('WebMCP encerrado');return 0}
 onStatus(`WebMCP \u00b7 ${count} ferramentas${failed?` \u00b7 ${failed} indispon\u00edveis`:''}`);
 return count;
}
