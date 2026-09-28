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
  /** Nome curto em português (semantic.display_name); contestações herdam do atacado. */
  name: string;
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
  prereg: { metric: unknown; threshold: unknown; prediction: unknown; null_model: unknown; rival: unknown; hash: unknown; at: unknown; success: string[]; kill: string[]; ref: unknown };
  createdSource: string | null;
  executedAt: string | null;
  execution: { at?: string; battery_id?: string; run_ref?: string; runner?: string } | null;
  parents: string[];
  children: string[];
  verdictRaw: string | null;
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
export interface ReviewStep { kind: string; by?: string; axis?: string; outcome?: string; at?: string; ref?: string; contest_test_id?: string }
export interface ActivityEvent { event_type: string; role: string; at: string; entity_id?: string; entity_kind?: string }
/** Read model público do TCC#96 repassado pelo build do Pages (system.read_model). */
export interface ReadModel {
  tests?: Record<string, Record<string, unknown>>;
  hypotheses?: Record<string, Record<string, unknown>>;
  roadmaps?: Array<Record<string, unknown>>;
  activity?: ActivityEvent[];
}

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
  frontierIds?: string[]; objectives?: string[]; progress?: Record<string, number>;
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
  activity: ActivityEvent[];
  hasReadModel: boolean;
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

  const rmodel = ((state as unknown as { read_model?: ReadModel }).read_model) ?? null;
  const rmTests = rmodel?.tests ?? {};
  const roadmapsRaw = (state.evolution?.roadmaps ?? []) as unknown as Array<Record<string, unknown>>;
  const campaignToRoadmap = new Map<string, string>();
  for (const rm of roadmapsRaw) if (rm.campaign_id) campaignToRoadmap.set(String(rm.campaign_id), String(rm.roadmap_id));

  const tests = new Map<string, TestEntity>();
  for (const id of new Set([...nodes.keys(), ...records.keys(), ...Object.keys(rmTests)])) {
    const n = nodes.get(id);
    const r = (records.get(id) ?? {}) as Record<string, unknown>;
    // O read model (TCC#96) tem prioridade: é o dado mais rico e já sanitizado.
    const any = { ...r, ...(rmTests[id] ?? {}) } as Record<string, unknown> & { prereg?: Record<string, unknown> };
    const status = str(any.status) ?? n?.status_group ?? null;
    const review = str(any.review_state) ?? str((n as unknown as Record<string, unknown>)?.review_state);
    const campaignId = str(any.campaign_id) ?? n?.campaign_id?.replace(/^campaign:/, '') ?? null;
    const pre = (val(any.prereg) as Record<string, unknown> | null) ?? {};
    const crit = (pre.criterion as { success?: string[]; kill?: string[] } | undefined) ?? {};
    const lineage = (k: string) => (Array.isArray(any[k]) ? (any[k] as unknown[]).map(String) : []);
    tests.set(id, {
      id,
      name: '',
      question: str((any.semantic as Record<string, unknown> | undefined)?.question_plain) ?? str(any.question_plain) ?? n?.question_plain ?? str(any.question),
      meaning: n?.result_meaning ?? str(any.result_meaning),
      summary: n?.summary ?? null,
      method: str(r.method),
      status,
      review,
      verdict: verdictOf(status, review, n?.state === 'BLOCKED'),
      hypothesisId: str(any.hypothesis_id),
      campaignId,
      roadmapId: str(any.roadmap_id) ?? (campaignId ? campaignToRoadmap.get(campaignId) ?? null : null),
      domain: n?.semantic_domain ?? str(any.domain) ?? n?.domain ?? 'SCIENCE',
      topic: n?.semantic_subdomain ?? null,
      blocker: n?.blocker ?? str(any.blocker) ?? (n?.state === 'BLOCKED' ? n.summary : null),
      contestOf: contestTarget(id),
      contests: [],
      createdAt: str(any.created_at_effective) ?? str(any.created_at),
      createdSource: str(any.created_at_source),
      executedAt: str(any.executed_at),
      execution: (any.execution as TestEntity['execution']) ?? null,
      parents: lineage('parents'),
      children: lineage('children'),
      verdictRaw: str(any.verdict),
      prereg: {
        metric: val(r.preregistered_metric) ?? pre.metric ?? null,
        threshold: val(r.threshold) ?? pre.threshold ?? null,
        success: crit.success ?? [], kill: crit.kill ?? [], ref: pre.ref ?? null,
        prediction: pre.prediction ?? null, null_model: pre.null ?? pre.null_model ?? null,
        rival: pre.rival ?? null, hash: pre.hash ?? val(any.prereg_hash) ?? null, at: pre.at ?? null,
      },
      result: val(r.result), statistics: val(r.statistics), robustness: val(r.robustness_checks),
      datasets: val(r.datasets), artifacts: val(r.artifacts),
      limitations: val(any.limitations), claimBoundary: val(any.claim_boundary), claimLevel: val(r.claim_level),
      reviews: (Array.isArray(any.review) ? any.review : Array.isArray(val(any.reviews)) ? val(any.reviews) : []) as ReviewStep[],
    });
  }
  for (const t of tests.values()) if (t.contestOf && tests.has(t.contestOf)) tests.get(t.contestOf)!.contests.push(t.id);
  // Nomes: o do backend quando existe; senão contestação = "Ataque N · <atacado>", teste = pergunta curta.
  const own = (id: string) => {
    const any = { ...((records.get(id) ?? {}) as Record<string, unknown>), ...(rmTests[id] ?? {}) } as Record<string, unknown>;
    const sem = (any.semantic ?? {}) as Record<string, unknown>;
    return str(sem.display_name) ?? str(any.display_name);
  };
  const naming = (t: TestEntity, depth = 0): string => {
    if (t.name) return t.name;
    const declared = own(t.id);
    if (declared) return (t.name = declared);
    if (t.contestOf && tests.has(t.contestOf) && depth < 12) {
      const parent = tests.get(t.contestOf)!;
      const idx = Math.max(1, parent.contests.indexOf(t.id) + 1);
      const base = naming(parent, depth + 1).replace(/^Ataque \d+ · /, '');
      let chain = 1; for (let p = parent; p.contestOf && tests.has(p.contestOf); p = tests.get(p.contestOf)!) chain += 1;
      return (t.name = `Ataque ${chain > 1 ? chain : idx} · ${base}`);
    }
    return (t.name = shortName(t.question) ?? humanId(t.id));
  };
  for (const t of tests.values()) naming(t);

  const hypotheses = new Map<string, HypothesisEntity>();
  for (const rec of sp?.hypotheses ?? []) {
    const id = bare(String(rec.id));
    const r = { ...(rec as Record<string, unknown>), ...(rmodel?.hypotheses?.[id] ?? {}) };
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
  const rmRoadmaps = new Map((rmodel?.roadmaps ?? []).map(r => [String(r.roadmap_id ?? r.id), r]));
  for (const [rid, r] of rmRoadmaps) {
    for (const tid of (r.test_ids as string[] | undefined) ?? []) { const t = tests.get(tid); if (t && !t.roadmapId) t.roadmapId = rid; }
  }
  for (const id of new Set([...roadmapsRaw.map(r => String(r.roadmap_id)), ...rmRoadmaps.keys()])) {
    const rm = roadmapsRaw.find(r => String(r.roadmap_id) === id) ?? {};
    const full = rmRoadmaps.get(id);
    const ch = (full?.charter as Record<string, unknown> | undefined) ?? {};
    const budget = (ch.budget as Record<string, number> | undefined) ?? {};
    const stop = (ch.stop as Record<string, number> | undefined) ?? {};
    const prog = (full?.progress as Record<string, number> | undefined) ?? {};
    const charter = { ...(charters.get(id) ?? {}), ...ch } as Record<string, unknown>;
    const campRaw = rm.campaign_id ?? full?.campaign_id;
    const campaignId = campRaw ? String(campRaw) : null;
    const camp = campaignId ? campaigns.get(campaignId) : undefined;
    const listed = ((full?.test_ids as string[] | undefined) ?? []).filter(t => tests.has(t));
    const rmTestIds = listed.length ? listed : [...tests.values()].filter(t => t.roadmapId === id).map(t => t.id);
    roadmaps.set(id, {
      id, title: str(full?.title) ?? camp?.title ?? humanId(id),
      question: str(full?.question) ?? (charter.question as string) ?? camp?.question ?? null, campaignId,
      state: String(full?.state ?? rm.state ?? charter.status ?? 'ACTIVE'),
      confirmed: Number(prog.confirmed ?? rm.confirmed ?? 0),
      target: (stop.success_confirmed ?? rm.success_target ?? null) as number | null,
      used: Number(rm.tests_used ?? prog.total ?? 0), maxTests: (budget.max_tests ?? rm.max_tests ?? null) as number | null,
      maxDays: (budget.max_days ?? rm.max_days ?? null) as number | null,
      refutedStreak: Number(rm.refuted_streak ?? 0),
      killStreak: (stop.kill_consecutive_refuted ?? rm.kill_streak ?? null) as number | null,
      stop: (rm.stop_reached as string) ?? null, renewable: Boolean(ch.renewable ?? rm.renewable),
      charteredAt: (charter.chartered_at as string) ?? null, tests: rmTestIds,
      hypotheses: (full?.hypothesis_ids as string[] | undefined)
        ?? [...new Set(rmTestIds.map(t => tests.get(t)!.hypothesisId).filter(Boolean) as string[])],
      frontier: Number(prog.frontier ?? rm.frontier_count ?? 0),
      frontierIds: ((full?.frontier_test_ids as string[] | undefined) ?? []).filter(t => tests.has(t)),
      objectives: Array.isArray(ch.objectives) ? (ch.objectives as string[]) : [],
      progress: prog,
    });
  }

  const counts = Object.fromEntries(VERDICT_ORDER.map(v => [v, 0])) as Record<Verdict, number>;
  for (const t of tests.values()) counts[t.verdict] += 1;

  const missingContract: string[] = rmodel ? [] : ['read_model (TCC#96 ainda não publicado)'];

  return {
    tests, hypotheses, campaigns, roadmaps, counts, reviews: state.evolution?.reviews ?? {},
    generatedAt: state.generated_at, missingContract,
    activity: [...(rmodel?.activity ?? [])].filter(e => e.at).sort((a, b) => a.at.localeCompare(b.at)), hasReadModel: Boolean(rmodel),
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
  camb_runtime_policy: 'o programa de cosmologia (CAMB) está fora da política de execução', guardian_freshness: 'minha auditoria está atrasada',
  public_projection: 'o site público ficou atrás da Tower', olympus: 'a área Olympus tem inconsistência', site_projection: 'o site ficou atrás da Tower',
};

/** Pergunta vira nome curto: sem "?" final, até ~8 palavras. */
function shortName(q: string | null): string | null {
  if (!q) return null;
  const words = q.replace(/[?¿]+$/, '').trim().split(/\s+/);
  return words.length <= 9 ? words.join(' ') : words.slice(0, 8).join(' ') + '…';
}
