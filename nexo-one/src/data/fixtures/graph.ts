// O grafo do Atlas é derivado do MESMO estado que alimenta o cockpit.
// Nenhum nó é inventado aqui: cada um vem de uma entidade já projetada.
import type { Domain, GraphEdge, GraphNode, SystemState } from '../../contracts/system.ts';
import { ago, fingerprint, freshness } from './build.ts';

type Seed = Pick<SystemState, 'actions' | 'capabilities' | 'providers' | 'findings' | 'filaments' | 'envelopes' | 'lanes'>;

const node = (n: Omit<GraphNode, 'source_revision'> & { source_revision?: string }): GraphNode =>
  ({ source_revision: n.source_revision ?? 'rev-7712', ...n });

const edge = (from: string, to: string, kind: GraphEdge['kind'], explanation: string, weight = 1): GraphEdge =>
  ({ id: `${kind}:${from}->${to}`, from, to, kind, weight, explanation });

const DOMAIN_SUMMARY: Record<Domain, string> = {
  NEXO: 'Núcleo operacional: registro de ações, projeções e recibos.',
  SCIENCE: 'Cosmologia e produção científica; verdade ancorada nos manuscritos canônicos.',
  ENGINEERING: 'Repositório, build e deploy; verdade ancorada no branch principal.',
  OLYMPUS: 'Treino, nutrição e check-ins; posse da verdade atualmente em disputa.',
};

/** Claims, tests e memories não têm fonte própria nas fixtures: são âncoras semânticas do Atlas. */
const ANCHORS: { claims: GraphNode[]; tests: GraphNode[]; memories: GraphNode[] } = {
  claims: [
    node({ id: 'claim.h0-calibrator', type: 'CLAIM', label: 'O calibrador escolhido altera a tensão de H0',
      domain: 'SCIENCE', state: 'CONFLICT', authority_class: 'DERIVED', source_ref: 'ssot://nexo/claims/h0-calibrator',
      fingerprint: fingerprint('claim:h0'), freshness: freshness('AGING', 190), checked_at: ago(190),
      severity: 'P2', summary: 'Sustentada por 5 evidências e contrariada por 4. Não resolvida.',
      evidence: ['drive://cosmo/manuscripts/h0-compare'] }),
    node({ id: 'claim.readback-authority', type: 'CLAIM', label: 'Readback é condição de aplicação de efeito',
      domain: 'NEXO', state: 'LIVE', authority_class: 'TRUTH_OWNER', source_ref: 'ssot://nexo/procedures/readback',
      fingerprint: fingerprint('claim:readback'), freshness: freshness('LIVE', 1), checked_at: ago(1),
      severity: 'INFO', summary: 'Regra canônica do kernel; sem contradição registrada.' }),
    node({ id: 'claim.deploy-incident', type: 'CLAIM', label: 'Declaração STALE precede incidente de deploy',
      domain: 'ENGINEERING', state: 'DEGRADED', authority_class: 'DERIVED', source_ref: 'ssot://nexo/claims/deploy-incidents',
      fingerprint: fingerprint('claim:deploy'), freshness: freshness('RECENT', 25), checked_at: ago(25),
      severity: 'P2', summary: 'Correlação observada em 4 de 6 incidentes. Amostra pequena.' }),
  ],
  tests: [
    node({ id: 'test.contract-shape', type: 'TEST', label: 'Contratos obedecem shape canônico', domain: 'NEXO',
      state: 'PASS', authority_class: 'DERIVED', source_ref: 'test://contracts/shape',
      fingerprint: fingerprint('test:shape'), freshness: freshness('LIVE', 2), checked_at: ago(2),
      summary: 'Todo envelope carrega source_ref, fingerprint e freshness.' }),
    node({ id: 'test.readback-required', type: 'TEST', label: 'Efeito sem readback nunca conta como aplicado',
      domain: 'NEXO', state: 'PASS', authority_class: 'DERIVED', source_ref: 'test://compiler/readback',
      fingerprint: fingerprint('test:readback'), freshness: freshness('LIVE', 2), checked_at: ago(2),
      summary: 'Cobre o caso do digest reportado sem confirmação.' }),
    node({ id: 'test.conflict-render', type: 'TEST', label: 'Conflito P0 é renderizado de forma inequívoca',
      domain: 'OLYMPUS', state: 'PASS', authority_class: 'DERIVED', source_ref: 'test://ui/conflict',
      fingerprint: fingerprint('test:conflict'), freshness: freshness('LIVE', 2), checked_at: ago(2),
      summary: 'Garante que CONFLICT não é exibido como aviso comum.' }),
  ],
  memories: [
    node({ id: 'memory.no-op-pattern', type: 'MEMORY', label: 'Padrão: verificar estado antes de escrever',
      domain: 'ENGINEERING', state: 'SNAPSHOT', authority_class: 'DERIVED', source_ref: 'ssot://nexo/memory/procedural',
      fingerprint: fingerprint('memory:noop'), freshness: freshness('RECENT', 25), checked_at: ago(25),
      summary: 'Memória procedural derivada de execuções que terminaram em NO_OP.' }),
    node({ id: 'memory.authority-dispute', type: 'MEMORY', label: 'Disputas de posse aparecem como revisões divergentes',
      domain: 'OLYMPUS', state: 'SNAPSHOT', authority_class: 'DERIVED', source_ref: 'ssot://nexo/memory/semantic',
      fingerprint: fingerprint('memory:authority'), freshness: freshness('RECENT', 25), checked_at: ago(25),
      summary: 'Memória semântica sobre como conflitos se manifestam nas fontes.' }),
  ],
};

export function buildGraph(seed: Seed): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const findingByDomain = new Map(seed.findings.map(f => [f.domain, f]));

  for (const domain of ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'] as Domain[]) {
    const finding = findingByDomain.get(domain);
    nodes.push(node({
      id: `domain.${domain.toLowerCase()}`, type: 'DOMAIN', label: domain, domain,
      state: finding?.status ?? 'LIVE', authority_class: finding?.authority.class ?? 'TRUTH_OWNER',
      source_ref: finding?.source_ref ?? 'ssot://nexo/registry',
      fingerprint: finding?.fingerprint ?? fingerprint(`domain:${domain}`),
      freshness: finding?.freshness ?? freshness('LIVE', 1), checked_at: finding?.checked_at ?? ago(1),
      severity: finding?.severity, summary: DOMAIN_SUMMARY[domain],
    }));
  }

  for (const provider of seed.providers) {
    nodes.push(node({
      id: `provider.${provider.id}`, type: 'PROVIDER', label: provider.label, domain: provider.expected_for[0],
      state: provider.state, authority_class: 'DELEGATED', source_ref: `provider://${provider.id}`,
      fingerprint: fingerprint(`provider:${provider.id}`),
      freshness: freshness(provider.state === 'LIVE' ? 'LIVE' : provider.state === 'CONFLICT' ? 'RECENT' : 'AGING', 25),
      checked_at: provider.checked_at, summary: provider.explanation,
    }));
    for (const domain of provider.expected_for) {
      edges.push(edge(`provider.${provider.id}`, `domain.${domain.toLowerCase()}`, 'PROJECTS',
        `${provider.label} projeta estado para ${domain}.`));
    }
  }

  for (const capability of seed.capabilities) {
    nodes.push(node({
      id: `capability.${capability.capability_id}`, type: 'CAPABILITY', label: capability.label,
      domain: capability.domain, state: capability.status, authority_class: 'DELEGATED',
      source_ref: `capability://${capability.capability_id}`, fingerprint: fingerprint(`cap:${capability.capability_id}`),
      freshness: capability.last_verified_at ? freshness('RECENT', 25) : freshness('UNKNOWN', null, null),
      checked_at: capability.last_verified_at ?? ago(2), summary: capability.explanation,
      capability_id: capability.capability_id, runtime: capability.runtime,
      evidence: capability.evidence_ref ? [capability.evidence_ref] : [],
    }));
    edges.push(edge(`capability.${capability.capability_id}`, `provider.${capability.provider}`, 'ROUTES_TO',
      `${capability.operation} roteado para ${capability.provider} via ${capability.runtime}.`));
  }

  for (const action of seed.actions) {
    nodes.push(node({
      id: `action.${action.action_id}`, type: 'ACTION', label: action.title, domain: action.lane,
      state: action.status === 'BLOCKED' ? 'BLOCKED' : action.status === 'FAILED' ? 'DEGRADED' : 'LIVE',
      authority_class: 'DERIVED', source_ref: action.source_ref, fingerprint: action.fingerprint,
      freshness: action.freshness, checked_at: action.checked_at, runtime: action.runtime,
      capability_id: action.capability_id ?? undefined, summary: action.eligibility,
      evidence: action.receipt_ref ? [action.receipt_ref] : [],
    }));
    edges.push(edge(`domain.${action.lane.toLowerCase()}`, `action.${action.action_id}`, 'OWNS',
      `${action.lane} é a lane responsável por esta ação.`));
    if (action.capability_id) {
      edges.push(edge(`action.${action.action_id}`, `capability.${action.capability_id}`, 'DEPENDS_ON',
        `A ação exige ${action.required_operation} através de ${action.capability_id}.`));
    }
    if (action.effect_key) {
      nodes.push(node({
        id: `effect.${action.effect_key}`, type: 'EFFECT', label: action.effect_key, domain: action.lane,
        state: action.readback.status === 'CONFIRMED' ? 'LIVE'
          : action.readback.status === 'FAILED' ? 'DEGRADED'
          : action.readback.status === 'UNVERIFIED' ? 'SNAPSHOT' : 'BLOCKED',
        authority_class: 'DERIVED', source_ref: action.receipt_ref ?? action.source_ref,
        fingerprint: action.input_fingerprint, freshness: action.freshness,
        checked_at: action.readback.checked_at ?? action.checked_at,
        summary: action.readback.explanation, evidence: action.receipt_ref ? [action.receipt_ref] : [],
      }));
      edges.push(edge(`action.${action.action_id}`, `effect.${action.effect_key}`, 'PRODUCES',
        'A ação, quando executada, emite este efeito.'));
      if (action.readback.provider) {
        edges.push(edge(`provider.${action.readback.provider}`, `effect.${action.effect_key}`, 'VERIFIES',
          `Readback ${action.readback.status} observado em ${action.readback.provider}.`,
          action.readback.status === 'CONFIRMED' ? 1 : 0.4));
      }
    }
    if (action.blocker) {
      edges.push(edge(`capability.${action.capability_id ?? 'cap.human.decide'}`, `action.${action.action_id}`,
        'BLOCKS', action.blocker, 0.9));
    }
  }

  for (const lane of seed.lanes) {
    for (const quest of lane.side_quests) {
      nodes.push(node({
        id: `sidequest.${quest.id}`, type: 'SIDE_QUEST', label: quest.title, domain: lane.domain,
        state: quest.status === 'DONE' ? 'LIVE' : quest.status === 'WAITING' ? 'SNAPSHOT' : 'DEGRADED',
        authority_class: 'DERIVED', source_ref: lane.source_ref, fingerprint: fingerprint(`sq:${quest.id}`),
        freshness: lane.freshness, checked_at: lane.checked_at,
        summary: `Side quest ${quest.status.toLowerCase()} na lane ${lane.domain}.`,
      }));
      edges.push(edge(`sidequest.${quest.id}`, `domain.${lane.domain.toLowerCase()}`, 'DEPENDS_ON',
        'Side quest aberta no escopo desta lane.'));
    }
  }
  const integrityAction = seed.actions.find(a => a.status === 'WAITING_SIDE_QUEST');
  if (integrityAction) {
    edges.push(edge('sidequest.sq.eng.workflow-perms', `action.${integrityAction.action_id}`, 'BLOCKS',
      'A ação aguarda o fechamento desta side quest.', 0.8));
  }

  for (const envelope of seed.envelopes) {
    nodes.push(node({
      id: `projection.${envelope.entity_id}`, type: 'PROJECTION', label: envelope.title, domain: envelope.domain,
      state: envelope.state, authority_class: envelope.authority_class, source_ref: envelope.source_ref,
      source_revision: envelope.source_revision, fingerprint: envelope.fingerprint, freshness: envelope.freshness,
      checked_at: envelope.checked_at, summary: envelope.summary ?? envelope.derivation_rule,
    }));
    edges.push(edge(`projection.${envelope.entity_id}`, `domain.${envelope.domain.toLowerCase()}`, 'DERIVES_FROM',
      `Regra de derivação: ${envelope.derivation_rule}.`));
  }

  nodes.push(...ANCHORS.claims, ...ANCHORS.tests, ...ANCHORS.memories);
  edges.push(
    edge('test.contract-shape', 'claim.readback-authority', 'VERIFIES', 'O teste exercita a regra declarada na claim.'),
    edge('test.readback-required', 'claim.readback-authority', 'VERIFIES', 'Cobre o caminho de readback ausente.'),
    edge('test.conflict-render', 'domain.olympus', 'VERIFIES', 'Garante que o conflito P0 aparece de forma inequívoca.'),
    edge('memory.no-op-pattern', 'claim.deploy-incident', 'SUPPORTS', 'Memória procedural reforça a leitura do incidente.', 0.6),
    edge('memory.authority-dispute', 'domain.olympus', 'SUPPORTS', 'Memória semântica sobre disputas de posse.', 0.7),
    edge('claim.deploy-incident', 'domain.engineering', 'DERIVES_FROM', 'Claim derivada do histórico da lane.'),
    edge('claim.h0-calibrator', 'domain.science', 'DERIVES_FROM', 'Claim aberta na produção científica.'),
    edge('claim.readback-authority', 'domain.nexo', 'OWNS', 'Regra canônica mantida pelo kernel.'),
  );

  for (const filament of seed.filaments) {
    nodes.push(node({
      id: `filament.${filament.id}`, type: 'FILAMENT', label: filament.label, domain: filament.domain,
      state: filament.status === 'CONTESTED' ? 'CONFLICT'
        : filament.status === 'RETIRED' ? 'STALE'
        : filament.status === 'PROVISIONAL' ? 'SNAPSHOT' : 'LIVE',
      authority_class: 'DERIVED', source_ref: filament.source_ref, fingerprint: fingerprint(`fil:${filament.id}`),
      freshness: freshness(filament.status === 'RETIRED' ? 'STALE' : 'RECENT', 25), checked_at: ago(25),
      summary: `${filament.from_label} → ${filament.to_label} · peso ${filament.weight.toFixed(2)}`,
      evidence: filament.evidence,
    }));
    const target = filament.domain === 'SCIENCE' ? 'claim.h0-calibrator'
      : filament.domain === 'ENGINEERING' ? 'claim.deploy-incident' : 'claim.readback-authority';
    edges.push(edge(`filament.${filament.id}`, target,
      filament.contradiction > filament.support ? 'CONTRADICTS' : 'SUPPORTS',
      `${filament.support} evidências a favor, ${filament.contradiction} contra. Limite: ${filament.boundary}`,
      filament.weight));
  }

  const conflict = seed.findings.find(f => f.status === 'CONFLICT');
  if (conflict?.provider.observed && conflict.provider.expected !== conflict.provider.observed) {
    edges.push(edge(`provider.${conflict.provider.observed}`, `provider.${conflict.provider.expected}`, 'CONTRADICTS',
      conflict.explanation, 1));
  }

  const seen = new Set<string>();
  const uniqueNodes = nodes.filter(n => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  const nodeIds = new Set(uniqueNodes.map(n => n.id));
  const seenEdges = new Set<string>();
  const uniqueEdges = edges.filter(e =>
    nodeIds.has(e.from) && nodeIds.has(e.to) && !seenEdges.has(e.id) && (seenEdges.add(e.id), true));
  return { nodes: uniqueNodes, edges: uniqueEdges };
}
