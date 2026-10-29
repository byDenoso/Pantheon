import {webcrypto, createHash} from 'node:crypto';
import {TOWER_ID} from '../server/mcp/operational-state.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FILE_URL = `https://www.googleapis.com/drive/v3/files/${TOWER_ID}`;
const LIMIT = 16 * 1024 * 1024;
const fail = code => { throw new Error(code); };
const b64url = value => Buffer.from(value).toString('base64url');

async function accessToken(env, fetcher) {
  let key;
  try { key = JSON.parse(env?.GOOGLE_SA_KEY); } catch { fail('GOOGLE_SA_KEY_INVALID'); }
  if (key?.type !== 'service_account' || typeof key.client_email !== 'string' || typeof key.private_key !== 'string') fail('GOOGLE_SA_KEY_INVALID');
  const pem = key.private_key.match(/^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+)-----END PRIVATE KEY-----\s*$/);
  if (!pem) fail('GOOGLE_SA_KEY_INVALID');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${b64url(JSON.stringify({iss:key.client_email,scope:'https://www.googleapis.com/auth/drive.readonly',aud:TOKEN_URL,iat:now,exp:now+3600}))}`;
  let signingKey;
  try { signingKey = await webcrypto.subtle.importKey('pkcs8', Buffer.from(pem[1].replace(/\s/g,''), 'base64'), {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['sign']); } catch { fail('GOOGLE_SA_KEY_INVALID'); }
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, Buffer.from(unsigned));
  const response = await fetcher(TOKEN_URL, {method:'POST', redirect:'manual', headers:{'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${b64url(signature)}`}), signal:AbortSignal.timeout(20000)});
  if (!response.ok) fail('GOOGLE_TOKEN_FAILED');
  const data = await response.json();
  if (typeof data.access_token !== 'string' || !data.access_token || data.token_type?.toLowerCase() !== 'bearer') fail('GOOGLE_TOKEN_INVALID');
  return data.access_token;
}

async function metadata(token, fetcher) {
  const response = await fetcher(`${FILE_URL}?fields=id%2CmimeType%2Csize%2CheadRevisionId`, {redirect:'manual', headers:{authorization:`Bearer ${token}`, 'cache-control':'no-store'}, signal:AbortSignal.timeout(20000)});
  if (!response.ok) fail('DRIVE_METADATA_FAILED');
  const data = await response.json();
  const size = Number(data.size);
  if (data.id !== TOWER_ID || data.mimeType !== 'application/json' || !Number.isSafeInteger(size) || size < 2 || size > LIMIT || typeof data.headRevisionId !== 'string' || !data.headRevisionId) fail('DRIVE_REVISION_ROW_INVALID');
  return {id:data.headRevisionId,size};
}

export async function readCanonicalDriveRevision(env, fetcher = fetch) {
  return metadata(await accessToken(env, fetcher), fetcher);
}

export async function readCanonicalDriveTowerBytes(env, fetcher = fetch) {
  const token = await accessToken(env, fetcher);
  const before = await metadata(token, fetcher);
  const response = await fetcher(`${FILE_URL}?alt=media`, {redirect:'manual', headers:{authorization:`Bearer ${token}`,accept:'application/json','cache-control':'no-store'}, signal:AbortSignal.timeout(20000)});
  if (!response.ok) fail('DRIVE_DOWNLOAD_FAILED');
  if (response.headers.has('content-length') && Number(response.headers.get('content-length')) !== before.size) fail('DRIVE_DOWNLOAD_SIZE_MISMATCH');
  const reader = response.body?.getReader();
  if (!reader) fail('DRIVE_DOWNLOAD_BODY_MISSING');
  const chunks = []; let size = 0;
  try {
    for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.byteLength; if (size > before.size) { await reader.cancel(); fail('DRIVE_DOWNLOAD_SIZE_MISMATCH'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  if (size !== before.size) fail('DRIVE_DOWNLOAD_SIZE_MISMATCH');
  const raw = Buffer.concat(chunks);
  const bodyDigest = createHash('sha256').update(raw).digest('hex');
  const after = await metadata(token, fetcher);
  if (after.id !== before.id || after.size !== before.size) fail('TOWER_READ_RACE');
  return {raw,transport:{kind:'GOOGLE_DRIVE_COMPLETE_BODY_AND_REVISION_READBACK',revision_id:before.id,body_sha256:bodyDigest,size:raw.length}};
}
