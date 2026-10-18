// Knowledge graph: literature and NEXO claims weighed against hypotheses.
// Read-only over read_model; the weights follow the table in NEXO ROADMAP V2.
import type {SystemState} from '../contracts/system.ts';

export type Stance = 'SUPPORTS' | 'CONTRADICTS';
export type KQuestion = {id: string; label: string; roadmap: string | null};
export type KHypothesis = {id: string; label: string; status: string; question: string | null; roadmap: string | null};
export type KClaim = {
  id: string; label: string; source: 'LITERATURE' | 'NEXO'; ref: string | null; journal: string | null;
  tier: string | null; value: string | null; date: string | null; lineage: string[]; survived: boolean;
  weight: number; links: {hypothesis: string; stance: Stance}[];
};
export type Score = {pro: number; con: number; lineages: number};
export type Knowledge = {questions: KQuestion[]; hypotheses: KHypothesis[]; claims: KClaim[]; scores: Map<string, Score>};

type Row = Record<string, unknown>;
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
const list = (v: unknown): string[] => Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : str(v) ? [str(v)!] : [];
const rows = (v: unknown): Row[] => v && typeof v === 'object' ? Object.values(v as Record<string, unknown>).filter((r): r is Row => !!r && typeof r === 'object') : [];

const EVIDENCE: Record<string, number> = {COLLABORATION: 1, INDEPENDENT: 0.8, REANALYSIS: 0.7, THEORY: 0.4, NEXO_SURVIVED: 0.8, NEXO_UNREVIEWED: 0.3};
const PUBLICATION: Record<string, number> = {PEER_REVIEWED: 1, PREPRINT: 0.7, PROCEEDINGS: 0.5, ERRATUM: 0.5, RETRACTED: 0};
const TIER: Record<string, number> = {A: 1, B: 0.85, C: 0.6, X: 0};
const REPLICATION: Record<string, number> = {INDEPENDENT_DATA: 1.3, SAME_DATA: 1, CONTESTED: 0.6};

/** Weight = evidence type × publication × journal tier × replication × supersession. */
export function claimWeight(c: {source: 'LITERATURE' | 'NEXO'; evidence?: string | null; publication?: string | null; tier?: string | null; replication?: string | null; superseded?: boolean; survived?: boolean}): number {
  const evidence = c.source === 'NEXO' ? (c.survived ? EVIDENCE.NEXO_SURVIVED : EVIDENCE.NEXO_UNREVIEWED) : EVIDENCE[c.evidence ?? ''] ?? EVIDENCE.INDEPENDENT;
  const pub = c.source === 'NEXO' ? 1 : PUBLICATION[c.publication ?? ''] ?? PUBLICATION.PREPRINT;
  const tier = c.source === 'NEXO' ? 1 : TIER[c.tier ?? ''] ?? TIER.B;
  const rep = REPLICATION[c.replication ?? ''] ?? 1;
  return Math.round(evidence * pub * tier * rep * (c.superseded ? 0.3 : 1) * 1000) / 1000;
}

/** Same data lineage counts once per hypothesis and stance: the heaviest claim wins. */
export function scoreHypothesis(claims: readonly KClaim[], hypothesis: string, at: string | null = null): Score {
  const best = new Map<string, number>();
  for (const c of claims) {
    if (at && c.date && c.date > at) continue;
    for (const link of c.links) if (link.hypothesis === hypothesis) {
      const key = `${link.stance}|${c.lineage.length ? [...c.lineage].sort().join('+') : c.id}`;
      best.set(key, Math.max(best.get(key) ?? 0, c.weight));
    }
  }
  let pro = 0, con = 0;
  for (const [key, w] of best) key.startsWith('SUPPORTS') ? pro += w : con += w;
  return {pro: Math.round(pro * 1000) / 1000, con: Math.round(con * 1000) / 1000, lineages: best.size};
}

const SURVIVED = /^(SURVIVED|SUPPORTED|CONFIRMED|PROMOTED)$/i;
const AGAINST = /^(REFUTED|FALSIFIED|FALSIFIES|REJECTED|NULL)$/i;

export function buildKnowledge(state: SystemState): Knowledge {
  const rm = (state as unknown as {read_model?: Record<string, unknown>}).read_model ?? {};
  const hypotheses: KHypothesis[] = rows(rm.hypotheses).map(h => ({
    id: str(h.hypothesis_id) ?? str(h.id) ?? '', label: str(h.proposition) ?? str(h.title) ?? str(h.question) ?? str(h.id) ?? '',
    status: (str(h.status) ?? 'CANDIDATE').toUpperCase(), question: str(h.question_id) ?? str(h.campaign_id) ?? null, roadmap: str(h.roadmap_id),
  })).filter(h => h.id);
  const known = new Set(hypotheses.map(h => h.id));
  const questions = new Map<string, KQuestion>();
  for (const c of rows(rm.campaigns)) {
    const id = str(c.campaign_id) ?? str(c.id);
    if (id) questions.set(id, {id, label: str(c.central_question) ?? str(c.title) ?? id, roadmap: str(c.roadmap_id)});
  }
  for (const h of hypotheses) if (h.question && !questions.has(h.question)) questions.set(h.question, {id: h.question, label: h.question, roadmap: h.roadmap});

  const claims: KClaim[] = [];
  for (const c of rows(rm.claims)) {
    const id = str(c.claim_id) ?? str(c.id);
    if (!id) continue;
    const source = str(c.source) === 'NEXO' ? 'NEXO' : 'LITERATURE';
    const links = [
      ...list(c.supports).map(hypothesis => ({hypothesis, stance: 'SUPPORTS' as const})),
      ...list(c.contradicts).map(hypothesis => ({hypothesis, stance: 'CONTRADICTS' as const})),
    ].filter(l => known.has(l.hypothesis));
    const survived = SURVIVED.test(str(c.review_verdict) ?? '');
    claims.push({id, label: str(c.label) ?? str(c.title) ?? id, source, ref: str(c.ref) ?? str(c.arxiv) ?? str(c.doi), journal: str(c.journal),
      tier: str(c.journal_tier), value: str(c.value), date: str(c.date), lineage: list(c.data_lineage), survived, links,
      weight: claimWeight({source, evidence: str(c.evidence_type), publication: str(c.publication_status), tier: str(c.journal_tier),
        replication: str(c.replication), superseded: c.superseded === true, survived})});
  }
  // Executed tests linked to a hypothesis are NEXO claims even before a claim record exists.
  const declared = new Set(claims.map(c => c.id));
  for (const t of rows(rm.tests)) {
    const id = str(t.id), hyp = str(t.hypothesis_id), verdict = str(t.verdict) ?? '';
    if (!id || !hyp || !known.has(hyp) || declared.has(`test:${id}`) || !verdict) continue;
    const review = str(t.review_state) ?? '';
    const survived = SURVIVED.test(review) || /^SURVIVED$/i.test(verdict);
    const stance: Stance = AGAINST.test(verdict) ? 'CONTRADICTS' : 'SUPPORTS';
    if (/^(INCONCLUSIVE|INCONCLUSIVO|PROVISIONAL)$/i.test(verdict)) continue;
    claims.push({id: `test:${id}`, label: str(t.display_name) ?? str(t.title) ?? id, source: 'NEXO', ref: id, journal: null, tier: null,
      value: str(t.result_meaning), date: str(t.executed_at) ?? str(t.created_at), lineage: list(t.data_lineage).length ? list(t.data_lineage)
        : rows(t.datasets).map(d => [str(d.name), str(d.version)].filter(Boolean).join('@')).filter(Boolean),
      survived, links: [{hypothesis: hyp, stance}], weight: claimWeight({source: 'NEXO', survived})});
  }
  const scores = new Map(hypotheses.map(h => [h.id, scoreHypothesis(claims, h.id)]));
  return {questions: [...questions.values()], hypotheses, claims, scores};
}

/** Deterministic orbital layout: each question is a hub, its hypotheses sit on an orbit, claims fan outward as satellites.
 *  Groups run left to right, or stack vertically when `compact` (narrow screens). */
export type Placed = {id: string; kind: 'question' | 'hypothesis' | 'claim'; x: number; y: number; r: number};
export function layoutKnowledge(k: Knowledge, {compact = false}: {compact?: boolean} = {}): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const byQuestion = new Map<string, KHypothesis[]>();
  for (const h of k.hypotheses) { const q = h.question ?? '∅'; byQuestion.set(q, [...(byQuestion.get(q) ?? []), h]); }
  const claimsOf = new Map<string, KClaim[]>();
  for (const c of k.claims) { const h = c.links[0]?.hypothesis; if (h) claimsOf.set(h, [...(claimsOf.get(h) ?? []), c]); }
  const orbit = compact ? 150 : 200, ring0 = compact ? 92 : 112, band = 30, perBand = 9;
  let cursor = 0;
  for (const [q, hs] of byQuestion) {
    const group: Placed[] = [{id: q, kind: 'question', x: 0, y: 0, r: 16}];
    hs.forEach((h, i) => {
      // Up to three hypotheses hang below the hub like a fan (the label sits above); more close the full orbit.
      const t = hs.length <= 3 ? Math.PI / 2 + (i - (hs.length - 1) / 2) * 0.98 : Math.PI * 2 * (i + 0.5) / hs.length - Math.PI / 2;
      const hx = Math.cos(t) * orbit, hy = Math.sin(t) * orbit;
      group.push({id: h.id, kind: 'hypothesis', x: hx, y: hy, r: 20});
      const cs = claimsOf.get(h.id) ?? [];
      cs.forEach((c, j) => {
        const b = Math.floor(j / perBand), n = Math.min(perBand, cs.length - b * perBand), ring = ring0 + b * band;
        const spread = Math.min(Math.PI * 0.85, n * 0.26), a = t + (n > 1 ? -spread / 2 + spread * (j % perBand) / (n - 1) : 0) + (b % 2) * 0.12;
        group.push({id: c.id, kind: 'claim', x: hx + Math.cos(a) * ring, y: hy + Math.sin(a) * ring, r: 4 + c.weight * 5});
      });
    });
    const x0 = Math.min(...group.map(p => p.x)) - 110, x1 = Math.max(...group.map(p => p.x)) + 110, y0 = -80, y1 = Math.max(...group.map(p => p.y)) + 40;
    const dx = compact ? 0 : cursor - x0, dy = compact ? cursor - y0 : 0;
    for (const p of group) out.set(`${p.kind[0]}:${p.id}`, {...p, x: p.x + dx, y: p.y + dy});
    cursor += compact ? y1 - y0 + 60 : x1 - x0 + 20;
  }
  return out;
}
