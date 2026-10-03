import {createHash} from 'node:crypto';
export const TOWER_ID='1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z';
export function operationalStateFromTower(tower,proof){
  if(!proof?.body_verified||proof.file_id!==TOWER_ID||tower?.contract!=='NEXO_TOWER_LIVE_V1'||
     tower.stable_file_id!==TOWER_ID||tower.storage!=='GOOGLE_DRIVE_PRIVATE'||
     tower.revision!==tower.state_fingerprint||!/^sha256:[a-f0-9]{64}$/.test(tower.state_fingerprint))
    throw new Error('CANONICAL_TOWER_INVALID');
  const work=Object.entries(tower.files).filter(([key,entry])=>key.startsWith('entities/artifact/')&&entry.value?.kind==='NEXO_OPERATIONAL_WORK_V1')
    .map(([,entry])=>({...entry.value.payload,version:entry.value.entity_version}));
  return {authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',revision:tower.revision,readback:'PASS',work,
    integrity:'DRIVE_MD5_AND_REVISION_READBACK',availability:work.length?'CONFIGURED_IN_TOWER':'NO_OPERATIONAL_WORK_REGISTERED'};
}
export async function readOperationalTower({token,fetchImpl=fetch}){
  if(!token)throw new Error('EXISTING_GOOGLE_AUTH_REQUIRED');
  const url=`https://www.googleapis.com/drive/v3/files/${TOWER_ID}`;
  const init=()=>({headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(45000)});
  const query='?fields=id,headRevisionId,size,md5Checksum&supportsAllDrives=true';
  const meta=await fetchImpl(url+query,init());if(!meta.ok)throw new Error('TOWER_METADATA_UNAVAILABLE');
  const before=await meta.json();
  if(before.id!==TOWER_ID||!before.headRevisionId||!/^[a-f0-9]{32}$/.test(before.md5Checksum))throw new Error('TOWER_METADATA_INVALID');
  if(Number(before.size)>32*1024*1024)throw new Error('TOWER_TOO_LARGE');
  const response=await fetchImpl(url+'?alt=media&supportsAllDrives=true',init());if(!response.ok)throw new Error('TOWER_UNAVAILABLE');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.byteLength;if(size>32*1024*1024)throw new Error('TOWER_TOO_LARGE');chunks.push(chunk);}
  const raw=Buffer.concat(chunks),md5=createHash('md5').update(raw).digest('hex');
  if(md5!==before.md5Checksum||raw.length!==Number(before.size))throw new Error('TOWER_BODY_HASH_MISMATCH');
  const check=await fetchImpl(url+query,init());if(!check.ok)throw new Error('TOWER_READ_RACE');
  const after=await check.json();
  if(after.id!==TOWER_ID||after.headRevisionId!==before.headRevisionId||after.md5Checksum!==md5)throw new Error('TOWER_READ_RACE');
  // Preserve the Writer fingerprint: Python/JS float encodings can differ.
  return operationalStateFromTower(JSON.parse(raw),{file_id:TOWER_ID,body_verified:true});
}
