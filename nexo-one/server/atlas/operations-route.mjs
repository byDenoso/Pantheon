import {randomBytes} from 'node:crypto';
import {projectOperations} from './operational-frontier.mjs';
import {operationsPage} from './operations-page.mjs';

export const OPERATIONS_ROUTES = new Set(['atlas-operations','atlas-operations-ui']);
export function operationsRoute(req) {
  const url = new URL(req.url, 'http://local');
  return url.searchParams.get('route') || url.pathname.replace(/\/+$/,'').split('/').pop();
}
/** The session boundary must run before token acquisition, source reads, or page rendering. */
export function createOperationsHandler({boundary,tokenProvider,runtimeEnvironment,readTower}) {
  return async function handleOperations(req,res) {
    for (const [key,value] of Object.entries({'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store',
      'Vercel-CDN-Cache-Control':'no-store','Vary':'Authorization, Origin, Cookie',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'})) res.setHeader(key,value);
    const send=(body,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));};
    const env=process.env,route=operationsRoute(req),url=new URL(req.url,'http://local');
    try {
      const denied=await boundary(req,env,{route:'atlas-private',now:Date.now()});
      if (denied) return send(denied.body,denied.status);
    } catch { return send({error:'AUTH_UNAVAILABLE'},503); }
    if (req.method !== 'GET') return send({error:'METHOD_NOT_ALLOWED'},405);
    if (route === 'atlas-operations-ui') {
      const nonce=randomBytes(24).toString('base64');
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('X-Frame-Options','SAMEORIGIN');
      res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'`);
      res.statusCode=200;return res.end(operationsPage(nonce));
    }
    if (route !== 'atlas-operations') return send({error:'NOT_FOUND'},404);
    const view=url.searchParams.get('view') || 'work',rawLimit=url.searchParams.get('limit') || '30';
    const owner=url.searchParams.get('owner'),cursor=url.searchParams.get('cursor');
    if (!['work','campaigns','receipts'].includes(view) || !/^[0-9]{1,3}$/.test(rawLimit)
        || Number(rawLimit)<1 || Number(rawLimit)>100 || (cursor && cursor.length>1024)
        || (owner && !/^[A-Z_]{2,40}$/.test(owner))) return send({error:'OPERATIONAL_QUERY_INVALID'},400);
    try {
      const signal=AbortSignal.timeout(15000),scoped=runtimeEnvironment(env,req.headers);
      const token=await tokenProvider(scoped,signal,{scopes:['https://www.googleapis.com/auth/drive.readonly']});
      let source;
      for (let attempt=0;attempt<2;attempt++) {
        try {source=await readTower({token,signal});break;}
        catch (error) {if(attempt || signal.aborted || error?.message!=='TOWER_READ_RACE') throw error;}
      }
      const value=projectOperations(source.tower,{view,limit:Number(rawLimit),cursor,owner:owner || null});
      return send({...value,integrity:'DRIVE_MD5_AND_REVISION_READBACK'});
    } catch (error) {
      if (error?.code === 'OPERATIONAL_CURSOR_STALE') return send({error:error.code,restart_from_first_page:true},409);
      if (['OPERATIONAL_QUERY_INVALID','OPERATIONAL_CURSOR_INVALID'].includes(error?.code)) return send({error:error.code},400);
      return send({error:'PRIVATE_SOURCE_UNAVAILABLE'},503);
    }
  };
}
