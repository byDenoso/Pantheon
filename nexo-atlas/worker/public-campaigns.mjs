import {verifiedCampaigns} from '../server/atlas/public-campaign-boundary.mjs';
import snapshot from '../.sites-runtime/public-campaign-snapshot.mjs';
const approved = snapshot === null ? null : verifiedCampaigns(snapshot);
export function campaignPublicProjection(legacy) {
  if (!approved) return legacy;
  return {...legacy, campaignsContract: approved.contract, campaigns: approved.campaigns,
    coverage: approved.coverage, generatedAt: approved.generatedAt,
    sourceRevision: approved.sourceRevision, snapshotDigest: approved.snapshotDigest};
}
