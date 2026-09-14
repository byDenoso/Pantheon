import type { AtlasNode } from '../scene/types';
import type { ScientificStatus } from './types';
import { scientificStatus } from './scientific-status.ts';

/**
 * The real per-domain "scientific question" read model for Observatório/Resumo do
 * Universo. Built entirely from data the static/live graph API already publishes
 * (system:SCIENCE -> DOMAIN nodes, domain:Dx -> CAMPAIGN children with a real
 * metadata.testCount) -- no invented question text, status, or evidence count.
 *
 * `synthesis` is always null today: no producer (static snapshot generator or the
 * live Vercel functions) computes a quantitative synthesis narrative for a domain
 * anywhere in this system. Rather than silently rendering a generic empty panel,
 * `unavailableReason` states that plainly so the UI can show why, not just that.
 */
export type ObservatoryCampaignRef = {
  id: string;
  label: string;
  status: string;
  testCount: number | null;
};

export type ObservatoryQuestion = {
  id: string;
  code: string;
  label: string;
  question: string;
  status: ScientificStatus;
  rawStatus: string;
  campaigns: ObservatoryCampaignRef[];
  testCount: number;
  synthesis: string | null;
  unavailableReason: string | null;
};

function metadataOf(node: AtlasNode): Record<string, unknown> {
  const value = node.metadata;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function testCountOf(node: AtlasNode): number | null {
  const value = metadataOf(node).testCount;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Pure builder: a real domain node plus its real campaign children in, one
 * ObservatoryQuestion row out. Never fabricates a question, status or count that
 * wasn't already on the input nodes.
 */
export function buildObservatoryQuestion(domainNode: AtlasNode, campaignNodes: AtlasNode[]): ObservatoryQuestion {
  const code = String(domainNode.domain || domainNode.id.replace(/^domain:/i, '')).toUpperCase();
  const rawStatus = String(domainNode.status || '');
  const campaigns: ObservatoryCampaignRef[] = campaignNodes
    .filter(node => String(node.type || '').toUpperCase() === 'CAMPAIGN')
    .map(node => ({
      id: node.id,
      label: String(node.label || node.id),
      status: String(node.status || ''),
      testCount: testCountOf(node)
    }));
  const testCount = campaigns.reduce((sum, campaign) => sum + (campaign.testCount || 0), 0);
  return {
    id: domainNode.id,
    code,
    label: String(domainNode.label || code),
    question: String(domainNode.summary || ''),
    status: scientificStatus(rawStatus),
    rawStatus,
    campaigns,
    testCount,
    synthesis: null,
    unavailableReason: 'A fonte ainda não publica uma síntese quantitativa para esta pergunta neste snapshot.'
  };
}

/** Canonical D1..D10(+) ordering by numeric code, not publish order. */
export function sortObservatoryQuestions(questions: ObservatoryQuestion[]): ObservatoryQuestion[] {
  return questions.slice().sort((a, b) => {
    const numA = Number(a.code.replace(/\D/g, ''));
    const numB = Number(b.code.replace(/\D/g, ''));
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
    return a.code.localeCompare(b.code);
  });
}
