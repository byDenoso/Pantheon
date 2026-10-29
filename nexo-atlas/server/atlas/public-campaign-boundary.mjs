import {validatePublicCampaignSnapshot} from './public-campaign-projection.mjs';
const forbidden = /(?:\bBOARD\b|\bolymp[a-z0-9_-]*\b|(?<![\p{L}\p{N}])p[. _-]*e[. _-]*e?[. _-]*r(?![\p{L}\p{N}])|\b(?:PCDM|pNGB|Miqueias)\b|CONTEST-|WORK-|NEXO_INBOX|-----BEGIN|\bBearer\s)/iu;
export function verifiedCampaigns(value) {
  const safe = validatePublicCampaignSnapshot(value);
  if (safe.coverage === 'UNAVAILABLE' || !safe.campaigns.length) throw new Error('PUBLIC_CAMPAIGNS_PENDING');
  // The legacy publication boundary excludes the entire private families,
  // not merely a detection claim. Reject the artifact rather than edit claims.
  if (forbidden.test(JSON.stringify(safe.campaigns))) throw new Error('PUBLIC_CAMPAIGN_PRIVATE_CONTENT');
  return safe;
}
