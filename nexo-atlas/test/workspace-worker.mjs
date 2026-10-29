// Local-only fake source binding; excluded from Site build inputs.
import {createWorker} from '../worker/index.mjs';
import {compilePrivateWorkspaceRuntime} from '../server/atlas/private-workspace.mjs';
export default {async fetch(request,env,ctx){
 const read=async()=>await(await env.TOWER_TEST.fetch('https://fixture.invalid/')).json();
 return createWorker({readSource:async()=>compilePrivateWorkspaceRuntime(await read()),readMemory:read}).fetch(request,env,ctx);
}};
