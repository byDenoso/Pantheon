import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const sourceRoot=resolve('data/mcp-source');
const outDir=resolve('dist/mcp');

const readText=path=>readFile(resolve(sourceRoot,path),'utf8');
const readJson=async path=>JSON.parse(await readText(path));

function unique(values){return [...new Set(values.filter(Boolean))].sort();}
function idSafe(value){return String(value).replace(/[^a-zA-Z0-9_.:-]+/g,'-');}
function familyOf(id){
  const value=String(id||'');
  const first=value.split(/[._]/)[0]||'other';
  if(/^gz/i.test(first))return 'gz';
  return first.toLowerCase();
}
function extractTools(source){
  const found=[];
  const regex=/["'](nexo(?:_[a-zA-Z0-9_]+|\.[a-zA-Z0-9_.]+))["']/g;
  for(const match of source.matchAll(regex))found.push(match[1]);
  return unique(found);
}
function compactCapability(id,value){
  return {
    id,
    backend:String(value?.backend||'unknown'),
    status:String(value?.status||'UNKNOWN'),
    scope:String(value?.scope||''),
    roles:Array.isArray(value?.roles)?value.roles.map(String):[],
    task_id:value?.task_id?String(value.task_id):null,
    battery_id:value?.battery_id?String(value.battery_id):null,
    gate_id:value?.gate_id?String(value.gate_id):null,
    control_repository:value?.control_repository?String(value.control_repository):null,
    executable:value?.executable===true||typeof value?.executable==='string',
  };
}

const manifest=await readJson('capabilities.json');
const mcpServer=await readText('mcp_server.py');
const remoteMcp=await readText('remote_mcp.py');
const source=await readJson('source.json');
const projectionManifest=await readJson('projection-manifest.json');

const capabilities=Object.entries(manifest.capabilities||{}).map(([id,value])=>compactCapability(id,value));
const internalTools=extractTools(mcpServer);
const remoteTools=extractTools(remoteMcp);
const tools=unique([...internalTools,...remoteTools]);
const remoteSet=new Set(remoteTools);
const backends=unique(capabilities.map(item=>item.backend));
const roles=unique(capabilities.flatMap(item=>item.roles));
const families=unique(capabilities.map(item=>familyOf(item.id)));
const statuses=unique(capabilities.map(item=>item.status));

const nodes=[];
const links=[];
const addNode=node=>nodes.push(node);
const addLink=(sourceId,targetId,kind,weight=1)=>links.push({
  id:`edge:${idSafe(sourceId)}:${idSafe(targetId)}:${kind}`,
  source:sourceId,target:targetId,kind,weight
});

addNode({id:'mcp:nexo',label:'NEXO MCP',kind:'ROOT',group:'MCP',status:'LIVE',summary:'Semantic MCP surface backed by TOWER_V06.'});
for(const [id,label] of [
  ['layer:tools','MCP tools'],
  ['layer:capabilities','Capabilities'],
  ['layer:backends','Runtime backends'],
  ['layer:roles','Agent roles'],
]){
  addNode({id,label,kind:'LAYER',group:'ARCHITECTURE',status:'LIVE'});
  addLink('mcp:nexo',id,'OWNS',1);
}
for(const transport of [
  {id:'transport:remote',label:'Remote MCP',status:'REMOTE',summary:'Semantic/intent-level callable surface.'},
  {id:'transport:internal',label:'Internal MCP',status:'TRUSTED',summary:'Trusted transport including internal mutation tools.'},
]){
  addNode({...transport,kind:'TRANSPORT',group:'MCP'});
  addLink('mcp:nexo',transport.id,'EXPOSES',1);
}

for(const name of tools){
  const remote=remoteSet.has(name);
  const id=`tool:${name}`;
  addNode({
    id,label:name,kind:'TOOL',group:'TOOLS',status:remote?'REMOTE':'INTERNAL',
    summary:remote?'Available on the remote semantic MCP surface.':'Available on the trusted/internal MCP surface.',
    meta:{remote,namespace:name.includes('.')?name.split('.')[0]:'nexo'}
  });
  addLink('layer:tools',id,'CONTAINS',0.74);
  addLink(remote?'transport:remote':'transport:internal',id,'EXPOSES',0.92);
}

for(const family of families){
  const id=`family:${family}`;
  addNode({id,label:family.toUpperCase(),kind:'FAMILY',group:'CAPABILITIES',status:'GROUP'});
  addLink('layer:capabilities',id,'GROUPS',0.7);
}
for(const backend of backends){
  const id=`backend:${backend}`;
  addNode({id,label:backend,kind:'BACKEND',group:'RUNTIME',status:'RUNTIME'});
  addLink('layer:backends',id,'CONTAINS',0.72);
}
for(const role of roles){
  const id=`role:${role}`;
  addNode({id,label:role,kind:'ROLE',group:'GOVERNANCE',status:'ROLE'});
  addLink('layer:roles',id,'CONTAINS',0.72);
}

for(const capability of capabilities){
  const id=`cap:${capability.id}`;
  addNode({
    id,
    label:capability.id,
    kind:'CAPABILITY',
    group:'CAPABILITIES',
    status:capability.status,
    summary:[capability.scope,capability.backend].filter(Boolean).join(' · '),
    meta:capability,
  });
  addLink(`family:${familyOf(capability.id)}`,id,'CONTAINS',0.78);
  addLink(id,`backend:${capability.backend}`,'RUNS_ON',0.64);
  for(const role of capability.roles)addLink(id,`role:${role}`,'AVAILABLE_TO',0.42);
}

const statusCounts=Object.fromEntries(statuses.map(status=>[
  status,capabilities.filter(item=>item.status===status).length
]));
const backendCounts=Object.fromEntries(backends.map(backend=>[
  backend,capabilities.filter(item=>item.backend===backend).length
]));

const topology={
  contract:'NEXO_MCP_TOPOLOGY_V1',
  generated_at:new Date().toISOString(),
  source:{
    authority:'TOWER_V06',
    repository:'byDenoso/NEXO-Obsidian-Vault',
    commit:String(source.tower_commit||''),
    manifest:'TOWER_V06/manifests/capabilities.json',
    mcp_server:'services/nexo-api/app/mcp_server.py',
    remote_mcp:'services/nexo-api/app/remote_mcp.py',
    source_storage:String(projectionManifest.source_storage||''),
    source_snapshot_id:String(projectionManifest.source_snapshot_id||''),
    source_state_fingerprint:String(projectionManifest.source_state_fingerprint||''),
    source_promoted_at:String(projectionManifest.source_promoted_at||''),
    projection_fingerprint:String(projectionManifest.projection_fingerprint||''),
  },
  stats:{
    tools:tools.length,
    remote_tools:remoteTools.length,
    internal_tools:tools.length-remoteTools.length,
    capabilities:capabilities.length,
    backends:backends.length,
    roles:roles.length,
    families:families.length,
    status_counts:statusCounts,
    backend_counts:backendCounts,
  },
  nodes,
  links,
};

await mkdir(outDir,{recursive:true});
await writeFile(resolve(outDir,'topology.json'),JSON.stringify(topology,null,2)+'\n','utf8');
console.log(JSON.stringify({contract:topology.contract,nodes:nodes.length,links:links.length,stats:topology.stats}));
