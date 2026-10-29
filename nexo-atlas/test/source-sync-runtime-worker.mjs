// Local test harness only; production never imports these synthetic transports.
import {createWorker} from '../worker/index.mjs';
const worker=createWorker();
const originalNow=Date.now;
function countedDatabase(db,stats){const wrap=s=>({_native:s,bind(...args){return wrap(s.bind(...args));},first(...args){stats.n++;return s.first(...args);},all(...args){stats.n++;return s.all(...args);},run(...args){stats.n++;return s.run(...args);},raw(...args){stats.n++;return s.raw(...args);}});return {prepare:q=>wrap(db.prepare(q)),withSession:mode=>countedDatabase(db.withSession(mode),stats),batch:rows=>{stats.n+=rows.length;return db.batch(rows.map(r=>r._native));}};}
export default {async fetch(request,env,ctx){
  if(env.TEST_FROZEN_NOW)Date.now=()=>Number(env.TEST_FROZEN_NOW);else Date.now=originalNow;
  const stats={n:0},DB=countedDatabase(env.DB,stats);
  const binding={async invoke(connector,action,args){if(env.TEST_DIRECT_READ_METADATA){if(connector!=='connector_5f3c8c41a1e54ad7a76272c89e2554fa')throw Error('WRONG_TEST_CONNECTOR');const id='1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z';let data;if(action==='list_file_revisions'&&args.fileId===id&&args.pageSize===1000)data={fileId:id,currentRevisionId:env.TEST_SOURCE_REVISION,revisions:[{id:env.TEST_SOURCE_REVISION,size:env.TEST_SOURCE_SIZE,mimeType:'application/json'}]};else if(action==='fetch'&&args.url==='https://drive.google.com/file/d/'+id+'/view'&&args.download_raw_file===true&&args.include_base64===false)data={id,mime_type:'application/json',file_size_bytes:Number(env.TEST_SOURCE_SIZE),file_uri:{download_url:env.TEST_SOURCE_URL}};else throw Error('WRONG_TEST_SOURCE_ACTION');return{status:'success',result:{structuredContent:data}};}const r=await env.CONNECTOR_TEST.fetch('https://local-connector.invalid/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connector,action,args})});return r.json();}};
  const r=await worker.fetch(request,{...env,DB},{...ctx,props:{CONNECTORS:binding}}),headers=new Headers(r.headers);headers.set('x-test-sql-statements',String(stats.n));return new Response(r.body,{status:r.status,headers});
}};
