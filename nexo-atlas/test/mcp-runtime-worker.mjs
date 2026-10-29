// Synthetic local harness only. Production obtains identity/CONNECTORS from Sites.
import {createWorker} from '../worker/index.mjs';
const worker=createWorker();
export default {fetch(request,env,ctx) {
  const binding={async invoke(connector,action,args) {
    const response=await env.CONNECTOR_TEST.fetch('https://connector-test.invalid/action',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connector,action,args})});
    return response.json();
  }};
  function session(db) {return new Proxy(db,{get(target,key){
    if(key==='prepare')return sql=>{const statement=target.prepare(sql);
      if(!sql.startsWith('SELECT generation FROM retrieval_heads'))return statement;
      return {bind(...values){const bound=statement.bind(...values);return {async first(){
        const value=await bound.first();await env.CONTROL_TEST.fetch('https://control-test.invalid/final-head');return value;
      }}}};};
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});}
  const DB=new Proxy(env.DB,{get(target,key){if(key==='withSession')return(...args)=>session(target.withSession(...args));const value=target[key];return typeof value==='function'?value.bind(target):value;}});
  return worker.fetch(request,{...env,DB},{...ctx,props:{CONNECTORS:binding}});
}};
