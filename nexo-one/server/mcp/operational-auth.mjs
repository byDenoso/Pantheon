import {timingSafeEqual} from 'node:crypto';
import {authenticated,sameOrigin} from '../auth/session.mjs';
import {sha256,ROLE_PROMPTS} from './operational-tools.mjs';

const equal=(a,b)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function operationalPrincipal(request,env){
  const headers=Object.fromEntries(request.headers.entries());
  if(!headers.host)headers.host=new URL(request.url).host;
  const req={headers};
  const bearer=/^Bearer ([^\s]+)$/.exec(headers.authorization||'')?.[1];
  const expected=env.NEXO_MCP_ACCESS_KEY_SHA256||env.NEXO_RUNNER_KEY_SHA256;
  if(bearer&&/^[0-9a-f]{64}$/.test(expected||'')&&equal(sha256(bearer),expected))
    return {authenticated:true,id:sha256('existing-mcp-key:'+bearer),roles:Object.keys(ROLE_PROMPTS)};
  if(authenticated(req,env)&&(request.method!=='POST'||sameOrigin(req))){
    return {authenticated:true,id:sha256('existing-owner-session:'+env.NEXO_SESSION_SECRET),roles:Object.keys(ROLE_PROMPTS)};
  }
  return null;
}
