// Local test entry only. Production still obtains CONNECTORS from Sites.
import {createWorker} from '../worker/index.mjs';
const worker=createWorker();
export default {fetch(request,env,ctx) {
  const binding={async invoke(connector,action,args) {
    const response=await env.CONNECTOR_TEST.fetch('https://connector-test.invalid/action',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connector,action,args})});
    return response.json();
  }};
  return worker.fetch(request,env,{...ctx,props:{CONNECTORS:binding}});
}};
