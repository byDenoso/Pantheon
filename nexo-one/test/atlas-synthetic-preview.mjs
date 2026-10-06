import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
// Synthetic end-to-end integration: actual built UI + actual backend handler.
// Only Redis/private-source transports are in-memory fixtures. Local HTTP Origin
// is mapped to the configured HTTPS test origin; production TLS/CDN is not tested.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {scryptSync} from 'node:crypto';
import handler from '../server/handler.mjs';
const pin='synthetic-integration-passphrase',salt='c'.repeat(32),store=new Map();
Object.assign(process.env,{NEXO_ATLAS_ORIGIN:'https://atlas.example',NEXO_ATLAS_PIN_HASH:`scrypt$${salt}$${scryptSync(pin,salt,64).toString('hex')}`,NEXO_ATLAS_REDIS_URL:'https://fixture-store.example',NEXO_ATLAS_REDIS_TOKEN:'synthetic',NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://fixture-source.example',NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic'});
let failDelete=false;const requests=[];
globalThis.fetch=async(url,options={})=>{
  if(String(url)==='https://fixture-source.example/')return Response.json(compilePrivateTowerRuntime(makePrivateTowerFixture()));
  if(String(url)!=='https://fixture-store.example')throw Error('Unexpected upstream');
  const [command,key,...args]=JSON.parse(options.body);let result;
  if(command==='GET')result=store.get(key)||null;
  else if(command==='SET'){store.set(key,args[0]);result='OK';}
  else if(command==='DEL'){if(failDelete)throw Error('synthetic outage');result=Number(store.delete(key));}
  else if(command==='EVAL'){const k=args[1],n=(store.get(k)||0)+1;store.set(k,n);result=n;}
  else throw Error('Unexpected storage command');
  return Response.json({result});
};
let base;const root=path.resolve('dist');
const server=http.createServer(async(req,res)=>{
  requests.push(`${req.method} ${req.url}`);
  if(req.url.startsWith('/api/')){if(req.headers.origin===base)req.headers.origin=process.env.NEXO_ATLAS_ORIGIN;return handler(req,res);}
  try{let pathname=new URL(req.url,'http://local').pathname;if(pathname.endsWith('/'))pathname+='index.html';const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://localhost:${server.address().port}`;

console.log(JSON.stringify({url:base,mode:'SYNTHETIC_ONLY',pin,privateRoute:base+'/#/privado'}));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
