// Read-only synthetic owner, session and Tower adapters for local UI verification.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {makePrivateTowerFixture} from './private-tower.fixture.mjs';
import {memoryFixture} from './memory.fixture.mjs';
import {compilePrivateWorkspaceRuntime,privateWorkspaceTest} from '../../server/atlas/private-workspace.mjs';
import {continuityView} from '../../server/atlas/continuity-view.mjs';
import {memoryRoute} from '../../worker/memory.mjs';

export function progressTowerFixture(){
 const tower=makePrivateTowerFixture(),put=(path,value)=>{tower.files[path]={encoding:'json',value};};
 const work=tower.files['entities/work/WORK-01.json'].value;
 Object.assign(work,{status:'BLOCKED_INPUT',human_action_required:false,human_gate:null,title:'Synthetic blocked campaign work',blocker:'Synthetic dataset unavailable',next_action:'Provide the synthetic dataset',inbox_ref:'SYNTHETIC-INTENT',owner_role:'EXECUTOR'});
 put('entities/work/WORK-02.json',{...work,id:'WORK-02',campaign_id:'CAMPAIGN-02',test_id:'TEST-04',title:'Synthetic independent campaign work',status:'RUNNING',blocker:null,next_action:'Continue the independent synthetic check',inbox_ref:null});
 tower.files['indexes/active-work.json'].value.work.push({id:'WORK-02'});
 put('entities/campaign/CAMPAIGN-01.json',{id:'CAMPAIGN-01',kind:'CAMPAIGN',domain:'OLYMPUS',title:'Synthetic blocked campaign',status:'ACTIVE',question:'Synthetic blocked question'});
 put('entities/campaign/CAMPAIGN-02.json',{id:'CAMPAIGN-02',kind:'CAMPAIGN',domain:'SCIENCE',title:'Synthetic independent campaign',status:'ACTIVE',question:'Synthetic independent question'});
 const first=tower.files['entities/test/TEST-01.json'].value;first.created_at='2026-01-01T00:00:00Z';first.prereg.ref='synthetic-prereg-document';
 put('entities/test/TEST-02.json',{...first,id:'TEST-02',title:'Synthetic dependency',display_name:'Synthetic dependency',created_at:'2026-01-02T00:00:00Z',parents:['TEST-01'],prereg:{},review_state:'NOT_REVIEWED'});
 put('entities/test/CONTEST-TEST-01-1.json',{...first,id:'CONTEST-TEST-01-1',title:'Synthetic contest',display_name:'Synthetic contest',created_at:'2026-01-03T00:00:00Z',contests_test_id:'TEST-01',prereg:{},review_state:'PENDING_REVIEW'});
 put('entities/test/TEST-04.json',{...first,id:'TEST-04',domain:'SCIENCE',semantic:{domain_id:'SCIENCE',subdomain_id:'independent'},campaign_id:'CAMPAIGN-02',roadmap_id:'ROADMAP-02',title:'Synthetic unrelated record',display_name:'Synthetic unrelated record',created_at:'2026-01-04T00:00:00Z',prereg:{},review_state:'NOT_REVIEWED'});
 put('roadmaps/ROADMAP-02.json',{id:'ROADMAP-02',roadmap_id:'ROADMAP-02',campaign_id:'CAMPAIGN-02',title:'Synthetic independent roadmap',domain:'SCIENCE',test_ids:['TEST-04'],status:'ACTIVE'});
 tower.files['roadmaps/ROADMAP-01.json'].value.test_ids.push('TEST-02','CONTEST-TEST-01-1');
 put('evolution/runs.json',{runs:[{run_id:'SYNTHETIC-ATTEMPT',action_id:'WORK-01',status:'FAILED',started_at:'2026-01-05T00:00:00Z',ended_at:'2026-01-05T00:01:00Z',readback_status:'UNVERIFIED'}]});
 put('operations/receipts/synthetic-envelope.json',{contract:'OPERATION_RECEIPT_V1',receipt_id:'SYNTHETIC-RECEIPT',intent_id:'SYNTHETIC-INTENT',payload_sha256:'sha256:'+'a'.repeat(64),effect_id:'envelope-synthetic',outcome:'APPLIED',stage:'APPLIED',observed_at:'2026-01-05T00:00:00Z',source_revision:tower.revision,result_revision:tower.revision});
 tower.file_count=Object.keys(tower.files).length;return tower;
}

export async function startPrivateUiServer({privateDir=process.env.PRIVATE_PREMIUM_UI_DIR||'server/private-ui'}={}){
 const tower=progressTowerFixture(),runtime=compilePrivateWorkspaceRuntime(tower),memory=memoryFixture();
 const control={authenticated:false,sourceError:null,continuityError:null,sourceReads:0,writes:0,grantWrites:0};
 const body=async req=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString()||'{}');};
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),json=(value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
   if(url.pathname==='/api/atlas-access')return json({signedIn:true,owner:true,setupRequired:false});
   if(url.pathname==='/api/atlas-session'){
    if(req.method==='DELETE')control.authenticated=false;
    if(req.method==='POST')control.authenticated=(await body(req)).pin==='synthetic-demo-only';
    return json({configured:true,authenticated:control.authenticated,expiresAt:control.authenticated?new Date(Date.now()+3600000).toISOString():null});
   }
   if(url.pathname==='/api/atlas-private'){control.sourceReads++;return control.sourceError?json(control.sourceError,503):json(runtime);}
   if(url.pathname==='/api/atlas-private/test'){const result=privateWorkspaceTest(tower,await body(req));return json(result.body,result.status);}
   if(url.pathname==='/api/atlas-private/continuity')return control.continuityError?json(control.continuityError,503):json(continuityView(tower,await body(req)));
   if(url.pathname==='/api/atlas-private/autonomy')return json({error:'PRIVATE_SOURCE_UNAVAILABLE',connectorStatus:'MCPbinding_unavailable'},503);
   if(url.pathname==='/api/atlas-locale')return json({contract:'ATLAS_LOCALE_V1',locale:url.searchParams.get('lang')||'pt-BR',source:'preference',supported:['pt-BR','en']});
   if(url.pathname==='/api/atlas-public')return json({contract:'ATLAS_PUBLIC_V1',items:[],links:[]});
   if(url.pathname==='/api/atlas-mcp/grant'){if(req.method!=='GET')control.grantWrites++;return json({active:false,approvalEnabled:false,role:'LEARNER',scope:'tower-scientific-current-readonly-v13'});}
   if(url.pathname.startsWith('/api/atlas-memory/')){const result=await memoryRoute(url.pathname,await body(req),async()=>memory);return json(result.body,result.status);}
   if(url.pathname.startsWith('/api/atlas-retrieval/'))return json({error:'RETRIEVAL_UNAVAILABLE'},503);
   if(url.pathname.startsWith('/api/atlas-knowledge/'))return json({error:'KNOWLEDGE_UNAVAILABLE'},503);
   if(req.method!=='GET'){control.writes++;return json({error:'SYNTHETIC_BROWSER_WRITE_DISABLED'},403);}
   let root='dist/client',path=url.pathname==='/'?'index.html':url.pathname.slice(1);
   if(url.pathname==='/api/atlas-private-ui'){root=privateDir;path='index.html';}
   else if(url.pathname.startsWith('/api/atlas-private-assets/')){root=privateDir;path=url.pathname.replace('/api/atlas-private-assets/','');}
   if(!/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path)){res.statusCode=404;return res.end();}
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(await readFile(resolve(root,path)));
  }catch{res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {origin:`http://127.0.0.1:${server.address().port}`,control,runtime,tower,close:()=>new Promise(resolve=>server.close(resolve))};
}
