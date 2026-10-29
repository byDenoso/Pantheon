import {createHash} from 'node:crypto';
import {TOWER_ID, validateCanonicalTowerIdentity} from '../server/mcp/operational-state.mjs';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {compilePrivateWorkspaceRuntime} from '../server/atlas/private-workspace.mjs';
import {safeConnectorStatus,boundedRetryAfter} from './source-errors.mjs';

export const DRIVE_CONNECTOR = 'connector_5f3c8c41a1e54ad7a76272c89e2554fa';
const FILE_URL = `https://drive.google.com/file/d/${TOWER_ID}/view`;
const fail = (message, connectorStatus, retryAfter) => {const error = new Error(message); if (safeConnectorStatus(connectorStatus)) error.connectorStatus = connectorStatus; if(boundedRetryAfter(retryAfter))error.retryAfter=retryAfter; throw error;};
async function stage(name, operation) {
  try {return await operation();}
  catch (error) {
    // Log runtime transport diagnostics only. URLs, quoted payloads, email
    // addresses and credential-sized strings are redacted before logging.
    const detail = String(error?.message || '').slice(0, 500)
      .replace(/https?:\/\/[^\s]+/gi, '[url]')
      .replace(/\b[^\s@]+@[^\s@]+\b/g, '[email]')
      .replace(/(?:Bearer|token|secret|password|authorization)\s*[:=]?\s*\S+/gi, '[credential]')
      .replace(/["'`][^"'`]*["'`]/g, '[quoted]')
      .replace(/[A-Za-z0-9_+\/=\-]{32,}/g, '[identifier]');
    console.error('ATLAS_SOURCE_STAGE', JSON.stringify({stage: name, name: /^[A-Za-z]{1,32}$/.test(error?.name || '') ? error.name : 'Error', detail}));
    fail(name + '_EXCEPTION', safeConnectorStatus(error?.connectorStatus)||safeConnectorStatus(error?.status),error?.retryAfter);
  }
}
async function invoke(binding, action, args) {
  if (!binding?.invoke) fail('PRIVATE_SOURCE_UNAVAILABLE', 'binding_unavailable');
  const result = await stage('DRIVE_' + action.toUpperCase() + '_RPC', () => binding.invoke(DRIVE_CONNECTOR, action, args));
  if (result?.status !== 'success') fail('CONNECTOR_' + action.toUpperCase() + '_FAILED', result?.status || 'upstream_error',result?.retryAfter);
  if(result.result?.isError===true)fail('CONNECTOR_'+action.toUpperCase()+'_FAILED','tool_error');
  let data = result.result?.structuredContent;
  // MCP permits structured output either as structuredContent or a JSON text
  // content block. Accept those two forms without treating arbitrary text as data.
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    for (const part of Array.isArray(result.result?.content) ? result.result.content : []) {
      if (part.type !== 'text' || typeof part.text !== 'string' || part.text.length > 2 * 1024 * 1024) continue;
      try {const parsed = JSON.parse(part.text); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {data = parsed; break;}} catch {}
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('CONNECTOR_' + action.toUpperCase() + '_PAYLOAD_INVALID');
  return data;
}
export async function readCanonicalDriveRevision(binding) {
  const data = await invoke(binding, 'list_file_revisions', {fileId: TOWER_ID, pageSize: 1000});
  if (data.fileId !== TOWER_ID || typeof data.currentRevisionId !== 'string') fail('DRIVE_REVISION_ID_INVALID');
  const row = Array.isArray(data.revisions) ? data.revisions.find(row => row.id === data.currentRevisionId) : null;
  const size = Number(row?.size);
  if (!Number.isSafeInteger(size) || size < 2 || size > 16 * 1024 * 1024 || row.mimeType !== 'application/json') fail('DRIVE_REVISION_ROW_INVALID');
  return {id: data.currentRevisionId, size};
}
export async function readCanonicalDriveTowerBytes(binding, fetcher = fetch) {
  // This is a fixed read-only adapter. The browser cannot supply a connector,
  // action, file ID, URL, owner, or download target.
  const before = await readCanonicalDriveRevision(binding);
  const data = await invoke(binding, 'fetch', {url: FILE_URL, download_raw_file: true, include_base64: false});
  if (data.id !== TOWER_ID || data.mime_type !== 'application/json' || Number(data.file_size_bytes) !== before.size) fail('DRIVE_DOWNLOAD_METADATA_INVALID');
  const rawUrl = data.file_uri?.download_url;
  let url; try {url = new URL(rawUrl);} catch {fail('DRIVE_DOWNLOAD_URL_MISSING');}
  if (url.protocol !== 'https:' || !/^sdmntpr[a-z0-9-]+\.oaiusercontent\.com$/.test(url.hostname) || url.username || url.password || url.port) fail('DRIVE_DOWNLOAD_URL_REJECTED');
  // Sites owns its Worker compatibility date. Use the portable HTTP cache
  // headers rather than RequestInit.cache, which older dispatch dates reject.
  // Workers does not implement redirect:'error'. Manual mode plus the non-2xx
  // rejection below refuses every redirect without following its destination.
  const response = await stage('DRIVE_DOWNLOAD_FETCH', () => fetcher(url, {redirect: 'manual', headers: {'Accept': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache'}, cf: {cacheTtlByStatus: {'200-599': -1}}, signal: AbortSignal.timeout(20000)}));
  if (!response.ok) fail('DRIVE_DOWNLOAD_HTTP_' + response.status);
  if (response.headers.has('content-length') && Number(response.headers.get('content-length')) !== before.size) fail('DRIVE_DOWNLOAD_SIZE_MISMATCH');
  const raw = await stage('DRIVE_DOWNLOAD_BODY', async () => {
    const chunks = []; let size = 0;
    const reader = response.body?.getReader(); if (!reader) fail('DRIVE_DOWNLOAD_BODY_MISSING');
    try {
      for (;;) {const {value: chunk, done} = await reader.read(); if (done) break; size += chunk.byteLength; if (size > before.size) {await reader.cancel(); fail('DRIVE_DOWNLOAD_SIZE_MISMATCH');} chunks.push(chunk);}
    } finally {reader.releaseLock();}
    if (size !== before.size) fail('DRIVE_DOWNLOAD_SIZE_MISMATCH');
    return Buffer.concat(chunks);
  });
  const bodyDigest = createHash('sha256').update(raw).digest('hex');
  const after = await readCanonicalDriveRevision(binding);
  if (after.id !== before.id || after.size !== before.size) fail('TOWER_READ_RACE');
  return {raw, transport: {kind: 'DRIVE_CONNECTOR_COMPLETE_BODY_AND_REVISION_READBACK', revision_id: before.id, body_sha256: bodyDigest, size: raw.length}};
}
export async function readCanonicalDriveTower(binding, fetcher = fetch) {
  const {raw,transport}=await readCanonicalDriveTowerBytes(binding,fetcher);
  const tower=JSON.parse(raw.toString('utf8'));
  validateCanonicalTowerIdentity(tower,{file_id:TOWER_ID,body_verified:true});
  return {tower,transport};
}
export async function readDriveTower(binding, fetcher = fetch, {profile} = {}) {
  const {tower, transport} = await readCanonicalDriveTower(binding, fetcher);
  const runtime = profile === 'workspace-v1' ? compilePrivateWorkspaceRuntime(tower) : compilePrivateTowerRuntime(tower);
  runtime.data.transport = transport;
  return runtime;
}

/** No download or caller-selected source. Any change requires a trusted rebuild. */
export async function validateImportedDriveRevision(binding, manifest) {
  if (manifest.snapshot?.source_id !== TOWER_ID || !manifest.transport ||
      typeof manifest.transport.revision_id !== 'string' || !Number.isSafeInteger(manifest.transport.size))
    fail('IMPORTED_TRANSPORT_BINDING_MISSING');
  const current = await readCanonicalDriveRevision(binding);
  if (current.id !== manifest.transport.revision_id || current.size !== manifest.transport.size)
    fail('IMPORTED_GENERATION_STALE');
  return current;
}
