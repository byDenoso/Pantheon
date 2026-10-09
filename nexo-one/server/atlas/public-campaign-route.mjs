import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validatePublicCampaignSnapshot} from './public-campaign-projection.mjs';

// Reads only the pre-sanitized publication artifact. Never opens Tower or accepts a browser path.
export async function readPublicCampaignSnapshot(env = {}) {
  const data = await readFile(env.NEXO_PUBLIC_CAMPAIGNS_FILE || resolve('dist/public-campaigns.json'));
  if (data.byteLength > 8 * 1024 * 1024) throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_TOO_LARGE');
  return validatePublicCampaignSnapshot(JSON.parse(data.toString('utf8')));
}
export async function publicCampaignAtlas(env = {}) {
  try {
    const snapshot = await readPublicCampaignSnapshot(env);
    return {status: 200, body: {...snapshot, contract: 'ATLAS_PUBLIC_V1', campaignsContract: snapshot.contract, items: [], links: []}};
  } catch { return {status: 503, body: {error: 'PUBLIC_CAMPAIGNS_UNAVAILABLE'}}; }
}
