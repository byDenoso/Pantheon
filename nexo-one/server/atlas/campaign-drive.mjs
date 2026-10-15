import {createHash} from 'node:crypto';
import {parseEvent, normalizeCampaignObservation, requireValue, stable, sha256, atlasCampaignAllowed} from './campaign-records.mjs';

const API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const DOC = 'application/vnd.google-apps.document';
const META = 'id,name,mimeType,parents,trashed,version,md5Checksum,size,modifiedTime,appProperties';
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(v);
const scopeName = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(v);
const sameHead = (a,b) => stable(a) === stable(b);

export function campaignScope(env, selected) {
  let scopes;
  try { scopes = JSON.parse(env.NEXO_ATLAS_CAMPAIGN_FOLDERS || '{}'); } catch { throw new Error('CAMPAIGN_CONFIG_INVALID'); }
  requireValue(scopes && typeof scopes === 'object' && !Array.isArray(scopes), 'CAMPAIGN_CONFIG_INVALID');
  const campaignId = selected ?? env.NEXO_ATLAS_DEFAULT_CAMPAIGN;
  requireValue(scopeName(campaignId) && Object.hasOwn(scopes,campaignId), 'CAMPAIGN_SCOPE_NOT_CONFIGURED');
  requireValue(atlasCampaignAllowed(campaignId), 'CAMPAIGN_EXCLUDED');
  requireValue(id(env.NEXO_CAMPAIGNS_ROOT_ID) && id(scopes[campaignId]), 'CAMPAIGN_CONFIG_INVALID');
  return {campaignId,folderId:scopes[campaignId],rootId:env.NEXO_CAMPAIGNS_ROOT_ID};
}

export async function readCampaignObservation({token,rootId,folderId,campaignId,fetchImpl=fetch,
  signal=AbortSignal.timeout(20000),now=()=>new Date().toISOString(),maxFiles=500,maxBytes=8*1024*1024} = {}) {
  requireValue(id(rootId) && id(folderId) && scopeName(campaignId), 'CAMPAIGN_SCOPE_INVALID');
  requireValue(atlasCampaignAllowed(campaignId), 'CAMPAIGN_EXCLUDED');
  requireValue(typeof token === 'string' && token.length > 0, 'CAMPAIGN_AUTH_MISSING');
  requireValue(Number.isInteger(maxFiles) && maxFiles >= 1 && maxFiles <= 500 && Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 8*1024*1024, 'CAMPAIGN_LIMIT_INVALID');
  let total = 0;
  async function bytes(path='',params={},limit=5*1024*1024) {
    const url = new URL(API+path); for (const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v));
    const response = await fetchImpl(url,{method:'GET',signal,redirect:'error',cache:'no-store',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
    if (!response.ok) {
      try { await response.body?.cancel?.(); } catch { /* Preserve the HTTP denial. */ }
      throw new Error(response.status === 401 || response.status === 403 ? `CAMPAIGN_AUTH_${response.status}` : `CAMPAIGN_HTTP_${response.status}`);
    }
    const parts=[]; let size=0;
    try {
      for await (const part of response.body) {
        size+=part.length; total+=part.length;
        requireValue(size<=limit && total<=maxBytes,'CAMPAIGN_READ_LIMIT'); parts.push(part);
      }
    } finally { if (signal.aborted) await response.body?.cancel?.().catch(()=>{}); }
    return Buffer.concat(parts);
  }
  const json = async (path,params,limit) => JSON.parse((await bytes(path,params,limit)).toString('utf8'));
  async function metadata(fileId) {
    const meta=await json('/'+fileId,{fields:META,supportsAllDrives:true},128*1024);
    requireValue(meta.id===fileId && meta.trashed===false,'CAMPAIGN_IDENTITY_INVALID'); return meta;
  }
  const root=await metadata(rootId);
  requireValue(root.mimeType===FOLDER,'CAMPAIGN_ROOT_INVALID');
  async function folder() {
    const meta=await metadata(folderId);
    requireValue(meta.mimeType===FOLDER && meta.name===campaignId && sameHead(meta.parents,[rootId]),'CAMPAIGN_FOLDER_MISMATCH'); return meta;
  }
  const folderBefore=await folder();
  async function listing() {
    const files=[],tokens=new Set(); let token;
    for (let page=0;page<20;page++) {
      const params={q:`'${folderId}' in parents and trashed = false`,fields:`nextPageToken,incompleteSearch,files(${META})`,
        pageSize:100,supportsAllDrives:true,includeItemsFromAllDrives:true,orderBy:'name',...(token?{pageToken:token}:{})};
      const value=await json('',params,1024*1024);
      requireValue(!value.incompleteSearch && Array.isArray(value.files),'CAMPAIGN_LIST_INCOMPLETE');
      for (const file of value.files) requireValue(id(file.id) && file.trashed===false && sameHead(file.parents,[folderId]),'CAMPAIGN_LIST_IDENTITY_INVALID');
      files.push(...value.files); requireValue(files.length<=maxFiles,'CAMPAIGN_LIST_LIMIT');
      token=value.nextPageToken;
      if (!token) {
        requireValue(new Set(files.map(f=>f.id)).size===files.length,'CAMPAIGN_LIST_DUPLICATE');
        return files.sort((a,b)=>a.id.localeCompare(b.id));
      }
      requireValue(!tokens.has(token),'CAMPAIGN_PAGE_LOOP'); tokens.add(token);
    }
    throw new Error('CAMPAIGN_LIST_LIMIT');
  }
  const before=await listing(),observations=[]; let unparsed=0;
  for (const file of before) {
    // New records opt into a minimal wire format; old artifacts remain untouched.
    const candidate=!!file.appProperties?.nexo_event_id || /^NEXO_EVENT__EV-[a-f0-9]{64}(?:\.json)?$/.test(file.name);
    if (!candidate) { unparsed++; continue; }
    requireValue(file.mimeType===DOC || file.mimeType==='application/json','EVENT_MIME_UNSUPPORTED');
    const raw=file.mimeType===DOC ? await bytes('/'+file.id+'/export',{mimeType:'text/plain'})
      : await bytes('/'+file.id,{alt:'media',supportsAllDrives:true});
    if (file.mimeType!==DOC) requireValue(file.md5Checksum===createHash('md5').update(raw).digest('hex'),'EVENT_BYTES_MISMATCH');
    const after=await metadata(file.id);
    requireValue(sameHead(file,after),'EVENT_READ_RACE');
    const event=parseEvent(raw,campaignId);
    if (/^NEXO_EVENT__EV-[a-f0-9]{64}(?:\.json)?$/.test(file.name)) requireValue(file.name.replace(/^NEXO_EVENT__|\.json$/g,'')===event.event_id,'EVENT_FILENAME_MISMATCH');
    if (file.appProperties?.nexo_campaign_id) requireValue(file.appProperties.nexo_campaign_id===campaignId,'EVENT_METADATA_MISMATCH');
    if (file.appProperties?.nexo_event_id) requireValue(file.appProperties.nexo_event_id===event.event_id,'EVENT_METADATA_MISMATCH');
    observations.push({event,file_id:file.id,version:file.version,sha256:sha256(raw),mime_type:file.mimeType});
  }
  requireValue(sameHead(before,await listing()) && sameHead(folderBefore,await folder()),'CAMPAIGN_READ_RACE');
  return normalizeCampaignObservation(observations,{campaignId,folderId,generatedAt:now(),unparsed});
}
