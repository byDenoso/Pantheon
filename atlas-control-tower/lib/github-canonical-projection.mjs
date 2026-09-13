const arr=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const unique=values=>[...new Set(values.filter(Boolean))];

function base(state){
 const {authority,payload,fingerprint}=state;
 return {source:'github',freshness:'LIVE',sourceVersion:authority.ref||'main',fingerprint,authority:'GITHUB',projectionAuthority:payload?.meta?.authority||'PROJECTION',projectionOnly:true,sourceRef:`https://github.com/${authority.repository}/blob/${authority.ref}/${authority.projection.transportPath}`};
}
const graph=(state,focus,nodes,edges,extra={})=>({...base(state),focus,nodes,edges,total:nodes.length,hasMore:false,truncated:false,depth:1,cache:'LIVE',issues:[],...extra});
const systemNode=(id,label,summary)=>({id:`system:${id}`,type:'SYSTEM',label,status:'ACTIVE',summary,metadata:{authority:'GITHUB'}});

function rootGraph(state){
 const root={id:'system:NEXO',type:'SYSTEM',label:'NEXO',status:'ACTIVE',summary:'Estado canônico versionado no GitHub.'};
 const children=[
  systemNode('SCIENCE','Ciência','Campanhas e evidências publicadas pelo control plane.'),
  systemNode('ENGINEERING','Engenharia','Programas, código e runtime publicados pelo control plane.'),
  systemNode('OLYMPUS','Olympus','Estrutura Olympus autorizada pelo control plane; dados privados permanecem fora do GitHub.'),
  systemNode('OPERATIONS','Operação','Ações e estado operacional publicados pela projeção autorizada pelo GitHub.')
 ];
 return graph(state,root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})));
}

function scienceGraph(state){
 const rows=arr(state.payload.science),domains=unique(rows.map(row=>text(row.domain))).sort();
 const nodes=[systemNode('SCIENCE','Ciência','Hierarquia científica canônica')];
 for(const id of domains){const group=rows.filter(row=>text(row.domain)===id),primary=group[0]||{};nodes.push({id:`domain:${id}`,domain:id,type:'DOMAIN',label:primary.title||id,status:primary.status||'',summary:primary.summary||'',metadata:{campaignCount:group.length,sourceRef:primary.sourceRef||null}})}
 return graph(state,'system:SCIENCE',nodes,nodes.slice(1).map(node=>({id:`contains:science:${node.id}`,source:'system:SCIENCE',target:node.id,type:'CONTAINS',declared:true})));
}

function hierarchyGraph(state,system,rows,rootId){
 const systemId=`system:${system}`,programs=arr(rows).filter(row=>upper(row.type)==='PROGRAM'&&text(row.parentId)===rootId),nodes=[systemNode(system,system==='ENGINEERING'?'Engenharia':'Olympus',`Hierarquia ${system} canônica`)];
 for(const row of programs)nodes.push({id:`domain:${row.id}`,domain:row.id,type:'DOMAIN',label:row.title||row.id,status:row.status||'',summary:row.summary||'',metadata:{sourceRef:row.sourceRef||null}});
 return graph(state,systemId,nodes,nodes.slice(1).map(node=>({id:`contains:${systemId}:${node.id}`,source:systemId,target:node.id,type:'CONTAINS',declared:true})));
}

function operationsGraph(state){
 const actions=arr(state.payload.actions),root=systemNode('OPERATIONS','Operação','Ações publicadas pela projeção autorizada pelo GitHub.');
 const children=actions.slice(0,96).map(row=>({id:row.id,type:'WORK',label:row.title||row.id,status:row.status||'',summary:row.summary||'',updatedAt:row.updatedAt||'',metadata:{authority:'GITHUB'}}));
 return graph(state,root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
}

function detailGraph(state,raw){
 const id=text(raw).replace(/^domain:/,''),p=state.payload;
 if(/^D\d+$|^M\d+$/i.test(id)){
  const rows=arr(p.science).filter(row=>text(row.domain)===id),focus=`domain:${id}`,root={id:focus,type:'DOMAIN',domain:id,label:id,status:'ACTIVE'},nodes=[root,...rows.map(row=>({id:row.id,type:'CAMPAIGN',label:row.title||row.id,status:row.status||'',summary:row.summary||'',domain:id,metadata:{sourceRef:row.sourceRef||null}}))];
  return graph(state,focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
 }
 for(const rows of [p.engineering,p.olympus]){
  const parent=arr(rows).find(row=>row.id===id);if(!parent)continue;
  const focus=`domain:${id}`,children=arr(rows).filter(row=>text(row.parentId)===id),root={id:focus,type:upper(parent.type),label:parent.title||id,status:parent.status||'',summary:parent.summary||''},nodes=[root,...children.map(row=>({id:row.id,type:upper(row.type)||'ENTITY',label:row.title||row.id,status:row.status||'',summary:row.summary||'',metadata:{sourceRef:row.sourceRef||null}}))];
  return graph(state,focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
 }
 return graph(state,`domain:${id}`,[],[],{depth:2,issues:[{level:'WARN',type:'FOCUS_NOT_IN_GITHUB_CANONICAL',focus:id}]});
}

function projectGraph(state,query={}){
 const focus=text(query.focus||'system:NEXO'),p=state.payload;
 if(focus==='system:NEXO')return rootGraph(state);
 if(focus==='system:SCIENCE')return scienceGraph(state);
 if(focus==='system:ENGINEERING')return hierarchyGraph(state,'ENGINEERING',p.engineering,'ENG-DOM-ENGINEERING');
 if(focus==='system:OLYMPUS')return hierarchyGraph(state,'OLYMPUS',p.olympus,'OLY-DOM-OLYMPUS');
 if(focus==='system:OPERATIONS')return operationsGraph(state);
 if(focus.startsWith('domain:'))return detailGraph(state,focus);
 return graph(state,focus,[],[],{issues:[{level:'WARN',type:'FOCUS_NOT_IN_GITHUB_CANONICAL',focus}]});
}

function learning(state){
 const structural=arr(state.payload.learning).map(row=>({id:row.id,stage:'structural',label:row.title||row.id,status:row.status,summary:row.summary,confidence:row.confidence??null,evidenceCount:row.support??null,contradictionCount:row.contradict??null,evidenceRefs:{provenance:row.provenance||null}}));
 const cross=arr(state.payload.crossDomain).map(row=>({id:row.id,stage:'cross-domain',label:row.title||row.id,status:row.status,summary:row.summary,evidenceRefs:{provenance:row.provenance||null,relation_scope:'CROSS_DOMAIN'}}));
 return {...base(state),total:structural.length+cross.length,crossDomain:cross.length,ladder:[{id:'structural',items:structural},{id:'cross-domain',items:cross}],emergent:[]};
}
function audit(state){const issues=arr(state.payload.integrity),resolved=new Set(['PASS','RESOLVED','LIVE']),open=issues.filter(row=>!resolved.has(upper(row.status))).length;return {...base(state),total:issues.length,open,resolved:issues.length-open,issues}}
function ops(state){const actions=arr(state.payload.actions).map(row=>({id:row.id,label:row.title,status:row.status,summary:row.summary,updatedAt:row.updatedAt,metadata:{authority:'GITHUB'}}));return {...base(state),counts:{blocked:actions.filter(row=>upper(row.status)==='BLOCKED').length,runs:null,success:null,readbackVerified:null},actions,runs:[],events:[]}}
function allEntities(state){const p=state.payload,out=[];for(const row of arr(p.science))out.push({id:row.id,type:'CAMPAIGN',label:row.title,status:row.status,summary:row.summary,domain:row.domain,metadata:{sourceRef:row.sourceRef}});for(const row of [...arr(p.engineering),...arr(p.olympus)])out.push({id:row.id,type:upper(row.type),label:row.title,status:row.status,summary:row.summary,metadata:{sourceRef:row.sourceRef,parentId:row.parentId}});for(const row of arr(p.actions))out.push({id:row.id,type:'WORK',label:row.title,status:row.status,summary:row.summary,metadata:{}});return out}

export function projectGithubCanonical(state,route,query={}){
 if(route==='graph'||route==='projection'||route==='universal-projection')return projectGraph(state,query);
 if(route==='health')return {ok:true,contract:'github-canonical-live-v1',dataSource:{...base(state),reason:'GITHUB_CANONICAL'}};
 if(route==='state')return {...base(state),projection:{...base(state)},counts:{CAMPAIGN:arr(state.payload.science).length,ENGINEERING:arr(state.payload.engineering).length,OLYMPUS:arr(state.payload.olympus).length},claims:{active:null,blocked:null},domains:{science:arr(state.payload.science).length,engineering:arr(state.payload.engineering).length,olympus:arr(state.payload.olympus).length}};
 if(route==='learning')return learning(state);
 if(route==='learning-relations')return learning(state).ladder.flatMap(stage=>stage.items).filter(item=>item.stage==='cross-domain');
 if(route==='audit')return audit(state);
 if(route==='ops')return ops(state);
 if(route==='automation-runs')return [];
 if(route==='entity'){const entity=allEntities(state).find(row=>row.id===(query.id||query.focus))||null;return {...base(state),entity}}
 throw new Error(`GITHUB_CANONICAL_ROUTE_UNSUPPORTED:${route}`);
}
