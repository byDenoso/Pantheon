import {cosmologyPublicProjection} from './public-cosmology.mjs';
import studyRoutes from '../src/atlas/publicStudyRoutes.json' with {type:'json'};
import {publicEditorialProjection} from './public-editorial.mjs';
import publicPublicationHistory from './public-publication.json' with {type:'json'};
import {readPublicSnapshot} from './public-response-cache.mjs';
import {campaignPublicProjection} from './public-campaigns.mjs';
import {visualPublicProjection} from './public-visuals.mjs';
import {configured, database, readSession, sessionBinding, sameOrigin, sessionRoute} from './auth.mjs';
import {readPrivate} from './source.mjs';
import {classifySourceFailure} from './source-errors.mjs';
import {privateWorkspaceTest} from '../server/atlas/private-workspace.mjs';
import {atlasLocale} from '../server/atlas/locale.mjs';
import {encodePrivateStream} from '../server/atlas/json-stream.mjs';
import privateAssets from '../.sites-runtime/private-assets.mjs';
import {ownerAccess, setupPin} from './owner.mjs';
import {publicAtlasProjection} from './public-tests.mjs';
import {memoryRoute, readMemorySource} from './memory.mjs';
import {knowledgeRoute} from './knowledge.mjs';
import {faithfulRetrievalRoute} from './retrieval/route.mjs';
import {sourceSyncRoute} from './retrieval/sync-route.mjs';
import {readonlyMcpRoute} from './mcp/route.mjs';
import {mcpGrantRoute} from './mcp/grants.mjs';
import {privateWriterOperations} from '../server/atlas/private-writer-status.mjs';
import {privateAutonomyView} from '../server/atlas/private-autonomy.mjs';
import {normalizePrivateTower} from '../server/atlas/private-tower-input.mjs';
import {verifyActionsIdentity} from './autonomy/identity.mjs';
import {postDecision, listWriterDecisions, readWriterDecision, revokeProposal, proposalHash} from './autonomy/outbox.mjs';

import {continuityView,readContinuitySource} from '../server/atlas/continuity-view.mjs';

const SECURITY = {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  Vary: 'Cookie, Authorization, Origin',
};
const json = (body, status = 200, extra = {}) => Response.json(body, {status, headers: {...SECURITY, ...extra}});
const PRIVATE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
// Public publication dates become visible when their reviewed timestamp passes.
// Cache only the static reviewed catalog, and retain that temporal boundary.
const publicationBoundaries=[...new Set(Object.values(publicPublicationHistory.records)
  .flatMap(record=>[record.published_at,record.updated_at])
  .filter(value=>typeof value==='string').map(value=>Date.parse(value)).filter(Number.isFinite))].sort((a,b)=>a-b);
async function smallBody(request, limit = 1024) {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('REQUEST_BODY_TOO_LARGE');
  const reader = request.body?.getReader(), decoder = new TextDecoder(); let raw = '', size = 0;
  if (reader) for (;;) {const {done, value} = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) {await reader.cancel(); throw new Error('REQUEST_BODY_TOO_LARGE');} raw += decoder.decode(value, {stream: true});}
  raw += decoder.decode();
  const body = raw ? JSON.parse(raw) : {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_JSON');
  return body;
}
function acceptsGzip(request) {
  let explicit=null,wildcard=null;
  for(const part of (request.headers.get('accept-encoding')||'').split(',')){
    const [rawName,...params]=part.trim().toLowerCase().split(';'),name=rawName.trim();
    if(name!=='gzip'&&name!=='*')continue;
    const q=params.length===0?1:params.length===1&&/^\s*q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.test(params[0])?Number(params[0].trim().slice(2)):0;
    if(name==='gzip')explicit=explicit===null?q:Math.min(explicit,q);
    else wildcard=wildcard===null?q:Math.min(wildcard,q);
  }
  return (explicit??wildcard??0)>0;
}
// Source reads and encoding may take time. Re-read the pinned owner and current
// PIN credential as well as the session before returning any private bytes.
async function stillAuthorized(request, env) {
  const current = await ownerAccess(request, env);
  return current.owner && configured(current.env) && await readSession(request, current.env);
}

export function createWorker({readSource = readPrivate, readMemory = readMemorySource, readContinuity = readContinuitySource, assets = privateAssets, verifyWriterIdentity = verifyActionsIdentity} = {}) {
  let sourceBusy = false;
  let publicSnapshot = null;
  return {async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (path === '/mcp') {
      if(sourceBusy)return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503,{'Retry-After':'3'});
      sourceBusy=true;
      try{return await readonlyMcpRoute(request,env,ctx?.props?.CONNECTORS);}
      finally{sourceBusy=false;}
    }
    // Match full route paths only. Neither ?route= nor legacy alias parameters
    // can route around the private boundary.
    if (path.startsWith('/api/')) {
      if (path === '/api/atlas-public') {
        if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
        const observedAt=Date.now();
        publicSnapshot=readPublicSnapshot(()=>cosmologyPublicProjection(visualPublicProjection(publicEditorialProjection(campaignPublicProjection(publicAtlasProjection())))),publicSnapshot,publicationBoundaries,observedAt);
        // This closure holds reviewed public JSON only. Visitor identity, connector
        // context and every private API stay outside this cache and remain no-store.
        return new Response(publicSnapshot.body,{headers:{...SECURITY,'Content-Type':'application/json'}});
      }
      if (path === '/api/atlas-locale') return request.method === 'GET' ? json(atlasLocale({url: request.url, headers: Object.fromEntries(request.headers)}, {}), 200, {Vary: 'Accept-Language'}) : json({error: 'METHOD_NOT_ALLOWED'}, 405);
      // Approved trust is limited to these exact read-only outbox paths. It never
      // enters the owner/PIN path and cannot authorize any other API or MCP tool.
      if (path === '/api/autonomy-writer/decisions' || /^\/api\/autonomy-writer\/decisions\/[a-f0-9]{64}$/.test(path)) {
        if (url.origin !== 'https://nexoresearch.org') return json({error:'ORIGIN_NOT_ALLOWED'},403);
        if (request.method !== 'GET') return json({error:'METHOD_NOT_ALLOWED'},405);
        if (url.search) return json({error:'INVALID_QUERY'},400);
        if (!await verifyWriterIdentity(request)) return json({error:'WRITER_IDENTITY_REQUIRED'},403);
        try {
          const options={db:database(env)};
          const value=path==='/api/autonomy-writer/decisions' ? await listWriterDecisions(request,options)
            : await readWriterDecision(request,path.slice('/api/autonomy-writer/decisions/'.length),options);
          return json(value);
        } catch {return json({error:'AUTONOMY_OUTBOX_UNAVAILABLE'},503);}
      }
      let access;
      try {access = await ownerAccess(request, env);} catch {return json({error: 'AUTH_UNAVAILABLE'}, 503);}
      if (path === '/api/atlas-access') return request.method === 'GET' ? json({signedIn: access.signedIn, owner: access.owner, setupRequired: access.setupRequired}) : json({error: 'METHOD_NOT_ALLOWED'}, 405);
      if (!access.owner) return json({error: 'AUTH_REQUIRED'}, 401);
      if (path === '/api/atlas-pin/setup') {
        if (request.method !== 'POST') return json({error: 'METHOD_NOT_ALLOWED'}, 405);
        try {
          const decision = await setupPin(request, env, access, await smallBody(request));
          return json(decision.body, decision.status, decision.setCookie ? {'Set-Cookie': decision.setCookie} : {});
        } catch (error) {return json({error: error?.message === 'REQUEST_BODY_TOO_LARGE' ? 'REQUEST_BODY_TOO_LARGE' : 'PIN_SETUP_UNAVAILABLE'}, error?.message === 'REQUEST_BODY_TOO_LARGE' ? 413 : 503);}
      }
      env = access.env;
      if (path === '/api/atlas-session') {
        try {
          let body = {};
          if (request.method === 'POST') {
            try {body = await smallBody(request);} catch(error) {return json({error: error?.message === 'REQUEST_BODY_TOO_LARGE' ? 'REQUEST_BODY_TOO_LARGE' : 'INVALID_JSON'}, error?.message === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400);}
          }
          const decision = await sessionRoute(request, env, body);
          return json(decision.body, decision.status, {...(decision.setCookie ? {'Set-Cookie': decision.setCookie} : {}), ...(decision.status === 429 ? {'Retry-After': String(decision.body.retryAfter)} : {})});
        } catch {return json({error: 'AUTH_UNAVAILABLE'}, 503);}
      }
      try {if (!configured(env) || !await readSession(request, env)) return json({error: 'AUTH_REQUIRED'}, 401);}
      catch {return json({error: 'AUTH_UNAVAILABLE'}, 503);}
      if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request)) return json({error: 'ORIGIN_NOT_ALLOWED'}, 403);
      if (path === '/api/atlas-mcp/grant') {
        try {
          let body={};
          if(request.method==='POST') {
            if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'JSON_REQUIRED'},415);
            try{body=await smallBody(request);}catch(error){return json({error:error.message==='REQUEST_BODY_TOO_LARGE'?'REQUEST_BODY_TOO_LARGE':'INVALID_JSON'},error.message==='REQUEST_BODY_TOO_LARGE'?413:400);}
          }
          const result=await mcpGrantRoute(request,env,body);
          return json(result.body,result.status);
        }catch(error){return json({error:'MCP_GRANT_UNAVAILABLE'},error.httpStatus||503);}
      }
      if (path === '/api/atlas-retrieval/search' || path === '/api/atlas-retrieval/sync') {
        if (request.method !== 'POST') return json({error:'METHOD_NOT_ALLOWED'},405);
        if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') return json({error:'JSON_REQUIRED'},415);
        if (sourceBusy) return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503,{'Retry-After':'3'});
        sourceBusy = true;
        try {
          let body;
          try {body = await smallBody(request,path.endsWith('/sync')?1024:16384);} catch (error) {return json({error:error?.message==='REQUEST_BODY_TOO_LARGE'?'REQUEST_BODY_TOO_LARGE':'INVALID_JSON'},error?.message==='REQUEST_BODY_TOO_LARGE'?413:400);}
          const result = path.endsWith('/sync')
            ? await sourceSyncRoute(request,env,body,ctx?.props?.CONNECTORS)
            : await faithfulRetrievalRoute(request,env,body,ctx?.props?.CONNECTORS);
          return json(result.body,result.status);
        } catch {return json({error:'RETRIEVAL_UNAVAILABLE',available:false},503);}
        finally {sourceBusy = false;}
      }
      if (path === '/api/atlas-memory/browse' || path === '/api/atlas-memory/propose' || path === '/api/atlas-memory/apply' || path === '/api/atlas-knowledge/query') {
        if (request.method !== 'POST') return json({error: 'METHOD_NOT_ALLOWED'}, 405);
        if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') return json({error: 'JSON_REQUIRED'}, 415);
        if (sourceBusy) return json({error: 'PRIVATE_SOURCE_UNAVAILABLE'}, 503, {'Retry-After': '3'});
        sourceBusy = true;
        try {
          let body;
          try {body = await smallBody(request, 16384);} catch (error) {return json({error: error?.message === 'REQUEST_BODY_TOO_LARGE' ? 'REQUEST_BODY_TOO_LARGE' : 'INVALID_JSON'}, error?.message === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400);}
          const read = () => readMemory({binding: ctx?.props?.CONNECTORS, request});
          const result = path === '/api/atlas-knowledge/query' ? await knowledgeRoute(body, read) : await memoryRoute(path, body, read);
          // Revalidate after the upstream read: an expired/revoked session must not receive its result.
          if (!await stillAuthorized(request, env)) return json({error: 'AUTH_REQUIRED'}, 401);
          return json(result.body, result.status);
        } catch {return json({error: 'MEMORY_SOURCE_UNAVAILABLE'}, 503);}
        finally {sourceBusy = false;}
      }
      if (path === '/api/atlas-private/test') {
        if (request.method !== 'POST') return json({error:'METHOD_NOT_ALLOWED'},405);
        if ((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json') return json({error:'JSON_REQUIRED'},415);
        let body;try{body=await smallBody(request,2048);}catch{return json({error:'PRIVATE_TEST_REQUEST_INVALID'},400);}
        if (Object.keys(body).some(key=>!['id','expected_revision'].includes(key)) || typeof body.id!=='string'||!body.id.trim()||body.id.length>512||typeof body.expected_revision!=='string'||!/^sha256:[a-f0-9]{64}$/.test(body.expected_revision)) return json({error:'PRIVATE_TEST_REQUEST_INVALID'},400);
        if(sourceBusy)return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503,{'Retry-After':'3'});
        sourceBusy=true;
        try {
          const tower=await readMemory({binding:ctx?.props?.CONNECTORS,request});
          const result=privateWorkspaceTest(tower,body);
          const encoded=result.status===200 ? await encodePrivateStream(result.body) : null;
          if(!await stillAuthorized(request,env))return json({error:'AUTH_REQUIRED'},401);
          return encoded ? new Response(encoded.bytes,{encodeBody:'manual',headers:{...SECURITY,'Content-Type':'application/json; charset=utf-8',...(encoded.encoding?{'Content-Encoding':encoded.encoding}:{})}}) : json(result.body,result.status);
        }catch{return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503);}
        finally{sourceBusy=false;}
      }
      if (path === '/api/atlas-private/continuity') {
        if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
        if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'JSON_REQUIRED'},415);
        let body;try{body=await smallBody(request,2048);}catch{return json({error:'CONTINUITY_REQUEST_INVALID'},400);}
        if(sourceBusy)return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503,{'Retry-After':'3'});
        sourceBusy=true;
        try {
          const tower=await readContinuity({binding:ctx?.props?.CONNECTORS,request});
          const result=continuityView(tower,body);
          if(!await stillAuthorized(request,env))return json({error:'AUTH_REQUIRED'},401);
          return json(result);
        }catch(error){return json({error:error.status?error.message:'PRIVATE_SOURCE_UNAVAILABLE',available:false},error.status||503);}
        finally{sourceBusy=false;}
      }
      if (path === '/api/atlas-private/autonomy/decisions') {
        if (request.method !== 'POST') return json({error:'METHOD_NOT_ALLOWED'},405);
        if (url.search) return json({error:'INVALID_QUERY'},400);
        if (sourceBusy) return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503,{'Retry-After':'3'});
        sourceBusy=true;
        try {
          const getBinding=async (req,currentEnv,now) => {
            const current=await ownerAccess(req,currentEnv);
            if(!current.owner)return null;
            const session=await sessionBinding(req,current.env,now);
            return session?{...session,userId:current.userId}:null;
          };
          const value=await postDecision(request,env,{db:database(env),getBinding,
            readCanonical:async()=>{const tower=await readMemory({binding:ctx?.props?.CONNECTORS,request});normalizePrivateTower(tower);return tower;},
            // No activation proposal exists until all real prerequisite receipts
            // have been reviewed. A client cannot supply its own checks or proof.
            preparedApproval:async()=>null});
          return json(value,202);
        } catch(error) {
          const code=error?.message;
          if(code==='AUTH_REQUIRED')return json({error:code},401);
          if(code==='BODY_TOO_LARGE')return json({error:code},413);
          if(['EXACT_PROPOSAL_CONFIRMATION_REQUIRED','PROPOSAL_NOT_PREPARED','PROPOSAL_EXPIRED'].includes(code))return json({error:code},409);
          if(['JSON_POST_REQUIRED','DECISION_FIELDS','HUMAN_PROPOSAL_INVALID','PAYLOAD_INVALID','ACTION_INVALID','ACTIVATION_RECEIPT_INVALID'].includes(code)||String(code).startsWith('ENVELOPE_'))return json({error:'AUTONOMY_REQUEST_INVALID'},400);
          return json({error:'AUTONOMY_DECISION_UNAVAILABLE'},503);
        } finally {sourceBusy=false;}
      }
      if (path === '/api/atlas-private/autonomy') {
        if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
        if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'JSON_REQUIRED'},415);
        let body;try{body=await smallBody(request,1024);}catch{return json({error:'AUTONOMY_REQUEST_INVALID'},400);}
        if(Object.keys(body).length)return json({error:'AUTONOMY_REQUEST_INVALID'},400);
        if(sourceBusy)return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503,{'Retry-After':'3'});
        sourceBusy=true;
        try {
          const tower=await readMemory({binding:ctx?.props?.CONNECTORS,request});
          const result=privateAutonomyView(tower);
          if(!await stillAuthorized(request,env))return json({error:'AUTH_REQUIRED'},401);
          return json(result);
        }catch{return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503);}
        finally{sourceBusy=false;}
      }
      if (path === '/api/atlas-private/operations') {
        if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
        if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'JSON_REQUIRED'},415);
        let body;try{body=await smallBody(request,2048);}catch{return json({error:'WRITER_STATUS_REQUEST_INVALID'},400);}
        if(Object.keys(body).some(key=>!['intent_id','expected_revision','limit'].includes(key)))return json({error:'WRITER_STATUS_REQUEST_INVALID'},400);
        if(sourceBusy)return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503,{'Retry-After':'3'});
        sourceBusy=true;
        try {
          const tower=await readMemory({binding:ctx?.props?.CONNECTORS,request});
          const result=privateWriterOperations(tower,body);
          if(!await stillAuthorized(request,env))return json({error:'AUTH_REQUIRED'},401);
          return json(result.body,result.status);
        }catch{return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503);}
        finally{sourceBusy=false;}
      }
      if (path === '/api/atlas-private') {
        if (request.method !== 'POST') return json({error: 'METHOD_NOT_ALLOWED'}, 405);
        if ((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json') return json({error:'JSON_REQUIRED'},415);
        if (sourceBusy) return json({error: 'PRIVATE_SOURCE_UNAVAILABLE', recovery:'RETRY_SOURCE', retryAfter:3}, 503, {'Retry-After': '3'});
        sourceBusy = true;
        try {
          let body;try{body=await smallBody(request,1024);}catch{return json({error:'PRIVATE_REQUEST_INVALID'},400);}
          if(Object.keys(body).some(key=>key!=='profile') || body.profile!==undefined&&body.profile!=='workspace-v1')return json({error:'PRIVATE_REQUEST_INVALID'},400);
          const value = await readSource(env, fetch, {binding: ctx?.props?.CONNECTORS, request,profile:body.profile});
          const encoded = await encodePrivateStream(value);
          if (!await stillAuthorized(request, env)) return json({error: 'AUTH_REQUIRED'}, 401);
          // Bytes are already gzip-encoded. Cloudflare otherwise applies gzip
          // again, leaving compressed bytes after the browser decodes once.
          return new Response(encoded.bytes, {encodeBody: 'manual', headers: {...SECURITY, 'Content-Type': 'application/json; charset=utf-8', Vary: 'Cookie, Authorization, Origin, Accept-Encoding', ...(encoded.encoding ? {'Content-Encoding': encoded.encoding} : {})}});
        } catch (error) {
          // A failed read can race with logout/credential rotation just like a
          // successful read. Do not report a protected source state to a revoked session.
          try {if(!await stillAuthorized(request,env))return json({error:'AUTH_REQUIRED'},401);}
          catch {return json({error:'AUTH_UNAVAILABLE'},503);}
          const failure=classifySourceFailure(error);
          console.error('ATLAS_PRIVATE_FAILURE', JSON.stringify({code:failure.diagnostic,
            ...(failure.connectorStatus?{connectorStatus:failure.connectorStatus}:{})}));
          return json(failure,503,failure.retryAfter?{'Retry-After':String(failure.retryAfter)}:{});
        }
        finally {sourceBusy = false;}
      }
      if (path === '/api/atlas-private-ui' || path.startsWith('/api/atlas-private-assets/')) {
        if (!['GET', 'HEAD'].includes(request.method)) return json({error: 'METHOD_NOT_ALLOWED'}, 405);
        const name = path === '/api/atlas-private-ui' ? 'index.html' : path.slice('/api/atlas-private-assets/'.length);
        if (!Object.hasOwn(assets, name)) return json({error: 'NOT_FOUND'}, 404);
        const asset = assets[name];
        const compressed = Boolean(asset.gzipBase64) && acceptsGzip(request);
        let body = null;
        if (request.method !== 'HEAD') {
          const bytes = Buffer.from(asset.gzipBase64 || asset.base64, 'base64');
          body = asset.gzipBase64 && !compressed
            ? new Response(bytes).body.pipeThrough(new DecompressionStream('gzip')) : bytes;
        }
        return new Response(body, {encodeBody: 'manual', headers: {...SECURITY,
          Vary: SECURITY.Vary + ', Accept-Encoding', ...(compressed ? {'Content-Encoding': 'gzip'} : {}),
          'Content-Type': asset.type, 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': PRIVATE_CSP}});
      }
      return json({error: 'NOT_FOUND'}, 404);
    }
    // Explicit public asset root. Server modules, fixtures, private assets and
    // arbitrary source paths are never passed through the static asset binding.
    if (!['GET', 'HEAD'].includes(request.method)) return json({error: 'METHOD_NOT_ALLOWED'}, 405);
    const studyPath=studyRoutes[url.searchParams.get('pergunta')];
    if ((path==='/'||path==='/index.html') && studyPath) return new Response(null,{status:301,headers:{...SECURITY,Location:studyPath}});
    if (Object.values(studyRoutes).includes(path.replace(/\/$/,'')) || path === '/' || path === '/index.html' || /^\/(?:privado|private)\/?$/.test(path)) {
      const response = await env.ASSETS.fetch(new Request(new URL('/', url), request));
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries({...SECURITY, 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': PRIVATE_CSP + "; frame-src 'self'; object-src 'none'"})) headers.set(key, value);
      return new Response(response.body, {status: response.status, headers});
    }
    const extraPublic = new Set(['/metodo.html', '/publicacoes.html', '/site-config.json', '/publications.json', '/robots.txt', '/sitemap.xml', '/assets/fonts/nexo-barlow-medium.ttf', '/assets/fonts/nexo-barlow-regular.ttf', '/assets/fonts/nexo-nunito-black.ttf', '/assets/fonts/FONT-LICENSES.txt']);
    if (extraPublic.has(path)) return env.ASSETS.fetch(request);
    if (/^\/assets\/[A-Za-z0-9_.-]+$/.test(path)) return env.ASSETS.fetch(request);
    return new Response('Not found', {status: 404, headers: SECURITY});
  }};
}
export default createWorker();
