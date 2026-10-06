import {atlasLocale} from './locale.mjs';
import {operationalPrincipal} from '../mcp/operational-auth.mjs';
import {atlasAuthenticated,atlasSameOrigin,atlasSessionRoute} from '../auth/atlas-session.mjs';
// Approval is explicit and code-reviewed. No Tower/source fields are approved.
// Never project arbitrary input by deleting a list of known-sensitive fields.
export function publicAtlas(){return {contract:'ATLAS_PUBLIC_V1',items:[],links:[]};}
export const MACHINE_ROUTES=new Set(['inbox-list','inbox-ack','atlas-ssot','projections']);
export const AUTH_ROUTES=new Set(['session','google-drive-return']);
export async function atlasBoundary(req,env,{route,body={},now=Date.now(),store}={}){
  if(route==='atlas-locale')return {status:req.method==='GET'?200:405,body:req.method==='GET'?atlasLocale(req,env):{error:'METHOD_NOT_ALLOWED'}};
  if(route==='atlas-public')return {status:req.method==='GET'?200:405,body:req.method==='GET'?publicAtlas():{error:'METHOD_NOT_ALLOWED'}};
  if(route==='atlas-session')return atlasSessionRoute(req,env,now,body,store);
  // These existing machine handlers must still apply their own independent OIDC
  // verification. This exception never grants browser/session access to them.
  if(MACHINE_ROUTES.has(route)||AUTH_ROUTES.has(route))return null;
  if(route==='mcp'||route==='mcp/status'||route==='inbox-drop'){
    // Preserve existing machine grants for MCP and its equivalent spool ingress. Strip
    // cookies so the old owner-session branch cannot bypass Atlas revocation.
    const authorization=String(req.headers?.authorization||'');
    if(authorization&&authorization.length<=16391){
      const machineRequest=new Request('https://machine.invalid/api/mcp',{
        method:req.method,headers:{authorization}});
      if(await operationalPrincipal(machineRequest,env))return null;
    }
  }
  if(!await atlasAuthenticated(req,env,now,store))return {status:401,body:{error:'AUTH_REQUIRED'}};
  if(!['GET','HEAD'].includes(req.method)&&!atlasSameOrigin(req,env))return {status:403,body:{error:'ORIGIN_NOT_ALLOWED'}};
  return null;
}
