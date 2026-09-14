const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const arr=value=>Array.isArray(value)?value:[];
const trimSlash=value=>text(value).replace(/\/+$/,'');
const paramsMatch=(value,needle)=>!needle||text(value).toLocaleLowerCase().includes(text(needle).toLocaleLowerCase());

function join(base,...parts){return [trimSlash(base),...parts.map(part=>text(part).replace(/^\/+|\/+$/g,''))].filter(Boolean).join('/')}

function testNode(test,domain=''){
  return {id:test.id,type:'TEST',label:test.label||test.id,status:test.status||'',summary:test.summary||'',domain:domain||arr(test.domains)[0]||'',authority:'GITHUB',evidenceClass:test.evidenceClass||'',updatedAt:test.lastVerified||'',metadata:{primaryCampaign:test.primaryCampaign||'',keyMetrics:test.keyMetrics||'',projectionAuthority:'GOOGLE_DRIVE'}};
}
function resultNode(test,domain=''){
  return {id:`result:${test.id}`,type:'RESULT',label:`Resultado · ${test.label||test.id}`,status:test.status||'',summary:test.summary||'',domain:domain||arr(test.domains)[0]||'',authority:'GITHUB',evidenceClass:test.evidenceClass||'',updatedAt:test.lastVerified||'',metadata:{testId:test.id,keyMetrics:test.keyMetrics||'',projectionAuthority:'GOOGLE_DRIVE'}};
}
function graph(focus,nodes=[],edges=[],extra={}){return {focus,nodes,edges,total:nodes.length,depth:Number(extra.depth||1),hasMore:Boolean(extra.hasMore),truncated:Boolean(extra.truncated),source:'GOOGLE_DRIVE',authority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE',projectionOnly:true,freshness:'SNAPSHOT',...extra}}

export function createStaticArtifactApi({baseUrl='/data',fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('STATIC_ARTIFACT_FETCH_REQUIRED');
  const base=trimSlash(baseUrl)||'/data';
  let manifestPromise=null;
  const cache=new Map();
  let provenance={source:'GOOGLE_DRIVE',freshness:'SNAPSHOT',sourceVersion:'',label:'GITHUB · SNAPSHOT DO DRIVE'};

  async function fetchJson(url){
    const key=String(url);
    if(cache.has(key))return cache.get(key);
    const pending=(async()=>{
      const response=await fetchImpl(key,{headers:{Accept:'application/json'}});
      if(!response?.ok)throw new Error(`STATIC_ARTIFACT_HTTP_${response?.status||0}:${key}`);
      try{return await response.json()}catch(error){throw new Error(`STATIC_ARTIFACT_INVALID_JSON:${key}:${String(error?.message||error)}`)}
    })();
    cache.set(key,pending);
    try{return await pending}catch(error){cache.delete(key);throw error}
  }

  async function manifest(){
    if(!manifestPromise){
      manifestPromise=fetchJson(join(base,'current/manifest.json')).then(value=>{
        if(value?.contract!=='nexo-static-runtime-v1'||!/^sha256:[a-f0-9]{64}$/i.test(text(value?.fingerprint)))throw new Error('STATIC_MANIFEST_INVALID');
        provenance={...provenance,sourceVersion:value.sourceVersion||'',fingerprint:value.fingerprint};
        return value;
      }).catch(error=>{manifestPromise=null;throw error});
    }
    return manifestPromise;
  }

  async function artifact(rel){
    const current=await manifest();
    const normalized=text(rel).replace(/^\/+/, '');
    if(!current.artifacts?.[normalized])throw new Error(`STATIC_ARTIFACT_UNDECLARED:${normalized}`);
    return fetchJson(join(base,current.snapshotPath,normalized));
  }

  async function entityIndex(){return artifact('entities/index.json')}
  async function searchIndex(){return artifact('search/index.json')}

  async function scienceRecord(id){
    const index=await entityIndex();
    const record=index.entities?.[id];
    if(!record)return null;
    if(!/^science\//.test(record.artifact||''))return {record,raw:null};
    if(record.artifact==='science/index.json')return {record,raw:await artifact('science/index.json')};
    const shard=await artifact(record.artifact);
    const testId=id.startsWith('result:')?id.slice(7):id;
    const test=arr(shard.tests).find(item=>item.id===testId)||null;
    return {record,raw:shard,test};
  }

  async function graphSearch(query={}){
    const index=await searchIndex();
    const type=upper(query.type),domain=upper(query.domain),needle=query.q||query.query||'';
    const limit=Math.max(1,Math.min(Number(query.limit||120),500));
    const filtered=arr(index.items).filter(item=>(!type||upper(item.type)===type)&&(!domain||upper(item.domain)===domain)&&(!needle||paramsMatch(item.id,needle)||paramsMatch(item.label,needle))).slice(0,limit);
    const nodes=filtered.map(item=>({id:item.id,type:item.type||'ENTITY',label:item.label||item.id,status:item.status||'',domain:item.domain||'',authority:'GITHUB'}));
    return graph(text(query.focus),nodes,[],{total:filtered.length,depth:0});
  }

  async function genericHierarchy(focus){
    const rawId=text(focus).replace(/^domain:/,'');
    const index=await entityIndex();
    const entity=index.entities?.[rawId];
    if(!entity)return graph(focus,[],[],{issues:[{level:'WARN',type:'FOCUS_NOT_IN_STATIC_INDEX',focus}]});
    const childEntries=Object.entries(index.entities).filter(([,item])=>item.parentId===rawId);
    const root={id:focus,type:entity.type||'ENTITY',label:entity.label||rawId,status:entity.status||'',summary:entity.summary||'',authority:'GITHUB',metadata:{childCount:childEntries.length}};
    const children=childEntries.map(([id,item])=>({id,type:item.type||'ENTITY',label:item.label||id,status:item.status||'',summary:item.summary||'',authority:'GITHUB',metadata:{childCount:Object.values(index.entities).filter(candidate=>candidate.parentId===id).length}}));
    return graph(focus,[root,...children],children.map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
  }

  async function campaignGraph(id){
    const index=await entityIndex();
    const campaign=index.entities?.[id];
    if(!campaign)return graph(id,[],[]);
    let raw;
    if(campaign.domain)raw=await artifact(`science/${campaign.domain}.json`);
    else raw=await artifact('science/CROSS.json').catch(()=>null);
    const tests=arr(raw?.tests).filter(test=>test.primaryCampaign===id);
    const root={id,type:'CAMPAIGN',label:campaign.label||id,status:campaign.status||'',summary:campaign.summary||'',domain:campaign.domain||'',authority:'GITHUB',metadata:{childCount:0}};
    const nodes=[root],edges=[];
    for(const test of tests){
      const t=testNode(test,campaign.domain),r=resultNode(test,campaign.domain);nodes.push(t,r);
      edges.push({id:`tests:${id}:${t.id}`,source:id,target:t.id,type:'TESTS',declared:true},{id:`produces:${t.id}:${r.id}`,source:t.id,target:r.id,type:'PRODUCES',declared:true});
    }
    return graph(id,nodes,edges,{depth:2,hasMore:Boolean(raw?.completeness?.truncated),truncated:Boolean(raw?.completeness?.truncated),completeness:raw?.completeness});
  }

  async function focusedScienceGraph(id){
    const found=await scienceRecord(id);
    if(!found?.record)return graph(id,[],[]);
    if(found.record.type==='DOMAIN')return artifact(`graph/science/${found.record.domain}.json`);
    if(found.record.type==='CAMPAIGN')return campaignGraph(id);
    if(found.test){
      const t=testNode(found.test,found.record.domain),r=resultNode(found.test,found.record.domain);
      if(id.startsWith('result:'))return graph(id,[r,t],[{id:`produces:${t.id}:${r.id}`,source:t.id,target:r.id,type:'PRODUCES',declared:true}],{depth:1});
      return graph(id,[t,r],[{id:`produces:${t.id}:${r.id}`,source:t.id,target:r.id,type:'PRODUCES',declared:true}],{depth:1});
    }
    return graph(id,[],[]);
  }

  async function readGraph(query={}){
    if(query.mode==='search'||query.type)return graphSearch(query);
    const focus=text(query.focus||'system:NEXO');
    if(focus==='system:NEXO')return artifact('graph/root.json');
    if(focus==='system:SCIENCE')return artifact('graph/science.json');
    if(focus==='system:ENGINEERING')return artifact('graph/engineering.json');
    if(focus==='system:OLYMPUS')return artifact('graph/olympus.json');
    if(focus==='system:OPERATIONS')return artifact('graph/operations.json');
    if(/^domain:D\d+$/i.test(focus))return artifact(`graph/science/${focus.slice(7).toUpperCase()}.json`);
    if(/^T-/i.test(focus)||/^result:T-/i.test(focus)||/^CAMP-/i.test(focus))return focusedScienceGraph(focus);
    if(/^domain:/.test(focus))return genericHierarchy(focus);
    const indexed=(await entityIndex()).entities?.[focus];
    if(upper(indexed?.type)==='PROGRAM')return genericHierarchy(focus);
    return graph(focus,[],[],{issues:[{level:'WARN',type:'FOCUS_NOT_IN_STATIC_RUNTIME',focus}]});
  }

  async function readEntity(id){
    const key=text(id),index=await entityIndex(),record=index.entities?.[key]||index.entities?.[key.replace(/^domain:/,'')];
    if(!record)return {entity:null,source:'GOOGLE_DRIVE',freshness:'SNAPSHOT',authority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE'};
    if(record.type==='TEST'||record.type==='RESULT'){
      const found=await scienceRecord(key);
      const entity=record.type==='RESULT'?resultNode(found.test,record.domain):testNode(found.test,record.domain);
      return {entity,relations:record.type==='TEST'?[{id:`produces:${entity.id}:result:${entity.id}`,source:entity.id,target:`result:${entity.id}`,type:'PRODUCES',declared:true}]:[],source:'GOOGLE_DRIVE',freshness:'SNAPSHOT',authority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE'};
    }
    return {entity:{id:key,type:record.type||'ENTITY',label:record.label||key,status:record.status||'',summary:record.summary||'',domain:record.domain||'',authority:'GITHUB',metadata:{parentId:record.parentId||null}},relations:[],source:'GOOGLE_DRIVE',freshness:'SNAPSHOT',authority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE'};
  }

  async function health(){
    const [current,value]=await Promise.all([manifest(),artifact('health.json')]);
    return {...value,fingerprint:current.fingerprint,sourceVersion:current.sourceVersion,dataSource:{source:'GOOGLE_DRIVE',effective:'GOOGLE_DRIVE',freshness:'SNAPSHOT',sourceVersion:current.sourceVersion,authority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE',projectionOnly:true,reason:'GITHUB_PUBLISHED_DRIVE_PROJECTION',usedFallback:false}};
  }

  return {
    get remote(){return false},
    get provenance(){return provenance},
    manifest,
    artifact,
    graph:readGraph,
    state:()=>artifact('state.json'),
    health,
    entity:readEntity,
    lineage:id=>readGraph({focus:id,mode:'children',depth:3}),
    learning:()=>artifact('learning/current.json'),
    learningFor:async id=>{const data=await artifact('learning/current.json');const items=arr(data.ladder).flatMap(stage=>arr(stage.items));return {...data,item:items.find(item=>item.id===id)||null}},
    learningLineage:id=>readGraph({focus:id,mode:'lineage',depth:3}),
    ops:()=>artifact('operations/current.json'),
    automationRuns:async()=>arr((await artifact('operations/current.json')).runs),
    audit:()=>artifact('audit/current.json'),
    files:async id=>({id,files:[],source:'GOOGLE_DRIVE',freshness:'SNAPSHOT',reason:'PUBLIC_STATIC_RUNTIME'}),
    research:async route=>{throw new Error(`STATIC_RESEARCH_ROUTE_NOT_MATERIALIZED:${route}`)},
    sync:async()=>({outcome:'READ_ONLY',source:'GITHUB_STATIC_STATE'}),
    clear(){cache.clear();manifestPromise=null},
    searchIndex
  };
}
