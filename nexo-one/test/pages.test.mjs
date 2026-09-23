import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('GitHub Pages build uses repository base and configurable SystemState endpoint', async () => {
  const vite = await text('vite.config.ts');
  const remote = await text('src/data/adapters/remote.ts');

  assert.match(vite, /GITHUB_PAGES/);
  assert.match(vite, /Pantheon/);
  assert.match(remote, /VITE_SYSTEM_ENDPOINT/);
  assert.match(remote, /BASE_URL/);
  assert.match(remote, /resolveSystemEndpoint/);
  assert.match(remote, /configuredEndpoint\.replace/);
  assert.match(remote, /\/api\/system/);
  assert.match(remote, /staticProjection \? \(force \? 'reload' : 'no-cache'\) : 'no-store'/);
  assert.match(remote, /endsWith\('\.json'\)/);
  const sync = await text('src/data/projectionSync.ts');
  const hook = await text('src/data/useSystem.ts');
  const app = await text('src/app/App.tsx');
  assert.match(sync, /VITE_NEXO_SYNC_ENDPOINT/);
  assert.match(sync, /sync_request_id===requestId/);
  assert.match(sync, /build-meta\.json/);
  assert.match(sync, /tower-projection\/projection\.json/);
  assert.match(sync, /tower-projection\/manifest\.json/);
  assert.doesNotMatch(sync, /raw\.githubusercontent\.com/);
  assert.doesNotMatch(sync, /api\.github\.com\/repos\/byDenoso\/NEXO-Obsidian-Vault/);
  assert.match(sync, /PUBLIC_PROJECTION_REFRESHED/);
  assert.match(sync, /source_storage==='GOOGLE_DRIVE_PRIVATE'/);
  assert.match(sync, /truth_owner==='TOWER_V06@GOOGLE_DRIVE_PRIVATE'/);
  assert.match(hook, /Nova projeção pública detectada/);
  assert.match(hook, /Sem alterações · projeção pública validada diretamente/);
  assert.match(hook, /dispatchProjectionSync/);
  assert.match(hook, /waitForProjectionSync/);
  assert.match(app, /onClick=\{system\.sync\}/);
  assert.match(app, /VITE_PUBLIC_NEXO_BASE/);
  assert.match(app, /hashForView\(next\)/);
  assert.match(app, /href="#\/sistema"/);
  assert.match(app, /goSystem\(\)/);
});

test('manual sync is a server-side GitHub dispatch bridge with exact readback identity', async () => {
  const handler = await text('server/handler.mjs');
  const hook = await text('src/data/useSystem.ts');
  const sync = await text('src/data/projectionSync.ts');

  assert.match(handler, /route==='projection-sync'/);
  assert.match(handler, /GITHUB_TOKEN/);
  assert.match(handler, /\/dispatches/);
  assert.match(handler, /nexo-public-projection-updated/);
  assert.match(handler, /NEXO_ONE_COCKPIT_MANUAL_SYNC/);
  assert.match(handler, /INVALID_PROJECTION_FINGERPRINT/);
  assert.match(handler, /status:String\(env\.GITHUB_TOKEN/);
  assert.match(handler, /event_type:'nexo-public-projection-updated'/);
  assert.match(handler, /ATLAS_ORIGINS\.has\(origin\)/);
  assert.match(handler, /https:\/\/nexo-one-two\.vercel\.app/);
  assert.match(hook, /dispatchProjectionSync/);
  assert.match(hook, /waitForProjectionSync/);
  assert.match(sync, /meta\.sync_request_id===requestId/);
});

test('GitHub Pages consumes only the sanctioned TOWER_V06 public projection', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  const builder = await text('scripts/build-pages-system.mjs');

  assert.match(workflow, /NEXO_VAULT_READ_TOKEN/);
  assert.match(workflow, /byDenoso\/NEXO-Obsidian-Vault/);
  assert.match(workflow, /TOWER_V06\/projections\/public\/projection\.json/);
  assert.match(workflow, /TOWER_V06\/projections\/public\/manifest\.json/);
  assert.match(workflow, /METALEARNING_CURRENT\.json/);
  assert.match(workflow, /PEER_DETECTION_BATTERY_V1\.json/);
  assert.match(workflow, /human-gates-details\.json/);
  assert.match(workflow, /NEXO_PUBLIC_HUMAN_GATE_DETAILS/);
  assert.match(workflow, /verify_projection/);
  assert.match(workflow, /authority.*TOWER_V06/);
  assert.match(workflow, /projection_only/);
  assert.match(workflow, /writeback/);
  assert.match(workflow, /tower_commit/);
  assert.match(workflow, /event_cursor/);
  assert.match(workflow, /projection_fingerprint/);
  assert.match(workflow, /presentation_input_fingerprint/);
  assert.match(workflow, /METALEARNING_CURRENT\.json/);
  assert.match(workflow, /PRESENTATION_INPUT_FINGERPRINT/);
  assert.match(workflow, /BUILD_META_PRESENTATION_INPUT_FINGERPRINT_MISMATCH/);
  assert.doesNotMatch(workflow, /cp atlas-control-tower\/data\/nexo-drive-projection\.json/);
  assert.doesNotMatch(workflow, /truthgraph\.snapshot\.json/);

  assert.match(builder, /NEXO_PUBLIC_PROJECTION_V1/);
  assert.match(builder, /validateSanctionedProjection/);
  assert.match(builder, /buildScienceProjectionV1/);
  assert.match(builder, /science-projection-v1\.json/);
  assert.match(builder, /validateScienceProjectionV1\(scienceReadback\)/);
  assert.match(builder, /Pantheon performs presentation shaping only/);
  assert.doesNotMatch(builder, /readProvider/);
  assert.doesNotMatch(builder, /public-system-input/);
  assert.doesNotMatch(builder, /nexo-drive-projection/);
  assert.doesNotMatch(builder, /truthgraph\.snapshot/);
  assert.match(workflow, /SCIENCE_PROJECTION_SOURCE_MISMATCH/);
  assert.match(workflow, /PAGES_SCIENCE_PROJECTION_READBACK_OK/);
});

test('Pages capability projection cannot silently collapse a non-empty Tower registry to zero', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: '6'.repeat(40),
    event_cursor: '20260922T220000000000Z-capabilities',
    projection_fingerprint: 'sha256:' + '7'.repeat(64),
    generated_at: '2026-09-22T22:00:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [],
    tests: [],
    capabilities: {
      'cap.proven': { backend: 'chatgpt_runtime', status: 'PROVEN' },
      'cap.active': { backend: 'nexo_runtime', status: 'ACTIVE' },
      'cap.retired': { backend: 'chatgpt_runtime', status: 'RETIRED' },
    },
    counts: { active_work: 0, tests: 0, capabilities: 3 },
  };

  const { system } = buildPagesProjection({ projection, manifestFile: manifest });
  assert.equal(system.capabilities.length, 3);
  assert.deepEqual(
    Object.fromEntries(system.capabilities.map(item => [item.capability_id, item.status])),
    {
      'cap.proven': 'PASS',
      'cap.active': 'UNVERIFIED',
      'cap.retired': 'RETIRED_RUNTIME',
    },
  );

  assert.throws(
    () => buildPagesProjection({
      projection: { ...projection, counts: { ...projection.counts, capabilities: 4 } },
      manifestFile: manifest,
    }),
    /CAPABILITY_COUNT_DRIFT:declared=4:compiled=3/,
  );
});

test('campaigns are first-class, source-linked and hide member tests from Atlas by default', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: 'e'.repeat(40),
    event_cursor: '20260922T120000000000Z-campaign',
    projection_fingerprint: 'sha256:' + 'f'.repeat(64),
    generated_at: '2026-09-22T12:00:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    campaigns: [{
      campaign_id: 'CAMP-DEMO',
      roadmap_id: 'RM-DEMO',
      title: 'Demo dark-energy campaign',
      domain: 'SCIENCE',
      subdomain: 'COSMOLOGY/DARK_ENERGY',
      state: 'ACTIVE',
      semantic_description: 'Tests a bounded dark-energy hypothesis.',
      semantic_state: 'ACTIVE',
      atlas_projection: {
        visible: true,
        parent_subdomain: 'Energia escura',
        label: 'DDE · demo',
        show_tests: false,
      },
      source_links: [{
        label: 'Primary source',
        url: 'https://arxiv.org/abs/2503.14743',
        kind: 'ARXIV',
      }],
    }],
    work: [{
      id: 'WORK-DEMO',
      title: 'Campaign work',
      domain: 'SCIENCE',
      status: 'READY',
      campaign_id: 'CAMP-DEMO',
    }],
    tests: [{
      id: 'T-DEMO-001',
      title: 'Campaign test',
      domain: 'SCIENCE',
      status: 'READY',
      campaign_id: 'CAMP-DEMO',
    }],
    capabilities: {},
    counts: { active_work: 1, tests: 1, campaigns: 1, capabilities: 0 },
  };

  const { system } = buildPagesProjection({ projection, manifestFile: manifest });
  const campaign = system.graph.nodes.find(node => node.id === 'campaign:CAMP-DEMO');
  const work = system.graph.nodes.find(node => node.id === 'work:WORK-DEMO');
  const childTest = system.graph.nodes.find(node => node.id === 'test:T-DEMO-001');

  assert.ok(campaign);
  assert.equal(campaign.type, 'CAMPAIGN');
  assert.equal(campaign.label, 'DDE · demo');
  assert.equal(campaign.parent_subdomain, 'Energia escura');
  assert.equal(campaign.member_count, 2);
  assert.equal(campaign.source_links[0].url, 'https://arxiv.org/abs/2503.14743');
  assert.equal(work.atlas_visible, undefined);
  assert.equal(childTest.atlas_visible, false);
  assert.ok(system.graph.edges.some(edge => edge.from === 'domain:SCIENCE' && edge.to === campaign.id));
  assert.ok(system.graph.edges.some(edge => edge.from === campaign.id && edge.to === work.id));
  assert.ok(system.graph.edges.some(edge => edge.from === campaign.id && edge.to === childTest.id));
});

test('legacy projection campaign_id still creates a campaign node without hardcoded campaign ids', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: '7'.repeat(40),
    event_cursor: '20260922T120100000000Z-campaign-fallback',
    projection_fingerprint: 'sha256:' + '8'.repeat(64),
    generated_at: '2026-09-22T12:01:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [],
    tests: [{
      id: 'T-FUTURE-001',
      domain: 'SCIENCE',
      status: 'READY',
      campaign_id: 'CAMP-FUTURE-UNSEEN',
    }],
    capabilities: {},
    counts: { active_work: 0, tests: 1, capabilities: 0 },
  };

  const { system } = buildPagesProjection({ projection, manifestFile: manifest });
  assert.ok(system.graph.nodes.some(node => node.id === 'campaign:CAMP-FUTURE-UNSEEN'));
  assert.ok(system.graph.edges.some(edge =>
    edge.from === 'campaign:CAMP-FUTURE-UNSEEN' && edge.to === 'test:T-FUTURE-001'
  ));
});

test('sanctioned TOWER interdomain entities become visible learning filaments', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: 'a'.repeat(40),
    event_cursor: '20260918T162451768632Z-47dfe529',
    projection_fingerprint: `sha256:${'b'.repeat(64)}`,
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [],
    tests: [],
    capabilities: {},
    counts: { active_work: 0, tests: 0, capabilities: 0 },
  };
  const { system } = buildPagesProjection({
    projection,
    manifestFile: manifest,
    interdomain: [{
      id: 'META::INTERDOMAIN::TEST',
      relation_type: 'METHOD_TRANSFER',
      source_domains: ['Cosmologia'],
      target_domains: ['Bodybuilding'],
      status: 'TESTING',
    }],
  });
  assert.equal(system.filaments.length, 1);
  assert.ok(system.graph.edges.some(edge => edge.is_learning && edge.learning_scope === 'INTER_DOMAIN'));
  assert.ok(system.graph.edges.some(edge => edge.from === 'domain:SCIENCE' && edge.to === 'domain:OLYMPUS'));
});

test('Peer Detection battery is projected by canonical semantic groups, not raw runtime stations', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: '1'.repeat(40),
    event_cursor: '20260921T230000000000Z-peer',
    projection_fingerprint: 'sha256:' + '2'.repeat(64),
    generated_at: '2026-09-21T23:00:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [
      { id: 'PEER-DETECTION-D00', title: 'freeze', domain: 'COSMOLOGY', status: 'READY' },
      { id: 'PEER-DETECTION-D01', title: 'baseline', domain: 'COSMOLOGY', status: 'READY' },
    ],
    tests: [
      { id: 'PEER-DETECTION-D00-V1', title: 'freeze test', domain: 'COSMOLOGY', status: 'VERIFIED' },
    ],
    capabilities: {
      'peer.detection.d00_v1': { battery_id: 'PEER_DETECTION_BATTERY_V1', gate_id: 'D00', status: 'ACTIVE' },
      'peer.detection.d01_v1': { battery_id: 'PEER_DETECTION_BATTERY_V1', gate_id: 'D01', status: 'ACTIVE' },
    },
    counts: { active_work: 2, tests: 1, capabilities: 2 },
  };
  const peerDetectionBattery = {
    id: 'PEER_DETECTION_BATTERY_V1',
    execution_order: ['D00', 'D01'],
    gates: {
      D00: { group: 'GOVERNANCE', purpose: 'freeze', capability_id: 'peer.detection.d00_v1' },
      D01: { group: 'BASELINE_PROFILE', purpose: 'baseline', capability_id: 'peer.detection.d01_v1' },
    },
  };

  const { system } = buildPagesProjection({ projection, manifestFile: manifest, peerDetectionBattery });
  const rawPeer = system.graph.nodes.filter(node =>
    /^work:PEER-DETECTION-|^test:PEER-DETECTION-|^capability:peer\.detection\./i.test(node.id)
  );
  assert.equal(rawPeer.length, 0);
  assert.equal(system.projected_work.length, 2, 'operational queue must preserve peer WORK hidden from Atlas');
  assert.deepEqual(system.projected_work.map(node => node.id).sort(), [
    'work:PEER-DETECTION-D00',
    'work:PEER-DETECTION-D01',
  ]);
  const semantic = system.filaments.filter(item => item.kind === 'SCIENTIFIC_LEARNING_PIPELINE');
  assert.equal(semantic.length, 2);
  assert.deepEqual(new Set(semantic.map(item => item.peer_detection_group)), new Set(['GOVERNANCE', 'BASELINE_PROFILE']));
  assert.ok(system.graph.edges.filter(edge => edge.is_learning).length >= 2);
});

test('published Pages auto-syncs Tower snapshots without a new infrastructure service', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  const hook = await text('src/data/useSystem.ts');
  const remote = await text('src/data/adapters/remote.ts');

  assert.match(workflow, /repository_dispatch:/);
  assert.match(workflow, /nexo-public-projection-updated/);
  assert.match(workflow, /cron:\s*'\*\/15 \* \* \* \*'/);
  assert.match(workflow, /METALEARNING_CURRENT\.json/);
  assert.match(workflow, /PEER_DETECTION_BATTERY_V1\.json/);
  assert.match(hook, /setInterval/);
  assert.match(hook, /60_000/);
  assert.match(hook, /visibilitychange/);
  assert.match(remote, /VITE_SYSTEM_ENDPOINT/);
  assert.match(remote, /staticProjection/);
  assert.match(remote, /'no-cache'/);
  assert.match(hook, /!syncController\.current/);
});

test('explicit Tower human gates become Needs Dener inbox items', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: 'c'.repeat(40),
    event_cursor: '20260919T230000000000Z-human',
    projection_fingerprint: 'sha256:' + 'd'.repeat(64),
    generated_at: '2026-09-20T00:00:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [{
      id: 'WORK-HUMAN-1',
      title: 'Provider authorization',
      status: 'WAIT_DEPENDENCY',
      priority: 'P0',
      domain: 'ENGINEERING',
      dependency_class: 'HUMAN_AUTH_REQUIRED',
    }],
    tests: [],
    capabilities: {},
    human_gates: { work_ids: ['WORK-HUMAN-1'], count: 1 },
    counts: { active_work: 1, tests: 0, capabilities: 0, needs_dener: 1 },
  };
  const humanGateDetails = [{
    id: 'WORK-HUMAN-1',
    dependency_class: 'HUMAN_AUTH_REQUIRED',
    next_action: 'Provision secure provider settings.',
    acceptance: ['Authenticated canonical write/readback PASS', 'Remote smoke PASS'],
    constraints: ['NO_SECRETS_IN_CHAT_OR_SOURCE'],
    remaining_dependencies: [
      {
        id: 'HOSTED_MCP_TOWER_WRITE_CREDENTIAL',
        dependency_class: 'HUMAN_AUTH_REQUIRED',
        detail: 'Secure server-side Tower write/readback credential is required.',
      },
      {
        id: 'VERCEL_FAILOVER_LIVE_CANARY_CAPACITY',
        dependency_class: 'EXTERNAL_TRANSIENT',
        detail: 'Vercel capacity is transient and retryable by the system.',
      },
    ],
  }];
  const { system } = buildPagesProjection({ projection, manifestFile: manifest, humanGateDetails });
  assert.equal(system.inbox.length, 1);
  assert.equal(system.inbox[0].id, 'needs-dener:WORK-HUMAN-1');
  assert.equal(system.inbox[0].kind, 'CONFIGURAR_ACESSO');
  assert.equal(system.inbox[0].domain, 'ENGINEERING');
  assert.equal(system.inbox[0].human_requirements.length, 1);
  assert.equal(system.inbox[0].human_requirements[0].id, 'HOSTED_MCP_TOWER_WRITE_CREDENTIAL');
  assert.equal(system.inbox[0].human_requirements[0].label, 'Autorizar / configurar acesso externo');
  assert.equal(system.inbox[0].automatic_requirements.length, 1);
  assert.equal(system.inbox[0].automatic_requirements[0].id, 'VERCEL_FAILOVER_LIVE_CANARY_CAPACITY');
  assert.equal(system.inbox[0].automatic_requirements[0].retryable, true);
  assert.match(system.inbox[0].automatic_requirements[0].detail, /Vercel capacity/);
  assert.match(system.inbox[0].why, /Só as dependências humanas/);
  assert.match(system.inbox[0].action_location, /Não inserir segredo/);
  assert.equal(system.inbox[0].system_next, 'Provision secure provider settings.');
  assert.deepEqual(system.inbox[0].readback_criteria, [
    'Authenticated canonical write/readback PASS',
    'Remote smoke PASS',
  ]);
  const workNode = system.graph.nodes.find(node => node.id === 'work:WORK-HUMAN-1');
  assert.ok(workNode);
  assert.equal(workNode.operational_status, 'WAIT_DEPENDENCY');
  assert.equal(workNode.priority, 'P0');
  assert.equal(workNode.dependency_class, 'HUMAN_AUTH_REQUIRED');
  assert.equal(workNode.human_gate, true);
  assert.equal(system.actions.length, 0, 'WORK projection must not impersonate an executable ActionRecord');
});

test('Needs Dener semantic compiler has no WORK-id special cases', async () => {
  const builder = await text('scripts/build-pages-system.mjs');
  assert.doesNotMatch(builder, /HOSTED_MCP_TOWER_WRITE_CREDENTIAL/);
  assert.doesNotMatch(builder, /PERSONAL_LOOP_PRIVATE_PROVIDER_AUTHORIZATION/);
  assert.doesNotMatch(builder, /REQUEST-INGRESS-HOSTING-V1/);
  assert.match(builder, /HUMAN_DEPENDENCY_KIND/);
  assert.match(builder, /automatic_requirements/);
  assert.match(builder, /readback_criteria/);
});

test('new projected domains expand without compiler switch edits', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: 'e'.repeat(40),
    event_cursor: '20260922T120000000000Z-domain',
    projection_fingerprint: 'sha256:' + 'f'.repeat(64),
    generated_at: '2026-09-22T12:00:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [{ id: 'WORK-FIN-1', title: 'Finance pilot', domain: 'FINANCE', status: 'READY' }],
    tests: [],
    capabilities: {},
    counts: { active_work: 1, tests: 0, capabilities: 0, needs_dener: 0 },
  };
  const { system, world } = buildPagesProjection({ projection, manifestFile: manifest });
  assert.ok(system.graph.nodes.some(node => node.id === 'domain:FINANCE' && node.domain === 'FINANCE'));
  assert.ok(system.graph.nodes.some(node => node.id === 'work:WORK-FIN-1' && node.domain === 'FINANCE'));
  assert.ok(system.lanes.some(lane => lane.domain === 'FINANCE'));
  assert.ok(world.contexts.some(context => context.id === 'FINANCE' && context.coverage === 'AVAILABLE'));
  const primitives = await text('src/components/primitives.tsx');
  assert.match(primitives, /DOMAIN_GLYPH\[domain\] \?\? '◇'/);
});

test('GitHub Pages deploys official artifact and exposes projection readback', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');

  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /id:\s*pages/);
  assert.match(workflow, /VITE_SYSTEM_ENDPOINT:\s*\$\{\{ steps\.pages\.outputs\.base_path \}\}\/system\.json/);
  assert.match(workflow, /test -s dist\/atlas3d\/index\.html/);
  assert.match(workflow, /GitHub Pages bundle does not contain the repository-root SystemState endpoint/);
  assert.match(workflow, /VITE_WORLD_ENDPOINT:\s*\.\/world-public\.ndjson/);
  assert.match(workflow, /tower-projection\/manifest\.json/);
  assert.match(workflow, /\$\{base\}\/atlas3d\//);
  assert.match(workflow, /<title>NEXO Atlas 3D<\/title>/);
  assert.match(workflow, /data-atlas-renderer="metro-cluster"/);
  assert.match(workflow, /data-atlas-ready="true"/);
  assert.match(workflow, /data-atlas-root-count="3"/);
  assert.match(workflow, /PAGES_ATLAS3D_VISUAL_READBACK_OK/);
  assert.match(workflow, /PAGES_COCKPIT_ACTIONS_READBACK_OK/);
  assert.match(workflow, /cockpit-actions-readback\.png/);
  assert.match(workflow, /data-work-count/);
  assert.match(workflow, /VITE_NEXO_SYNC_ENDPOINT/);
  assert.match(workflow, /VITE_PUBLIC_NEXO_BASE:\s*https:\/\/bydenoso\.github\.io\/Pantheon\//);
  assert.doesNotMatch(workflow, /VITE_PRIVATE_COCKPIT_URL:\s*https:\/\/nexo-one-two\.vercel\.app/);
  assert.match(workflow, /SYNC_REQUEST_ID/);
  assert.match(workflow, /sync_request_id/);
  assert.match(workflow, /PAGES_ATLAS_LEARNING_SEMANTIC_OK/);
  assert.match(workflow, /SCIENTIFIC_LEARNING_PIPELINE/);
  assert.match(workflow, /raw_peer_source_nodes/);
  assert.match(workflow, /data-atlas-peer-artifact-nodes/);
  assert.match(workflow, /METALEARNING_NOT_PROJECTED/);
  assert.match(workflow, /data-g6-label-collisions="0"/);
  assert.match(workflow, /data-g6-label-dom-collisions/);
  assert.match(workflow, /viewport-adaptive-v2/);
  assert.match(workflow, /mode=3d&expand=dense-science/);
  assert.match(workflow, /data-three-depth-policy="domain-depth-sibling-v3"/);
  assert.match(workflow, /Three same-level siblings still form a flat totem/);
  assert.match(workflow, /PAGES_ATLAS3D_3D_READBACK_OK visual=neural-synapse/);
  assert.match(workflow, /data-three-visual="neural-synapse"/);
  assert.match(workflow, /three_synapse_count/);
  assert.match(workflow, /three_learning/);
  assert.match(workflow, /three_same_level_z/);
  assert.match(workflow, /data-g6-learning-edges/);
  assert.match(workflow, /data-g6-scientific-learning-edges/);
  assert.match(workflow, /data-g6-peer-learning-edges/);
  assert.match(workflow, /data-g6-subdomain-learning-edges/);
  assert.match(workflow, /data-g6-peer-subdomain-edges/);
  assert.match(workflow, /data-atlas-learning-subdomain-endpoints/);
  assert.match(workflow, /data-atlas-learning-exact-entity-records/);
  assert.match(workflow, /learning-leaf/);
  assert.match(workflow, /data-g6-direct-exact-entity-learning-edges/);
  assert.match(workflow, /PAGES_ATLAS3D_LEAF_READBACK_OK/);
  assert.match(workflow, /data-three-direct-exact-entity-learning-synapses/);
  assert.match(workflow, /PAGES_ATLAS3D_LEAF_3D_READBACK_OK/);
  assert.match(workflow, /data-atlas-learning-themes/);
  assert.match(workflow, /data-atlas-learning-distinct-subdomains/);
  assert.match(workflow, /data-atlas-learning-max-subdomain-share/);
  assert.match(workflow, /data-atlas-peer-target-subdomains/);
  assert.match(workflow, /Learning semantics collapsed into too few subdomains/);
  assert.match(workflow, /mega-subdomain/);
  assert.match(workflow, /data-atlas-peer-subdomain-links/);
  assert.match(workflow, /data-atlas-semantic-subdomain-links/);
  assert.match(workflow, /data-atlas-procedural-subdomain-links/);
  assert.match(workflow, /Learning routing remains hub-dominated/);
  assert.match(workflow, /data-three-scientific-learning-synapses/);
  assert.match(workflow, /data-three-subdomain-learning-synapses/);
  assert.match(workflow, /data-three-peer-subdomain-synapses/);
  assert.match(workflow, /data-three-peer-learning-synapses/);
  assert.match(workflow, /Scientific Learning underrepresented/);
  assert.match(workflow, /G6 rendered only.*Peer Detection bundles/);
  assert.match(workflow, /PAGES_ATLAS3D_MOBILE_READBACK_OK/);
  assert.match(workflow, /PAGES_ATLAS3D_MOBILE_3D_READBACK_OK/);
  assert.match(workflow, /window-size=390,844/);
  assert.match(workflow, /touch-events=enabled/);
  assert.match(workflow, /data-g6-profile="compact-touch"/);
  assert.match(workflow, /data-three-profile="compact-touch"/);
  assert.match(workflow, /Atlas mobile workspace collapsed vertically/);
  assert.match(workflow, /atlas3d-readback-mobile\.png/);
  assert.match(workflow, /atlas3d-readback-mobile-3d\.png/);
  assert.match(workflow, /readback=1/);
  assert.match(workflow, /public\/vendor\/g6\.min\.js/);
  assert.match(workflow, /dist\/vendor\/g6\.min\.js/);
  assert.match(workflow, /data-atlas-g6-source="preloaded"/);
  assert.match(workflow, /WORK_WAITING_COUNT_DRIFT/);
  assert.match(workflow, /system\.projected_work/);
  assert.match(workflow, /data-three-quality="reduced-gpu"/);
  assert.match(workflow, /data-three-fit-policy="selection-safe-area-v5"/);
  assert.match(workflow, /data-three-fit-scope="selection"/);
  assert.match(workflow, /data-three-fit-node-count/);
  assert.match(workflow, /did not focus selected semantic context/);
  assert.match(workflow, /data-three-fit-coverage/);
  assert.match(workflow, /Mobile Three fit wastes viewport or clips content/);
  assert.match(workflow, /data-g6-learning-records/);
  assert.match(workflow, /data-g6-learning-relations/);
  assert.match(workflow, /Desktop G6 still draws one Learning filament per canonical record/);
  assert.match(workflow, /Learning legend\/model record count diverges/);
  assert.match(workflow, /Mobile G6 did not compact parallel Learning filaments/);
  assert.match(workflow, /data-three-learning-visual-synapses/);
  assert.match(workflow, /data-three-learning-records/);
  assert.match(workflow, /data-three-learning-relations/);
  assert.match(workflow, /Desktop Three still draws one synapse per Learning record/);
  assert.match(workflow, /! grep -Fq 'id="atlas-metro-g6"'/);
  assert.match(workflow, /atlas3d-production-readback/);
  assert.match(workflow, /PAGES_TOWER_PROJECTION_READBACK_OK/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
});

test('NEXO ONE is the only workflow allowed to publish the Pages root', async () => {
  const workflowsDir = new URL('../../.github/workflows/', import.meta.url);
  const files = (await readdir(workflowsDir)).filter(name => /\.ya?ml$/.test(name));
  const publishers = [];
  for (const file of files) {
    const body = await readFile(new URL(file, workflowsDir), 'utf8');
    if (/actions\/deploy-pages@v4/.test(body) || /pages:\s*write/.test(body)) publishers.push(file);
  }
  assert.deepEqual(publishers, ['nexo-one-pages.yml']);
});

test('GitHub Pages personal plane reads the locally compiled public WorldState', async () => {
  const hook = await text('src/app/useWorld.ts');
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  const builder = await text('scripts/build-pages-system.mjs');

  assert.match(hook, /VITE_WORLD_ENDPOINT/);
  assert.match(hook, /staticProjection\?\(reset\?'reload':'no-cache'\):'no-store'/);
  assert.match(hook, /endsWith\('\.ndjson'\)/);
  assert.doesNotMatch(hook, /fetch\('\/api\/world\?stream=1&refresh=1'/);
  assert.match(workflow, /VITE_WORLD_ENDPOINT:\s*\.\/world-public\.ndjson/);
  assert.match(workflow, /test -s dist\/world-public\.ndjson/);
  assert.match(builder, /world-public\.ndjson/);
  assert.match(builder, /buildPagesProjection/);
  assert.doesNotMatch(workflow, /VITE_WORLD_ENDPOINT:\s*https:\/\/nexo-one-two\.vercel\.app\/api\/world/);
});


test('Pages runtime avoids redundant scheduled deploys and hydrates history concurrently', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  assert.match(workflow, /cancel-in-progress:\s*true/);
  assert.match(workflow, /id:\s*deploy_needed/);
  assert.match(workflow, /PAGES_NO_OP projection, live semantic inputs and Pantheon commit already published/);
  assert.match(workflow, /build-meta\.json/);
  assert.match(workflow, /NEXO_ONE_BUILD_META_V1/);
  assert.match(workflow, /xargs -r -P 8/);
  assert.match(workflow, /if: needs\.build\.outputs\.deploy_needed == 'true'/);
  assert.match(workflow, /PAGES_BUILD_META_READBACK_OK/);
});


test('General durable Drive state projects into Atlas as aggregates and Learning filaments', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: '9'.repeat(40),
    event_cursor: '20260922T221800000000Z-general',
    projection_fingerprint: 'sha256:' + 'a'.repeat(64),
    generated_at: '2026-09-22T22:18:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [],
    tests: [],
    capabilities: {},
    counts: { active_work: 0, tests: 0, capabilities: 0, needs_dener: 0 },
  };
  const general = {
    contract: 'NEXO_GENERAL_PUBLIC_PROJECTION_V1',
    authority: 'GOOGLE_DRIVE_PRIVATE',
    execution: [{
      atlas_id: 'general-runtime-persistence',
      title: 'General durable runtime',
      summary: 'Material General outputs persist in Drive and reconcile into Atlas.',
      domain: 'ENGINEERING',
      status: 'ACTIVE',
      source_ref: 'drive://STAGING/GENERAL/EXECUTION/GENEXEC-001',
      fingerprint: 'genexec:001',
      updated_at: '2026-09-22T22:17:00Z',
    }],
    learning: [{
      id: 'GENLEARN-PROJECTION-PROVENANCE',
      title: 'Projection provenance integrity',
      rule: 'Validate payload plus source identity plus source revision.',
      status: 'PROMOTED',
      from_domain: 'NEXO',
      to_domain: 'ENGINEERING',
      from_label: 'NEXO execution',
      to_label: 'Projection reliability',
      source_ref: 'drive://STAGING/GENERAL/LEARNING/GENLEARN-001',
      fingerprint: 'genlearn:001',
      support: 2,
      contradiction: 0,
    }],
    cursors: [{ id: 'cursor:general-learning' }],
    handoffs: [{ id: 'handoff:science' }],
  };

  const { system } = buildPagesProjection({ projection, manifestFile: manifest, general });
  const aggregate = system.graph.nodes.find(node => node.id === 'general:general-runtime-persistence');
  assert.ok(aggregate);
  assert.equal(aggregate.domain, 'ENGINEERING');
  assert.equal(aggregate.source_ref, 'drive://STAGING/GENERAL/EXECUTION/GENEXEC-001');
  assert.equal(aggregate.fingerprint, 'genexec:001');

  const learned = system.filaments.find(item => item.id === 'GENLEARN-PROJECTION-PROVENANCE');
  assert.ok(learned);
  assert.equal(learned.kind, 'PROCEDURAL');
  assert.equal(learned.status, 'ESTABLISHED');
  assert.equal(learned.source_ref, 'drive://STAGING/GENERAL/LEARNING/GENLEARN-001');
  assert.ok(system.graph.edges.some(edge => edge.is_learning && edge.learning_ref === learned.id));

  assert.equal(system.graph.nodes.some(node => /cursor|handoff/i.test(node.id)), false);
});


test('Pages fingerprints and compiles the derived General projection', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  const builder = await text('scripts/build-pages-system.mjs');
  assert.match(workflow, /general-public-projection\.json/);
  assert.match(workflow, /NEXO_PUBLIC_GENERAL/);
  assert.match(builder, /NEXO_PUBLIC_GENERAL/);
  assert.match(builder, /generalLearningFilaments/);
  assert.match(builder, /applyGeneralExecutionToGraph/);
});


test('public system state projects capability registry with conservative evidence semantics', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: 'c'.repeat(40),
    event_cursor: '20260922T230000000000Z-capabilities',
    projection_fingerprint: 'sha256:' + 'd'.repeat(64),
    generated_at: '2026-09-22T23:00:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [],
    tests: [],
    capabilities: {
      'cap.proven': { backend: 'chatgpt_runtime', status: 'PROVEN' },
      'cap.validated': { backend: 'nexo_runtime', status: 'VALIDATED_CURRENT' },
      'cap.active': { backend: 'nexo_agent_api', status: 'ACTIVE' },
      'github.actions.alias': { status: 'ALIAS' },
      'cap.retired': { backend: 'chatgpt_runtime', status: 'RETIRED' },
    },
    counts: { active_work: 0, tests: 0, capabilities: 5, needs_dener: 0 },
  };

  const { system } = buildPagesProjection({ projection, manifestFile: manifest });

  assert.equal(system.capabilities.length, 5);
  assert.deepEqual(
    Object.fromEntries(system.capabilities.map(item => [item.capability_id, item.status])),
    {
      'cap.proven': 'PASS',
      'cap.validated': 'PASS',
      'cap.active': 'UNVERIFIED',
      'github.actions.alias': 'UNKNOWN',
      'cap.retired': 'RETIRED_RUNTIME',
    },
  );
  assert.equal(system.capabilities.find(item => item.capability_id === 'cap.active').operation, null);
  assert.equal(system.capabilities.find(item => item.capability_id === 'cap.active').risk, null);
  assert.equal(system.capabilities.find(item => item.capability_id === 'cap.active').domain, 'NEXO');
  assert.equal(system.capabilities.find(item => item.capability_id === 'github.actions.alias').runtime, 'GITHUB_ACTIONS');
  assert.match(system.capabilities.find(item => item.capability_id === 'cap.active').explanation, /no execution\/readback proof/i);
  assert.match(system.capabilities.find(item => item.capability_id === 'cap.proven').evidence_ref, /^tower:\/\//);
  assert.deepEqual(
    system.providers[0].capabilities.sort(),
    ['cap.active', 'cap.proven', 'cap.retired', 'cap.validated', 'github.actions.alias'].sort(),
  );
});
