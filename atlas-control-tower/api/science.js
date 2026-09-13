import {readGithubAuthority} from '../lib/github-authority.mjs';
import {loadGithubCanonical} from '../lib/github-canonical-runtime.mjs';
import {loadDriveGithubScience,projectDriveGithubScience} from '../lib/drive-github-science.mjs';

function urlOf(req){return new URL(req.url||'/','https://atlas.local')}
function routeOf(req){const u=urlOf(req);return u.searchParams.get('route')||u.pathname.split('/').filter(Boolean).pop()||'graph'}
function queryOf(req){const u=urlOf(req),q=Object.fromEntries(u.searchParams);delete q.route;return q}
function sendJson(res,value,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Atlas-Authority','GITHUB');res.setHeader('X-Atlas-Projection','GOOGLE_DRIVE');return res.end(JSON.stringify(value))}

export function assertScienceProjectionAuthorized(authority){
 const projection=authority?.scienceProjection;
 if(authority?.authority!=='GITHUB'||projection?.kind!=='GOOGLE_DRIVE'||projection?.schema!=='nexo-science-drive-github-v1'||projection?.transportPath!=='atlas-control-tower/data/science-drive-projection.json'||projection?.role!=='PROJECTION_ONLY')throw new Error('SCIENCE_PROJECTION_NOT_AUTHORIZED');
 return projection;
}

export default async function handler(req,res){
 const method=String(req.method||'GET').toUpperCase(),route=routeOf(req),query=queryOf(req);
 if(method==='OPTIONS'){res.statusCode=204;return res.end()}
 if(method!=='GET'||!['graph','state','entity'].includes(route))return sendJson(res,{ok:false,error:'METHOD_OR_ROUTE_NOT_ALLOWED',authority:'GITHUB'},405);
 try{
  const authority=await readGithubAuthority({signal:req.signal});
  const scienceProjection=assertScienceProjectionAuthorized(authority);
  const [science,genericState]=await Promise.all([Promise.resolve(loadDriveGithubScience()),loadGithubCanonical({signal:req.signal})]);
  const value=projectDriveGithubScience(science,route,query,{genericState});
  return sendJson(res,{...value,scienceProjection});
 }catch(error){
  console.error('[atlas:drive-github-science]',route,String(error?.message||error));
  return sendJson(res,{ok:false,error:'DRIVE_GITHUB_SCIENCE_UNAVAILABLE',detail:String(error?.message||error).slice(0,180),authority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE',lastValidPreserved:true},500);
 }
}
