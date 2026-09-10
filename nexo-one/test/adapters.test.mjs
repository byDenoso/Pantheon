import test from 'node:test';
import assert from 'node:assert/strict';
import {drive,gmail,calendar} from '../server/adapters/google.mjs';
import {googleConnectToken,GOOGLE_READ_SCOPES} from '../server/adapters/connect.mjs';
import {github} from '../server/adapters/github.mjs';
import {vercel} from '../server/adapters/vercel.mjs';
import {nexo} from '../server/adapters/nexo.mjs';
import {validateItem} from '../src/contracts/validate.mjs';
const now=Date.parse('2026-09-09T12:00:00Z');
const env={GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GOOGLE_REFRESH_TOKEN:'fixture',VERCEL_READ_TOKEN:'fixture',VERCEL_PROJECT_ID:'prj_fixture',NEXO_SOURCE_URL:'https://source.example/export'};
async function mock(routes,fn){const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{const found=routes.find(([match])=>String(url).includes(match));assert.ok(found,`Unexpected outbound request: ${url}`);const value=typeof found[1]==='function'?found[1](url,options):found[1];return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});};try{return await fn();}finally{globalThis.fetch=original;}}
const oauth=['oauth2.googleapis.com',{access_token:'fixture-access',expires_in:3600}];

test('Google Connect exchanges Vercel OIDC for a user-scoped read-only token',async()=>{
  const original=globalThis.fetch;let seen;
  globalThis.fetch=async(url,options)=>{seen={url:String(url),options};return new Response(JSON.stringify({token:'connect-google-token'}),{status:200,headers:{'Content-Type':'application/json'}});};
  try{
    const token=await googleConnectToken({GOOGLE_CONNECTOR:'google/nexo-google',GOOGLE_CONNECT_SUBJECT_ID:'owner',VERCEL_OIDC_TOKEN:'oidc-fixture'});
    assert.equal(token,'connect-google-token');
    assert.equal(seen.url,'https://api.vercel.com/v1/connect/token/google/nexo-google');
    assert.equal(seen.options.method,'POST');
    assert.equal(seen.options.headers.Authorization,'Bearer oidc-fixture');
    const body=JSON.parse(seen.options.body);
    assert.deepEqual(body.subject,{type:'user',id:'owner'});
    assert.deepEqual(body.scopes,GOOGLE_READ_SCOPES);
    assert.deepEqual(GOOGLE_READ_SCOPES,[
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly'
    ]);
  }finally{globalThis.fetch=original;}
});

test('Google Connect normalizes missing authorization as AUTH_REQUIRED',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'authorization_required'}),{status:403,headers:{'Content-Type':'application/json'}});
  try{
    await assert.rejects(()=>googleConnectToken({GOOGLE_CONNECTOR:'google/nexo-google',VERCEL_OIDC_TOKEN:'oidc-fixture'}),error=>error?.code==='AUTH_REQUIRED');
  }finally{globalThis.fetch=original;}
});

test('Drive prefers Vercel Connect when a Google connector is configured',async()=>{
  const connectEnv={...env,GOOGLE_CONNECTOR:'google/nexo-google',GOOGLE_CONNECT_SUBJECT_ID:'owner',VERCEL_OIDC_TOKEN:'oidc-fixture'};
  await mock([
    ['api.vercel.com/v1/connect/token/google/nexo-google',{token:'connect-access'}],
    ['drive/v3/files',(url,options)=>{assert.equal(options.headers.Authorization,'Bearer connect-access');return {files:[]};}]
  ],async()=>{const x=await drive({env:connectEnv,now});assert.deepEqual(x.items,[]);});
});

test('Configured Google Connect failure does not silently fall back to legacy OAuth',async()=>{
  const connectEnv={...env,GOOGLE_CONNECTOR:'google/nexo-google',GOOGLE_CONNECT_SUBJECT_ID:'owner',VERCEL_OIDC_TOKEN:'oidc-fixture'};
  const original=globalThis.fetch;const seen=[];
  globalThis.fetch=async(url)=>{
    seen.push(String(url));
    if(String(url).includes('api.vercel.com/v1/connect/token/google/nexo-google'))return new Response(JSON.stringify({error:'authorization_required'}),{status:403,headers:{'Content-Type':'application/json'}});
    assert.fail(`Connect failure must not fall back to ${url}`);
  };
  try{
    await assert.rejects(()=>drive({env:connectEnv,now}),error=>error?.code==='AUTH_REQUIRED');
    assert.equal(seen.some(url=>url.includes('oauth2.googleapis.com')),false);
  }finally{globalThis.fetch=original;}
});

test('Drive normalizes paginated files and safely escapes search query',async()=>mock([oauth,['drive/v3/files',(url)=>{assert.match(new URL(url).searchParams.get('q'),/name contains/);return {nextPageToken:'next',files:[{id:'f1',name:'CAMB input',modifiedTime:'2026-09-08T10:00:00Z',version:'1'}]};}]],async()=>{const x=await drive({env,now,query:"O'Hara"});assert.equal(x.partial,true);assert.equal(x.items[0].contextId,'COSMOLOGY');assert.equal(validateItem(x.items[0],'drive'),true);}));
test('Gmail metadata does not invent actionable commitments',async()=>mock([oauth,['/messages/m1',{id:'m1',threadId:'t1',payload:{headers:[{name:'Subject',value:'Revisão CAMB'},{name:'From',value:'Fixture sender'}]}}],['/messages?',{messages:[{id:'m1'}]}]],async()=>{const x=await gmail({env,now});assert.equal(x.items[0].status,undefined);assert.equal(validateItem(x.items[0],'gmail'),true);}));
test('Calendar excludes canceled and self-declined events, retains all-day exclusive end',async()=>mock([oauth,['/events?',{items:[{id:'a',summary:'Appointment',htmlLink:'https://calendar.google.com/event?eid=a',start:{date:'2026-09-09'},end:{date:'2026-09-10'}},{id:'b',status:'cancelled'},{id:'c',attendees:[{self:true,responseStatus:'declined'}]}]}]],async()=>{const x=await calendar({env,now});assert.equal(x.items.length,1);assert.equal(x.items[0].allDay,true);assert.equal(validateItem(x.items[0],'calendar'),true);}));
test('GitHub derives assignment only from explicit assignees and blockers from labels',async()=>mock([['/issues?', [{number:1,title:'Fix',html_url:'https://github.com/byDenoso/Pantheon/issues/1',state:'open',assignees:[{login:'byDenoso'}],labels:[]},{number:2,title:'Blocked',html_url:'https://github.com/byDenoso/Pantheon/issues/2',state:'open',labels:[{name:'blocked'}]}]],['/repos/',{full_name:'byDenoso/Pantheon',html_url:'https://github.com/byDenoso/Pantheon',pushed_at:'2026-09-09T10:00:00Z'}]],async()=>{const x=await github({env:{},now});assert.equal(x.items[1].status,'NEEDS_ME');assert.equal(x.items[2].status,'BLOCKED');assert.ok(x.items.every(i=>validateItem(i,'github')));}));
test('Vercel failure history is contextual, not an invented current blocker',async()=>mock([['/deployments?',{deployments:[{uid:'dpl_fixture',name:'nexo-one',state:'ERROR',created:now}],pagination:{next:null}}]],async()=>{const x=await vercel({env,now});assert.equal(x.items[0].status,undefined);assert.equal(validateItem(x.items[0],'vercel'),true);}));

test('NEXO reads the canonical Sheet without re-stamping the owner update time',async()=>{
  const sheetEnv={GOOGLE_CONNECTOR:'google/nexo-google',GOOGLE_CONNECT_SUBJECT_ID:'owner',VERCEL_OIDC_TOKEN:'oidc-fixture',NEXO_SHEET_ID:'ssot-fixture'};
  const values=[
    ['record_type','record_id','status','title','detail','payload_json','source','updated_at'],
    ['action','abc','BLOCKED','Acquire source','Exact source missing','','Neon:nexo_ops.actions','2026-09-09 12:00:00+00']
  ];
  await mock([
    ['api.vercel.com/v1/connect/token/google/nexo-google',{token:'connect-access'}],
    ['sheets.googleapis.com/v4/spreadsheets/ssot-fixture/values/',(url,options)=>{assert.equal(options.headers.Authorization,'Bearer connect-access');assert.match(String(url),/NEXO%21A1%3AH1000/);return {values};}]
  ],async()=>{
    const x=await nexo({env:sheetEnv,now});
    assert.equal(x.items.length,1);
    assert.equal(x.items[0].id,'nexo:action:abc');
    assert.equal(x.items[0].status,'BLOCKED');
    assert.equal(x.items[0].observedAt,'2026-09-09T12:00:00.000Z');
    assert.equal(x.items[0].sourceRef,'https://docs.google.com/spreadsheets/d/ssot-fixture/edit');
    assert.equal(validateItem(x.items[0],'nexo'),true);
    assert.match(x.revision,/^[a-f0-9]{64}$/);
  });
});

test('NEXO rejects malformed canonical Sheet schema instead of inventing fields',async()=>{
  const sheetEnv={GOOGLE_CONNECTOR:'google/nexo-google',VERCEL_OIDC_TOKEN:'oidc-fixture',NEXO_SHEET_ID:'ssot-fixture'};
  await mock([
    ['api.vercel.com/v1/connect/token/google/nexo-google',{token:'connect-access'}],
    ['sheets.googleapis.com/v4/spreadsheets/ssot-fixture/values/',{values:[['title','detail'],['Missing identity','bad']]}]
  ],async()=>{
    await assert.rejects(()=>nexo({env:sheetEnv,now}),error=>error?.code==='UNAVAILABLE');
  });
});

test('NEXO requires versioned owner export and never re-stamps it',async()=>mock([['source.example',{version:'1',revision:'r1',items:[{id:'nexo:a',observedAt:'2026-01-01T00:00:00Z'}]}]],async()=>{const x=await nexo({env});assert.equal(x.items[0].observedAt,'2026-01-01T00:00:00Z');assert.equal(x.revision,'r1');}));
