import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPublicCampaignSnapshot, validatePublicCampaignSnapshot} from './public-campaign-projection.mjs';
import {googleToken} from '../adapters/google.mjs';

const MAX_BYTES = 8 * 1024 * 1024;
async function readDriveSnapshot(env, {fetcher = fetch, tokenProvider = googleToken} = {}) {
  const id = String(env.NEXO_PUBLIC_CAMPAIGNS_DRIVE_FILE_ID || '');
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('PUBLIC_CAMPAIGN_FILE_INVALID');
  const signal = AbortSignal.timeout(20000);
  const token = await tokenProvider(env, signal, {scopes:['https://www.googleapis.com/auth/drive.readonly']});
  if (!token) throw new Error('PUBLIC_CAMPAIGN_AUTH_REQUIRED');
  const options = {signal, redirect:'error', cache:'no-store', headers:{Authorization:`Bearer ${token}`, Accept:'application/json'}};
  const base = `https://www.googleapis.com/drive/v3/files/${id}?`;
  const metadata = await fetcher(base + 'fields=id,mimeType,size&supportsAllDrives=true', options);
  if (!metadata.ok) throw new Error('PUBLIC_CAMPAIGN_FILE_UNAVAILABLE');
  const info = await metadata.json();
  if (info.id !== id || info.mimeType !== 'application/json' || !Number.isFinite(Number(info.size)) || Number(info.size) > MAX_BYTES) throw new Error('PUBLIC_CAMPAIGN_FILE_INVALID');
  const response = await fetcher(base + 'alt=media&supportsAllDrives=true', options);
  if (!response.ok) throw new Error('PUBLIC_CAMPAIGN_FILE_UNAVAILABLE');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_TOO_LARGE');
    chunks.push(chunk);
  }
  return validatePublicCampaignSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

// Reads only the pre-sanitized publication artifact. Never opens Tower or accepts a browser path.
export async function readPublicCampaignSnapshot(env = {}, options) {
  if (env.NEXO_PUBLIC_CAMPAIGNS_DRIVE_FILE_ID) return readDriveSnapshot(env, options);
  const data = await readFile(env.NEXO_PUBLIC_CAMPAIGNS_FILE || resolve('dist/public-campaigns.json'));
  if (data.byteLength > 8 * 1024 * 1024) throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_TOO_LARGE');
  return validatePublicCampaignSnapshot(JSON.parse(data.toString('utf8')));
}
export async function publicCampaignAtlas(env = {}, options) {
  try {
    const input = await readPublicCampaignSnapshot(env, options);
    // The public site shows campaign summaries only. Individual tests remain
    // on authenticated routes even if an older publication included them.
    const snapshot = createPublicCampaignSnapshot(input.campaigns.map(c => ({...c, tests:[], testsCoverage:'UNAVAILABLE'})), input);
    return {status: 200, body: {...snapshot, contract: 'ATLAS_PUBLIC_V1', campaignsContract: snapshot.contract, items: [], links: []}};
  } catch { return {status: 503, body: {error: 'PUBLIC_CAMPAIGNS_UNAVAILABLE'}}; }
}
