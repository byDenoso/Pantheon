/** Trusted canonical source importer. Pinned hardened 1.3 semantics, expanded=false.
 * No HTTP entry point, caller-selected role/source, network access, or deployment.
 * Raw JSON numbers retain Python int/float identity through python-json.mjs.
 */
import {parsePythonJSON, canonical, pyStr, pyTruthy, isNumeric, isRecord, entries, record, equal} from './python-json.mjs';
import {assert, sha256, cmp, instant, TOWER_ID, ENGINE_CONFIG, CHUNKER, LIMITS} from './integrity.mjs';
import {pythonUpper,pythonLower,pythonIsDigit} from './producer-unicode.mjs';
import {createHash} from 'node:crypto';
import {parseSourceEnvelope} from './source-envelope.mjs';
import {TABLES} from './unicode-tables.mjs';
import {pythonStrip} from './tokenizer.mjs';

export const PRODUCER_VERSION='hardened-1.3-authorized-source-v1';
export const SOURCE_LIMITS=Object.freeze({rawBytes:16*1024*1024,files:20000,documents:12000,leaves:500000,documentLeaves:25000,pointerCodepoints:8192,identityCodepoints:2048,documentChunks:256,hiddenAliasCodepoints:1000000});
const ROLES=['ENGINEER','EXECUTOR','GUARDIAO','LEARNER','PITIA','REFEREE_1','SENTINEL'];
const ROLE_ALIASES={ADVISOR:'ENGINEER',CIENTISTA:'LEARNER',OPERADOR:'EXECUTOR',CRITICO:'REFEREE_1',ENGENHEIRO:'ENGINEER',SENTINELA:'SENTINEL'};
const INACTIVE=new Set(['SUPERSEDED','RETIRED','RETRACTED','INVALIDATED','ARCHIVED','DELETED']);
const SECRETS=new Set(['password','secret','private_key','api_key','access_token','refresh_token','authorization','client_secret']);
const SECRET_KEY=/(?:password|passwd|secret|private.?key|api.?key|access.?token|refresh.?token|authorization|credential|cookie|bearer.?token)/i;
const SECRET_NAMES=new Set([...SECRETS,'apikey','secretkey','accesstoken','refreshtoken','clientsecret','privatekey','credentials','cookie','cookies','bearertoken'].map(s=>s.toLowerCase().replace(/[^a-z0-9]/g,'')));
const pyCase=s=>s.replace(/[İı]/g,'i').replace(/ſ/g,'s').replace(/K/g,'k');
const iTest=(re,s)=>re.test(pyCase(s));
const PRIVATE_DOMAIN=/^(?:HEALTH|BODYBUILDING|OLYMPUS|OLY|PERSONAL|PERSON|CLIENT|PEER)(?:[.:/_-]|$)/i;
const DOMAIN_KEY=/^(?:domain|domain_id|subdomain_id|topic_id|source_domains|target_domains|from_domain|to_domain|client_id|person_id)$/i;
const PRIVATE_ALIASES={'pessoal':'PERSONAL','saúde':'HEALTH','saude':'HEALTH','fisiculturismo':'BODYBUILDING'};
const COLLECTIONS={'evolution/board.json':['posts','BOARD_POST'],'evolution/learning.json':['rules','LEARNED_RULE'],'evolution/families.json':['families','FAMILY'],'evolution/incidents.json':['incidents','INCIDENT'],'evolution/thoughts.json':['entries','THOUGHT']};
const EXTRAS=[['runtime/runs/','RUN'],['runtime/results/','RESULT'],['runtime/evidence/','EVIDENCE'],['runtime/artifacts/','ARTIFACT'],['recipes/','RECIPE']];
const ranges=rs=>rs.map(([a,b])=>`\\u{${a.toString(16)}}${a===b?'':`-\\u{${b.toString(16)}}`}`).join('');
const WORD=ranges(TABLES.wordRanges),SPACE=ranges(TABLES.spaceRanges);
const signedURL=new RegExp(`(https?://[^${SPACE}?]+)\\?[^${SPACE}]+`,'giu');
const bearer=new RegExp(`bearer[${SPACE}]+[A-Za-zİıſK0-9._~-]+`,'giu');
const truth=v=>v!==undefined&&pyTruthy(v);
const or=(...values)=>values.find(truth)??values.at(-1);
const str=v=>pyStr(v===undefined?null:v);
const slice=(s,a,b)=>{let i=0;const chars=[];for(const c of s){if(i>=b)break;if(i>=a)chars.push(c);i++;}return chars.join('');};
const len=s=>{let n=0;for(const _ of s)n++;return n;};
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export const digest=async value=>sha256(canonical(value));
export const pointerEscape=key=>str(key).replaceAll('~','~0').replaceAll('/','~1');
const stem=path=>{const name=path.split('/').at(-1),n=name.lastIndexOf('.');return n>0?name.slice(0,n):name;};

export function roleName(role){
  assert(typeof role==='string','INVALID_TRUSTED_ROLE');
  let ascii=''; for(const ch of role){const d=TABLES.nfkd[ch.codePointAt(0)]??ch;for(const c of d)if(c.codePointAt(0)<128)ascii+=c;}
  const upper=pythonUpper(ascii),name=ROLE_ALIASES[upper]??upper;
  assert(ROLES.includes(name),'INVALID_TRUSTED_ROLE');return name;
}
export function runtimeAcl(values){
  const roles=new Set();
  for(const value of values){
    assert(typeof value==='string','SOURCE_ACL_INVALID');
    try{roles.add(roleName(value));}catch(error){if(error.message!=='INVALID_TRUSTED_ROLE')throw error;}
  }
  return [...roles].sort(cmp);
}
export function* leaves(value,pointer=''){
  if(isRecord(value)){for(const [key,item] of entries(value).sort((a,b)=>cmp(a[0],b[0])))yield* leaves(item,pointer+'/'+pointerEscape(key));}
  else if(Array.isArray(value)){for(let n=0;n<value.length;n++)yield* leaves(value[n],pointer+'/'+n);}
  else if(value!==null&&value!==undefined)yield [pointer,value];
}
export function references(value){
  const found=new Set();
  function walk(v,key=''){if(isRecord(v)){for(const [k,x]of entries(v))walk(x,k);}else if(Array.isArray(v)){for(const x of v)walk(x,key);}else if(typeof v==='string'&&(/_(?:id|ref|refs|ids)$/.test(key)||['refs','supersedes','contradicts'].includes(key)))found.add(v);}
  walk(value);return [...found].sort(cmp);
}
function clean(value,safe=false){
  if(isRecord(value))return record(entries(value).filter(([k])=>safe?!iTest(SECRET_KEY,k)&&!SECRET_NAMES.has(pythonLower(k).replace(/[^a-z0-9]/g,'')):!SECRETS.has(pythonLower(k))).map(([k,v])=>[k,clean(v,safe)]));
  if(Array.isArray(value))return value.map(v=>clean(v,safe));
  if(typeof value==='string'){let s=value.replace(signedURL,'$1?[query-redacted]').replace(bearer,'Bearer [redacted]');if(safe)s=s.replace(/(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,})/g,'[credential-redacted]');return s;}
  return value;
}
export function privateDomain(value,path=''){
  const domain=v=>{const text=typeof v==='string'?pythonStrip(v).normalize('NFC'):'';return has(PRIVATE_ALIASES,pythonLower(text))?PRIVATE_ALIASES[pythonLower(text)]:text;};
  if(path.split('/').some(p=>iTest(PRIVATE_DOMAIN,p)))return true;
  if(Array.isArray(value))return value.some(v=>privateDomain(v));
  if(!isRecord(value))return false;
  for(const [key,item]of entries(value)){
    if(iTest(DOMAIN_KEY,key))for(const candidate of Array.isArray(item)?item:[item]){
      if(iTest(PRIVATE_DOMAIN,str(candidate))||iTest(PRIVATE_DOMAIN,domain(candidate))||(['subdomain_id','topic_id'].includes(pythonLower(key))&&typeof candidate==='string'&&candidate.split('.').some(p=>iTest(PRIVATE_DOMAIN,domain(p)))))return true;
    }
    if((isRecord(item)||Array.isArray(item))&&privateDomain(item))return true;
  }return false;
}
function* proseParts(value,prefix=''){
  if(isRecord(value)){for(const [k,v]of entries(value))if(!['entity_version','created_at','updated_at'].includes(k))yield* proseParts(v,(prefix+'.'+k).replace(/^\.+|\.+$/g,''));}
  else if(Array.isArray(value)){if(value.length>16&&value.every(v=>isNumeric(v)||typeof v==='boolean'))yield `${prefix}: numerical array (${value.length} entries; read the source)`;else for(const v of value)yield* proseParts(v,prefix);}
  else yield value!==null?`${prefix}: ${str(value)}`:'';
}
function limitedJoin(values,limit){const chars=[];let count=0,first=true;for(const value of values){const line=(first?'':'\n')+value;first=false;for(const c of line){if(count===limit)return chars.join('');chars.push(c);count++;}}return chars.join('');}
function prose(value){return limitedJoin(proseParts(value),16001);}
function* leafLines(value){for(const [p,v]of leaves(value))yield `${p}: ${str(v)}`;}
function* windows(text){let body='',start=0,count=0;for(const c of text){body+=c;count++;if(count===850){yield {body,start,end:start+count};start+=count;body='';count=0;}}if(count||!start)yield {body,start,end:start+count};}

export function aliasMap(docs){const map=new Map();for(const d of docs)for(const a of [d.uid,d.object_id,d.path,'TOWER_V06/'+d.path]){if(!map.has(a))map.set(a,new Set());map.get(a).add(d.uid);}return map;}

export async function readSource(raw,{transport=null,fixtureOnly=false}={}){
  const bytes=typeof raw==='string'?new TextEncoder().encode(raw):raw instanceof Uint8Array?raw:new Uint8Array(raw);
  assert(bytes.length>0&&bytes.length<=SOURCE_LIMITS.rawBytes,'SOURCE_RESOURCE_BOUND');
  const envelope=parseSourceEnvelope(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),payload=envelope.metadata;
  assert(isRecord(payload)&&payload.contract==='NEXO_TOWER_LIVE_V1'&&payload.authority==='TOWER_V06'&&payload.stable_file_id===TOWER_ID,'CANONICAL_SOURCE_IDENTITY_INVALID');
  assert(payload.storage==='GOOGLE_DRIVE_PRIVATE'&&payload.truth_owner==='TOWER_V06@GOOGLE_DRIVE_PRIVATE'&&payload.write_model==='IN_PLACE_FILE_REVISION_CAS_READBACK','CANONICAL_AUTHORITY_INVALID');
  assert(equal(payload.file_count??null,envelope.fileRanges.size)&&envelope.fileRanges.size<=SOURCE_LIMITS.files,'CANONICAL_FILES_INVALID');
  const fingerprint=createHash('sha256');fingerprint.update('{');let first=true;
  for(const [path,entry]of envelope.entries({sorted:true})){if(!first)fingerprint.update(',');first=false;fingerprint.update(canonical(path));fingerprint.update(':');fingerprint.update(canonical(entry));}
  fingerprint.update('}');const revision='sha256:'+fingerprint.digest('hex');
  assert(payload.revision===revision&&payload.state_fingerprint===revision,'CANONICAL_FINGERPRINT_INVALID');
  const control=envelope.entry('CONTROL.json');assert(isRecord(control?.value)&&control.value.truth_owner===payload.truth_owner,'CANONICAL_CONTROL_INVALID');
  for(const path of envelope.fileRanges.keys())assert(!path.startsWith('/')&&!path.startsWith('\\')&&!path.split('/').includes('..'),'CANONICAL_PATH_INVALID');
  instant(payload.updated_at);
  const rawSHA=await sha256(bytes);
  if(!fixtureOnly){assert(transport?.kind==='DRIVE_CONNECTOR_COMPLETE_BODY_AND_REVISION_READBACK'&&typeof transport.revision_id==='string'&&transport.revision_id.length>0&&transport.body_sha256===rawSHA&&transport.size===bytes.length,'VERIFIED_TRANSPORT_REQUIRED');}
  return {payload,envelope,revision,source_id:TOWER_ID,source_sha256:rawSHA,observed_at:payload.updated_at,transport:transport?{...transport}:null,fixture_only:fixtureOnly};
}

export async function importDocuments(snapshot,{previous=null,recordCache=new Map()}={}){
  const files=snapshot.envelope,result=new Map(),ambiguous=new Set(),counts={},excluded=new Set();let leafCount=0;
  const count=(k,n=1)=>counts[k]=(counts[k]??0)+n;
  async function add(path,item,kind,ident,pointer=''){
    assert(isRecord(item),'SOURCE_RECORD_SHAPE_INVALID');kind=pythonUpper(str(or(item.kind,kind)));
    if(kind.endsWith('_NOOP')||kind.startsWith('UNAPPLIED_')||['INBOX_RECORD','OPERATOR_INTENT','ACTION'].includes(kind)){count('administrative_skipped');return;}
    if(['HEALTH','OLYMPUS','PERSONAL'].includes(pythonUpper(str(item.domain??'')))){count('personal_skipped');return;}
    assert(len(ident)<=SOURCE_LIMITS.identityCodepoints&&len(path)<=SOURCE_LIMITS.identityCodepoints,'SOURCE_IDENTITY_BOUND');let documentLeaves=0;for(const [pointer]of leaves(item)){documentLeaves++;leafCount++;assert(documentLeaves<=SOURCE_LIMITS.documentLeaves&&leafCount<=SOURCE_LIMITS.leaves&&len(pointer)<=SOURCE_LIMITS.pointerCodepoints,'SOURCE_LEAF_RESOURCE_BOUND');}
    let uid=ident.startsWith(kind+'::')?ident:kind+'::'+ident;const safe=clean(item);let acl;
    if(safe.allowed_roles!==undefined&&safe.allowed_roles!==null){assert(Array.isArray(safe.allowed_roles),'SOURCE_ACL_INVALID');acl=runtimeAcl(safe.allowed_roles);}
    else if(safe.private===true){const recipient=or(safe.to,safe.writer_role);acl=truth(recipient)&&recipient!=='ALL'?runtimeAcl([recipient]):[];}
    else acl=[...ROLES];
    let state=pythonUpper(str(or(safe.state,safe.status,safe.charter?.status,'RECORDED')));
    if(truth(safe.retired_at))state='RETIRED';if(truth(safe.resolved_at)&&kind==='BOARD_POST')state='ARCHIVED';if(truth(safe.retracted_at))state='RETRACTED';
    const semantic=isRecord(safe.semantic)?safe.semantic:{},payload=isRecord(safe.payload)?safe.payload:{};
    const topic=str(or(semantic.topic_id,safe.topic_id,payload.topic_id,safe.roadmap_id,''));
    let text=prose(safe);const truncated=len(text)>16000;text=slice(text,0,16000);
    let evidence=or(safe.evidence_ref,safe.source_ref,safe.run_id,payload.evidence_ref);
    if(!truth(evidence)){const signals=or(payload.signals,[]);assert(Array.isArray(signals),'SOURCE_SIGNALS_INVALID');evidence=signals.filter(isRecord).map(s=>s.evidence??'');evidence=or(evidence,payload.evidence,safe.evidence,safe.text,uid);}
    const doc={uid,object_id:ident,path,pointer,kind,version:str(or(safe.entity_version,safe.version,'unversioned')),content_hash:await digest(item),title:slice(str(or(safe.display_name,safe.title,safe.question,ident)),0,220),text,state,topic,allowed_roles:acl,refs:references(safe),expires_at:or(safe.expires_at,safe.valid_until,null),evidence_key:await digest(evidence),data:safe,truncated,ambiguous_identity:false};
    let old=result.get(uid);
    if(old&&(old.content_hash!==doc.content_hash||canonical(old.allowed_roles)!==canonical(doc.allowed_roles))){ambiguous.add(uid);result.delete(uid);old.uid=uid+'#'+old.content_hash.slice(0,16);old.ambiguous_identity=true;result.set(old.uid,old);count('identity_conflicts');old=null;}
    if(ambiguous.has(uid)){doc.uid=uid+'#'+doc.content_hash.slice(0,16);doc.ambiguous_identity=true;uid=doc.uid;old=result.get(uid);}
    result.set(uid,old??doc);count('documents',old?0:1);count('truncated_documents',truncated?1:0);
  }
  for(const [path,entry]of files.entries({sorted:true})){const item=entry?.value;
    if(entry?.encoding!=='json'||!isRecord(item)){count('unsupported_encoding_or_shape');continue;}
    if(path.startsWith('entities/'))await add(path,item,pythonUpper(path.split('/')[1]),str(or(item.id,item.work_id,stem(path))));
    else if(path.startsWith('roadmaps/'))await add(path,item,'ROADMAP',stem(path));
    else if(path.startsWith('contracts/'))await add(path,item,'CONTRACT',stem(path));
    else if(path==='evolution/board.json'){assert(Array.isArray(item.posts??[]),'SOURCE_COLLECTION_INVALID');for(const [n,post]of (item.posts??[]).entries())await add(path,post,'BOARD_POST',str(or(post.id,n)),`/posts/${n}`);}
    else if(path==='evolution/learning.json'){assert(Array.isArray(item.rules??[]),'SOURCE_COLLECTION_INVALID');for(const [n,rule]of (item.rules??[]).entries())await add(path,rule,'LEARNED_RULE',str(or(rule.id,`${str(rule.feature)}=${str(rule.value)}`)),`/rules/${n}`);}
    else if(has(COLLECTIONS,path)){const [key,kind]=COLLECTIONS[path],collection=item[key]??{};assert(isRecord(collection)||Array.isArray(collection),'SOURCE_COLLECTION_INVALID');for(const [n,obj]of isRecord(collection)?entries(collection):collection.entries())if(isRecord(obj))await add(path,obj,kind,str(or(obj.id,obj.family_id,n)),`/${key}/${pointerEscape(n)}`);}
    else if(path==='runtime/artifacts/meta_learning/METALEARNING_CURRENT.json')await add(path,item,'PROCEDURAL_STATE','METALEARNING_CURRENT');
    else count('non_retrieval_surface_skipped');
  }
  assert(result.size<=SOURCE_LIMITS.documents,'SOURCE_DOCUMENT_BOUND');
  const ids=new Map([...result.values()].map(d=>[d.object_id,d]));
  for(const doc of result.values()){const older=or(doc.data.supersedes,[]);assert(typeof older==='string'||Array.isArray(older),'SOURCE_SUPERSESSION_INVALID');for(const ident of typeof older==='string'?[older]:older){const target=result.get(ident)??ids.get(ident);if(target&&target.uid!==doc.uid)target.state='SUPERSEDED';}}
  function remember(raw,path,kind,ident){if(!isRecord(raw)||!privateDomain(raw,path))return;kind=pythonUpper(str(or(raw.kind,kind)));ident=str(ident);assert(len(ident)<=SOURCE_LIMITS.identityCodepoints&&len(path)<=SOURCE_LIMITS.identityCodepoints,'SOURCE_IDENTITY_BOUND');for(const a of [ident,path,'TOWER_V06/'+path])excluded.add(a);if(kind)excluded.add(ident.startsWith(kind+'::')?ident:kind+'::'+ident);}
  for(const [path,entry]of files.entries()){const raw=entry?.value;if(entry?.encoding!=='json'||!isRecord(raw))continue;
    if(has(COLLECTIONS,path)){const [key,kind]=COLLECTIONS[path],collection=raw[key]??{};for(const [index,item]of isRecord(collection)?entries(collection):Array.isArray(collection)?collection.entries():[]){if(!isRecord(item))continue;const ident=kind==='BOARD_POST'?or(item.id,str(index)):kind==='LEARNED_RULE'?or(item.id,`${str(item.feature)}=${str(item.value)}`):or(item.id,item.family_id,str(index));remember(item,path,kind,ident);}}
    else {let kind=EXTRAS.find(([p])=>path.startsWith(p))?.[1],ident;
      if(path.startsWith('entities/')){kind=pythonUpper(path.split('/')[1]);ident=or(raw.id,raw.work_id,stem(path));}
      else if(kind)ident=or(raw.id,raw[pythonLower(kind)+'_id'],stem(path));
      else if(path.startsWith('roadmaps/')||path.startsWith('contracts/')){kind=path.startsWith('roadmaps/')?'ROADMAP':'CONTRACT';ident=stem(path);}
      else if(path.startsWith('events/')){kind='EVENT';ident=or(raw.event_id,raw.id,stem(path));}else continue;remember(raw,path,kind,ident);
    }
  }
  let docs=[...result.values()].sort((a,b)=>cmp(a.uid,b.uid));const privateDocs=docs.filter(d=>privateDomain(d.data,d.path));
  for(const d of privateDocs)for(const a of [d.uid,d.object_id,d.path,'TOWER_V06/'+d.path])excluded.add(a);
  docs=docs.filter(d=>!privateDomain(d.data,d.path));count('personal_skipped',privateDocs.length);
  for(const d of docs){d.data=clean(d.data,true);d.title=clean(d.title,true);d.text=limitedJoin(leafLines(d.data),16000);d.refs=references(d.data);}
  const currentAliases=aliasMap(docs);for(const a of currentAliases.keys())excluded.delete(a);
  for(const a of new Set([...(previous?.aliases??[]),...(previous?.excluded_aliases??[])]))if(!currentAliases.has(a))excluded.add(a);
  const chunks=[],records=[],old=new Map((previous?.documents??[]).map(d=>[d.uid,d]));let reused=0,created=0;
  for(let offset=0;offset<docs.length;offset+=32){
    const batch=docs.slice(offset,offset+32),keys=await Promise.all(batch.map(d=>digest([ENGINE_CONFIG,d])));
    const found=recordCache.getMany?await recordCache.getMany(keys):new Map(await Promise.all(keys.map(async key=>[key,await recordCache.get(key)])));
    const pending=[];
    for(let n=0;n<batch.length;n++){const d=batch[n],key=keys[n];records.push(key);let rec=found.get(key);
      if(rec){assert(await digest(rec.document)===await digest(d),'RECORD_CACHE_CONFLICT');reused++;}
      else {rec={document:d,chunks:await contextualChunks(d,{maxChunks:LIMITS.chunks-chunks.length})};pending.push([key,rec]);created++;}assert(chunks.length+rec.chunks.length<=LIMITS.chunks,'SOURCE_CHUNK_RESOURCE_BOUND');chunks.push(...rec.chunks);
    }
    if(recordCache.setMany)await recordCache.setMany(pending);else for(const [key,rec]of pending)await recordCache.set(key,rec);
  }
  const {edges,unresolved_by_uid,graphStats}=buildEdges(docs,previous);
  const docIds=new Set(docs.map(d=>d.uid));
  return {snapshot:Object.fromEntries(['revision','source_id','source_sha256','observed_at','transport','fixture_only'].map(k=>[k,snapshot[k]])),documents:docs,chunks,records,edges,unresolved_by_uid,reference_fields:Object.fromEntries(docs.map(d=>[d.uid,referenceFields(d)])),aliases:[...currentAliases.keys()].sort(cmp),excluded_aliases:[...excluded].sort(cmp),stats:{...counts,...graphStats,expanded_documents:0,documents:docs.length,records_reused:reused,records_rebuilt:created},delta:{added:docs.filter(d=>!old.has(d.uid)).map(d=>d.uid),changed:docs.filter(d=>old.has(d.uid)&&old.get(d.uid).content_hash!==d.content_hash).map(d=>d.uid),deleted:[...old.keys()].filter(id=>!docIds.has(id)),retired:docs.filter(d=>INACTIVE.has(d.state)&&!INACTIVE.has(old.get(d.uid)?.state)).map(d=>d.uid),acl_changed:docs.filter(d=>old.has(d.uid)&&canonical(d.allowed_roles)!==canonical(old.get(d.uid).allowed_roles)).map(d=>d.uid),revoked:docs.filter(d=>old.has(d.uid)&&old.get(d.uid).allowed_roles.some(r=>!d.allowed_roles.includes(r))).map(d=>d.uid)}};
}

export async function contextualChunks(doc,{maxChunks=SOURCE_LIMITS.documentChunks}={}){
  maxChunks=Math.min(maxChunks,SOURCE_LIMITS.documentChunks);
  const context={entity:doc.object_id,kind:doc.kind,title:doc.title,question:slice(str(or(doc.data.question,doc.data.hypothesis,'')),0,320),version:doc.version,document:doc.path,state:doc.state,topic:doc.topic,recorded_at:or(doc.data.updated_at,doc.data.created_at,null),valid_from:or(doc.data.valid_from,doc.data.effective_from,null),valid_until:doc.expires_at,related_references:references(doc.data).slice(0,8)};
  const result=[];let parts=[],spans=[],length=0;
  async function flush(){if(!parts.length)return;assert(result.length<maxChunks,'SOURCE_CHUNK_RESOURCE_BOUND');const body=parts.join('\n'),id=await digest([CHUNKER,doc.uid,doc.content_hash,spans,body]);result.push({id,uid:doc.uid,body,context:{...context,sections:[...new Set(spans.filter(s=>s.pointer.includes('/')).map(s=>s.pointer.split('/')[1]))].sort(cmp).slice(0,12)},segments:spans,representation:'sanitized_json_values'});parts=[];spans=[];length=0;}
  let leafCount=0;
  for(const [pointer,value]of leaves(doc.data)){assert(++leafCount<=SOURCE_LIMITS.documentLeaves&&len(pointer)<=SOURCE_LIMITS.pointerCodepoints,'SOURCE_LEAF_RESOURCE_BOUND');const text=typeof value==='string'?value:canonical(value);
    for(const window of windows(text)){const line=pointer+': '+window.body,size=len(line);if(parts.length&&length+size+1>1000)await flush();const offset=length+(parts.length?1:0);parts.push(line);spans.push({pointer:doc.pointer+pointer,start:offset,end:offset+size,value_start:window.start,value_end:window.end});length=offset+size;}
  }await flush();
  if(!result.length){assert(maxChunks>0,'SOURCE_CHUNK_RESOURCE_BOUND');result.push({id:await digest([CHUNKER,doc.uid,doc.content_hash]),uid:doc.uid,body:'{}',context,segments:[],representation:'sanitized_json_values'});}return result;
}

function hiddenPattern(hidden){assert(hidden.size<=20000&&[...hidden].reduce((n,a)=>n+len(a),0)<=SOURCE_LIMITS.hiddenAliasCodepoints,'HIDDEN_ALIAS_RESOURCE_BOUND');const values=[...new Set([...hidden].filter(Boolean).flatMap(a=>[a,pointerEscape(a)]))].sort((a,b)=>len(b)-len(a)||cmp(a,b));
  return values.length?new RegExp(`(?<![${WORD}])(?:${values.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})(?![${WORD}])`,'gu'):null;}
const matches=(pattern,value)=>{if(!pattern)return false;pattern.lastIndex=0;return pattern.test(value);};
const restrictedPointer=(pattern,p)=>matches(pattern,p)||p.split('/').slice(1).some(part=>matches(pattern,part.replaceAll('~1','/').replaceAll('~0','~')));
function redact(value,pattern){
  if(!pattern)return value;
  if(isRecord(value)){const original=entries(value),pairs=[];let changed=false;for(const [k,v]of original){if(matches(pattern,k)){changed=true;continue;}const next=redact(v,pattern);if(next!==v)changed=true;pairs.push([k,next]);}return changed?record(pairs):value;}
  if(Array.isArray(value)){let changed=false;const next=value.map(v=>{const n=redact(v,pattern);if(n!==v)changed=true;return n;});return changed?next:value;}
  if(typeof value==='string'){pattern.lastIndex=0;return value.replace(pattern,'[restricted reference]');}return value;
}

export async function authorizedView(generation,{current=generation,role,now}){
  role=roleName(role);const moment=instant(now),latest=new Map(current.documents.map(d=>[d.uid,d])),boundaries=[];let allowed=[];
  for(const item of generation.documents){const d={...item},head=latest.get(d.uid);if(!head||!head.allowed_roles.includes(role)||head.state==='DELETED'||d.ambiguous_identity||head.ambiguous_identity)continue;
    const from=or(d.data.valid_from,d.data.effective_from);if(truth(from))boundaries.push(instant(from));if(truth(d.expires_at))boundaries.push(instant(d.expires_at));
    if(truth(from)&&moment<instant(from))continue;if(!d.allowed_roles.includes(role)||INACTIVE.has(d.state)||truth(d.expires_at)&&instant(d.expires_at)<=moment)continue;allowed.push(d);
  }
  let start=instant('0001-01-01T00:00:00+00:00'),end=instant('9999-12-31T23:59:59.999999+00:00');for(const b of boundaries){if(b<=moment&&b>start)start=b;if(b>moment&&b<end)end=b;}
  // Reviewed 1.2 hashes the pre-locator-quarantine scope; final scope is bound separately below.
  const key=await digest([current.snapshot.source_sha256,generation.snapshot.source_sha256,role,allowed.map(d=>[d.uid,d.content_hash]),false]);
  const all=aliasMap([...current.documents,...generation.documents]),excluded=new Set([...current.excluded_aliases,...generation.excluded_aliases]);
  let visible,pattern;function refresh(){visible=new Set(allowed.map(d=>d.uid));const hidden=new Set([...all].filter(([,ids])=>![...ids].some(id=>visible.has(id))).map(([a])=>a));for(const a of excluded)hidden.add(a);pattern=hiddenPattern(hidden);}refresh();
  while(pattern){const filtered=allowed.filter(d=>!restrictedPointer(pattern,d.pointer)&&![d.uid,d.object_id,d.path,d.kind,d.version,d.state,d.expires_at??'',d.data.valid_from??'',d.data.effective_from??'',d.data.created_at??'',d.data.updated_at??''].some(v=>matches(pattern,str(v))));if(filtered.length===allowed.length)break;allowed=filtered;refresh();}
  const originals=new Map();for(const c of generation.chunks)if(visible.has(c.uid)){if(!originals.has(c.uid))originals.set(c.uid,[]);originals.get(c.uid).push(c);}
  const chunks=[];for(const d of allowed){const data=redact(d.data,pattern),title=redact(d.title,pattern),topic=redact(d.topic,pattern),changed=data!==d.data||title!==d.title||topic!==d.topic;d.data=data;d.title=title;d.text=redact(d.text,pattern);d.topic=topic!==d.topic?'':d.topic;d.refs=references(d.data);chunks.push(...changed?await contextualChunks(d):originals.get(d.uid)??[]);}
  const edges=(generation.edges??[]).filter(e=>visible.has(e.source)&&visible.has(e.target)&&!restrictedPointer(pattern,e.pointer));
  return {key,role,snapshot:generation.snapshot,authorization_revision:current.snapshot.revision,authorization_source_sha256:current.snapshot.source_sha256,validity_start:formatInstant(start),validity_end:formatInstant(end),documents:allowed,chunks,edges,include_inactive:false};
}
export function formatInstant(us){let seconds=us/1000000n,rest=us%1000000n;if(rest<0){seconds--;rest+=1000000n;}const date=new Date(Number(seconds)*1000).toISOString().replace(/\.000Z$/,'');return date+(rest?'.'+String(rest).padStart(6,'0'):'')+'+00:00';}
export const chunkText=c=>[c.context.entity,c.context.title,c.context.question,'version '+c.context.version,c.body].join('\n');

const RELATIONS={"hypothesis_id":"tests_hypothesis","hypothesis_ref":"tests_hypothesis","hypothesis_refs":"tests_hypothesis","test_id":"for_test","target_test_id":"for_test","test_ids":"for_test","test_ref":"for_test","test_refs":"for_test","parent_test_id":"derived_from","contests_test_id":"contests","contest_test_id":"has_contest","recipe":"uses_recipe","recipe_ref":"uses_recipe","recipe_id":"uses_recipe","binding_id":"uses_binding","binding_ref":"uses_binding","data_binding_id":"uses_binding","dataset":"uses_dataset","dataset_id":"uses_dataset","dataset_ref":"uses_dataset","dataset_ids":"uses_dataset","dataset_refs":"uses_dataset","run_id":"has_run","run_ref":"has_run","result_id":"has_result","result_ref":"has_result","artifact_id":"has_artifact","artifact_ref":"has_artifact","artifact_refs":"has_artifact","evidence_id":"supported_by","evidence_ref":"supported_by","evidence_refs":"supported_by","work_id":"for_work","work_ref":"for_work","roadmap_id":"in_campaign","roadmap_ref":"in_campaign","campaign_id":"in_campaign","depends_on":"depends_on","depends_on_ids":"depends_on","supersedes":"supersedes","superseded_by":"superseded_by","contradicts":"contradicts","confirms":"confirms","derives_from":"derived_from","source_ref":"derived_from","refs":"references","related_ids":"references"};
export function referenceFields(doc){const result=[];for(const [pointer,value]of leaves(doc.data)){if(typeof value!=='string')continue;const key=pointer.split('/').reverse().find(p=>p&&!pythonIsDigit(p))??'',relation=has(RELATIONS,key)?RELATIONS[key]:undefined;if(relation)result.push({ref:value,relation,pointer:doc.pointer+pointer});}return result;}
export function buildEdges(docs,previous=null){
  const aliases=aliasMap(docs),oldAliases=aliasMap(previous?.documents??[]),oldRefs=previous?.reference_fields?new Map(Object.entries(previous.reference_fields)):new Map((previous?.documents??[]).map(d=>[d.uid,referenceFields(d)]));
  const changed=new Set([...new Set([...aliases.keys(),...oldAliases.keys()])].filter(a=>canonical([...(aliases.get(a)??[])].sort(cmp))!==canonical([...(oldAliases.get(a)??[])].sort(cmp))));
  const refs=new Map(docs.map(d=>[d.uid,referenceFields(d)])),affected=new Set(docs.filter(d=>canonical(refs.get(d.uid))!==canonical(oldRefs.get(d.uid)??null)||refs.get(d.uid).some(r=>changed.has(r.ref))).map(d=>d.uid)),uids=new Set(docs.map(d=>d.uid));
  const edges=(previous?.edges??[]).filter(e=>uids.has(e.source)&&uids.has(e.target)&&!affected.has(e.source)),reused=edges.length;
  const unresolved=Object.fromEntries(Object.entries(previous?.unresolved_by_uid??{}).filter(([u])=>uids.has(u)));
  for(const d of docs){if(!affected.has(d.uid))continue;let missing=0;const seen=new Set();for(const f of refs.get(d.uid)){const targets=aliases.get(f.ref)??new Set();if(targets.size!==1){missing++;continue;}const target=[...targets][0];if(target===d.uid)continue;const id=canonical([d.uid,target,f.relation,f.pointer]);if(seen.has(id))continue;seen.add(id);edges.push({source:d.uid,target,relation:f.relation,pointer:f.pointer,origin:'explicit_source_field'});}unresolved[d.uid]=missing;}
  edges.sort((a,b)=>cmp(a.source,b.source)||cmp(a.target,b.target)||cmp(a.relation,b.relation)||cmp(a.pointer,b.pointer));
  return {edges,unresolved_by_uid:unresolved,graphStats:{relation_sources_rebuilt:affected.size,relation_sources_reused:docs.length-affected.size,edges_reused:reused,edges_resolved:edges.length-reused,changed_aliases:changed.size}};
}
