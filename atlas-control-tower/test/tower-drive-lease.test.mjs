import test from 'node:test';
import assert from 'node:assert/strict';
import {createTowerDriveLease,TOWER_DRIVE_LOCK_ID} from '../lib/tower-drive-lease.mjs';

function fakeDb(initial){
  let row=initial?structuredClone(initial):null;
  const fetchImpl=async(url,init={})=>{
    const u=new URL(url),method=init.method||'GET';
    if(method==='GET')return new Response(JSON.stringify(row?[row]:[]),{status:200});
    if(method==='POST'){
      if(!row)row=JSON.parse(init.body);
      return new Response(JSON.stringify([row]),{status:201});
    }
    if(method==='PATCH'){
      const body=JSON.parse(init.body),q=u.searchParams;
      const match=row&&[...q.entries()].every(([k,v])=>String(row[k])===String(v).replace(/^eq\./,''));
      if(!match)return new Response('[]',{status:200});
      row={...row,...body};
      return new Response(JSON.stringify([row]),{status:200});
    }
    return new Response('{}',{status:405});
  };
  return {fetchImpl,get:()=>row};
}
const env={VERCEL_OIDC_TOKEN:'oidc',NEON_DATA_API_URL:'https://neon.invalid/rest/v1'};

test('lease creates one reusable coordination row and acquires it atomically',async()=>{
  const db=fakeDb();
  const lease=createTowerDriveLease({env,fetchImpl:db.fetchImpl,ttlMs:30000});
  const held=await lease.acquire({owner:'TEST'});
  assert.equal(db.get().id,TOWER_DRIVE_LOCK_ID);
  assert.equal(db.get().status,'IN_PROGRESS');
  assert.equal(db.get().metadata.lease_owner,'TEST');
  await lease.release(held);
  assert.equal(db.get().status,'PENDING');
});

test('second writer fails while lease is live',async()=>{
  const now=new Date().toISOString();
  const db=fakeDb({id:TOWER_DRIVE_LOCK_ID,status:'IN_PROGRESS',updated_at:now,metadata:{lease_expires_at:new Date(Date.now()+60000).toISOString()}});
  const lease=createTowerDriveLease({env,fetchImpl:db.fetchImpl});
  await assert.rejects(()=>lease.acquire(),/TOWER_WRITE_LEASE_BUSY/);
});

test('expired lease can be recovered only against exact observed updated_at',async()=>{
  const old=new Date(Date.now()-60000).toISOString();
  const db=fakeDb({id:TOWER_DRIVE_LOCK_ID,status:'IN_PROGRESS',updated_at:old,metadata:{lease_expires_at:new Date(Date.now()-1000).toISOString()}});
  const lease=createTowerDriveLease({env,fetchImpl:db.fetchImpl});
  const held=await lease.acquire({owner:'RECOVERY'});
  assert.equal(held.recovered,true);
  assert.equal(db.get().metadata.lease_owner,'RECOVERY');
});

test('writer fails closed without Vercel OIDC',async()=>{
  const lease=createTowerDriveLease({env:{},fetchImpl:async()=>{throw new Error('network')}});
  assert.equal(lease.configured,false);
  await assert.rejects(()=>lease.acquire(),/TOWER_WRITE_LEASE_NOT_CONFIGURED/);
});
