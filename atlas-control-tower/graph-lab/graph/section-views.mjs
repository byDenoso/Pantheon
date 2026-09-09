export const ATLAS_SECTIONS=['graph','domains','ssot','analytics','deploy','settings'];

const ROOT='system:NEXO';
const slug=value=>String(value||'unknown').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'unknown';
const edge=(source,target,kind='derived')=>({id:`section-edge:${source}:${target}`,source,target,kind,authority:'derived-projection'});
const toneForStatus=status=>{
 const value=String(status||'').toUpperCase();
 if(/BLOCK|FAIL|ERROR|OPEN_GATE|CONTRADICTION/.test(value))return'blocked';
 if(/NEEDS|PENDING|UNKNOWN|STALE|WAIT|PARTIAL/.test(value))return'warn';
 if(/ACTIVE|DONE|SUPPORTED|VERIFIED|PASS|READY|HEALTHY/.test(value))return'ok';
 return'idle';
};
const systemForTab=tab=>({Science:'SCIENCE',Engineering:'ENGINEERING',Olympus:'OLYMPUS',NEXO:'NEXO',Relations:'BLACK_BOX'}[tab]||'BLACK_BOX');

function opsFor({level='domain',status='ACTIVE',summary=''}){
 return{level,status,tone:toneForStatus(status),summary,rollup:{},sections:[]};
}

function rootFor(source,label,summary){
 const root=source.nodes?.find(node=>node.id===source.rootId)||source.nodes?.find(node=>node.id===ROOT)||{id:ROOT,recordId:'NEXO',system:'NEXO',type:'SYSTEM',kind:'SYSTEM'};
 return{...root,id:ROOT,parentId:undefined,label,hierarchyLevel:'root',type:'SYSTEM',kind:'SYSTEM',authority:'derived-projection',ops:{...(root.ops||{}),...opsFor({level:'root',status:root.status||'ACTIVE',summary})}};
}

function derivedNode({id,label,parentId=ROOT,level='domain',system='NEXO',status='ACTIVE',summary='',recordId,extra={}}){
 return{id,label,parentId,hierarchyLevel:level,type:level==='domain'?'DOMAIN':level==='program'?'PROGRAM':'CAMPAIGN',kind:level==='domain'?'DOMAIN':level==='program'?'PROGRAM':'CAMPAIGN',system,status,authority:'derived-projection',recordId:recordId||id,summary,ops:opsFor({level,status,summary}),...extra};
}

function finish(root,nodes,edges,section,source){
 return{rootId:root.id,nodes:[root,...nodes],edges,section,source:source.source,ops:source.ops,live:source.live,authority:'derived-projection'};
}

function domainsView(source){
 const allowed=new Set(['root','domain','program']);
 const nodes=(source.nodes||[]).filter(node=>node.id!==source.rootId&&allowed.has(node.hierarchyLevel)).map(node=>({...node}));
 const ids=new Set([source.rootId,...nodes.map(node=>node.id)]);
 const edges=(source.edges||[]).filter(link=>ids.has(link.source)&&ids.has(link.target)).map(link=>({...link}));
 const root=rootFor(source,'NEXO · DOMAINS','Domínios e Programs projetados diretamente da hierarquia canônica. Campaigns ficam fora desta visão para reduzir ruído.');
 return{rootId:root.id,nodes:[root,...nodes],edges,section:'domains',source:source.source,ops:source.ops,live:source.live,authority:'derived-projection'};
}

function ssotView(source){
 const root=rootFor(source,'SSOT','Topologia das fontes que alimentam a projeção atual. Esta visão descreve origem e autoridade, não cria entidades científicas.');
 const kind=String(source.source?.kind||'unknown');
 const authority=derivedNode({id:'section:ssot:authority',label:kind==='drive-ssot'?'LIVE DRIVE':'SSOT SNAPSHOT',level:'domain',system:'NEXO',status:kind==='drive-ssot'?'ACTIVE':'STALE',summary:`Fonte atual: ${kind}.`});
 const tabs=[...new Set([...(source.source?.tabs||[]),...(source.nodes||[]).map(node=>node.sheetTab).filter(Boolean)])];
 const tabNodes=tabs.map(tab=>derivedNode({id:`section:ssot:tab:${slug(tab)}`,label:String(tab),parentId:authority.id,level:'program',system:systemForTab(tab),status:'ACTIVE',summary:`Aba ${tab} observada pela projeção atual.`}));
 return finish(root,[authority,...tabNodes],[edge(root.id,authority.id),...tabNodes.map(node=>edge(authority.id,node.id))],'ssot',source);
}

function analyticsView(source,runtime){
 const root=rootFor(source,'ANALYTICS','Distribuição operacional dos nós reais por estado. O agrupamento é derivado; os recordIds permanecem canônicos.');
 const candidates=(source.nodes||[]).filter(node=>node.id!==source.rootId);
 const groups=new Map();
 for(const node of candidates){const tone=toneForStatus(node.status||node.ops?.status);if(!groups.has(tone))groups.set(tone,[]);groups.get(tone).push(node)}
 const order=['blocked','warn','ok','idle'];
 const bucketLabel={blocked:'BLOCKED',warn:'ATTENTION',ok:'HEALTHY',idle:'OTHER'};
 const bucketStatus={blocked:'BLOCKED',warn:'NEEDS_DATA',ok:'ACTIVE',idle:'UNKNOWN'};
 const buckets=[];const children=[];const edges=[];
 const limit=Math.max(12,Number(runtime?.options?.maxVisibleNodes||110)-8);
 let remaining=limit;
 for(const tone of order){
  const items=groups.get(tone)||[];
  if(!items.length)continue;
  const bucket=derivedNode({id:`section:analytics:${tone}`,label:`${bucketLabel[tone]} · ${items.length}`,level:'domain',system:'NEXO',status:bucketStatus[tone],summary:`${items.length} nós nesta classe de estado.`});
  buckets.push(bucket);edges.push(edge(root.id,bucket.id));
  const ranked=[...items].sort((a,b)=>({domain:0,program:1,campaign:2}[a.hierarchyLevel]??3)-({domain:0,program:1,campaign:2}[b.hierarchyLevel]??3)||String(a.label).localeCompare(String(b.label)));
  const take=ranked.slice(0,Math.max(0,remaining));remaining-=take.length;
  for(const node of take){
   const child={...node,parentId:bucket.id,hierarchyLevel:'program',type:'PROGRAM',kind:'PROGRAM',authority:'derived-from-ssot-status',originalParentId:node.parentId,originalHierarchyLevel:node.hierarchyLevel};
   children.push(child);edges.push(edge(bucket.id,child.id));
  }
 }
 return finish(root,[...buckets,...children],edges,'analytics',source);
}

function deployView(source,runtime){
 const root=rootFor(source,'DEPLOY','Topologia observada do runtime desta sessão. Hosts e commit vêm do ambiente carregado no navegador.');
 const host=derivedNode({id:'section:deploy:host',label:`HOST · ${runtime?.hostname||'browser'}`,level:'domain',system:'ENGINEERING',status:'READY'});
 const assets=derivedNode({id:'section:deploy:assets',label:`ASSETS · ${runtime?.assetHost||'same-origin'}`,parentId:host.id,level:'program',system:'ENGINEERING',status:'READY'});
 const renderer=derivedNode({id:'section:deploy:renderer',label:`RENDERER · ${(runtime?.rendererMode||'unknown').toUpperCase()}`,parentId:host.id,level:'program',system:'ENGINEERING',status:'ACTIVE'});
 const ssot=derivedNode({id:'section:deploy:ssot',label:`SSOT · ${String(source.source?.kind||'unknown').toUpperCase()}`,parentId:host.id,level:'program',system:'NEXO',status:source.source?.kind==='drive-ssot'?'ACTIVE':'STALE'});
 const nodes=[host,assets,renderer,ssot];
 const edges=[edge(root.id,host.id),edge(host.id,assets.id),edge(host.id,renderer.id),edge(host.id,ssot.id)];
 if(runtime?.commit){const commit=derivedNode({id:'section:deploy:commit',label:`COMMIT · ${String(runtime.commit).slice(0,10)}`,parentId:assets.id,level:'campaign',system:'ENGINEERING',status:'VERIFIED'});nodes.push(commit);edges.push(edge(assets.id,commit.id))}
 return finish(root,nodes,edges,'deploy',source);
}

function settingsView(source,runtime){
 const root=rootFor(source,'SETTINGS','Estado visual e de densidade aplicado ao renderer nesta sessão.');
 const options=runtime?.options||{};
 const categories=[
  derivedNode({id:'section:settings:appearance',label:'APPEARANCE',level:'domain',system:'SCIENCE'}),
  derivedNode({id:'section:settings:renderer',label:'RENDERER',level:'domain',system:'ENGINEERING'}),
  derivedNode({id:'section:settings:motion',label:'MOTION',level:'domain',system:'LEARNING'}),
  derivedNode({id:'section:settings:density',label:'DENSITY',level:'domain',system:'OLYMPUS'})
 ];
 const values=[
  derivedNode({id:'section:settings:theme',label:String(runtime?.theme||'dark').toUpperCase(),parentId:categories[0].id,level:'program',system:'SCIENCE'}),
  derivedNode({id:'section:settings:renderer-mode',label:String(runtime?.rendererMode||'unknown').toUpperCase(),parentId:categories[1].id,level:'program',system:'ENGINEERING'}),
  derivedNode({id:'section:settings:glow',label:`GLOW · ${Number(options.glow??0).toFixed(2)}`,parentId:categories[1].id,level:'program',system:'ENGINEERING'}),
  derivedNode({id:'section:settings:fog',label:`FOG · ${Number(options.fog??0).toFixed(2)}`,parentId:categories[1].id,level:'program',system:'ENGINEERING'}),
  derivedNode({id:'section:settings:drift',label:`DRIFT · ${Number(options.drift??0).toFixed(1)}`,parentId:categories[2].id,level:'program',system:'LEARNING'}),
  derivedNode({id:'section:settings:pulse',label:`PULSE · ${Number(options.pulseSpeed??0).toFixed(2)}`,parentId:categories[2].id,level:'program',system:'LEARNING'}),
  derivedNode({id:'section:settings:labels',label:`LABELS · ${Number(options.maxLabels??0)}`,parentId:categories[3].id,level:'program',system:'OLYMPUS'}),
  derivedNode({id:'section:settings:visible',label:`VISIBLE · ${Number(options.maxVisibleNodes??0)}`,parentId:categories[3].id,level:'program',system:'OLYMPUS'})
 ];
 const edges=[...categories.map(node=>edge(root.id,node.id)),...values.map(node=>edge(node.parentId,node.id))];
 return finish(root,[...categories,...values],edges,'settings',source);
}

export function buildSectionGraph(source,section,runtime={}){
 if(!source?.nodes?.length)return{rootId:ROOT,nodes:[],edges:[],section,authority:'derived-projection'};
 switch(section){
  case'graph':return source;
  case'domains':return domainsView(source);
  case'ssot':return ssotView(source);
  case'analytics':return analyticsView(source,runtime);
  case'deploy':return deployView(source,runtime);
  case'settings':return settingsView(source,runtime);
  default:return source;
 }
}
