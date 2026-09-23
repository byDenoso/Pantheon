// Controle de missão: campanhas do roadmap lidas como missões, testes como
// eventos da missão. Tudo derivado do grafo publicado (projeção da Tower);
// o significado vem do bloco semântico, nunca de heurística nova aqui.
import type { GraphNode, SystemState } from '../contracts/system.ts';
import { atlasSubdomainOf, atlasTopDomainOf } from './atlasTaxonomy.ts';

export type Phase = 'DONE' | 'RUNNING' | 'READY' | 'BLOCKED' | 'PAUSED';

export interface MissionTest {
  id: string;
  title: string;
  phase: Phase;
  question: string | null;
  meaning: string | null;
}

export interface Mission {
  id: string;
  title: string;
  domain: string;
  station: string;
  question: string | null;
  total: number;
  counts: Record<Phase, number>;
  progress: number;
  next: MissionTest | null;
  tests: MissionTest[];
}

export interface MissionResult {
  id: string;
  title: string;
  station: string;
  domain: string;
  missionTitle: string | null;
  meaning: string;
}

export interface MissionTelemetry {
  towerRevision: string;
  generatedAt: string;
  missions: number;
  tests: number;
  done: number;
  running: number;
  ready: number;
  blocked: number;
}

const PHASES: Phase[] = ['DONE', 'RUNNING', 'READY', 'BLOCKED', 'PAUSED'];

export function phaseOf(node: GraphNode): Phase {
  const group = String(node.status_group || '').toUpperCase();
  if ((PHASES as string[]).includes(group)) return group as Phase;
  const state = String(node.state || '').toUpperCase();
  if (state === 'BLOCKED' || state === 'CONFLICT') return 'BLOCKED';
  return 'READY';
}

const clean = (value?: string | null): string | null => {
  const text = String(value ?? '').trim();
  return text && !/^(TEST projected without reinterpretation|Campaign inferred from canonical member)/.test(text) ? text : null;
};

/** CAMP-H0-LCDM-ORIGIN-20260916 -> "H0 LCDM origin" when no human title was projected. */
export function missionTitle(label: string): string {
  if (!/^CAMP-/.test(label)) return label;
  const words = label.replace(/^CAMP-/, '').replace(/-\d{8}$/, '').split('-').filter(Boolean);
  return words.map((word, index) => (index === 0 || /\d/.test(word) || word.length <= 4 ? word : word.toLowerCase())).join(' ');
}

function toTest(node: GraphNode): MissionTest {
  return {
    id: node.id,
    title: node.label,
    phase: phaseOf(node),
    question: clean(node.question_plain),
    meaning: clean(node.result_meaning),
  };
}

const PHASE_ORDER: Record<Phase, number> = { RUNNING: 0, READY: 1, PAUSED: 2, BLOCKED: 3, DONE: 4 };

export function missionsOf(state: SystemState): Mission[] {
  const nodes = state.graph.nodes;
  const testsByCampaign = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    if (node.type !== 'TEST' || !node.campaign_id) continue;
    const list = testsByCampaign.get(node.campaign_id) ?? [];
    list.push(node);
    testsByCampaign.set(node.campaign_id, list);
  }

  return nodes
    .filter(node => node.type === 'CAMPAIGN' && node.campaign_id)
    .map(node => {
      const tests = (testsByCampaign.get(node.campaign_id!) ?? []).map(toTest)
        .sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]);
      const counts = Object.fromEntries(PHASES.map(phase => [phase, 0])) as Record<Phase, number>;
      for (const test of tests) counts[test.phase] += 1;
      const total = tests.length || node.member_count || 0;
      return {
        id: node.id,
        title: missionTitle(node.label),
        domain: atlasTopDomainOf(node),
        station: atlasSubdomainOf(node),
        question: clean(node.question_plain) ?? clean(node.semantic_description),
        total,
        counts,
        progress: total ? counts.DONE / total : 0,
        next: tests.find(test => test.phase === 'RUNNING' || test.phase === 'READY') ?? null,
        tests,
      };
    })
    // Missões com trabalho em aberto primeiro; depois por tamanho.
    .sort((a, b) =>
      Number(b.counts.RUNNING + b.counts.READY > 0) - Number(a.counts.RUNNING + a.counts.READY > 0)
      || b.total - a.total);
}

export function recentResults(state: SystemState, limit = 6): MissionResult[] {
  const titles = new Map(
    state.graph.nodes.filter(n => n.type === 'CAMPAIGN' && n.campaign_id).map(n => [n.campaign_id!, missionTitle(n.label)]),
  );
  const done = state.graph.nodes
    .filter(node => node.type === 'TEST' && phaseOf(node) === 'DONE')
    .map(node => ({
      id: node.id,
      title: node.label,
      station: atlasSubdomainOf(node),
      domain: atlasTopDomainOf(node),
      missionTitle: node.campaign_id ? titles.get(node.campaign_id) ?? null : null,
      meaning: clean(node.result_meaning) ?? 'Resultado registrado na Tower; a leitura em linguagem simples ainda não foi escrita.',
      hasMeaning: Boolean(clean(node.result_meaning)),
    }))
    // Resultados com significado escrito sobem; é o que o Dener consegue ler sem abrir o código.
    .sort((a, b) => Number(b.hasMeaning) - Number(a.hasMeaning));
  // Uma descoberta por estação antes de repetir estação: o feed mostra a amplitude do NEXO.
  const byStation = new Map<string, typeof done>();
  for (const result of done) byStation.set(result.station, [...(byStation.get(result.station) ?? []), result]);
  const picked: typeof done = [];
  while (picked.length < limit && [...byStation.values()].some(list => list.length)) {
    for (const list of byStation.values()) {
      const next = list.shift();
      if (next && picked.length < limit) picked.push(next);
    }
  }
  return picked.map(({ hasMeaning: _ignored, ...result }) => result);
}

export function telemetryOf(state: SystemState, missions: Mission[]): MissionTelemetry {
  const tests = state.graph.nodes.filter(node => node.type === 'TEST');
  const count = (phase: Phase) => tests.filter(node => phaseOf(node) === phase).length;
  return {
    towerRevision: String(state.bus.fingerprint || '').replace(/^sha256:/, '').slice(0, 12) || '—',
    generatedAt: state.generated_at,
    missions: missions.length,
    tests: tests.length,
    done: count('DONE'),
    running: count('RUNNING'),
    ready: count('READY'),
    blocked: count('BLOCKED'),
  };
}
