// Browser-only synthetic fixtures. No canonical research content is bundled or submitted.
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {startBackend} from './helpers/private-backend.mjs';
import {createPublicCampaignSnapshot} from '../server/atlas/public-campaign-projection.mjs';
const root = mkdtempSync(join(tmpdir(), 'nexo-campaign-browser-')), publicDir = join(root, 'dist'), privateDir = join(root, 'private');
const bi = text => ({'pt-BR': text, en: `EN ${text}`}), at = '2026-10-08T12:00:00.000Z';
const campaign = (i, state = 'ongoing') => ({id: `study-${i}`, questionId: `question-${i}`, question: bi(i === 12 ? 'A expansão depende do recorte?' : `A estrutura depende do modelo ${i}?`), why: bi('Verificar as hipóteses adotadas.'), method: null, currentStage: bi('O teste terminou e aguarda revisão.'), nextStep: bi('Conferir os limites do teste.'), limitations: [bi('A precisão depende dos dados.')], updatedAt: at, state, closure: state === 'completed' ? {closedAt: at, outcome: 'INCONCLUSIVE', summary: bi('A campanha encerrou sem resolver a pergunta.')} : null, references: [], tests: [{id: `test-${i}`, question: bi('O ajuste é estável?'), method: bi('Comparação com entradas públicas.'), stage: 'AWAITING_REVIEW', updatedAt: at, result: null, references: []}]});
const snapshot = createPublicCampaignSnapshot([...Array.from({length: 13}, (_, i) => campaign(i)), campaign(13, 'completed')], {sourceRevision: `sha256:${'a'.repeat(64)}`, generatedAt: at});
const payload = {...snapshot, contract: 'ATLAS_PUBLIC_V1', campaignsContract: snapshot.contract, items: [], links: []};
const shots = process.env.CAMPAIGN_SHOTS;
let browser, backend;
const errors = [];
try {
  mkdirSync(privateDir); writeFileSync(join(privateDir, 'manifest.json'), JSON.stringify({files: {}}));
  const project = fileURLToPath(new URL('../', import.meta.url));
  const build = spawnSync(process.execPath, [join(project, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', publicDir, '--emptyOutDir'], {cwd: project, encoding: 'utf8'});
  assert.equal(build.status, 0, build.stderr);
  backend = await startBackend({privateDir, publicDir, runtime: {}});
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'pt-BR'}), page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await context.route('**/api/atlas-public', route => route.fulfill({contentType: 'application/json', body: JSON.stringify(payload)}));
  await page.goto(backend.base); await page.locator('.atlas-public-campaign').first().waitFor();
  assert.equal(await page.locator('.atlas-public-campaign').count(), 6);
  await page.getByRole('button', {name: 'Próxima', exact: true}).click(); assert.equal(await page.locator('.atlas-public-campaign').count(), 6);
  await page.getByRole('button', {name: 'Próxima', exact: true}).click(); assert.equal(await page.locator('.atlas-public-campaign').count(), 1);
  await page.getByLabel('Buscar pergunta').fill('expansão'); assert.equal(await page.locator('.atlas-public-campaign').count(), 1);
  await page.getByLabel('Buscar pergunta').fill(''); await page.getByRole('button', {name: 'Concluídas (1)', exact: true}).click();
  assert.equal(await page.locator('.atlas-public-campaign').count(), 1); assert.match(await page.locator('.atlas-public-campaign').innerText(), /Resultado inconclusivo/);
  await page.getByRole('button', {name: 'Em andamento (13)', exact: true}).click();
  await page.locator('.atlas-campaign-tests summary').first().click(); assert.match(await page.locator('.atlas-campaign-test').first().innerText(), /Aguardando revisão/); assert.equal(await page.locator('.atlas-campaign-test .atlas-campaign-result').count(), 0);
  await page.getByRole('button', {name: 'EN', exact: true}).click(); assert.match(await page.locator('.atlas-campaigns').innerText(), /In progress|Find a question/); assert.doesNotMatch(await page.locator('.atlas-campaigns').innerText(), /Próximo passo|Concluídas/);
  await page.goto(`${backend.base}/?campanha=study-13#/`); await page.locator('.atlas-public-campaign').waitFor(); assert.equal(await page.locator('.atlas-public-campaign').count(), 1);
  assert.equal(await page.locator('.atlas-public-campaign').getAttribute('id'), 'campaign-study-13');
  await page.getByRole('button', {name: 'PT-BR', exact: true}).click();
  await page.goto(backend.base); await page.locator('.atlas-public-campaign').first().waitFor();
  const previewLabel = async target => target.evaluate(() => {
    const label = document.createElement('p'); label.textContent = 'PRÉVIA COM DADOS SINTÉTICOS · Nenhuma campanha real foi publicada';
    label.style.cssText = 'margin:0;padding:12px 24px;background:#1e5bff;color:white;font:500 14px/1.4 sans-serif;';
    document.body.prepend(label);
  });
  if (shots) {mkdirSync(shots, {recursive: true}); await previewLabel(page); await page.screenshot({path: join(shots, 'campaign-desktop.png'), fullPage: true});}
  const phone = await context.newPage(); await phone.setViewportSize({width: 390, height: 844});
  await phone.goto(backend.base); await phone.locator('.atlas-public-campaign').first().waitFor();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await phone.locator('.atlas-campaign-controls button,.atlas-campaign-controls input').evaluateAll(elements => elements.filter(e => e.getBoundingClientRect().height < 44).length), 0);
  if (shots) {await previewLabel(phone); await phone.screenshot({path: join(shots, 'campaign-mobile.png'), fullPage: true});}
  assert.deepEqual(errors, []); assert.equal(backend.st.log.some(line => /atlas-private/.test(line)), false);
  console.log(JSON.stringify({status: 'PASS', desktop: '1440x1000', mobile: '390x844', campaigns: 14, syntheticOnly: true}));
} finally {await backend?.close(); await browser?.close(); rmSync(root, {recursive: true, force: true});}
