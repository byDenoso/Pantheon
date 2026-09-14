import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCampaignStatus } from '../src/core/cockpit-campaigns.ts';

test('summarizeCampaignStatus never invents a campaign, status, or domain -- only reshapes real input', () => {
  const campaigns = [
    { id: 'CAMP-B', type: 'CAMPAIGN', label: 'Bravo', domainId: 'domain:D2', status: 'CONSTRAINED' },
    { id: 'CAMP-A', type: 'CAMPAIGN', label: 'Alpha', domainId: 'domain:D1', status: 'CHECKPOINTED' }
  ];
  const rows = summarizeCampaignStatus(campaigns);
  assert.deepEqual(rows.map(r => r.id), ['CAMP-A', 'CAMP-B'], 'sorted by label, not input order');
  assert.equal(rows[0].domain, 'D1');
  assert.equal(rows[0].status, 'CHECKPOINTED');
});

test('summarizeCampaignStatus falls back to UNKNOWN status and null domain honestly, never fabricating either', () => {
  const rows = summarizeCampaignStatus([{ id: 'CAMP-X', type: 'CAMPAIGN', label: 'X' }]);
  assert.equal(rows[0].status, 'UNKNOWN');
  assert.equal(rows[0].domain, null);
});

test('summarizeCampaignStatus caps the list for an at-a-glance panel without dropping the alphabetically-first entries', () => {
  const campaigns = Array.from({ length: 20 }, (_, i) => ({ id: `CAMP-${i}`, type: 'CAMPAIGN', label: `Campaign ${String(i).padStart(2, '0')}` }));
  const rows = summarizeCampaignStatus(campaigns, 5);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].label, 'Campaign 00');
  assert.equal(rows[4].label, 'Campaign 04');
});

test('summarizeCampaignStatus is a pure function: never mutates the input array', () => {
  const campaigns = [{ id: 'CAMP-B', type: 'CAMPAIGN', label: 'Bravo' }, { id: 'CAMP-A', type: 'CAMPAIGN', label: 'Alpha' }];
  const snapshot = JSON.parse(JSON.stringify(campaigns));
  summarizeCampaignStatus(campaigns);
  assert.deepEqual(campaigns, snapshot);
});
