import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

function manifest() {
  return {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: 'a'.repeat(40),
    event_cursor: '20260927T210000000000Z-drift',
    projection_fingerprint: 'sha256:' + 'b'.repeat(64),
    generated_at: '2026-09-27T21:00:00Z',
  };
}

function projection() {
  const m = manifest();
  return {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest: m,
    event_cursor: m.event_cursor,
    taxonomy: [],
    campaigns: [
      { campaign_id: 'CAMP-SCI', title: 'Campanha científica', domain: 'SCIENCE', state: 'ACTIVE' },
      { campaign_id: 'CAMP-WORK-ONLY', title: 'Campanha só com trabalho', domain: 'ENGINEERING', state: 'ACTIVE' },
    ],
    hypotheses: [
      { hypothesis_id: 'H-EXISTS', statement: 'Hipótese existente' },
    ],
    work: [
      { id: 'W1', title: 'Etapa 1', domain: 'ENGINEERING', status: 'READY', campaign_id: 'CAMP-WORK-ONLY' },
      { id: 'W2', title: 'Etapa 2', domain: 'ENGINEERING', status: 'READY', campaign_id: 'CAMP-WORK-ONLY' },
    ],
    tests: [
      { id: 'T-SCI-RUN', title: 'T-SCI-RUN', domain: 'SCIENCE', status: 'CHECKPOINTED', status_group: 'DONE',
        campaign_id: 'CAMP-SCI', hypothesis_id: 'H-MISSING', semantic: { question_plain: 'A medição científica continua em andamento?' } },
      { id: 'T-SCI-DONE', title: 'T-SCI-DONE', domain: 'SCIENCE', status: 'VERIFIED', status_group: 'READY',
        campaign_id: 'CAMP-SCI', hypothesis_id: 'H-EXISTS', semantic: { question_plain: 'A medição científica terminou?' } },
      { id: 'T-OLY-READY', title: 'T-OLY-READY', domain: 'OLYMPUS', status: 'READY', status_group: 'DONE' },
      { id: 'T-ENG-DONE', title: 'T-ENG-DONE', domain: 'ENGINEERING', status: 'DONE', status_group: 'READY' },
      { id: 'PEER-DETECTION-D00-V1', title: 'PEER-DETECTION-D00-V1', domain: 'SCIENCE', status: 'CHECKPOINTED',
        semantic: { question_plain: 'O gate de detecção continua em execução?' } },
    ],
    capabilities: {},
    human_gates: { work_ids: [], count: 0 },
    counts: { active_work: 2, tests: 5, capabilities: 0, needs_dener: 0 },
  };
}

test('Atlas uses one canonical phase classifier for lanes and graph and retains hidden tests for audit', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const p = projection();
  const peerDetectionBattery = {
    id: 'PEER_DETECTION_BATTERY_V1',
    execution_order: ['D00'],
    gates: { D00: { group: 'GOVERNANCE', purpose: 'Gate', capability_id: '' } },
  };
  const { system } = buildPagesProjection({ projection: p, manifestFile: p.manifest, peerDetectionBattery });

  const graphTests = system.graph.nodes.filter(node => node.type === 'TEST');
  assert.equal(graphTests.length, p.tests.length, 'graph must preserve every canonical TEST, even when hidden from the scene');

  const run = graphTests.find(node => node.id === 'test:T-SCI-RUN');
  const olympus = graphTests.find(node => node.id === 'test:T-OLY-READY');
  const peer = graphTests.find(node => node.id === 'test:PEER-DETECTION-D00-V1');
  assert.equal(run.status_group, 'RUNNING');
  assert.equal(olympus.status_group, 'READY');
  assert.equal(peer.atlas_visible, false);

  const sci = system.lanes.find(lane => lane.domain === 'SCIENCE');
  const oly = system.lanes.find(lane => lane.domain === 'OLYMPUS');
  assert.match(sci.current_state, /3 testes · 1 concluídos · 2 em andamento · 0 prontos/);
  assert.match(oly.current_state, /1 testes · 0 concluídos · 0 em andamento · 1 prontos/);
  assert.equal(graphTests.filter(node => node.domain === 'OLYMPUS' && node.status_group === 'DONE').length, 0);
});

test('campaign TEST count excludes WORK and technical IDs do not become the visible title', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const p = projection();
  const { system } = buildPagesProjection({ projection: p, manifestFile: p.manifest });

  const workOnly = system.graph.nodes.find(node => node.id === 'campaign:CAMP-WORK-ONLY');
  assert.equal(workOnly.member_count, 2);
  assert.equal(workOnly.work_count, 2);
  assert.equal(workOnly.test_count, 0);

  const testNode = system.graph.nodes.find(node => node.id === 'test:T-SCI-RUN');
  assert.equal(testNode.label, 'A medição científica continua em andamento?');
  const noSemantic = system.graph.nodes.find(node => node.id === 'test:T-ENG-DONE');
  assert.equal(noSemantic.label, 'Teste sem descrição simples');
});

test('dangling hypothesis references fail closed in the public science projection', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const p = projection();
  const { system } = buildPagesProjection({ projection: p, manifestFile: p.manifest });
  const testRecord = system.science_projection_v1.tests.find(item => item.id === 'T-SCI-RUN');
  assert.equal(testRecord.hypothesis_id.value, null);
  assert.match(testRecord.hypothesis_id.unavailable_reason, /H-MISSING/);
  assert.match(testRecord.hypothesis_id.unavailable_reason, /absent from this public projection/);
});

test('execution and integrity views refuse contradictory empty/green copy', async () => {
  const [operations, overview, evolution] = await Promise.all([
    text('src/features/system/Operations.tsx'),
    text('src/features/system/Overview.tsx'),
    text('src/features/system/EvolutionPanel.tsx'),
  ]);
  assert.match(operations, /projectedRunning/);
  assert.match(operations, /testes em andamento/);
  assert.match(operations, /sem inventar run_id/);
  assert.match(overview, /minutes > 120/);
  assert.match(overview, /publicação ainda não recebeu um heartbeat recente/);
  assert.match(evolution, /thoughtAgeMinutes > 360/);
  assert.match(evolution, /Diário da Pítia sem nova entrada/);
});
