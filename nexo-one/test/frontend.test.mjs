// Testes do frontend: contratos, view models, cenários, filtros e navegação.
// Nada aqui depende de rede, de DOM ou de snapshot bruto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { SCENARIOS, DEFAULT_SCENARIO_ID, finalize, scenarioById, worstState } from '../src/data/fixtures/scenarios.ts';
import { fingerprint } from '../src/data/fixtures/build.ts';
import { assertSystemState, DataSourceError, fixtureSource, activeSource, remoteSource } from '../src/data/adapters/index.ts';
import {
  blockedActions, capabilityCounts, capabilityMatrix, globalSummary, humanActions, inboxGroups,
  integrityIssues, laneViews, provenanceOf, resolvableActions, runsForAction,
} from '../src/viewmodels/system.ts';
import { EMPTY_FILTERS, filterCount, filterGraph, layoutGraph, legendOf, relationsOf, VIEWBOX } from '../src/viewmodels/graph.ts';
import { capabilityToneOf, label, toneOf } from '../src/viewmodels/tokens.ts';
import { parseCommand } from '../src/app/command.ts';
import { NAV_GROUPS, MOBILE_PRIMARY, SYSTEM_VIEWS, VIEW_TITLES, entryFor, isSystemView } from '../src/app/navigation.ts';

const base = () => scenarioById(DEFAULT_SCENARIO_ID).build();
const byId = id => scenarioById(id).build();

// -- Contratos ---------------------------------------------------------------

test('toda fixture obedece ao contrato e sobrevive à validação de fronteira', () => {
  for (const scenario of SCENARIOS) {
    const state = scenario.build();
    assert.equal(state.contract_version, '1', `${scenario.id} sem contract_version`);
    assert.doesNotThrow(() => assertSystemState(state), `${scenario.id} rejeitado pela validação`);
  }
});

test('toda projeção é NON_AUTHORITATIVE e carrega proveniência completa', () => {
  for (const scenario of SCENARIOS) {
    for (const envelope of scenario.build().envelopes) {
      assert.equal(envelope.authoritative, false, `${envelope.entity_id} se declarou autoritativo`);
      assert.ok(envelope.source_ref, `${envelope.entity_id} sem source_ref`);
      assert.ok(envelope.fingerprint, `${envelope.entity_id} sem fingerprint`);
      assert.ok(envelope.freshness?.state, `${envelope.entity_id} sem freshness`);
      assert.ok(envelope.derivation_rule, `${envelope.entity_id} sem derivation_rule`);
    }
  }
});

test('a validação rejeita payload fora do contrato em vez de degradar em silêncio', () => {
  assert.throws(() => assertSystemState({ contract_version: '2' }), DataSourceError);
  assert.throws(() => assertSystemState(null), DataSourceError);
  const broken = base();
  broken.envelopes[0] = { ...broken.envelopes[0], authoritative: true };
  assert.throws(() => assertSystemState(broken), /NON_AUTHORITATIVE/);
  const missing = base();
  missing.envelopes[0] = { ...missing.envelopes[0], source_ref: '' };
  assert.throws(() => assertSystemState(missing), /proveniência/);
});

test('fixtures são determinísticas: mesma entrada, mesmo fingerprint', () => {
  assert.equal(base().bus.fingerprint, base().bus.fingerprint);
  assert.notEqual(byId('all-live').bus.fingerprint, base().bus.fingerprint);
  assert.equal(fingerprint('abc'), fingerprint('abc'));
  assert.notEqual(fingerprint('abc'), fingerprint('abd'));
});

test('o adapter ativo é o de fixtures e o remoto falha de forma explícita', async () => {
  assert.equal(activeSource.kind, 'fixture');
  assert.equal(remoteSource.kind, 'remote');
  const state = await fixtureSource.load({ scenarioId: 'all-live' });
  assert.equal(state.scenario_id, 'all-live');
});

// -- Estado global e severidade ---------------------------------------------

test('o estado global é o pior componente, nunca uma média otimista', () => {
  assert.equal(worstState(['LIVE', 'SNAPSHOT', 'CONFLICT']), 'CONFLICT');
  assert.equal(worstState(['LIVE', 'STALE', 'DEGRADED']), 'DEGRADED');
  assert.equal(worstState(['LIVE']), 'LIVE');
  assert.equal(base().global_state, 'CONFLICT');
  assert.equal(byId('all-live').global_state, 'LIVE');
});

test('OLYMPUS existe como conflito P0 e bloqueia a autoridade do domínio', () => {
  const state = base();
  const olympus = state.findings.find(f => f.domain === 'OLYMPUS');
  assert.equal(olympus.status, 'CONFLICT');
  assert.equal(olympus.severity, 'P0');
  assert.equal(olympus.authority.class, 'NON_AUTHORITATIVE');
  assert.notEqual(olympus.provider.expected, olympus.provider.observed);
  const summary = globalSummary(state);
  assert.equal(summary.conflicts.length, 1);
  assert.equal(summary.domains.find(d => d.domain === 'OLYMPUS').state, 'CONFLICT');
});

test('globalSummary cobre os quatro domínios e ordena conflitos por severidade', () => {
  const summary = globalSummary(base());
  assert.deepEqual(summary.domains.map(d => d.domain), ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS']);
  assert.ok(summary.blockers.length > 0);
  assert.ok(summary.needsHuman > 0);
});

// -- Human Inbox -------------------------------------------------------------

test('o Human Inbox só agrupa os cinco tipos de intervenção humana', () => {
  const groups = inboxGroups(base());
  assert.ok(groups.length > 0);
  for (const group of groups) {
    assert.ok(['DECIDIR', 'APROVAR', 'RESPONDER', 'ESCOLHER', 'FORNECER_DADO'].includes(group.kind));
    assert.ok(group.items.length > 0, 'grupo vazio não deve ser exibido');
  }
  const kinds = groups.map(g => g.kind);
  assert.equal(new Set(kinds).size, kinds.length, 'tipos duplicados');
});

test('o cenário de decisão humana eleva a severidade e mantém o gate', () => {
  const state = byId('human-decision');
  const decide = state.inbox.find(i => i.kind === 'DECIDIR');
  assert.equal(decide.severity, 'P0');
  assert.ok(state.actions.filter(a => a.human_gate).every(a => a.status === 'AWAITING_HUMAN'));
});

// -- Elegibilidade de ação ---------------------------------------------------

test('NEXO só pode resolver o que não tem gate humano nem capability impedida', () => {
  const state = base();
  const resolvable = resolvableActions(state);
  for (const action of resolvable) {
    assert.equal(action.human_gate, null, `${action.action_id} tem gate humano`);
    const capability = state.capabilities.find(c => c.capability_id === action.capability_id);
    if (capability) assert.ok(!['BLOCKED', 'UNKNOWN'].includes(capability.status));
    if (!action.reversible) assert.equal(capability?.status, 'PASS');
  }
  assert.ok(!resolvable.some(a => a.action_id === 'act.eng.promote-artifact'), 'deploy bloqueado não é autônomo');
  assert.ok(!resolvable.some(a => a.action_id === 'act.sci.submit-letter'), 'ação irreversível não é autônoma');
});

test('ações bloqueadas, falhas e em side quest aparecem separadas das autônomas', () => {
  const state = base();
  const blocked = blockedActions(state).map(a => a.status);
  assert.ok(blocked.includes('BLOCKED'));
  assert.ok(blocked.includes('FAILED'));
  assert.ok(blocked.includes('WAITING_SIDE_QUEST'));
  assert.ok(humanActions(state).every(a => a.human_gate || a.status === 'AWAITING_HUMAN'));
});

test('NO_OP_ALREADY_APPLIED confirma readback sem emitir escrita', () => {
  const state = byId('no-op-applied');
  const action = state.actions.find(a => a.action_id === 'act.eng.sync-readme');
  assert.equal(action.status, 'NO_OP_ALREADY_APPLIED');
  assert.equal(action.readback.status, 'CONFIRMED');
  assert.equal(action.readback.observed_fingerprint, action.input_fingerprint);
  const run = state.runs.find(r => r.run_id === 'run.9f2c');
  assert.equal(run.status, 'NO_OP');
  assert.equal(run.steps.find(s => s.stage === 'EFFECT').status, 'SKIPPED');
});

test('WAITING_SIDE_QUEST mantém a ação fora da autonomia e nomeia a side quest', () => {
  const state = byId('waiting-side-quest');
  const action = state.actions.find(a => a.action_id === 'act.eng.schedule-integrity-run');
  assert.equal(action.status, 'WAITING_SIDE_QUEST');
  assert.match(action.blocker, /sq\.eng\.workflow-perms/);
  assert.ok(!resolvableActions(state).some(a => a.action_id === action.action_id));
  const lane = state.lanes.find(l => l.domain === 'ENGINEERING');
  assert.equal(lane.side_quests.length, 2);
});

// -- Readback ----------------------------------------------------------------

test('readback FAILED nunca conta como efeito aplicado', () => {
  const state = byId('readback-failed');
  const action = state.actions.find(a => a.action_id === 'act.nexo.notify-digest');
  assert.equal(action.readback.status, 'FAILED');
  assert.equal(action.readback.observed_fingerprint, null);
  assert.notEqual(action.status, 'APPLIED');
  assert.ok(action.blocker);
  const run = state.runs.find(r => r.run_id === 'run.77aa');
  assert.equal(run.steps.find(s => s.stage === 'READBACK').status, 'FAIL');
  assert.ok(integrityIssues(state).some(i => i.id === 'readback:run.77aa'));
});

test('todo run percorre as cinco etapas do trace na ordem canônica', () => {
  for (const run of base().runs) {
    assert.deepEqual(run.steps.map(s => s.stage), ['ACTION', 'CAPABILITY', 'RUNTIME', 'EFFECT', 'READBACK']);
  }
});

// -- Capabilities ------------------------------------------------------------

test('UNVERIFIED é tratado como ausência de prova, nunca como funcionalidade parcial', () => {
  const state = byId('github-unverified');
  const scheduled = state.capabilities.find(c => c.capability_id === 'cap.github.schedule.workflow');
  assert.equal(scheduled.status, 'UNVERIFIED');
  assert.equal(scheduled.last_verified_at, null);
  assert.equal(scheduled.evidence_ref, null);
  // O tom de UNVERIFIED é o mesmo de UNKNOWN e diferente do de PASS e do de degradado.
  assert.equal(capabilityToneOf('UNVERIFIED'), 'unknown');
  assert.equal(capabilityToneOf('UNKNOWN'), 'unknown');
  assert.notEqual(capabilityToneOf('UNVERIFIED'), capabilityToneOf('PASS'));
  assert.notEqual(capabilityToneOf('UNVERIFIED'), 'degraded');
});

test('a matriz de capability usa o pior status da célula', () => {
  const state = base();
  const { runtimes, cells } = capabilityMatrix(state);
  assert.ok(runtimes.length > 0);
  for (const cell of cells) {
    const worst = cell.capabilities.some(c => c.status === 'BLOCKED') ? 'BLOCKED'
      : cell.capabilities.some(c => c.status === 'UNKNOWN') ? 'UNKNOWN'
      : cell.capabilities.some(c => c.status === 'UNVERIFIED') ? 'UNVERIFIED' : 'PASS';
    assert.equal(cell.status, worst, `${cell.domain}/${cell.runtime}`);
  }
  const counts = capabilityCounts(state);
  assert.equal(
    counts.PASS + counts.UNVERIFIED + counts.UNKNOWN + counts.BLOCKED,
    state.capabilities.length);
});

// -- Provider ausente e STALE -----------------------------------------------

test('provider ausente vira MISSING_PROVIDER e freshness UNKNOWN, nunca zero', () => {
  const state = byId('provider-missing');
  const drive = state.providers.find(p => p.id === 'drive');
  assert.equal(drive.state, 'MISSING_PROVIDER');
  assert.equal(drive.last_success_at, null);
  const science = state.findings.find(f => f.domain === 'SCIENCE');
  assert.equal(science.status, 'MISSING_PROVIDER');
  assert.equal(science.provider.observed, null);
  assert.equal(science.freshness.state, 'UNKNOWN');
  assert.equal(science.freshness.observed_at, null);
  const lane = state.lanes.find(l => l.domain === 'SCIENCE');
  assert.equal(lane.state, 'MISSING_PROVIDER');
  assert.equal(toneOf('UNKNOWN'), 'unknown');
});

test('fonte STALE preserva conteúdo anterior e o rotula explicitamente', () => {
  const state = byId('source-stale');
  assert.ok(state.envelopes.every(e => e.state === 'STALE'));
  assert.ok(state.envelopes.every(e => e.freshness.state === 'STALE'));
  assert.ok(state.envelopes.every(e => e.freshness.observed_at !== null), 'STALE mantém a leitura anterior');
  assert.equal(toneOf('STALE'), 'stale');
  assert.equal(label('STALE'), 'Leitura anterior');
});

test('projeção DEGRADED reporta cobertura parcial sem esconder a lacuna', () => {
  const state = byId('projection-degraded');
  assert.ok(state.envelopes.some(e => e.state === 'DEGRADED'));
  assert.ok(state.lanes.every(l => l.state === 'DEGRADED'));
  assert.equal(state.global_state, 'DEGRADED');
});

test('o cenário tudo LIVE não deixa nenhum estado residual degradado', () => {
  const state = byId('all-live');
  assert.ok(state.providers.every(p => p.state === 'LIVE'));
  assert.ok(state.findings.every(f => f.status === 'LIVE'));
  assert.ok(state.capabilities.every(c => c.status === 'PASS'));
  assert.equal(state.bus.state, 'LIVE');
  assert.equal(integrityIssues(state).length, 0);
});

// -- Bus e lanes -------------------------------------------------------------

test('o bus é derivado, nunca escrito à mão, e NEXO ONE e Atlas consomem o mesmo estado', () => {
  const state = base();
  assert.equal(state.bus.envelope_count, state.envelopes.length);
  assert.equal(state.bus.sources.length, state.providers.length);
  const consumers = state.bus.consumers.map(c => c.id);
  assert.ok(consumers.includes('nexo_one') && consumers.includes('atlas'));
  // Recompilar não muda o resultado.
  assert.equal(finalize(state).bus.fingerprint, state.bus.fingerprint);
});

test('as lanes operacionais expostas ao cockpit são SCIENCE, ENGINEERING e OLYMPUS', () => {
  assert.deepEqual(laneViews(base()).map(l => l.domain), ['SCIENCE', 'ENGINEERING', 'OLYMPUS']);
  assert.ok(base().lanes.some(l => l.domain === 'NEXO'), 'NEXO continua no contrato');
});

test('runsForAction liga ação e execução pelos identificadores do registro', () => {
  const state = base();
  const runs = runsForAction(state, 'act.nexo.notify-digest');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].run_id, 'run.77aa');
  assert.equal(runsForAction(state, 'inexistente').length, 0);
});

// -- Grafo do Atlas ----------------------------------------------------------

test('o grafo é derivado do mesmo estado e não inventa entidades', () => {
  const state = base();
  const ids = new Set(state.graph.nodes.map(n => n.id));
  for (const action of state.actions) assert.ok(ids.has(`action.${action.action_id}`));
  for (const capability of state.capabilities) assert.ok(ids.has(`capability.${capability.capability_id}`));
  for (const provider of state.providers) assert.ok(ids.has(`provider.${provider.id}`));
  for (const envelope of state.envelopes) assert.ok(ids.has(`projection.${envelope.entity_id}`));
  for (const edge of state.graph.edges) {
    assert.ok(ids.has(edge.from), `aresta órfã: ${edge.from}`);
    assert.ok(ids.has(edge.to), `aresta órfã: ${edge.to}`);
  }
});

test('o conflito de autoridade aparece como aresta CONTRADICTS entre providers', () => {
  const contradiction = base().graph.edges.find(e => e.kind === 'CONTRADICTS' && e.from.startsWith('provider.'));
  assert.ok(contradiction, 'conflito P0 sem aresta de contradição');
  assert.equal(contradiction.from, 'provider.olympus_store');
  assert.equal(contradiction.to, 'provider.nexo_ssot');
});

test('filtros do grafo compõem por E e removem arestas órfãs', () => {
  const state = base();
  assert.equal(filterCount(EMPTY_FILTERS), 0);
  const all = filterGraph(state.graph, EMPTY_FILTERS);
  assert.equal(all.nodes.length, state.graph.nodes.length);

  const olympus = filterGraph(state.graph, { ...EMPTY_FILTERS, domains: ['OLYMPUS'] });
  assert.ok(olympus.nodes.length > 0);
  assert.ok(olympus.nodes.every(n => n.domain === 'OLYMPUS'));
  const kept = new Set(olympus.nodes.map(n => n.id));
  assert.ok(olympus.edges.every(e => kept.has(e.from) && kept.has(e.to)));

  const capabilities = filterGraph(state.graph, { ...EMPTY_FILTERS, types: ['CAPABILITY'] });
  assert.ok(capabilities.nodes.every(n => n.type === 'CAPABILITY'));

  const combined = filterGraph(state.graph, { ...EMPTY_FILTERS, domains: ['OLYMPUS'], types: ['CAPABILITY'] });
  assert.ok(combined.nodes.every(n => n.domain === 'OLYMPUS' && n.type === 'CAPABILITY'));
  assert.ok(combined.nodes.length <= olympus.nodes.length);

  const searched = filterGraph(state.graph, { ...EMPTY_FILTERS, search: 'olympus' });
  assert.ok(searched.nodes.length > 0);
  assert.equal(filterGraph(state.graph, { ...EMPTY_FILTERS, search: 'zzz-inexistente' }).nodes.length, 0);
  assert.equal(filterCount({ ...EMPTY_FILTERS, domains: ['OLYMPUS'], search: 'x' }), 2);
});

test('relationsOf separa upstream de downstream sem duplicar arestas', () => {
  const state = base();
  const { upstream, downstream } = relationsOf(state.graph, 'action.act.eng.promote-artifact');
  assert.ok(upstream.length > 0 && downstream.length > 0);
  assert.ok(upstream.every(r => r.edge.to === 'action.act.eng.promote-artifact'));
  assert.ok(downstream.every(r => r.edge.from === 'action.act.eng.promote-artifact'));
  const ids = [...upstream, ...downstream].map(r => r.edge.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('o layout é determinístico e mantém todo nó dentro do viewBox', () => {
  const nodes = base().graph.nodes;
  const first = layoutGraph(nodes);
  const second = layoutGraph(nodes);
  assert.deepEqual(first.map(n => [n.id, n.x, n.y]), second.map(n => [n.id, n.x, n.y]));
  assert.equal(first.length, nodes.length);
  for (const node of first) {
    assert.ok(node.x >= 0 && node.x <= VIEWBOX, `${node.id} fora do eixo x`);
    assert.ok(node.y >= 0 && node.y <= VIEWBOX, `${node.id} fora do eixo y`);
    assert.ok(node.radius > 0);
  }
  assert.ok(legendOf(nodes).length > 0);
});

// -- Filamentos --------------------------------------------------------------

test('filamentos declaram peso, suporte, contradição e limite de validade', () => {
  for (const filament of base().filaments) {
    assert.ok(filament.weight >= 0 && filament.weight <= 1);
    assert.ok(Number.isInteger(filament.support) && Number.isInteger(filament.contradiction));
    assert.ok(filament.boundary.length > 0, `${filament.id} sem limite declarado`);
    assert.ok(filament.evidence.length > 0, `${filament.id} sem evidência`);
    assert.ok(['ESTABLISHED', 'PROVISIONAL', 'CONTESTED', 'RETIRED'].includes(filament.status));
  }
  const contested = base().filaments.find(f => f.status === 'CONTESTED');
  assert.ok(contested.contradiction > 0);
  assert.equal(toneOf('CONTESTED'), 'conflict');
});

// -- Proveniência ------------------------------------------------------------

test('provenanceOf normaliza qualquer entidade sem inventar campos', () => {
  const minimal = provenanceOf({ source_ref: 'ssot://x', fingerprint: 'FP-1' });
  assert.equal(minimal.source_revision, null);
  assert.equal(minimal.derivation_rule, null);
  assert.equal(minimal.freshness, null);
  const full = provenanceOf({
    source_ref: 'ssot://x', fingerprint: 'FP-1', source_revision: 'rev-1',
    authority_class: 'DERIVED', checked_at: '2026-09-10T09:00:00.000Z',
    freshness: { state: 'LIVE', observed_at: '2026-09-10T09:00:00.000Z', ttl_seconds: 900 },
    derivation_rule: 'r()', projection_role: 'ATLAS',
  });
  assert.equal(full.projection_role, 'ATLAS');
  assert.equal(full.authority_class, 'DERIVED');
});

// -- Navegação e Command Bar -------------------------------------------------

test('a navegação cobre as dez visões de sistema e o cockpit pessoal', () => {
  const entries = NAV_GROUPS.flatMap(g => g.entries.map(e => e.id));
  for (const view of SYSTEM_VIEWS) assert.ok(entries.includes(view), `${view} fora da navegação`);
  for (const view of ['NOW', 'LOOPS', 'DAY', 'CONTEXT', 'RECALL']) assert.ok(entries.includes(view));
  assert.equal(new Set(entries).size, entries.length, 'entrada duplicada na navegação');
  for (const view of entries) assert.ok(VIEW_TITLES[view]?.title, `${view} sem título`);
  assert.ok(MOBILE_PRIMARY.every(view => entries.includes(view)));
  assert.equal(MOBILE_PRIMARY.length, 4, 'a barra inferior reserva o quinto slot para "Mais"');
  assert.ok(isSystemView('ATLAS'));
  assert.ok(!isSystemView('NOW'));
  assert.equal(entryFor('ATLAS').label, 'Atlas');
});

test('a Command Bar navega, busca e recusa escrita de forma determinística', () => {
  assert.deepEqual(parseCommand('truthgraph'), { kind: 'NAVIGATE', view: 'TRUTHGRAPH' });
  assert.deepEqual(parseCommand('/atlas'), { kind: 'NAVIGATE', view: 'ATLAS' });
  assert.deepEqual(parseCommand('integridade'), { kind: 'NAVIGATE', view: 'INTEGRITY' });
  assert.deepEqual(parseCommand('execucao'), { kind: 'NAVIGATE', view: 'EXECUTION' });
  assert.deepEqual(parseCommand('EXECUÇÃO'), { kind: 'NAVIGATE', view: 'EXECUTION' }, 'acento deve ser normalizado');
  assert.equal(parseCommand('').view, 'OVERVIEW');

  const find = parseCommand('olympus store');
  assert.equal(find.kind, 'FIND');
  assert.equal(find.view, 'ATLAS');
  assert.equal(find.query, 'olympus store');

  for (const write of ['criar loop', 'deploy produção', 'enviar email', 'aprovar deploy']) {
    const rejected = parseCommand(write);
    assert.equal(rejected.kind, 'REJECTED', `${write} deveria ser recusado`);
    assert.match(rejected.message, /não executa escrita/);
  }
});

// -- Fronteira de segurança --------------------------------------------------

test('o frontend não implementa integração real nem referencia segredo', async () => {
  const forbidden = /GOOGLE_REFRESH_TOKEN|GOOGLE_CLIENT_SECRET|VERCEL_READ_TOKEN|GITHUB_TOKEN|NEXO_SESSION_SECRET|NEXO_PASSWORD_HASH/;
  const externalHost = /https?:\/\/(?:www\.)?(?:googleapis|github|vercel|gmail)\.com/;
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!/\.(tsx?|mjs)$/.test(path)) continue;
      const text = await readFile(path, 'utf8');
      assert.doesNotMatch(text, /from ['"][^'"]*server\//, `${path} importa implementação de servidor`);
      assert.doesNotMatch(text, forbidden, `${path} referencia segredo`);
      assert.doesNotMatch(text, externalHost, `${path} chama provider externo direto do browser`);
    }
  };
  await walk(fileURLToPath(new URL('../src', import.meta.url)));
});

test('o único ponto de integração declarado é o adapter remoto', async () => {
  const remote = await readFile(fileURLToPath(new URL('../src/data/adapters/remote.ts', import.meta.url)), 'utf8');
  assert.match(remote, /PONTO DE INTEGRAÇÃO ÚNICO/);
  assert.match(remote, /\/api\/system/);
  const source = await readFile(fileURLToPath(new URL('../src/data/adapters/index.ts', import.meta.url)), 'utf8');
  assert.match(source, /activeSource: SystemDataSource = fixtureSource/);
});

test('os dez cenários obrigatórios existem e são rotulados', () => {
  const required = [
    'all-live', 'olympus-conflict', 'github-unverified', 'provider-missing', 'source-stale',
    'projection-degraded', 'readback-failed', 'no-op-applied', 'waiting-side-quest', 'human-decision',
  ];
  const ids = SCENARIOS.map(s => s.id);
  for (const id of required) assert.ok(ids.includes(id), `cenário ausente: ${id}`);
  for (const scenario of SCENARIOS) {
    assert.ok(scenario.label.length > 0);
    assert.ok(scenario.description.length > 0);
  }
});
