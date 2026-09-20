import {randomUUID} from 'node:crypto';
import {DEFAULT_NEON_DATA_API_URL} from './neon-v1.mjs';

export const TOWER_DRIVE_LOCK_ID='8c366ef0-feca-5d16-bb3d-6ee2ae9e3332';
const SCHEMA='nexo_ops';
const TABLE='actions';

function headers(token,{write=false,upsert=false}={}){
  return {
    Authorization:'Bearer '+token,
    Accept:'application/json',
    ...(write?{'Content-Type':'application/json','Content-Profile':SCHEMA,Prefer:(upsert?'resolution=ignore-duplicates,':'')+'return=representation'}:{'Accept-Profile':SCHEMA})
  };
}
async function parse(response,label){
  const text=await response.text();
  let value=[];if(text){try{value=JSON.parse(text);}catch{throw new Error(label+'_INVALID_JSON');}}
  if(!response.ok)throw new Error(label+'_'+response.status+':'+String(value?.message||value?.error||text).slice(0,160));
  return value;
}
export function createTowerDriveLease({env=process.env,fetchImpl=globalThis.fetch,ttlMs=30000}={}){
  if(typeof fetchImpl!=='function')throw new Error('FETCH_REQUIRED');
  const base=String(env.NEON_DATA_API_URL||DEFAULT_NEON_DATA_API_URL).replace(/\/+$/,'');
  const token=String(env.VERCEL_OIDC_TOKEN||'').trim();
  const configured=Boolean(token);
  const nowIso=()=>new Date().toISOString();
  const query=async params=>{
    const q=new URLSearchParams(params);
    return parse(await fetchImpl(base+'/'+TABLE+'?'+q,{headers:headers(token)}),'TOWER_LEASE_READ');
  };
  const patch=async(filters,body)=>{
    const q=new URLSearchParams(Object.entries(filters).map(([k,v])=>[k,'eq.'+String(v)]));
    return parse(await fetchImpl(base+'/'+TABLE+'?'+q,{method:'PATCH',headers:headers(token,{write:true}),body:JSON.stringify(body)}),'TOWER_LEASE_PATCH');
  };
  async function ensureRow(){
    if(!configured)throw new Error('TOWER_WRITE_LEASE_NOT_CONFIGURED');
    let rows=await query({select:'*',id:'eq.'+TOWER_DRIVE_LOCK_ID,limit:'1'});
    if(rows?.[0])return rows[0];
    const now=nowIso();
    const row={id:TOWER_DRIVE_LOCK_ID,title:'NEXO Tower Drive writer lease',domain:'ENGINEERING',status:'PENDING',priority:'P0',blocker_reason:null,source_ref:'tower://drive-writer-lease',metadata:{kind:'TOWER_DRIVE_WRITER_LEASE',authority:'DERIVED_NOT_EVIDENCE'},created_at:now,updated_at:now};
    const q=new URLSearchParams({on_conflict:'id'});
    await parse(await fetchImpl(base+'/'+TABLE+'?'+q,{method:'POST',headers:headers(token,{write:true,upsert:true}),body:JSON.stringify(row)}),'TOWER_LEASE_CREATE');
    rows=await query({select:'*',id:'eq.'+TOWER_DRIVE_LOCK_ID,limit:'1'});
    if(!rows?.[0])throw new Error('TOWER_WRITE_LEASE_ROW_MISSING');
    return rows[0];
  }
  async function acquire({owner='NEXO_RUNTIME'}={}){
    let current=await ensureRow();
    const now=Date.now();
    if(String(current.status).toUpperCase()==='IN_PROGRESS'){
      const expires=Date.parse(current.metadata?.lease_expires_at||'');
      if(Number.isFinite(expires)&&expires>now)throw new Error('TOWER_WRITE_LEASE_BUSY');
      const tokenValue=randomUUID();
      const updatedAt=nowIso();
      const changed=await patch({id:TOWER_DRIVE_LOCK_ID,status:'IN_PROGRESS',updated_at:current.updated_at},{
        status:'IN_PROGRESS',updated_at:updatedAt,blocker_reason:null,
        metadata:{...(current.metadata||{}),lease_token:tokenValue,lease_owner:String(owner),lease_acquired_at:updatedAt,lease_expires_at:new Date(now+ttlMs).toISOString()}
      });
      if(!changed?.[0])throw new Error('TOWER_WRITE_LEASE_BUSY');
      current=changed[0];
      return {token:tokenValue,row:current,recovered:true};
    }
    if(String(current.status).toUpperCase()!=='PENDING')throw new Error('TOWER_WRITE_LEASE_STATE_INVALID:'+String(current.status));
    const tokenValue=randomUUID(),updatedAt=nowIso();
    const changed=await patch({id:TOWER_DRIVE_LOCK_ID,status:'PENDING'},{
      status:'IN_PROGRESS',updated_at:updatedAt,blocker_reason:null,
      metadata:{...(current.metadata||{}),lease_token:tokenValue,lease_owner:String(owner),lease_acquired_at:updatedAt,lease_expires_at:new Date(now+ttlMs).toISOString()}
    });
    if(!changed?.[0])throw new Error('TOWER_WRITE_LEASE_BUSY');
    return {token:tokenValue,row:changed[0],recovered:false};
  }
  async function release(lease){
    if(!lease?.token||!lease?.row?.updated_at)throw new Error('TOWER_WRITE_LEASE_INVALID');
    const changed=await patch({id:TOWER_DRIVE_LOCK_ID,status:'IN_PROGRESS',updated_at:lease.row.updated_at},{
      status:'PENDING',updated_at:nowIso(),blocker_reason:null,
      metadata:{...(lease.row.metadata||{}),lease_token:null,lease_owner:null,lease_released_at:nowIso(),lease_expires_at:null}
    });
    if(!changed?.[0])throw new Error('TOWER_WRITE_LEASE_LOST');
    return changed[0];
  }
  async function runExclusive(fn,{owner}={}){
    const lease=await acquire({owner});
    let value,error;
    try{value=await fn(lease);}catch(e){error=e;}
    let releaseError;try{await release(lease);}catch(e){releaseError=e;}
    if(error)throw error;
    if(releaseError)throw releaseError;
    return value;
  }
  return {configured,acquire,release,runExclusive,ensureRow};
}
