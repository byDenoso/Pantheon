// Local synthetic UI verification; no credentials or real private records.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {memoryRoute} from '../worker/memory.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
const input=makePrivateTowerFixture(),tower=memoryFixture();
for(const [path,value] of Object.entries({
 'contracts/OLYMPUS_DOMAIN_ROUTING_V1.json':{owner_domain:'OLYMPUS',domain_surface:'02_DOMAINS/Bodybuilding/'},
 'entities/interdomain/SURFACE.json':{id:'SURFACE',source_domains:['Bodybuilding'],target_domains:['Bodybuilding']},
 'evolution/board.json':{posts:[
  {id:'ROOT',at:'2025-12-31T12:00:00Z',from:'ENGINEER',to:'EXECUTOR',text:'Synthetic exact canonical board question',refs:['TEST-01'],private:true},
  {id:'REPLY',at:'2025-12-31T13:00:00Z',from:'EXECUTOR',to:'ENGINEER',text:'Synthetic exact canonical board answer',reply_to:'ROOT',refs:[],private:true},
  {id:'EXPIRED',at:'2025-12-30T12:00:00Z',expires_at:'2025-12-31T12:00:00Z',from:'LEARNER',to:'ENGINEER',text:'Synthetic expired private message',refs:[],private:true},
 ]},
}))input.files[path]={encoding:'json',value};
input.file_count=Object.keys(input.files).length;
input.files['entities/test/TEST-01.json'].value.created_at='2025-01-01T00:00:00Z';
for (let i=2;i<=8;i++) input.files[`entities/test/SYNTH-${i}.json`]={encoding:'json',value:{id:`SYNTH-${i}`,kind:'TEST',domain:i%2?'ENGINEERING':'COSMOLOGY',display_name:`Synthetic timeline test ${i}`,question:`Synthetic test ${i}?`,created_at:`2025-0${i}-01T00:00:00Z`,status:'CHECKPOINTED',private:true,method:'Synthetic fixture only',result_meaning:'Synthetic result'}};
input.file_count=Object.keys(input.files).length;
const runtime=compilePrivateTowerRuntime(input);
let authenticated=false;

const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(u.pathname==='/api/atlas-access')return json({signedIn:true,owner:true,setupRequired:false});
 if(u.pathname==='/api/atlas-session'){
 if(req.method==='DELETE')authenticated=false;
 if(req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');authenticated=body.pin==='synthetic-demo-only';if(!authenticated){res.statusCode=401;return json({error:'UNAUTHORIZED'});}}
 return json({configured:true,authenticated,expiresAt:authenticated?new Date(Date.now()+3600000).toISOString():null});
 }
 if((u.pathname==='/api/atlas-private'||u.pathname==='/api/atlas-private-ui'||u.pathname.startsWith('/api/atlas-private-assets/'))&&!authenticated){res.statusCode=401;return json({error:'UNAUTHORIZED'});}
 if(u.pathname==='/api/atlas-private')return json(runtime);
 if(u.pathname==='/api/atlas-public')return json(publicAtlasProjection());
 if(u.pathname==='/api/atlas-locale')return json({contract:'ATLAS_LOCALE_V1',locale:u.searchParams.get('lang')||'pt-BR',source:'preference',supported:['pt-BR','en']});
 if(u.pathname.startsWith('/api/atlas-memory/')){const chunks=[];for await(const c of req)chunks.push(c);const result=await memoryRoute(u.pathname,JSON.parse(Buffer.concat(chunks).toString()||'{}'),async()=>tower);res.statusCode=result.status;return json(result.body);}
 if(u.pathname.startsWith('/api/atlas-knowledge/')){res.statusCode=503;return json({error:'KNOWLEDGE_UNAVAILABLE'});}
 let root='dist/client',path=u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(u.pathname==='/api/atlas-private-ui'){root='server/private-ui';path='index.html';}
 else if(u.pathname.startsWith('/api/atlas-private-assets/')){root='server/private-ui';path=u.pathname.replace('/api/atlas-private-assets/','');}
 if(!/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path)){res.statusCode=404;return res.end();}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'})[extname(path)]||'application/octet-stream');res.end(await readFile(resolve(root,path)));}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
console.log('SYNTHETIC PREVIEW ONLY: '+origin+'/#/teia');
console.log('Fictional fixture PIN: synthetic-demo-only. No real account, data, or identity verification.');
