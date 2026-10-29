import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,extname} from 'node:path';
import {atlasStore} from '../../nexo-one/server/auth/atlas-session.mjs';
import {createVercelPrivate} from '../worker/vercel-private.mjs';

const root=resolve(import.meta.dirname,'private-ui');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
async function asset(name){
  const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
  if(manifest.contract!=='ATLAS_PRIVATE_ASSETS_V1'||!Object.hasOwn(manifest.files,name))return null;
  const bytes=await readFile(resolve(root,name));
  if(createHash('sha256').update(bytes).digest('hex')!==manifest.files[name]||!types[extname(name)])throw Error('PRIVATE_ASSET_INVALID');
  return {bytes,type:types[extname(name)]};
}
export default async function vercelHandler(req,res,path){
  try {
    const env=process.env;
    const input=req.body===undefined?null:Buffer.isBuffer(req.body)?req.body:typeof req.body==='string'?req.body:JSON.stringify(req.body);
    const url=new URL(req.url,'https://nexo-one-two.vercel.app');
    url.pathname=path;url.searchParams.delete('route');url.searchParams.delete('asset');
    const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:input})});
    const handle=createVercelPrivate({store:atlasStore(env),asset});
    const response=await handle(request,env);
    res.statusCode=response.status;
    for(const [name,value] of response.headers)if(name!=='set-cookie')res.setHeader(name,value);
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {res.statusCode=503;res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'AUTH_UNAVAILABLE'}));}
}
