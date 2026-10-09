// Every API call is intercepted. These synthetic receipts never reach a real control endpoint.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {proposalDigest} from '../src/atlas/autonomyControl.ts';
const at = '2026-10-08T12:00:00Z', fingerprint = 'a'.repeat(64);
const blocked = () => ({available: false, blockers: ['A publicação e as tarefas ainda precisam de prova.'], envelope: null, proposal_sha256: null});
const empty = () => ({contract: 'NEXO_AUTONOMY_CONTROL_VIEW_V1', observed_at: at, tower_fingerprint: fingerprint,
  mandate: null, actions: {approve: blocked(), revoke: blocked()}, receipt: null});
let current = empty(), getCalls = 0, posts = [], uncertain = false, authenticated = false, browser;
const server = await createServer({configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
  server: {host: '127.0.0.1', port: 0, watch: {ignored: ['**/server/private-ui/**', '**/dist/**']}}});
try {
  await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {});
  const context = await browser.newContext({viewport: {width: 1100, height: 850}}), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await context.route('**/api/atlas-locale*', route => route.fulfill({contentType: 'application/json', body: JSON.stringify({contract: 'ATLAS_LOCALE_V1', locale: 'pt-BR', source: 'default', supported: ['pt-BR', 'en']})}));
  await context.route('**/api/session', route => {
    const request = route.request();
    if (request.method() === 'POST') {
      assert.deepEqual(request.postDataJSON(), {password: 'synthetic-access-code'}); authenticated = true;
    } else if (request.method() === 'DELETE') authenticated = false;
    return route.fulfill({contentType: 'application/json', body: JSON.stringify({configured: true, authenticated,
      access: authenticated ? 'PRIVATE' : 'PUBLIC', mode: authenticated ? 'PRIVATE' : 'PUBLIC_READ_ONLY'})});
  });
  await context.route('**/api/autonomy-status', route => {getCalls++; return route.fulfill({contentType: 'application/json', body: JSON.stringify(current)});});
  await context.route('**/api/autonomy-control', route => {
    const body = route.request().postDataJSON(); posts.push(body);
    return route.fulfill(uncertain ? {status: 503, contentType: 'application/json', body: JSON.stringify({error: 'SPOOL_BODY_READBACK_FAILED'})}
      : {status: 202, contentType: 'application/json', body: JSON.stringify({stage: 'DELIVERED', readback: 'PASS', stable_id: 'human-synthetic', proposal_sha256: body.confirmation_sha256})});
  });
  await page.goto(base + '/autonomy');
  await page.getByLabel('Código de acesso', {exact: true}).waitFor();
  assert.equal(getCalls, 0); assert.equal(posts.length, 0);
  assert.equal(await page.getByRole('button', {name: 'Entrar', exact: true}).isDisabled(), true);
  await page.getByLabel('Código de acesso', {exact: true}).fill('synthetic-access-code');
  await page.getByRole('button', {name: 'Entrar', exact: true}).click();
  await page.getByText('A ampliação não tem mandato ativo verificado.', {exact: true}).waitFor();
  await page.getByText('Aprovar o mandato preparado', {exact: true}).click();
  assert.equal(await page.getByRole('button', {name: 'Aprovar mandato', exact: true}).count(), 0); assert.equal(posts.length, 0);
  await page.getByText('Revisar recibo de ativação', {exact: true}).click();
  const envelope = {kind: 'OPERATOR_INTENT', source: 'DENER', created_at: at, payload: {action: 'APPROVE_AUTONOMY_MANDATE',
    mandate_id: 'mandate-synthetic', expected_revision: 0, approval_ref: 'Synthetic task receipt', activation_receipt: {
      source_revision: 'b'.repeat(40), tower_fingerprint: fingerprint, checked_at: at,
      checks: {transport: true, writer: true, public_projection: true, prompts: true, quota: true}}}};
  const digest = await proposalDigest(envelope);
  await page.getByLabel('JSON do recibo preparado').fill(JSON.stringify({envelope, proposal_sha256: digest}));
  await page.getByRole('button', {name: 'Conferir recibo exato', exact: true}).click();
  await page.getByText('O recibo corresponde ao estado atual.', {exact: false}).waitFor();
  assert.equal(posts.length, 0);
  const approve = page.getByRole('button', {name: 'Aprovar mandato', exact: true}); assert.equal(await approve.isDisabled(), true);
  await page.getByLabel('Revisei esta proposta exata e autorizo este mandato.', {exact: true}).check();
  assert.equal(await approve.isEnabled(), true); const before = getCalls; await approve.click();
  await page.getByText('Enviado ao Writer. Aguardando confirmação na Tower.', {exact: true}).waitFor();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
  assert.equal(posts.length, 1); assert.deepEqual(posts[0], {envelope, confirmation_sha256: digest}); assert.equal(getCalls, before + 1);
  assert.equal(await page.getByRole('button', {name: 'Aprovar mandato', exact: true}).count(), 0);
  uncertain = true;
  await page.getByText('Revisar recibo de ativação', {exact: true}).click();
  await page.getByLabel('JSON do recibo preparado').fill(JSON.stringify({envelope, proposal_sha256: digest}));
  await page.getByRole('button', {name: 'Conferir recibo exato', exact: true}).click();
  await page.getByText('Aprovar o mandato preparado', {exact: true}).click();
  await page.getByLabel('Revisei esta proposta exata e autorizo este mandato.', {exact: true}).check();
  const uncertainBefore = getCalls; await page.getByRole('button', {name: 'Aprovar mandato', exact: true}).click();
  await page.getByText('O envio ficou incerto.', {exact: false}).waitFor();
  await page.getByLabel('JSON do recibo preparado').waitFor({state: 'attached'});
  assert.equal(posts.length, 2); assert.equal(getCalls, uncertainBefore + 1);
  await page.setViewportSize({width: 390, height: 844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.reload(); await page.getByText('A ampliação não tem mandato ativo verificado.', {exact: true}).waitFor();
  assert.equal(await page.getByLabel('JSON do recibo preparado').inputValue(), '');
  assert.equal(await page.getByRole('button', {name: 'Aprovar mandato', exact: true}).count(), 0);
  const revoke = {kind: 'OPERATOR_INTENT', source: 'DENER', created_at: at, payload: {action: 'REVOKE_AUTONOMY_MANDATE',
    mandate_id: 'mandate-synthetic', expected_revision: 1, approval_ref: 'Synthetic revoke'}};
  current = {...empty(), mandate: {id: 'mandate-synthetic', revision: 1, status: 'ACTIVE'}};
  current.actions.revoke = {available: true, blockers: [], envelope: revoke, proposal_sha256: await proposalDigest(revoke)};
  uncertain = false;
  await page.reload(); await page.getByText('A Tower registra um mandato ativo.', {exact: true}).waitFor();
  await page.getByText('Revogar o mandato atual', {exact: true}).click();
  assert.equal(await page.getByRole('button', {name: 'Revogar mandato', exact: true}).isDisabled(), true);
  await page.getByLabel('Revisei esta proposta exata e revogo este mandato.', {exact: true}).check();
  const revokeBefore = getCalls; await page.getByRole('button', {name: 'Revogar mandato', exact: true}).click();
  await page.getByText('Enviado ao Writer. Aguardando confirmação na Tower.', {exact: true}).waitFor();
  await page.getByText('A Tower registra um mandato ativo.', {exact: true}).waitFor();
  assert.equal(posts.length, 3); assert.equal(getCalls, revokeBefore + 1); assert.deepEqual(posts[2], {envelope: revoke, confirmation_sha256: await proposalDigest(revoke)});
  await page.getByRole('button', {name: 'Sair', exact: true}).click();
  await page.getByLabel('Código de acesso', {exact: true}).waitFor();
  assert.equal(await page.getByText('Revisar recibo de ativação', {exact: true}).count(), 0);
  assert.equal(await page.getByLabel('Código de acesso', {exact: true}).inputValue(), '');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({status: 'PASS', entry: '/autonomy', nativeSession: true, syntheticOnly: true, explicitConfirmation: true, singleReadback: true, uncertainPostRetries: 0, desktop: '1100x850', mobile: '390x844'}));
} finally {await browser?.close(); await server.close();}
