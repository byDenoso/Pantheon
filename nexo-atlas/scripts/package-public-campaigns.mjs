import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {verifiedCampaigns} from '../server/atlas/public-campaign-boundary.mjs';
// No new approval is produced here. The operator must supply the existing
// sanitized Writer export; missing input leaves the previous public catalog.
await mkdir('.sites-runtime',{recursive:true});
let snapshot = null;
try {
  const raw = await readFile('worker/public-campaigns.approved.json');
  if(raw.byteLength > 8*1024*1024)throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_TOO_LARGE');
  snapshot=verifiedCampaigns(JSON.parse(raw));
  if(snapshot.coverage==='UNAVAILABLE'||!snapshot.campaigns.length)throw new Error('PUBLIC_CAMPAIGNS_PENDING');
} catch(error) {if(error.code!=='ENOENT')throw error;}
await writeFile('.sites-runtime/public-campaign-snapshot.mjs',`export default ${JSON.stringify(snapshot)};\n`);
console.log(snapshot ? 'Writer campaign artifact validated for packaging' : 'No approved campaign artifact: preserving the existing public catalog');
