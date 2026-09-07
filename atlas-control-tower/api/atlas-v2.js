import baseHandler from './atlas.js';

const DERIVED='DERIVED_NOT_EVIDENCE';
const LEARNING_SYSTEM={id:'system:LEARNING',type:'SYSTEM',label:'Learning',authority:DERIVED,status:'active',summary:'Learning operacional publicado em learning_v1.'};
const itemPrefixes=['observation:','pattern:','lesson:','strategy:','policy:'];
const isLearningId=id=>String(id||'').startsWith('learning-stage:')||itemPrefixes.some(p=>String(id||'').startsWith(p));

function invokeBase(req,route,params={}){
 return new Promise((resolve,reject)=>{
  const url=new URL(req.url||'/','https://atlas.local');
  url.searchParams.set('route',route);
  for(const [k,v] of Object.entries(params)) v==null?url.searchParams.delete(k):url.searchParams.set(k,String(v));
  const fakeReq=Object.create(req||null);
  fakeReq.url=url.pathname+'?'+url.searchParams.toString();
  fakeReq.method='GET';
  const headers={};let body='';let done=false;
  const fakeRes={
   statusCode:200,
   setHeader(k,v){headers[String(k).toLowerCase()]=v},
   end(chunk=''){if(done)return;done=true;body+=chunk||'';let data=null;try{data=body?JSON.parse(body):null}catch{}resolve({status:this.statusCode||200,headers,data,body})}
  };
  Promise.resolve(baseHandler(fakeReq,fakeRes)).then(()=>{if(!done)fakeRes.end()}).catch(reject);
 });
}

function allItems(report){return(report?.ladder||[]).flatMap(stage=>(stage.items||[]).map(item=>({...item,_stage:stage}))) }
function stageNode(stage){return{id:`learning-stage:${stage.id}`,type:'DOMAIN',label:stage.label,authority:DERIVED,status:stage.available?'active':'unknown',summary:`${stage.count||0} registros em ${stage.source||'learning_v1'}.`,metadata:{learningStage:stage.id,source:stage.source||''}}}
function itemNode(item,stage){return{id:item.id,type:'LEARNING_RELATION',label:item.relationType||item.id,authority:DERIVED,status:item.status||'unknown',summary:item.notes||'',domain:item.domainA||'',metadata:{learningStage:stage.id,evidenceCount:item.evidenceCount??null,contradictionCount:item.contradictionCount??null,confidence:item.confidence??null,derivedFrom:item.derivedFrom||[]}}}
function fingerprint(report){let h=2166136261;const text=(report?.ladder||[]).map(s=>`${s.id}:${s.count}:${(s.items||[]).map(x=>x.id+':'+x.status).join(',')}`).join('|');for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16)}

function learningGraph(report,focus,limit=120){
 const fp=fingerprint(report),stages=report?.ladder||[];
 if(focus==='system:LEARNING'){
  const children=stages.filter(s=>s.available||s.count).map(stageNode);
  return{focus,nodes:[LEARNING_SYSTEM,...children],edges:children.map(n=>({id:`system:LEARNING:CONTAINS:${n.id}`,source:'system:LEARNING',target:n.id,type:'CONTAINS',authority:DERIVED})),total:children.length+1,hasMore:false,depth:1,fingerprint:fp,sourceVersion:report?.generatedAt||'',source:'v1',freshness:'LIVE',cache:'HIT',issues:[]};
 }
 if(String(focus).startsWith('learning-stage:')){
  const sid=String(focus).slice('learning-stage:'.length),stage=stages.find(s=>s.id===sid);
  if(!stage)return{focus,nodes:[],edges:[],total:0,hasMore:false,depth:1,fingerprint:fp,source:'v1',freshness:'LIVE',issues:[]};
  const root=stageNode(stage),items=(stage.items||[]).slice(0,Math.max(1,Math.min(Number(limit)||120,120))).map(x=>itemNode(x,stage));
  return{focus,nodes:[root,...items],edges:items.map(n=>({id:`${root.id}:CONTAINS:${n.id}`,source:root.id,target:n.id,type:'CONTAINS',authority:DERIVED})),total:(stage.items||[]).length+1,hasMore:(stage.items||[]).length>items.length,depth:1,fingerprint:fp,sourceVersion:report?.generatedAt||'',source:'v1',freshness:'LIVE',cache:'HIT',issues:[]};
 }
 const entry=allItems(report).find(x=>x.id===focus);
 if(entry){
  const node=itemNode(entry,entry._stage),byId=new Map(allItems(report).map(x=>[x.id,x]));
  const linked=new Set(entry.derivedFrom||[]);for(const x of allItems(report))if((x.derivedFrom||[]).includes(entry.id))linked.add(x.id);
  const linkedNodes=[...linked].map(id=>byId.get(id)).filter(Boolean).slice(0,24).map(x=>itemNode(x,x._stage));
  const edges=linkedNodes.map(n=>({id:`${n.id}:DERIVED_FROM:${node.id}`,source:(entry.derivedFrom||[]).includes(n.id)?n.id:node.id,target:(entry.derivedFrom||[]).includes(n.id)?node.id:n.id,type:'DERIVED_FROM',authority:DERIVED}));
  return{focus,nodes:[node,...linkedNodes],edges,total:linkedNodes.length+1,hasMore:false,depth:1,fingerprint:fp,sourceVersion:report?.generatedAt||'',source:'v1',freshness:'LIVE',cache:'HIT',issues:[]};
 }
 return null;
}

async function learningReport(req){const r=await invokeBase(req,'learning');if(r.status>=400)throw Error(r.body||'LEARNING_UNAVAILABLE');return r.data}

export default async function handler(req,res){
 const u=new URL(req.url||'/','https://atlas.local'),route=u.searchParams.get('route')||u.pathname.split('/').pop(),focus=u.searchParams.get('focus')||'',id=u.searchParams.get('id')||'';
 try{
  if(route==='graph'&&(focus==='system:LEARNING'||isLearningId(focus))){
   const report=await learningReport(req),g=learningGraph(report,focus,u.searchParams.get('limit'));
   if(g){res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.statusCode=200;return res.end(JSON.stringify(g))}
  }
  if(route==='entity'&&isLearningId(id)){
   const report=await learningReport(req);
   if(String(id).startsWith('learning-stage:')){
    const sid=String(id).slice('learning-stage:'.length),stage=(report.ladder||[]).find(s=>s.id===sid);if(stage){const entity=stageNode(stage),relations=(stage.items||[]).slice(0,100).map(x=>({id:`${entity.id}:CONTAINS:${x.id}`,source:entity.id,target:x.id,type:'CONTAINS',authority:DERIVED}));res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.statusCode=200;return res.end(JSON.stringify({entity,relations,relationCount:(stage.items||[]).length,source:'v1'}))}
   }else{
    const entry=allItems(report).find(x=>x.id===id);if(entry){const entity=itemNode(entry,entry._stage),relations=[...(entry.derivedFrom||[]).map(x=>({id:`${x}:DERIVED_FROM:${entry.id}`,source:x,target:entry.id,type:'DERIVED_FROM',authority:DERIVED})),...allItems(report).filter(x=>(x.derivedFrom||[]).includes(entry.id)).map(x=>({id:`${entry.id}:DERIVED_FROM:${x.id}`,source:entry.id,target:x.id,type:'DERIVED_FROM',authority:DERIVED}))];res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.statusCode=200;return res.end(JSON.stringify({entity,relations:relations.slice(0,100),relationCount:relations.length,source:'v1'}))}
   }
  }
  return baseHandler(req,res);
 }catch(e){console.error('[atlas:v2]',route,e?.message||e);return baseHandler(req,res)}
}
