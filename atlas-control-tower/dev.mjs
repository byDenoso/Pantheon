import http from 'node:http';import fs from 'node:fs';import handler from './api/atlas.js';
import projectionHandler from './api/projection.js';
import {frontendFiles} from './frontend-files.mjs';
const allowed={'/':'index.html',...Object.fromEntries(frontendFiles.map(f=>['/'+f,f]))};

/** Local-only projection fixture.
 *  The Neon Data API is reached with a Vercel OIDC token that exists only inside
 *  a deployment, so a laptop cannot read the real tables. Point ATLAS_DEV_FIXTURE
 *  at a JSON bundle of real rows and the projection is assembled from those,
 *  through the exact builders production uses. It is a rendering harness, not a
 *  fallback: this file never ships, and the deployed endpoint has no fixture
 *  path, so production can never quietly serve recorded data as if it were live. */
const FIXTURE=process.env.ATLAS_DEV_FIXTURE||'';
async function devProjection(req,res){
 if(!FIXTURE||!fs.existsSync(FIXTURE))return projectionHandler(req,res);
 const url=new URL(req.url,'http://localhost'),query=Object.fromEntries(url.searchParams);
 // The contract description is not fixture data; let the real handler answer it
 // so the harness cannot disagree with production about the contract.
 if(query.describe==='1')return projectionHandler(req,res);
 const {buildScience,buildExecution,buildIntegrity,composeProjections,applyView,parseLayers}=await import('./lib/projections.mjs');
 const bundle=JSON.parse(fs.readFileSync(FIXTURE,'utf8'));
 const rows=o=>Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[k,v==null?(k==='recordCounts'||k==='projection'?{}:[]):v]));
 const {layers,unknown}=parseLayers(query.layers||query.layer,'science');
 const build={science:()=>buildScience(rows(bundle.science)),execution:()=>buildExecution(rows(bundle.execution)),
  integrity:()=>buildIntegrity({...rows(bundle.integrity),projection:{generatedAt:new Date().toISOString()}})};
 const payload=applyView(composeProjections(layers.map(id=>build[id]())),query);
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.end(JSON.stringify({...payload,requested:layers,unknownLayers:unknown,degraded:[],devFixture:true}));
}

http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/projection')return devProjection(req,res);
 if(url.pathname.startsWith('/api/'))return handler(req,res);
 const p=allowed[url.pathname];if(!p||!fs.existsSync(p)){res.writeHead(404);return res.end('Not found')}
 res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.mjs')?'text/javascript':'text/html');
 res.end(fs.readFileSync(p));
}).listen(3000,'0.0.0.0',()=>console.log('Atlas :3000'+(FIXTURE?' · projeção a partir de '+FIXTURE:'')));
