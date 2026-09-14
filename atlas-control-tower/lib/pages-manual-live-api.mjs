const LIVE_URL='https://nexo-one-two.vercel.app/api/atlas-public-ssot';
const arr=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const unique=values=>[...new Set(values.filter(Boolean))];

function validate(snapshot){
  if(snapshot?.contract!=='NEXO_ATLAS_SSOT_V1')throw new Error('PUBLIC_SSOT_CONTRACT_INVALID');
  if(snapshot?.authority!=='GOOGLE_DRIVE'||snapshot?.projectionOnly!==true||snapshot?.access!=='PUBLIC_SANITIZED')throw new Error('PUBLIC_SSOT_AUTHORITY_INVALID');
  if(!/^sha256:[a-f0-9]{64}$/i.test(text(snapshot?.fingerprint)))throw new Error('PUBLIC_SSOT_FINGERPRINT_INVALID');
  if(!snapshot?.projections||!Array.isArray(snapshot.projections.Science)||!Array.isArray(snapshot.projections.Engineering))throw new Error('PUBLIC_SSOT_PROJECTION_INVALID');
  return snapshot;
}

function base(snapshot){return {source:'GOOGLE_DRIVE',freshness:'LIVE',sourceVersion:snapshot.sourceModifiedAt||snapshot.generatedAt||'',fingerprint:snapshot.fingerprint,authority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE',projectionOnly:true,cache:'LIVE'}}
function graph(snapshot,focus,nodes,edges,extra={}){return {...base(snapshot),focus,nodes,edges,total:nodes.length,depth:Number(extra.depth||1),hasMore:false,truncated:false,issues:[],...extra}}
function systemNode(id,label){return {id:`system:${id}`,type:'SYSTEM',label,status:'ACTIVE',authority:'GITHUB'}}
function scienceRows(snapshot){return arr(snapshot.projections?.Science).filter(row=>upper(row.record_type)==='CAMPAIGN'&&text(row.record_id))}
function hierarchyRows(snapshot){return arr(snapshot.projections?.Engineering).map(row=>({type:upper(row.record_type),id:text(row.record_id),status:text(row.status),title:text(row.title),summary:text(row.summary),parentId:text(row.parent_id)})).filter(row=>row.id)}

function liveScienceGraph(snapshot,focus){
  const rows=scienceRows(snapshot);
  if(focus==='system:SCIENCE'){
    const domains=unique(rows.map(row=>text(row.domain))).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const root=systemNode('SCIENCE','Ciência');
    const nodes=[root,...domains.map(id=>{const first=rows.find(row=>text(row.domain)===id)||{};return {id:`domain:${id}`,domain:id,type:'DOMAIN',label:text(first.title)||id,status:text(first.status),summary:text(first.summary),authority:'GITHUB'}})];
    return graph(snapshot,focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})));
  }
  const id=text(focus).replace(/^domain:/,'');
  if(!/^D\d+$|^M\d+$/i.test(id))return null;
  const matches=rows.filter(row=>text(row.domain).toUpperCase()===id.toUpperCase());
  const root={id:`domain:${id}`,domain:id,type:'DOMAIN',label:id,status:'ACTIVE',authority:'GITHUB'};
  const nodes=[root,...matches.map(row=>({id:text(row.record_id),type:'CAMPAIGN',label:text(row.title)||text(row.record_id),status:text(row.status),summary:text(row.summary),domain:id,authority:'GITHUB'}))];
  return graph(snapshot,root.id,nodes,nodes.slice(1).map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
}

function liveEngineeringGraph(snapshot,focus){
  const rows=hierarchyRows(snapshot);
  if(focus==='system:ENGINEERING'){
    const root=systemNode('ENGINEERING','Engenharia');
    const programs=rows.filter(row=>row.type==='PROGRAM'&&row.parentId==='ENG-DOM-ENGINEERING');
    const nodes=[root,...programs.map(row=>({id:`domain:${row.id}`,domain:row.id,type:'DOMAIN',label:row.title||row.id,status:row.status,summary:row.summary,authority:'GITHUB'}))];
    return graph(snapshot,focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})));
  }
  if(!focus.startsWith('domain:'))return null;
  const id=focus.slice(7),parent=rows.find(row=>row.id===id);
  if(!parent)return null;
  const children=rows.filter(row=>row.parentId===id);
  const root={id:focus,type:parent.type==='PROGRAM'?'PROGRAM':'DOMAIN',label:parent.title||id,status:parent.status,summary:parent.summary,authority:'GITHUB'};
  const nodes=[root,...children.map(row=>({id:row.id,type:row.type||'ENTITY',label:row.title||row.id,status:row.status,summary:row.summary,authority:'GITHUB'}))];
  return graph(snapshot,focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
}

function liveGraph(snapshot,query={}){
  const focus=text(query.focus||'system:NEXO');
  return liveScienceGraph(snapshot,focus)||liveEngineeringGraph(snapshot,focus);
}

function liveEntity(snapshot,id){
  const key=text(id).replace(/^domain:/,'');
  const science=scienceRows(snapshot).find(row=>text(row.record_id)===key);
  if(science)return {entity:{id:key,type:'CAMPAIGN',label:text(science.title)||key,status:text(science.status),summary:text(science.summary),domain:text(science.domain),authority:'GITHUB'},relations:[],...base(snapshot)};
  const engineering=hierarchyRows(snapshot).find(row=>row.id===key);
  if(engineering)return {entity:{id:key,type:engineering.type||'ENTITY',label:engineering.title||key,status:engineering.status,summary:engineering.summary,authority:'GITHUB',metadata:{parentId:engineering.parentId||null}},relations:[],...base(snapshot)};
  return null;
}

function changedProjectionNames(before,after){
  if(!before)return [];
  return ['Science','Engineering'].filter(key=>JSON.stringify(arr(before.projections?.[key]))!==JSON.stringify(arr(after.projections?.[key])));
}

export function createPagesManualSyncApi(staticApi,{fetchImpl=globalThis.fetch,liveUrl=LIVE_URL}={}){
  if(typeof fetchImpl!=='function')throw new Error('PAGES_SYNC_FETCH_REQUIRED');
  let live=null;
  let lastReceipt=null;

  async function fetchLive(tag){
    const url=new URL(liveUrl);
    url.searchParams.set('refresh','1');
    url.searchParams.set('_readback',String(tag));
    const response=await fetchImpl(url.toString(),{method:'GET',headers:{Accept:'application/json'},cache:'no-store'});
    if(!response?.ok)throw new Error(`PAGES_SYNC_HTTP_${response?.status||0}`);
    return validate(await response.json());
  }

  async function sync(){
    const before=live;
    try{
      const first=await fetchLive(`write-${Date.now()}`);
      const readback=await fetchLive(`readback-${Date.now()}`);
      if(first.fingerprint!==readback.fingerprint)throw new Error('PAGES_SYNC_READBACK_MISMATCH');
      live=readback;
      const changedProjections=changedProjectionNames(before,readback);
      const outcome=!before?'REFRESHED':before.fingerprint===readback.fingerprint?'NO_CHANGE':'UPDATED';
      lastReceipt={outcome,readbackVerified:true,fingerprintBefore:before?.fingerprint||null,fingerprintAfter:readback.fingerprint,sourceVersion:readback.sourceModifiedAt||'',changedProjections,source:'GOOGLE_DRIVE'};
      return lastReceipt;
    }catch(error){
      lastReceipt={outcome:'FAILED',readbackVerified:false,error:'LIVE_SYNC_UNAVAILABLE',detail:String(error?.message||error).slice(0,180),lastValidPreserved:true,source:live?'GOOGLE_DRIVE':'GITHUB_STATIC_STATE'};
      return lastReceipt;
    }
  }

  return {
    get remote(){return false},
    get provenance(){return live?{source:'GOOGLE_DRIVE',freshness:'LIVE',sourceVersion:live.sourceModifiedAt||'',fingerprint:live.fingerprint,label:'DRIVE · SINCRONIZAÇÃO MANUAL'}:staticApi.provenance},
    get lastSync(){return lastReceipt},
    async graph(query={}){return (live&&liveGraph(live,query))||staticApi.graph(query)},
    state:(...args)=>staticApi.state(...args),
    async health(){
      const fallback=await staticApi.health();
      if(!live)return fallback;
      return {...fallback,fingerprint:live.fingerprint,sourceVersion:live.sourceModifiedAt||'',dataSource:{...(fallback?.dataSource||{}),source:'GOOGLE_DRIVE',effective:'GOOGLE_DRIVE',freshness:'LIVE',sourceVersion:live.sourceModifiedAt||'',authority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE',projectionOnly:true,reason:'MANUAL_DRIVE_READBACK',usedFallback:false}};
    },
    async entity(id,view){return (live&&liveEntity(live,id,view))||staticApi.entity(id,view)},
    lineage:(...args)=>staticApi.lineage(...args),
    learning:(...args)=>staticApi.learning(...args),
    learningFor:(...args)=>staticApi.learningFor(...args),
    learningLineage:(...args)=>staticApi.learningLineage(...args),
    ops:(...args)=>staticApi.ops(...args),
    automationRuns:(...args)=>staticApi.automationRuns(...args),
    audit:(...args)=>staticApi.audit(...args),
    files:(...args)=>staticApi.files(...args),
    research:(...args)=>staticApi.research(...args),
    searchIndex:(...args)=>staticApi.searchIndex(...args),
    sync,
    clear(){staticApi.clear?.()}
  };
}
