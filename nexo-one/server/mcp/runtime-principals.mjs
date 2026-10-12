// Trusted deployment configuration only. This module never creates credentials.
import {timingSafeEqual} from 'node:crypto';
import {sha256,ROLE_PROMPTS,OPERATIONAL_TOOL_NAMES} from './operational-tools.mjs';
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[a-z][a-z0-9_.-]{0,79}$/;
const KEYS=['subject','runtime','token_sha256','roles','allowed_tools','expires_at','revoked'];
const deny=()=>{throw new Error('MCP_PRINCIPAL_CONFIG_INVALID');};
export function runtimePrincipal(raw,bearer,now=Date.now()){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)deny();
  let config;try{config=JSON.parse(raw);}catch{deny();}
  if(!config||typeof config!=='object'||Array.isArray(config)||
     Object.keys(config).sort().join(',')!=='principals,schema'||
     config.schema!=='NEXO_MCP_RUNTIME_PRINCIPALS_V1'||
     !Array.isArray(config.principals)||config.principals.length>64)deny();
  const subjects=new Set(),hashes=new Set();
  for(const row of config.principals){
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==KEYS.length||
       KEYS.some(key=>!Object.hasOwn(row,key))||typeof row.subject!=='string'||typeof row.token_sha256!=='string'||
       !HASH.test(row.subject)||!HASH.test(row.token_sha256)||
       typeof row.runtime!=='string'||!ID.test(row.runtime)||subjects.has(row.subject)||hashes.has(row.token_sha256)||
       typeof row.revoked!=='boolean'||typeof row.expires_at!=='string'||
       !Number.isFinite(Date.parse(row.expires_at))||!row.expires_at.endsWith('Z')||
       !Array.isArray(row.roles)||!row.roles.length||new Set(row.roles).size!==row.roles.length||
       row.roles.some(role=>typeof role!=='string'||!Object.hasOwn(ROLE_PROMPTS,role))||
       !Array.isArray(row.allowed_tools)||!row.allowed_tools.length||
       new Set(row.allowed_tools).size!==row.allowed_tools.length||
       row.allowed_tools.some(name=>!OPERATIONAL_TOOL_NAMES.includes(name)))deny();
    subjects.add(row.subject);hashes.add(row.token_sha256);
  }
  if(typeof bearer!=='string'||bearer.length<24||bearer.length>4096)return null;
  const actual=Buffer.from(sha256(bearer),'hex');
  const row=config.principals.find(item=>timingSafeEqual(actual,Buffer.from(item.token_sha256,'hex')));
  if(!row||row.revoked||Date.parse(row.expires_at)<=now)return null;
  return {authenticated:true,id:row.subject,runtime:row.runtime,
    roles:[...row.roles],allowed_tools:[...row.allowed_tools]};
}
