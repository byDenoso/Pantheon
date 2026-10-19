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

/* ---------------------------------------------------------------------------------------------------------------
 * Scale: progressive-disclosure scene. Per question only the top hypotheses are drawn, the rest hide behind one
 * cluster node; claim satellites exist only for the top three hypotheses (compact) and for what is focused.
 * Everything below is pure and deterministic: same input, same coordinates. */
export type Box = {x0: number; y0: number; x1: number; y1: number};
export type SNode = {key: string; id: string; kind: 'question' | 'hypothesis' | 'claim' | 'cluster' | 'pager' | 'tray'; x: number; y: number; r: number; group: string; host?: string};
export type SGroup = {id: string; label: string; hub: SNode; box: Box; total: number; top: string[]; members: string[]; rest: string[]; expanded: boolean; page: number; pages: number; tray: boolean};
export type Where = {group: string; inTray: boolean; restIndex: number};
export type Scene = {groups: SGroup[]; nodes: Map<string, SNode>; claims: SNode[]; tray: {node: SNode; box: Box; count: number; open: boolean; label: string} | null; box: Box; where: Map<string, Where>; ranked: Map<string, KHypothesis[]>};
export type SceneOptions = {
  aspect?: number; compact?: boolean; expanded?: ReadonlySet<string>; pages?: ReadonlyMap<string, number>; tray?: boolean; noQuestion?: string; trayLabel?: string;
  hypothesis?: (h: KHypothesis) => boolean; claim?: (c: KClaim) => boolean; score?: (id: string) => Score;
};
export const TOP_N = 8, PAGE_N = 24, CLAIMS_PER_GROUP = 12, CLAIM_BUDGET = 80, TINY = 2, UNASSIGNED = '∅';
const isUnassigned = (q: string) => q === UNASSIGNED || /unassigned/i.test(q);
const PRIORITY = (s: string) => s === 'PROMOTED' ? 0 : s === 'ACTIVE' || s === 'READY' ? 1 : 2;

/** Claims per hypothesis, heaviest first. */
export function claimsByHypothesis(k: Knowledge, keep: (c: KClaim) => boolean = () => true): Map<string, KClaim[]> {
  const m = new Map<string, KClaim[]>();
  for (const c of k.claims) if (keep(c)) for (const l of c.links) { const a = m.get(l.hypothesis); if (a) a.push(c); else m.set(l.hypothesis, [c]); }
  for (const a of m.values()) a.sort((x, y) => y.weight - x.weight || (x.id < y.id ? -1 : 1));
  return m;
}
/** PROMOTED/ACTIVE first, then by |pro - con|, then by claim count. */
export function rankHypotheses(hs: readonly KHypothesis[], score: (id: string) => Score, count: (id: string) => number): KHypothesis[] {
  const net = (h: KHypothesis) => { const s = score(h.id); return Math.abs(s.pro - s.con); };
  return [...hs].sort((a, b) => PRIORITY(a.status) - PRIORITY(b.status) || net(b) - net(a) || count(b.id) - count(a.id) || (a.id < b.id ? -1 : 1));
}
/** Satellite offsets around a host: arcs facing angle t, rings stacked outward. */
export function fan(n: number, t: number, r0: number, step = 12): [number, number][] {
  const out: [number, number][] = []; let left = n, b = 0;
  while (left > 0) {
    const rho = r0 + b * step * 1.15, c = Math.min(left, Math.max(4, Math.floor(Math.PI * 0.85 * rho / step))), spread = Math.min(Math.PI * 0.85, c * step / rho);
    for (let j = 0; j < c; j++) { const a = t + (c > 1 ? -spread / 2 + spread * j / (c - 1) : 0) + (b % 2 ? spread / (2 * c) : 0); out.push([Math.cos(a) * rho, Math.sin(a) * rho]); }
    left -= c; b++;
  }
  return out;
}
const claimNode = (c: KClaim, host: SNode, group: string, dx: number, dy: number): SNode => ({key: `c:${c.id}`, id: c.id, kind: 'claim', x: host.x + dx, y: host.y + dy, r: 3 + c.weight * 3, group, host: host.id});

type Cell = {id: string; label: string; nodes: SNode[]; w: number; h: number; box: Box; group: Omit<SGroup, 'hub' | 'box'> | null};
const bounds = (ns: readonly SNode[]): Box => ({x0: Math.min(...ns.map(n => n.x - n.r)), y0: Math.min(...ns.map(n => n.y - n.r)), x1: Math.max(...ns.map(n => n.x + n.r)), y1: Math.max(...ns.map(n => n.y + n.r))});

export function planKnowledge(k: Knowledge, o: SceneOptions = {}): Scene {
  const score = o.score ?? ((id: string) => k.scores.get(id) ?? {pro: 0, con: 0, lineages: 0});
  const byHyp = claimsByHypothesis(k, o.claim), count = (id: string) => byHyp.get(id)?.length ?? 0;
  const qLabel = new Map(k.questions.map(q => [q.id, q.label]));
  const order: string[] = [], vis = new Map<string, KHypothesis[]>(), total = new Map<string, number>();
  const seen = (g: string) => { if (!total.has(g)) { total.set(g, 0); order.push(g); } };
  for (const q of k.questions) seen(q.id);
  for (const h of k.hypotheses) { const g = h.question ?? UNASSIGNED; seen(g); total.set(g, total.get(g)! + 1); if (!o.hypothesis || o.hypothesis(h)) vis.set(g, [...(vis.get(g) ?? []), h]); }
  const ids = order.filter(g => vis.has(g)), many = ids.length > 6;
  const tiny = (g: string) => many && (total.get(g)! <= TINY || isUnassigned(g));
  const bySize = (a: string, b: string) => total.get(b)! - total.get(a)!;
  const main = ids.filter(g => !tiny(g)).sort(bySize), side = ids.filter(tiny).sort(bySize), open = !!o.tray && side.length > 0;

  const ranked = new Map<string, KHypothesis[]>(), where = new Map<string, Where>();
  for (const g of ids) {
    const r = rankHypotheses(vis.get(g)!, score, count); ranked.set(g, r);
    r.forEach((h, i) => where.set(h.id, {group: g, inTray: tiny(g), restIndex: i < TOP_N ? -1 : i - TOP_N}));
  }

  const cp = o.compact ?? (o.aspect ?? 1.6) < 0.8;
  let budget = CLAIM_BUDGET;
  const local = (g: string): Cell => {
    const r = ranked.get(g)!, top = r.slice(0, TOP_N), rest = r.slice(TOP_N), label = (!qLabel.get(g) || (isUnassigned(g) && qLabel.get(g) === g)) ? (o.noQuestion ?? 'Sem pergunta') : qLabel.get(g)!;
    const expanded = !!o.expanded?.has(g) && rest.length > 0, pages = Math.ceil(rest.length / PAGE_N), page = Math.max(0, Math.min(pages - 1, o.pages?.get(g) ?? 0));
    const members = expanded ? rest.slice(page * PAGE_N, (page + 1) * PAGE_N) : [];
    const m = top.length + (rest.length ? 1 : 0), R = Math.max(cp ? 84 : 122, 56 / (2 * Math.sin(Math.PI / Math.max(m, 2))));
    const ang = (slot: number) => m === 1 ? Math.PI / 2 : -Math.PI / 2 + 2 * Math.PI * (slot + 0.5) / m;
    const clusterSlot = rest.length ? Math.floor(m / 2) : -1;
    const hub: SNode = {key: `q:${g}`, id: g, kind: 'question', x: 0, y: 0, r: 18, group: g};
    const nodes: SNode[] = [hub], hs = new Map<string, SNode>();
    top.forEach((h, i) => {
      const a = ang(clusterSlot < 0 || i < clusterSlot ? i : i + 1), n: SNode = {key: `h:${h.id}`, id: h.id, kind: 'hypothesis', x: Math.cos(a) * R, y: Math.sin(a) * R, r: 11, group: g};
      nodes.push(n); hs.set(h.id, n);
    });
    if (rest.length) {
      const a = ang(clusterSlot); nodes.push({key: `k:${g}`, id: g, kind: 'cluster', x: Math.cos(a) * R, y: Math.sin(a) * R, r: 14, group: g});
      if (expanded) {
        const PH = 21, rmax = PH * Math.sqrt(members.length + 0.5), D = R + 44 + rmax, cx = Math.cos(a) * D, cy = Math.sin(a) * D;
        members.forEach((h, i) => { const rho = PH * Math.sqrt(i + 0.5), t = i * 2.399963; nodes.push({key: `h:${h.id}`, id: h.id, kind: 'hypothesis', x: cx + Math.cos(t) * rho, y: cy + Math.sin(t) * rho, r: 6, group: g}); });
        if (pages > 1) nodes.push({key: `p:${g}`, id: g, kind: 'pager', x: cx, y: cy + rmax + 24, r: 11, group: g});
      }
    }
    // compact claim satellites (they face the hub, so the outside stays free for labels): round-robin over the top three hypotheses, heaviest first, within the remaining budget
    const hosts = top.slice(0, 3), lists = hosts.map(h => byHyp.get(h.id) ?? []), quota = Math.max(0, Math.min(CLAIMS_PER_GROUP, budget));
    const picked = new Map<string, KClaim[]>(), used = new Set<string>(); let n = 0;
    for (let j = 0; n < quota; j++) {
      let any = false;
      hosts.forEach((h, i) => { const c = lists[i][j]; if (!c) return; any = true; if (n < quota && !used.has(c.id)) { used.add(c.id); n++; picked.set(h.id, [...(picked.get(h.id) ?? []), c]); } });
      if (!any) break;
    }
    budget -= n;
    for (const [hid, cs] of picked) { const host = hs.get(hid)!, offs = fan(cs.length, Math.atan2(-host.y, -host.x), host.r + 18); cs.forEach((c, i) => nodes.push(claimNode(c, host, g, offs[i][0], offs[i][1]))); }
    const b = bounds(nodes), box = {x0: b.x0 - (cp ? 150 : 200), y0: b.y0 - 78, x1: b.x1 + (cp ? 150 : 200), y1: b.y1 + 40};
    return {id: g, label, nodes, w: Math.max(box.x1 - box.x0, 300), h: box.y1 - box.y0, box,
      group: {id: g, label, total: total.get(g)!, top: top.map(h => h.id), members: members.map(h => h.id), rest: rest.map(h => h.id), expanded, page, pages, tray: tiny(g)}};
  };
  const cells: Cell[] = main.map(local);
  const trayCount = side.reduce((s, g) => s + total.get(g)!, 0), trayLabel = `${o.trayLabel ?? 'Outras perguntas'} (${side.length})`;
  if (side.length) {
    const node: SNode = {key: 't:tray', id: 'tray', kind: 'tray', x: 0, y: 0, r: 15, group: 'tray'};
    cells.push({id: 'tray', label: trayLabel, nodes: [node], w: 300, h: 150, box: {x0: -150, y0: -78, x1: 150, y1: 72}, group: null});
  }
  if (open) for (const g of side) cells.push(local(g));

  // shelf packing: try several wrap widths and keep the one that fills the viewport best (largest fit scale); rows are centred.
  const gap = 24, aspect = o.aspect ?? 1.6, maxW = Math.max(300, ...cells.map(c => c.w)), sumW = cells.reduce((t, c) => t + c.w + gap, 0);
  const pack = (target: number) => {
    const rows: Cell[][] = [[]]; let rw = 0;
    for (const c of cells) { if (rows[rows.length - 1].length && rw + c.w > target) { rows.push([]); rw = 0; } rows[rows.length - 1].push(c); rw += c.w + gap; }
    const widths = rows.map(r => r.reduce((t, c) => t + c.w, 0) + gap * (r.length - 1)), W = Math.max(...widths), H = rows.reduce((t, r) => t + Math.max(...r.map(c => c.h)) + gap, -gap);
    return {rows, widths, W, H, fit: Math.min(aspect / W, 1 / H)};
  };
  let best = pack(maxW);
  if (!cp && aspect >= 0.8) for (let i = 1; i <= 16; i++) { const t = pack(maxW + (sumW - maxW) * i / 16); if (t.fit > best.fit * 1.02) best = t; }
  const {rows, widths} = best, widest = best.W;
  const nodes = new Map<string, SNode>(), groups: SGroup[] = [], claims: SNode[] = [], boxes: Box[] = []; let tray: Scene['tray'] = null, y = 0;
  rows.forEach((r, ri) => {
    let x = (widest - widths[ri]) / 2; const rh = Math.max(...r.map(c => c.h));
    for (const c of r) {
      const dx = x + (c.w - (c.box.x1 - c.box.x0)) / 2 - c.box.x0, dy = y - c.box.y0;
      const placed = c.nodes.map(n => ({...n, x: n.x + dx, y: n.y + dy}));
      for (const n of placed) { nodes.set(n.key, n); if (n.kind === 'claim') claims.push(n); }
      const box = {x0: x, y0: y, x1: x + c.w, y1: y + c.h}; boxes.push(box);
      if (c.group) groups.push({...c.group, hub: placed[0], box}); else tray = {node: placed[0], box, count: trayCount, open, label: c.label};
      x += c.w + gap;
    }
    y += rh + gap;
  });
  const box = boxes.length ? {x0: Math.min(...boxes.map(b => b.x0)), y0: Math.min(...boxes.map(b => b.y0)), x1: Math.max(...boxes.map(b => b.x1)), y1: Math.max(...boxes.map(b => b.y1))} : {x0: 0, y0: 0, x1: 1400, y1: 820};
  return {groups, nodes, claims, tray, box, where, ranked};
}

/** Claim satellites for one hypothesis (selection, hover or deep zoom). Skips ids already drawn. */
export function satellites(scene: Scene, hypothesis: string, claims: readonly KClaim[], cap: number, skip: ReadonlySet<string> = new Set()): SNode[] {
  const host = scene.nodes.get(`h:${hypothesis}`), g = host && scene.groups.find(x => x.id === host.group);
  if (!host || !g) return [];
  const picks = claims.filter(c => !skip.has(c.id)).slice(0, cap), dir = Math.atan2(host.y - g.hub.y, host.x - g.hub.x) + (host.r > 8 ? Math.PI : 0), offs = fan(picks.length, dir, host.r + 18);
  return picks.map((c, i) => claimNode(c, host, g.id, offs[i][0], offs[i][1]));
}

export type PlacedLabel = {key: string; lines: string[]; anchor: 'start' | 'middle' | 'end'; x: number; y: number; box: Box; size: number; title: boolean};
export type LabelOptions = {scale: number; compact?: boolean; lang?: 'pt-BR' | 'en'; deep?: boolean; focus?: ReadonlySet<string>; highlight?: ReadonlySet<string>; cull?: Box | null; extra?: readonly SNode[]};
const clipText = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
export function wrapText(s: string, n: number, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of s.split(/\s+/)) { if (line && `${line} ${w}`.length > n) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w; }
  if (line) out.push(line);
  return out.length > max ? [...out.slice(0, max - 1), clipText(out.slice(max - 1).join(' '), n)] : out;
}
export const overlaps = (a: Box, b: Box, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;

/** Greedy label placement in screen pixels at zoom `scale` (label font sizes are screen sizes, so they stay readable at any zoom).
 *  Order: group titles, focused nodes, cluster controls, then hypotheses by rank across groups. A label that collides with
 *  anything already placed or with any node is dropped; the node keeps its tooltip. Boxes are in screen pixels (world * scale). */
export function sceneLabels(k: Knowledge, scene: Scene, o: LabelOptions): Map<string, PlacedLabel> {
  const s = o.scale, pt = (o.lang ?? 'pt-BR') === 'pt-BR', out = new Map<string, PlacedLabel>(), hyp = new Map(k.hypotheses.map(h => [h.id, h]));
  const inView = (n: SNode) => !o.cull || (n.x >= o.cull.x0 && n.x <= o.cull.x1 && n.y >= o.cull.y0 && n.y <= o.cull.y1);
  const obstacles = [...scene.nodes.values(), ...(o.extra ?? [])].filter(inView).map(n => ({key: n.key, box: {x0: (n.x - n.r) * s, y0: (n.y - n.r) * s, x1: (n.x + n.r) * s, y1: (n.y + n.r) * s}}));
  const placed: Box[] = [];
  const size = (text: string[], px: number) => ({w: Math.max(...text.map(t => t.length)) * px * 0.57 + 6, h: text.length * (px + 3) + 2});

  const titles = scene.groups.map(g => ({node: g.hub, box: g.box, text: g.label}));
  if (scene.tray) titles.push({node: scene.tray.node, box: scene.tray.box, text: scene.tray.label});
  for (const t of titles) {
    if (o.cull && !overlaps(t.box, o.cull)) continue;
    const lines = wrapText(t.text, 30, 2), px = 14, {w, h} = size(lines, px), cx = t.node.x * s;
    // pinned near the top of the cell, but never lower than the highest node of the group (bar included)
    const high = Math.min(...[...scene.nodes.values()].filter(n => n.group === t.node.group && n.kind !== 'claim').map(n => n.y - n.r - (n.kind === 'hypothesis' ? 12 : 0))) * s;
    const top = Math.min(t.box.y0 * s + 10, high - 6 - h);
    const b = {x0: cx - w / 2, y0: top, x1: cx + w / 2, y1: top + h};
    placed.push(b); out.set(t.node.key, {key: t.node.key, lines, anchor: 'middle', x: 0, y: top - t.node.y * s + px - 1, box: b, size: px, title: true});
  }

  const items: {node: SNode; lines: string[]; barPad: number; force?: boolean}[] = [], taken = new Set<string>();
  const add = (node: SNode | undefined, lines: string[], barPad = 0, force = false) => { if (node && !taken.has(node.key) && inView(node)) { taken.add(node.key); items.push({node, lines, barPad, force}); } };
  const textOf = (id: string) => hyp.get(id)?.label ?? k.claims.find(c => c.id === id)?.label ?? id;
  const wrapH = (id: string) => wrapText(textOf(id), o.compact ? 17 : 26, 2);
  for (const id of o.focus ?? []) { const n = scene.nodes.get(`h:${id}`) ?? scene.nodes.get(`c:${id}`) ?? (o.extra ?? []).find(e => e.id === id); if (n) add(n, wrapH(id), n.kind === 'hypothesis' ? 10 : 0, true); }
  for (const id of o.highlight ?? []) add(scene.nodes.get(`h:${id}`), wrapH(id), 10);
  for (const g of scene.groups) {
    add(scene.nodes.get(`k:${g.id}`), [g.expanded ? (pt ? '− recolher' : '− collapse') : (pt ? `+${g.rest.length} hipóteses` : `+${g.rest.length} hypotheses`)]);
    if (g.pages > 1 && g.expanded) add(scene.nodes.get(`p:${g.id}`), [`${pt ? 'ver mais' : 'more'} ${g.page + 1}/${g.pages}`]);
  }
  const depth = Math.max(0, ...scene.groups.map(g => g.top.length));
  for (let i = 0; i < depth; i++) for (const g of scene.groups) { const id = g.top[i]; if (id) add(scene.nodes.get(`h:${id}`), wrapH(id), 10); }
  if (o.deep) for (const g of scene.groups) for (const id of g.members) add(scene.nodes.get(`h:${id}`), wrapH(id), 0);

  const hubOf = new Map(scene.groups.map(g => [g.id, g.hub]));
  for (const it of items) {
    const n = it.node, px = 12, {w, h} = size(it.lines, px), cx = n.x * s, cy = n.y * s, rs = n.r * s, hub = hubOf.get(n.group), ox = hub ? n.x - hub.x : 0, oy = hub ? n.y - hub.y : 1;
    const bp = it.barPad, d = rs * 0.72 + 3, base = px - 1;
    // [box x, box y, text x, first baseline, anchor]
    const side: Record<string, [number, number, number, number, 'start' | 'middle' | 'end']> = {
      r: [cx + rs + 5, cy - h / 2, rs + 5, -h / 2 + base, 'start'], l: [cx - rs - 5 - w, cy - h / 2, -rs - 5, -h / 2 + base, 'end'],
      b: [cx - w / 2, cy + rs + 4, 0, rs + 4 + base, 'middle'], a: [cx - w / 2, cy - rs - 4 - bp - h, 0, -(rs + 4 + bp) - h + base, 'middle'],
      br: [cx + d, cy + d, d, d + base, 'start'], bl: [cx - d - w, cy + d, -d, d + base, 'end'],
      ar: [cx + d, cy - d - bp - h, d, -d - bp - h + base, 'start'], al: [cx - d - w, cy - d - bp - h, -d, -d - bp - h + base, 'end'],
      ru: [cx + rs + 5, cy - h + 9, rs + 5, -h + 9 + base, 'start'], rd: [cx + rs + 5, cy - 9, rs + 5, -9 + base, 'start'],
      lu: [cx - rs - 5 - w, cy - h + 9, -rs - 5, -h + 9 + base, 'end'], ld: [cx - rs - 5 - w, cy - 9, -rs - 5, -9 + base, 'end']};
    const v = oy >= 0 ? ['b', 'a'] : ['a', 'b'], hz = ox >= 0 ? ['r', 'l'] : ['l', 'r'], dg = (oy >= 0 ? 'b' : 'a') + (ox >= 0 ? 'r' : 'l'), dg2 = (oy >= 0 ? 'b' : 'a') + (ox >= 0 ? 'l' : 'r'), dg3 = (oy >= 0 ? 'a' : 'b') + (ox >= 0 ? 'r' : 'l');
    const order = [...(Math.abs(ox) >= Math.abs(oy) * 0.5 ? [hz[0], v[0], v[1], hz[1]] : [v[0], hz[0], hz[1], v[1]]), hz[0] + 'u', hz[0] + 'd', dg, dg3, dg2, hz[1] + 'u', hz[1] + 'd'];
    let done = false;
    for (const c of order) {
      const [bx, by, tx, ty, anchor] = side[c], b = {x0: bx, y0: by, x1: bx + w, y1: by + h};
      if (placed.some(p => overlaps(p, b, 2)) || obstacles.some(ob => ob.key !== n.key && overlaps(ob.box, b, 1))) continue;
      placed.push(b); out.set(n.key, {key: n.key, lines: it.lines, anchor, x: tx, y: ty, box: b, size: px, title: false});
      done = true; break;
    }
    if (!done && it.force) { const [bx, by, tx, ty, anchor] = side[order[0]]; out.set(n.key, {key: n.key, lines: it.lines, anchor, x: tx, y: ty, box: {x0: bx, y0: by, x1: bx + w, y1: by + h}, size: px, title: false}); }
  }
  return out;
}
