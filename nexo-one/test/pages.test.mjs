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
  assert.match(workflow, /verify_projection/);
  assert.match(workflow, /authority.*TOWER_V06/);
  assert.match(workflow, /projection_only/);
  assert.match(workflow, /writeback/);
  assert.match(workflow, /tower_commit/);
  assert.match(workflow, /event_cursor/);
  assert.match(workflow, /projection_fingerprint/);
  assert.doesNotMatch(workflow, /cp atlas-control-tower\/data\/nexo-drive-projection\.json/);
  assert.doesNotMatch(workflow, /truthgraph\.snapshot\.json/);

  assert.match(builder, /NEXO_PUBLIC_PROJECTION_V1/);
  assert.match(builder, /validateSanctionedProjection/);
  assert.match(builder, /Pantheon performs presentation shaping only/);
  assert.doesNotMatch(builder, /readProvider/);
  assert.doesNotMatch(builder, /public-system-input/);
  assert.doesNotMatch(builder, /nexo-drive-projection/);
  assert.doesNotMatch(builder, /truthgraph\.snapshot/);
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
  const { system } = buildPagesProjection({ projection, manifestFile: manifest });
  assert.equal(system.inbox.length, 1);
  assert.equal(system.inbox[0].id, 'needs-dener:WORK-HUMAN-1');
  assert.equal(system.inbox[0].kind, 'FORNECER_DADO');
  assert.equal(system.inbox[0].domain, 'ENGINEERING');
  assert.match(system.inbox[0].why, /Needs Dener/);
  const workNode = system.graph.nodes.find(node => node.id === 'work:WORK-HUMAN-1');
  assert.ok(workNode);
  assert.equal(workNode.operational_status, 'WAIT_DEPENDENCY');
  assert.equal(workNode.priority, 'P0');
  assert.equal(workNode.dependency_class, 'HUMAN_AUTH_REQUIRED');
  assert.equal(workNode.human_gate, true);
  assert.equal(system.actions.length, 0, 'WORK projection must not impersonate an executable ActionRecord');
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
  assert.match(workflow, /data-atlas-g6-source="local"/);
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
  assert.match(workflow, /PAGES_NO_OP projection and Pantheon commit already published/);
  assert.match(workflow, /build-meta\.json/);
  assert.match(workflow, /NEXO_ONE_BUILD_META_V1/);
  assert.match(workflow, /xargs -r -P 8/);
  assert.match(workflow, /if: needs\.build\.outputs\.deploy_needed == 'true'/);
  assert.match(workflow, /PAGES_BUILD_META_READBACK_OK/);
});
