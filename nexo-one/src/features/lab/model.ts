// Caderno de laboratório: um índice único de entidades (teste, hipótese, campanha, roadmap)
// montado a partir do system.json. O front não inventa estado: tudo vem da projeção;
// quando falta dado, o campo fica null e a página diz o que falta.
import type { GraphNode, ScienceProjectionRecord, SystemState } from '../../contracts/system.ts';

export type Verdict = 'CONFIRMED' | 'REFUTED' | 'REVIEW' | 'PROVISIONAL' | 'READY' | 'BLOCKED' | 'DISCARDED';

export const VERDICT_PT: Record<Verdict, string> = {
  CONFIRMED: 'Confirmado', REFUTED: 'Refutado', REVIEW: 'Em revisão', PROVISIONAL: 'Resultado provisório',
  READY: 'Na fila', BLOCKED: 'Bloqueado', DISCARDED: 'Descartado',
};
/** Forma além da cor: o estado nunca depende só do matiz. */
export const VERDICT_GLYPH: Record<Verdict, string> = {
  CONFIRMED: '✓', REFUTED: '✕', REVIEW: '◐', PROVISIONAL: '●', READY: '○', BLOCKED: '▨', DISCARDED: '–',
};
export const VERDICT_ORDER: Verdict[] = ['CONFIRMED', 'REFUTED', 'REVIEW', 'PROVISIONAL', 'READY', 'BLOCKED', 'DISCARDED'];

export interface TestEntity {
  id: string;
  question: string | null;
  meaning: string | null;
  summary: string | null;
  method: string | null;
  status: string | null;
  review: string | null;
  verdict: Verdict;
  hypothesisId: string | null;
  campaignId: string | null;
  roadmapId: string | null;
  domain: string;
  topic: string | null;
  blocker: string | null;
  contestOf: string | null;
  contests: string[];
  createdAt: string | null;
  prereg: { metric: unknown; threshold: unknown; prediction: unknown; null_model: unknown; rival: unknown; hash: unknown; at: unknown };
  result: unknown;
  statistics: unknown;
  robustness: unknown;
  datasets: unknown;
  artifacts: unknown;
  limitations: unknown;
  claimBoundary: unknown;
  claimLevel: unknown;
  reviews: ReviewStep[];
}
export interface ReviewStep { kind: string; by?: string; axis?: string; outcome?: string; at?: string; ref?: string }

export interface HypothesisEntity {
  id: string; statement: string | null; model: unknown; baseline: unknown; falsification: unknown;
  origin: string | null; tests: string[]; verdict: Verdict | null;
}
export interface CampaignEntity { id: string; title: string | null; question: string | null; why: string | null; hypothesisIds: string[]; tests: string[] }
export interface RoadmapEntity {
  id: string; title: string; question: string | null; campaignId: string | null; state: string;
  confirmed: number; target: number | null; used: number; maxTests: number | null; maxDays: number | null;
  refutedStreak: number; killStreak: number | null; stop: string | null; renewable: boolean; charteredAt: string | null;
  tests: string[]; hypotheses: string[]; frontier: number;
}

export interface Lab {
  tests: Map<string, TestEntity>;
  hypotheses: Map<string, HypothesisEntity>;
  campaigns: Map<string, CampaignEntity>;
  roadmaps: Map<string, RoadmapEntity>;
  counts: Record<Verdict, number>;
  reviews: Record<string, number>;
  generatedAt: string;
  missingContract: string[];
}

const val = (field: unknown): unknown => {
  if (field && typeof field === 'object' && 'value' in (field as Record<string, unknown>)) return (field as { value: unknown }).value;
  return field ?? null;
};
const str = (field: unknown): string | null => {
  const v = val(field);
  if (v === null || v === undefined) return null;
  const text = typeof v === 'string' ? v : JSON.stringify(v);
  return text.trim() ? text.trim() : null;
};
const bare = (id: string) => id.replace(/^(test|hypothesis|campaign|roadmap):/, '');

/** CONTEST-<alvo>-<n> contesta <alvo>. Uma camada por vez (contestação de contestação existe). */
export const contestTarget = (id: string): string | null => {
  const m = /^CONTEST-(.+)-\d+$/.exec(id);
  return m ? m[1]! : null;
};

function verdictOf(status: string | null, review: string | null, graphBlocked: boolean): Verdict {
  const r = (review || '').toUpperCase();
  if (r === 'CONFIRMED') return 'CONFIRMED';
  if (r === 'REFUTED') return 'REFUTED';
  if (r === 'PENDING_REVIEW' || r === 'CONTESTED' || r === 'REFEREE1_PASSED') return 'REVIEW';
  const s = (status || '').toUpperCase();
  if (graphBlocked || s.startsWith('BLOCKED')) return 'BLOCKED';
  if (s === 'REJECTED') return 'DISCARDED';
  if (s === 'READY' || s === 'QUEUED' || s === 'RUNNING' || s === 'DISPATCHED') return 'READY';
  if (s) return 'PROVISIONAL';
  return 'READY';
}

export function buildLab(state: SystemState): Lab {
  const sp = state.science_projection_v1;
  const nodes = new Map<string, GraphNode>();
  for (const node of state.graph.nodes) if (node.type === 'TEST') nodes.set(bare(node.id), node);
  const records = new Map<string, ScienceProjectionRecord>();
  for (const rec of sp?.tests ?? []) records.set(bare(String(rec.id)), rec);

  const roadmapsRaw = (state.evolution?.roadmaps ?? []) as unknown as Array<Record<string, unknown>>;
  const campaignToRoadmap = new Map<string, string>();
  for (const rm of roadmapsRaw) if (rm.campaign_id) campaignToRoadmap.set(String(rm.campaign_id), String(rm.roadmap_id));

  const tests = new Map<string, TestEntity>();
  for (const id of new Set([...nodes.keys(), ...records.keys()])) {
    const n = nodes.get(id);
    const r = (records.get(id) ?? {}) as Record<string, unknown>;
    const any = r as Record<string, unknown> & { prereg?: Record<string, unknown> };
    const status = str(r.status) ?? n?.status_group ?? null;
    const review = str(any.review_state) ?? str((n as unknown as Record<string, unknown>)?.review_state);
    const campaignId = str(r.campaign_id) ?? n?.campaign_id?.replace(/^campaign:/, '') ?? null;
    const pre = (val(any.prereg) as Record<string, unknown> | null) ?? {};
    tests.set(id, {
      id,
      question: n?.question_plain ?? str(any.question_plain) ?? str(any.question),
      meaning: n?.result_meaning ?? str(any.result_meaning),
      summary: n?.summary ?? null,
      method: str(r.method),
      status,
      review,
      verdict: verdictOf(status, review, n?.state === 'BLOCKED'),
      hypothesisId: str(r.hypothesis_id),
      campaignId,
      roadmapId: str(any.roadmap_id) ?? (campaignId ? campaignToRoadmap.get(campaignId) ?? null : null),
      domain: n?.semantic_domain ?? n?.domain ?? 'SCIENCE',
      topic: n?.semantic_subdomain ?? null,
      blocker: n?.blocker ?? str(any.blocker) ?? (n?.state === 'BLOCKED' ? n.summary : null),
      contestOf: contestTarget(id),
      contests: [],
      createdAt: str(any.created_at),
      prereg: {
        metric: val(r.preregistered_metric) ?? pre.metric ?? null,
        threshold: val(r.threshold) ?? pre.threshold ?? pre.criterion ?? null,
        prediction: pre.prediction ?? null, null_model: pre.null ?? pre.null_model ?? null,
        rival: pre.rival ?? null, hash: pre.hash ?? val(any.prereg_hash) ?? null, at: pre.at ?? null,
      },
      result: val(r.result), statistics: val(r.statistics), robustness: val(r.robustness_checks),
      datasets: val(r.datasets), artifacts: val(r.artifacts),
      limitations: val(any.limitations), claimBoundary: val(any.claim_boundary), claimLevel: val(r.claim_level),
      reviews: Array.isArray(val(any.reviews)) ? (val(any.reviews) as ReviewStep[]) : [],
    });
  }
  for (const t of tests.values()) if (t.contestOf && tests.has(t.contestOf)) tests.get(t.contestOf)!.contests.push(t.id);

  const hypotheses = new Map<string, HypothesisEntity>();
  for (const rec of sp?.hypotheses ?? []) {
    const r = rec as Record<string, unknown>;
    const id = bare(String(rec.id));
    hypotheses.set(id, {
      id, statement: str(r.statement), model: val(r.model), baseline: val(r.baseline),
      falsification: val(r.falsification_criterion), origin: str(r.origin) ?? str(r.proposed_by), tests: [], verdict: null,
    });
  }
  for (const t of tests.values()) {
    if (!t.hypothesisId) continue;
    if (!hypotheses.has(t.hypothesisId)) hypotheses.set(t.hypothesisId, {
      id: t.hypothesisId, statement: null, model: null, baseline: null, falsification: null, origin: null, tests: [], verdict: null,
    });
    hypotheses.get(t.hypothesisId)!.tests.push(t.id);
  }
  for (const h of hypotheses.values()) h.verdict = aggregate(h.tests.map(id => tests.get(id)!.verdict));

  const campaigns = new Map<string, CampaignEntity>();
  for (const rec of sp?.campaigns ?? []) {
    const r = rec as Record<string, unknown>;
    const id = bare(String(rec.id));
    const hyps = val(r.hypothesis_ids);
    campaigns.set(id, {
      id, title: str(r.title), question: str(r.question_plain) ?? str(r.question), why: str(r.why_it_matters),
      hypothesisIds: Array.isArray(hyps) ? hyps.map(String) : [], tests: [],
    });
  }
  for (const t of tests.values()) if (t.campaignId && campaigns.has(t.campaignId)) campaigns.get(t.campaignId)!.tests.push(t.id);

  const charters = new Map((state.evolution?.charters ?? []).map(c => [c.roadmap_id, c as Record<string, unknown>]));
  const roadmaps = new Map<string, RoadmapEntity>();
  for (const rm of roadmapsRaw) {
    const id = String(rm.roadmap_id);
    const charter = charters.get(id) ?? {};
    const campaignId = rm.campaign_id ? String(rm.campaign_id) : null;
    const camp = campaignId ? campaigns.get(campaignId) : undefined;
    const rmTests = [...tests.values()].filter(t => t.roadmapId === id).map(t => t.id);
    roadmaps.set(id, {
      id, title: camp?.title ?? humanId(id), question: (charter.question as string) ?? camp?.question ?? null, campaignId,
      state: String(rm.state ?? charter.status ?? 'ACTIVE'),
      confirmed: Number(rm.confirmed ?? 0), target: (rm.success_target as number) ?? null,
      used: Number(rm.tests_used ?? 0), maxTests: (rm.max_tests as number) ?? null, maxDays: (rm.max_days as number) ?? null,
      refutedStreak: Number(rm.refuted_streak ?? 0), killStreak: (rm.kill_streak as number) ?? null,
      stop: (rm.stop_reached as string) ?? null, renewable: Boolean(rm.renewable),
      charteredAt: (charter.chartered_at as string) ?? null, tests: rmTests,
      hypotheses: [...new Set(rmTests.map(t => tests.get(t)!.hypothesisId).filter(Boolean) as string[])],
      frontier: Number(rm.frontier_count ?? 0),
    });
  }

  const counts = Object.fromEntries(VERDICT_ORDER.map(v => [v, 0])) as Record<Verdict, number>;
  for (const t of tests.values()) counts[t.verdict] += 1;

  const missingContract: string[] = [];
  const sample = sp?.tests?.[0] as Record<string, unknown> | undefined;
  if (sample && !('review_state' in sample)) missingContract.push('tests[].review_state');
  if (sample && !('created_at' in sample)) missingContract.push('tests[].created_at');
  if (sample && !('prereg' in sample)) missingContract.push('tests[].prereg');
  if (sample && !('reviews' in sample)) missingContract.push('tests[].reviews');
  if (!(state.evolution as Record<string, unknown> | undefined)?.events) missingContract.push('evolution.events');

  return {
    tests, hypotheses, campaigns, roadmaps, counts, reviews: state.evolution?.reviews ?? {},
    generatedAt: state.generated_at, missingContract,
  };
}

function aggregate(verdicts: Verdict[]): Verdict | null {
  if (!verdicts.length) return null;
  for (const v of ['CONFIRMED', 'REFUTED', 'REVIEW', 'PROVISIONAL', 'READY', 'BLOCKED'] as Verdict[]) if (verdicts.includes(v)) return v;
  return 'DISCARDED';
}

export const humanId = (id: string) => id
  .replace(/^(RM|CAMP|HYP|META)-/, '').replace(/-20\d{6}(-V\d+)?$/, '').replace(/-V\d+$/, '')
  .replace(/-/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

export const ago = (iso?: string | null): string => {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.round(minutes / 60)} h`;
  return `há ${Math.round(minutes / 1440)} d`;
};

/** Linha de base por visitante: "o que mudou desde a sua última visita" sem inventar histórico no servidor. */
export interface Baseline { at: string; counts: Record<string, number> }
const BASE_KEY = 'nexo.lab.baseline.v1';
export function readBaseline(current: Record<string, number>): Baseline | null {
  let prev: Baseline | null = null;
  try { prev = JSON.parse(localStorage.getItem(BASE_KEY) || 'null'); } catch { prev = null; }
  const now = new Date().toISOString();
  try {
    // Renova a base só depois de 20 h, para que "desde" signifique aproximadamente "desde ontem".
    if (!prev || Date.now() - Date.parse(prev.at) > 20 * 3600e3) localStorage.setItem(BASE_KEY, JSON.stringify({ at: now, counts: current }));
  } catch { /* sem armazenamento: sem delta */ }
  return prev;
}

export const GUARDIAN_AREA_PT: Record<string, string> = {
  site: 'o site está atrás da Tower', learner: 'o Learner produziu pouco', olympus_projection: 'a projeção do Olympus diverge',
  executor: 'o Executor está parado', refutador: 'o Refutador está parado', pitia: 'a Pítia está parada',
  inbox: 'há propostas não aplicadas', writer: 'o robô escritor falhou', batteries: 'baterias travadas',
};
