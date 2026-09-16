const emptySchema={type:'object',properties:{},additionalProperties:false};
const entitySchema={type:'object',properties:{entity_id:{type:'string'}},required:['entity_id'],additionalProperties:false};
const focusSchema={type:'object',properties:{entity_id:{type:'string'},label:{type:'string'}},required:['entity_id'],additionalProperties:false};
const searchSchema={type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false};

function tool(name,description,inputSchema,annotations,execute){
  return {name,title:name,description,inputSchema,annotations,execute};
}

export function createAtlasWebMcpToolDescriptors(core){
  if(!core)throw new Error('ATLAS_SEMANTIC_CORE_REQUIRED');
  const descriptors=[
    tool('atlas.get_status','Read Atlas operational status and canonical authority.',emptySchema,{readOnlyHint:true,consequentialHint:false,untrustedContentHint:false},()=>core.get_status()),
    tool('atlas.get_current_context','Read the current Atlas route, focus and navigation context.',emptySchema,{readOnlyHint:true,consequentialHint:false,untrustedContentHint:false},()=>core.get_current_context()),
    tool('atlas.get_selection','Read the currently selected Atlas entity and provenance.',emptySchema,{readOnlyHint:true,consequentialHint:false,untrustedContentHint:true},()=>core.get_selection()),
    tool('atlas.get_entity','Read an entity already available in the current Atlas projection.',entitySchema,{readOnlyHint:true,consequentialHint:false,untrustedContentHint:true},input=>core.get_entity(input)),
    tool('atlas.get_capabilities','Read which Atlas/NEXO operations are currently available.',emptySchema,{readOnlyHint:true,consequentialHint:false,untrustedContentHint:false},()=>core.get_capabilities()),
    tool('atlas.select_entity','Select an entity in the Atlas UI without canonical mutation.',entitySchema,{readOnlyHint:false,consequentialHint:false,untrustedContentHint:false},input=>core.select_entity(input)),
    tool('atlas.focus_entity','Focus/open an entity in the Atlas UI without canonical mutation.',focusSchema,{readOnlyHint:false,consequentialHint:false,untrustedContentHint:false},input=>core.focus_entity(input)),
    tool('atlas.search','Apply an Atlas graph search/filter without canonical mutation.',searchSchema,{readOnlyHint:false,consequentialHint:false,untrustedContentHint:false},input=>core.search(input)),
    tool('atlas.sync','Request the existing Atlas synchronization/readback path.',emptySchema,{readOnlyHint:false,consequentialHint:false,untrustedContentHint:false},()=>core.sync())
  ];

  const capabilities=core.get_capabilities();
  if(capabilities?.canonical_write?.available){
    // Intentionally empty in v1 until canonical mutation methods are explicitly
    // mapped to backend semantic commands with authorization + readback.
  }
  return descriptors;
}

/**
 * @param {{documentLike?: any, core: any}} options
 */
export async function registerAtlasWebMcp(options={}){
  const {documentLike=globalThis.document,core}=options;
  const modelContext=documentLike?.modelContext;
  if(!modelContext||typeof modelContext.registerTool!=='function'){
    return {available:false,reason:'WEBMCP_UNAVAILABLE',dispose(){},signal:null,tools:[]};
  }
  const controller=new AbortController();
  const tools=createAtlasWebMcpToolDescriptors(core);
  for(const descriptor of tools){
    await modelContext.registerTool(descriptor,{signal:controller.signal});
  }
  return {
    available:true,
    reason:null,
    tools:tools.map(item=>item.name),
    signal:controller.signal,
    dispose(){controller.abort();}
  };
}
