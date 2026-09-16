const text=value=>String(value??'').trim();

/**
 * @typedef {Object} AtlasSemanticCoreOptions
 * @property {()=>any} getState
 * @property {Record<string,Function>} actions
 * @property {()=>any} getRoute
 * @property {()=>any} [getCapabilities]
 */

function findNode(state,id){
  const target=text(id);
  if(!target)return null;
  const nodes=Array.isArray(state?.graph?.nodes)?state.graph.nodes:[];
  return nodes.find(node=>text(node?.id)===target)||null;
}

function snapshotCapabilities(raw={}){
  const towerWriteConfigured=Boolean(raw?.towerWriteConfigured??raw?.tower_write_configured);
  return {
    canonical_write:{available:towerWriteConfigured,reason:towerWriteConfigured?null:'TOWER_WRITE_NOT_CONFIGURED'},
    execution:{available:towerWriteConfigured,reason:towerWriteConfigured?null:'TOWER_WRITE_NOT_CONFIGURED'},
    destructive:{available:false,reason:'NOT_EXPOSED_BY_ATLAS_WEBMCP_V1'}
  };
}

/** @param {AtlasSemanticCoreOptions} options */
export function createAtlasSemanticCore(options){
  const {getState,actions,getRoute,getCapabilities=()=>({})}=options||{};
  if(typeof getState!=='function')throw new Error('ATLAS_STATE_READER_REQUIRED');
  if(!actions)throw new Error('ATLAS_ACTIONS_REQUIRED');
  if(typeof getRoute!=='function')throw new Error('ATLAS_ROUTE_READER_REQUIRED');

  const state=()=>getState()||{};
  const route=()=>getRoute()||{};
  const capabilities=()=>snapshotCapabilities(getCapabilities()||{});

  function get_status(){
    const current=state();
    return {
      status:current.error?'DEGRADED':'OK',
      truth_owner:'TOWER_V06',
      freshness:current.health?.dataSource?.freshness||'UNKNOWN',
      focus_id:current.focusId||null,
      selected_id:current.selectedId||null,
      webmcp_role:'INTERACTION_SURFACE_ONLY'
    };
  }

  function get_current_context(){
    const current=state();
    const currentRoute=route();
    return {
      area:currentRoute.area||null,
      path:currentRoute.path||null,
      route_context:currentRoute.context||{},
      focus_id:current.focusId||null,
      selected_id:current.selectedId||null,
      navigation_path:Array.isArray(current.path)?current.path:[]
    };
  }

  function get_selection(){
    const current=state();
    return current.selectedId?{
      selected_id:current.selectedId,
      entity:current.selectedEntity?.entity||findNode(current,current.selectedId),
      provenance:current.selectedEntity?.provenance||[]
    }:{selected_id:null,entity:null,provenance:[]};
  }

  function get_entity({entity_id}={}){
    const id=text(entity_id);
    if(!id)throw new Error('ENTITY_ID_REQUIRED');
    const current=state();
    if(text(current.selectedId)===id&&current.selectedEntity?.entity)return current.selectedEntity.entity;
    const node=findNode(current,id);
    if(!node)throw new Error('ENTITY_NOT_AVAILABLE_IN_ATLAS_CONTEXT');
    return node;
  }

  async function select_entity({entity_id}={}){
    const entity=get_entity({entity_id});
    actions.select(entity);
    return {status:'SELECTED',entity_id:entity.id};
  }

  async function focus_entity({entity_id,label}={}){
    const id=text(entity_id);
    if(!id)throw new Error('ENTITY_ID_REQUIRED');
    const known=findNode(state(),id);
    if(known&&typeof actions.open==='function'){
      await actions.open(known);
      return {status:'FOCUSED',entity_id:id};
    }
    if(typeof actions.focusSystem!=='function')throw new Error('FOCUS_CAPABILITY_UNAVAILABLE');
    await actions.focusSystem(id,text(label)||id);
    return {status:'FOCUSED',entity_id:id};
  }

  async function search({query}={}){
    const value=text(query);
    if(!value)throw new Error('QUERY_REQUIRED');
    if(typeof actions.search!=='function')throw new Error('SEARCH_CAPABILITY_UNAVAILABLE');
    await actions.search(value);
    return {status:'FILTERED',query:value};
  }

  async function sync(){
    if(typeof actions.sync!=='function')throw new Error('SYNC_CAPABILITY_UNAVAILABLE');
    const result=await actions.sync();
    return {status:'SYNC_REQUESTED',result:result??null};
  }

  return {
    get_status,get_current_context,get_selection,get_entity,select_entity,focus_entity,search,sync,
    get_capabilities:capabilities
  };
}

export const _internal={snapshotCapabilities,findNode};
