import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/atlas.js';

const ok = data => ({ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)});

function responseSink(){
 let body='';
 return {
  res:{
   statusCode:200,
   headers:{},
   setHeader(k,v){this.headers[k]=v},
   end(chunk=''){body+=String(chunk)}
  },
  body:()=>body
 };
}

test('system:OLYMPUS detects people and their current state from the olympus schema', async t => {
 const originalFetch=global.fetch;
 t.after(()=>{global.fetch=originalFetch});
 global.fetch=async (url,options={}) => {
  const profile=options.headers?.['Accept-Profile'];
  const table=decodeURIComponent(new URL(url).pathname.split('/').pop());
  if(profile==='science_v1') return ok([]);
  if(profile==='olympus'&&table==='people') return ok([
   {person_id:'OLY-CL-0001',display_name:'Dener',mode:'CORE',status:'ACTIVE'}
  ]);
  if(profile==='olympus'&&table==='current_state') return ok([
   {person_id:'OLY-CL-0001',state_revision:4,freshness:'STALE',decision:'REQUEST_DATA',next_action:'Registrar o check-in atual antes de nova mudança.',source_ref:'drive-state-id',updated_at:'2026-09-07T22:30:00Z'}
  ]);
  if(profile==='olympus'&&['events','evidence','attention'].includes(table)) return ok([]);
  return ok([]);
 };
 const sink=responseSink();
 await handler({method:'GET',url:'/api/graph?focus=system%3AOLYMPUS&depth=2',headers:{'x-vercel-oidc-token':'test-token'}},sink.res);
 const data=JSON.parse(sink.body());
 assert.equal(sink.res.statusCode,200);
 assert.ok(data.nodes.some(n=>n.id==='olympus:person:OLY-CL-0001'&&n.label==='Dener'));
 assert.ok(data.nodes.some(n=>n.id==='olympus:state:OLY-CL-0001'&&n.status==='STALE'));
 assert.ok(data.edges.some(e=>e.source==='system:OLYMPUS'&&e.target==='olympus:person:OLY-CL-0001'));
 assert.ok(data.edges.some(e=>e.source==='olympus:person:OLY-CL-0001'&&e.target==='olympus:state:OLY-CL-0001'));
});
