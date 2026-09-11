import {driveRoute,DRIVE_SSOT_META} from '../lib/drive-ssot.mjs';

function urlOf(req){return new URL(req.url||'/','https://atlas.local')}
function routeOf(req){const u=urlOf(req);return u.searchParams.get('route')||u.pathname.split('/').filter(Boolean).pop()||'health'}
function queryOf(req){const u=urlOf(req),q=Object.fromEntries(u.searchParams);delete q.route;return q}
function sendJson(res,value,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=300');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Atlas-Authority','GOOGLE_DRIVE');return res.end(JSON.stringify(value))}

export default async function handler(req,res){
 const route=routeOf(req),query=queryOf(req),method=String(req.method||'GET').toUpperCase();
 if(method!=='GET')return sendJson(res,{ok:false,error:'READ_ONLY_DRIVE_SSOT',authority:'GOOGLE_DRIVE',sourceFileId:DRIVE_SSOT_META.sourceFileId},405);
 try{return sendJson(res,await driveRoute(route,query,{method}))}
 catch(error){
  const message=String(error?.message||error);
  const status=message.startsWith('DRIVE_ROUTE_UNSUPPORTED')?404:500;
  return sendJson(res,{ok:false,error:message,authority:'GOOGLE_DRIVE',projectionOnly:true},status);
 }
}
