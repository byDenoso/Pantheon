import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PUBLIC_CAMPAIGN_POLICY, projectApprovedPublicCampaigns, validatePublicCampaignSnapshot} from '../server/atlas/public-campaign-projection.mjs';
import {publicTestSourceDigest} from '../server/atlas/public-test-projection.mjs';
import {publishPublicCampaigns} from '../scripts/publish-public-campaigns.mjs';
import {publicCampaignAtlas} from '../server/atlas/public-campaign-route.mjs';
import {assertStaticPublication} from '../scripts/static-publication.mjs';
import {campaignPage, campaignHref, guardPublicCampaign} from '../src/atlas/publicCampaigns.ts';
import {loadPublic} from '../src/atlas/publicItems.ts';
import {buildWriterPublicCampaignSnapshot, prepareWriterPublicCampaignSnapshot} from '../scripts/build-public-campaigns.mjs';
const bi = t => ({'pt-BR': t, en: `EN ${t}`}), at = '2026-10-08T12:00:00.000Z';
const meta = {sourceRevision: `sha256:${'a'.repeat(64)}`, generatedAt: at};
const campaign = (id = 'canonical-campaign') => ({id, question_id: `question-${id}`, visibility: 'PUBLIC', status: 'DONE', _source_path: 'private/path', privateSentinel: 'PRIVATE_SOURCE_SENTINEL'});
const sourceTest = () => ({id: 'canonical-test', visibility: 'PUBLIC', campaign_id: 'canonical-campaign', status: 'DONE', secret: 'PRIVATE_SOURCE_SENTINEL'});
const approve = (source, kind = 'CAMPAIGN') => ({kind, sourceId: source.id, sourceDigest: publicTestSourceDigest(source), publicId: `public-${source.id}`, questionId: source.question_id, campaignSourceId: source.campaign_id, publication: {policy: PUBLIC_CAMPAIGN_POLICY, status: 'APPROVED', receiptId: 'receipt-1'}, presentation: {question: bi('Does the public model fit?'), why: bi('Test the assumptions.'), method: bi('Compare frozen public inputs.'), currentStage: bi('Awaiting independent review.'), nextStep: bi('Review the result.'), limitations: null, updatedAt: at, stage: 'AWAITING_REVIEW', result: {verdict: 'INCONCLUSIVE', summary: bi('The data do not resolve this question.'), limitations: [bi('Precision remains limited.')]}}});
const project = (c = campaign(), t = sourceTest(), a = [approve(c), approve(t, 'TEST')]) => projectApprovedPublicCampaigns({campaigns: [c], tests: [t]}, a, meta);

test('questions bind explicitly; DONE cannot close campaign or publish unreviewed result', () => {
  const snapshot = project(), c = snapshot.campaigns[0];
  assert.equal(c.state, 'ongoing'); assert.equal(c.closure, null); assert.equal(c.tests[0].result, null);
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE_SOURCE_SENTINEL|private\/path|"sourceId":"canonical-test"|sourceDigest|receipt-1/);
  assert.deepEqual(validatePublicCampaignSnapshot(snapshot), snapshot);
  const source = campaign();
  for (const change of [{questionId: 'different-question'}, {sourceDigest: `sha256:${'b'.repeat(64)}`}, {publication: {status: 'APPROVED'}}, {publicId: 'C:\\private'}]) assert.equal(project(source, sourceTest(), [{...approve(source), ...change}]).campaigns.length, 0);
  const testRow = {...sourceTest(), campaign_id: 'another-campaign'};
  assert.equal(project(source, testRow, [approve(source), {...approve(testRow, 'TEST'), campaignSourceId: source.id}]).campaigns[0].tests.length, 0);
});

test('public progress comes from canonical execution facts rather than an approved prose stage', () => {
  const c = campaign();
  const stage = change => {const row = {...sourceTest(), ...change}, approval = approve(row, 'TEST'); approval.presentation.stage = 'RUNNING'; return project(c, row, [approve(c), approval]).campaigns[0].tests[0].stage;};
  assert.equal(stage({status: 'READY'}), 'PLANNED');
  assert.equal(stage({status: 'RUNNING'}), 'UNKNOWN');
  assert.equal(stage({status: 'RUNNING', execution_observation: 'GITHUB_JOB_STEP', started_at: at, run_ref: 'actions/runs/123'}), 'RUNNING');
  assert.equal(stage({status: 'DONE', executed_at: at, execution_phase: 'RUNNING'}), 'AWAITING_REVIEW');
});

test('different questions remain separate even when their public question text is identical', () => {
  const a = campaign('one'), b = campaign('two');
  const snapshot = projectApprovedPublicCampaigns({campaigns: [a, b], tests: []}, [approve(a), approve(b)], meta);
  assert.equal(snapshot.campaigns.length, 2);
  assert.notEqual(snapshot.campaigns[0].questionId, snapshot.campaigns[1].questionId);
  assert.equal(snapshot.campaigns[0].question.en, snapshot.campaigns[1].question.en);
});

test('independent confirmation cannot turn an inconclusive canonical result into positive evidence', () => {
  const c = campaign(), attack = {id: 'attack', contests_test_id: 'canonical-test'};
  for (const verdict of ['INCONCLUSIVE', 'INCONCLUSIVO']) {
    const row = {...sourceTest(), verdict, review_state: 'CONFIRMED', contests: [{contest_test_id: 'attack'}],
      reviews: [{referee: 'critic', outcome: 'INCONCLUSIVE', contest_test_id: 'attack', at}]};
    const approval = approve(row, 'TEST');
    approval.independence = {policy: 'NEXO_SCIENTIFIC_INDEPENDENCE_V1', eligible: true,
      parentDigest: publicTestSourceDigest(row), attackId: 'attack', attackDigest: publicTestSourceDigest(attack), reviewedAt: at};
    const render = () => projectApprovedPublicCampaigns({campaigns: [c], tests: [row, attack]}, [approve(c), approval], meta).campaigns[0].tests[0];
    approval.presentation.result.verdict = 'SUPPORTS';
    assert.equal(render().stage, 'REVIEWED'); assert.equal(render().result, null);
    approval.presentation.result.verdict = 'INCONCLUSIVE';
    assert.equal(render().result.verdict, 'INCONCLUSIVE');
  }
});

test('explicit closure retains inconclusive and negative studies; independent review is required', () => {
  const c = {...campaign(), closure: {status: 'CLOSED', receipt_id: 'closure-1', closed_at: at, outcome: 'INCONCLUSIVE'}};
  const attack = {id: 'attack', contests_test_id: 'canonical-test'};
  const t = {...sourceTest(), review_state: 'CONFIRMED', contests: [{contest_test_id: 'attack'}], reviews: [{referee: 'critic', outcome: 'INCONCLUSIVE', contest_test_id: 'attack', at}]};
  const ca = approve(c), ta = approve(t, 'TEST'); ca.presentation.closure = {receiptId: 'closure-1', closedAt: at, outcome: 'INCONCLUSIVE', summary: bi('Campaign closed with an unresolved question.')};
  ta.independence = {policy: 'NEXO_SCIENTIFIC_INDEPENDENCE_V1', eligible: true, parentDigest: publicTestSourceDigest(t), attackId: 'attack', attackDigest: publicTestSourceDigest(attack), reviewedAt: at};
  const snapshot = projectApprovedPublicCampaigns({campaigns: [c], tests: [t, attack]}, [ca, ta], meta);
  assert.equal(snapshot.campaigns[0].state, 'completed'); assert.equal(snapshot.campaigns[0].tests[0].result.verdict, 'INCONCLUSIVE');
  const dependent = {...ta, independence: {...ta.independence, eligible: false}};
  const pendingReview = projectApprovedPublicCampaigns({campaigns: [c], tests: [t, attack]}, [ca, dependent], meta).campaigns[0];
  assert.equal(pendingReview.tests[0].result, null);
  assert.equal(pendingReview.state, 'completed');
  assert.equal(pendingReview.closure.outcome, null);
  const brokenClosure = {...ca, presentation: {...ca.presentation, closure: {...ca.presentation.closure, receiptId: 'wrong'}}};
  assert.equal(project(c, t, [brokenClosure, ta]).campaigns[0].state, 'ongoing');
});

const tcc = process.env.TCC_RUNTIME_REPO || fileURLToPath(new URL('../../../TCC/', import.meta.url));
test('actual TCC mechanical review and closure requests project without fabricated reviews or scientific outcomes', {skip: !existsSync(join(tcc, 'runtime/nexo_agent_api/evolution.py'))}, () => {
  const code = `import json, tempfile, runpy\nfrom pathlib import Path\nfrom runtime.nexo_agent_api import evolution as e, scientific_integrity as s\nf = runpy.run_path('tests/test_scientific_integrity.py')\nfixture, save = f['fixture'], f['save']\nwith tempfile.TemporaryDirectory() as directory:\n root = Path(directory)\n parent = fixture('canonical-test')\n parent.update(status='DONE', state='DONE', verdict='PROMOTED', executed_at='2026-09-30T10:00:00Z', review_state='CONTESTED', visibility='PUBLIC', campaign_id='canonical-campaign')\n attack = fixture('attack')\n attack.update(status='DONE', state='DONE', verdict='PROMOTED', executed_at='2026-09-30T10:01:00Z', contests_test_id=parent['id'], dataset_and_selection='Independent generated sample B')\n attack['prereg_hash'] = e.prereg_hash(attack['id'], attack)\n attack['independence'] = {'axis':'data', 'evidence_refs':['entities/evidence/input-b.json'], 'frozen_at':'2026-09-30T10:00:00Z', 'on_pass':'CONFIRMED', 'on_fail':'REFUTED'}\n attack['independence_fingerprint'] = s.digest(attack['independence'])\n save(root, 'entities/evidence/input-b.json', {'id':'input-b', 'source':'synthetic_fixture'})\n save(root, 'entities/test/canonical-test.json', parent)\n save(root, 'entities/test/attack.json', attack)\n validation = s.independence(parent, attack, root)\n requests = e.contest_chain_reconcile_requests(root)\n parent.update(next(r['changes'] for r in requests if r.get('entity_name') == parent['id']))\n campaign = {'id':'canonical-campaign', 'question_id':'question-canonical-campaign', 'visibility':'PUBLIC', 'charter':{'status':'ACTIVE'}}\n save(root, 'roadmaps/canonical-campaign.json', campaign)\n closure = e.close_requests({'created_at':'2026-09-30T10:01:00Z'}, {'roadmap_id':'canonical-campaign', 'reason':'SUCCESS'}, root)\n campaign.update(closure[0]['merge'])\n print(json.dumps({'parent':parent, 'attack':attack, 'campaign':campaign, 'validation':validation}))`;
  const result = spawnSync(process.env.PYTHON_EXECUTABLE || 'python', ['-c', code], {cwd: resolve(tcc), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const fixture = JSON.parse(result.stdout), c = fixture.campaign, t = fixture.parent, attack = fixture.attack;
  assert.equal(fixture.validation.eligible, true); assert.equal(t.mechanical_contest_verdict.rule, 'FROZEN_INDEPENDENT_ATTACK_V2'); assert.equal(t.reviews, undefined);
  const ca = approve(c), ta = approve(t, 'TEST');
  ca.presentation.closure = {receiptId: c.closure.receipt_id, closedAt: c.closure.closed_at, reason: c.closure.reason, outcome: c.closure.outcome, summary: bi('Work ended after its stopping criterion.')};
  ta.presentation.result.verdict = 'SUPPORTS';
  ta.independence = {policy: 'NEXO_SCIENTIFIC_INDEPENDENCE_V1', eligible: true, parentDigest: publicTestSourceDigest(t), attackId: attack.id, attackDigest: publicTestSourceDigest(attack), reviewedAt: t.mechanical_contest_verdict.at};
  const snapshot = projectApprovedPublicCampaigns({campaigns: [c], tests: [t, attack]}, [ca, ta], meta);
  assert.equal(snapshot.campaigns[0].state, 'completed'); assert.equal(snapshot.campaigns[0].closure.reason, 'SUCCESS'); assert.equal(snapshot.campaigns[0].closure.outcome, null); assert.equal(snapshot.campaigns[0].tests[0].result.verdict, 'SUPPORTS');
  const invalid = {...t, review_validation: {...t.review_validation, eligible: false}};
  const invalidApproval = approve(invalid, 'TEST'); invalidApproval.independence = {...ta.independence, parentDigest: publicTestSourceDigest(invalid)};
  assert.equal(projectApprovedPublicCampaigns({campaigns: [c], tests: [invalid, attack]}, [ca, invalidApproval], meta).campaigns[0].tests[0].result, null);
});

test('private sources and unsafe approved text never enter the public snapshot', () => {
  for (const change of [{private: true}, {visibility: undefined}, {domain: 'OLYMPUS'}, {access: 'PRIVATE'}]) {
    const c = {...campaign(), ...change}; assert.equal(project(c, sourceTest(), [approve(c)]).campaigns.length, 0);
  }
  const c = campaign(), a = approve(c);
  for (const value of ['C:\\Users\\private\\data', 'Bearer PRIVATE_TOKEN', 'peer-detection', 'drive://PRIVATE', 'password=PRIVATE']) assert.equal(project(c, sourceTest(), [{...a, presentation: {...a.presentation, question: bi(value)}}]).campaigns.length, 0);
  const snapshot = project(c, sourceTest(), [{...a, presentation: {...a.presentation, references: [{public: true, label: bi('Private drive'), url: 'https://drive.google.com/file/d/private/view'}, {public: true, label: bi('Paper'), url: 'https://arxiv.org/abs/0000.00000'}]}}]);
  assert.deepEqual(snapshot.campaigns[0].references.map(r => r.url), ['https://arxiv.org/abs/0000.00000']);
});

test('internal Unix paths and authenticated cloud links cannot enter approved public prose or references', () => {
  const c = campaign(), a = approve(c);
  for (const value of ['/tmp/nexo/private.json', 'Input /home/owner/input.dat', '/Users/owner/private',
    'source=/var/private/data', 'Input (/workspace/private.csv)', '/opt/nexo/config.json',
    'access_token=SYNTHETIC', 'Authorization: Bearer SYNTHETIC']) {
    assert.equal(project(c, sourceTest(), [{...a, presentation: {...a.presentation, question: bi(value)}}]).campaigns.length, 0);
  }
  assert.equal(project(c, sourceTest(), [{...a, presentation: {...a.presentation, question: bi('P(k) / k and σ / H0; /optical is a public label.')}}]).campaigns.length, 1);
  const blocked = [
    'https://storage.googleapis.com/synthetic/test.json?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=SYNTHETIC&X-Goog-Signature=abcd',
    'https://synthetic.blob.core.windows.net/data/test.json?sv=2025-01-05&sr=b&sp=r&se=2099-01-01&sig=SYNTHETIC',
    'https://example.s3.amazonaws.com/test.json?X-Amz-Credential=SYNTHETIC&X-Amz-Signature=abcd',
    ...['token', 'access_token', 'access-token', 'refresh_token', 'id_token', 'auth_token', 'authorization',
      'auth', 'oauth_token', 'session_token', 'api_key', 'client_secret', 'SAS_token', 'key'].map(key => `https://example.org/public?${key}=SYNTHETIC`),
    'https://example.org/public#access_token=SYNTHETIC',
  ];
  const references = [...blocked, 'https://arxiv.org/html/0000.00000#S1', 'https://example.org/paper?lang=en'];
  const snapshot = project(c, sourceTest(), [{...a, presentation: {...a.presentation,
    references: references.map(url => ({public: true, label: bi('Synthetic reference'), url}))}}]);
  assert.deepEqual(snapshot.campaigns[0].references.map(r => r.url), references.slice(-2));
});

test('snapshot tampering, unknown keys, missing closure, and duplicate questions fail closed', () => {
  const snapshot = project();
  for (const bad of [{...snapshot, private: 'injected'}, {...snapshot, campaigns: [{...snapshot.campaigns[0], state: 'completed'}]}, {...snapshot, campaigns: [...snapshot.campaigns, {...snapshot.campaigns[0], id: 'other'}]}]) assert.throws(() => validatePublicCampaignSnapshot(bad), /PUBLIC_CAMPAIGN/);
  assert.equal(guardPublicCampaign({...snapshot.campaigns[0], state: 'completed'}), null);
});

test('atomic publisher verifies readback, preserves last valid snapshot on failure, and API is snapshot-only', async t => {
  const root = await mkdtemp(join(tmpdir(), 'nexo-campaigns-')); t.after(() => rm(root, {recursive: true, force: true}));
  const input = join(root, 'approved.json'), dist = join(root, 'dist'), snapshot = project();
  await writeFile(input, JSON.stringify(snapshot));
  const receipt = await publishPublicCampaigns(input, dist);
  assert.equal(receipt.snapshotDigest, snapshot.snapshotDigest); await assertStaticPublication(dist);
  assert.equal((await publicCampaignAtlas({NEXO_PUBLIC_CAMPAIGNS_FILE: join(dist, 'public-campaigns.json')})).body.campaigns.length, 1);
  const before = await readFile(join(dist, 'public-campaigns.json'), 'utf8');
  await writeFile(input, JSON.stringify({...snapshot, private: true}));
  await assert.rejects(publishPublicCampaigns(input, dist), /DRIFT/);
  assert.equal(await readFile(join(dist, 'public-campaigns.json'), 'utf8'), before);
  assert.equal((await publicCampaignAtlas({NEXO_PUBLIC_CAMPAIGNS_FILE: join(root, 'missing')})).status, 503);
});

test('search, pagination and shared links use explicit public campaign identity', () => {
  const c = project().campaigns[0], list = Array.from({length: 13}, (_, i) => ({...c, id: `c${i}`, questionId: `q${i}`, question: bi(i === 12 ? 'Expansion?' : 'Structure?')}));
  assert.equal(campaignPage(list, {state: 'ongoing'}).items.length, 6);
  assert.equal(campaignPage(list, {state: 'ongoing', page: 2}).items.length, 1);
  assert.equal(campaignPage(list, {state: 'ongoing', search: 'expansion', locale: 'en'}).total, 1);
  assert.equal(campaignPage(list, {state: 'completed'}).total, 0);
  assert.equal(campaignHref('question:one'), '?campanha=question%3Aone#/');
});

test('static fallback occurs only when API is not deployed; missing projections remain unavailable', async () => {
  const snapshot = project(), response = s => new Response(JSON.stringify(s), {headers: {'content-type': 'application/json'}});
  const calls = [];
  const fetcher = async url => { calls.push(url); return url === '/api/atlas-public' ? new Response('Not deployed', {status: 404}) : response(snapshot); };
  const loaded = await loadPublic(fetcher, undefined, '/public-campaigns.json');
  assert.equal(loaded.status, 'ready'); assert.equal(loaded.campaigns.length, 1); assert.deepEqual(calls, ['/api/atlas-public', '/public-campaigns.json']);
  const failed = await loadPublic(async () => new Response('Unavailable', {status: 503}), undefined, '/public-campaigns.json'); assert.equal(failed.status, 'unavailable');
});

test('Writer byte commitments tolerate numeric spelling but reject changed or stale approval sources', () => {
  const c = {...campaign(), weight: 1}, sourceJson = JSON.stringify(c).replace('"weight":1', '"weight":1.0');
  const sha = createHash('sha256').update(sourceJson).digest('hex');
  const a = approve(c); delete a.sourceDigest; a.writerSourceSha256 = sha;
  const pkg = {records: {campaigns: [c], tests: []}, approvals: [a], source_commitments: {[c.id]: {json: sourceJson, sha256: sha}}, meta};
  assert.equal(buildWriterPublicCampaignSnapshot(pkg).campaigns.length, 1);
  assert.throws(() => buildWriterPublicCampaignSnapshot({...pkg, approvals: [{...a, writerSourceSha256: 'b'.repeat(64)}]}), /STALE/);
  assert.throws(() => buildWriterPublicCampaignSnapshot({...pkg, records: {campaigns: [{...c, weight: 2}], tests: []}}), /COMMITMENT/);
});

test('missing canonical approvals preserve the previous verified public snapshot rather than publish empty state', async t => {
  const root = await mkdtemp(join(tmpdir(), 'nexo-campaign-pending-')); t.after(() => rm(root, {recursive: true, force: true}));
  const output = join(root, 'public-campaigns.json'), previous = JSON.stringify(project());
  await writeFile(output, previous);
  const receipt = await prepareWriterPublicCampaignSnapshot({records: {campaigns: [campaign()], tests: []}, approvals: [], source_commitments: {}, meta}, output);
  assert.equal(receipt.status, 'PUBLIC_CAMPAIGNS_PENDING'); assert.equal(await readFile(output, 'utf8'), previous);
  const snapshot = projectApprovedPublicCampaigns({campaigns: [campaign()], tests: []}, [], meta);
  assert.equal(snapshot.coverage, 'UNAVAILABLE');
});

