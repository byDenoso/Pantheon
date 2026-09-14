import type { CampaignNode } from './contracts';

export type CockpitCampaignRow = {
  id: string;
  label: string;
  status: string;
  domain: string | null;
};

/**
 * Pure formatting/ordering step for the Cockpit's "Campanhas" panel: real campaign
 * rows in, real campaign rows out (same id/label/status/domain), just sorted and
 * capped for an at-a-glance operational view. Never invents a campaign, a status, or
 * a domain that wasn't already on the input node.
 */
export function summarizeCampaignStatus(campaigns: CampaignNode[], limit = 10): CockpitCampaignRow[] {
  return campaigns
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(campaign => ({
      id: campaign.id,
      label: campaign.label,
      status: campaign.status || 'UNKNOWN',
      domain: campaign.domainId ? campaign.domainId.replace(/^domain:/i, '').toUpperCase() : null
    }));
}
