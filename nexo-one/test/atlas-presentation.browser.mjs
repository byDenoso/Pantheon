// Production public UI smoke. No private data is used; optional test content is a synthetic route fixture only.
// Run when a supported Chromium environment is available: npm run test:presentation-browser
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {startBackend} from './helpers/private-backend.mjs';
const temp = mkdtempSync(join(tmpdir(), 'atlas-presentation-')), publicDir = join(temp, 'dist'), privateDir = join(temp, 'private');
const shots = process.env.PRESENTATION_SHOTS;
if (shots) mkdirSync(shots, {recursive: true});
mkdirSync(privateDir); writeFileSync(join(privateDir, 'manifest.json'), JSON.stringify({files: {}}));
const results = {}, errors = [], foreign = [];
let browser, backend;
try {
  const build = spawnSync('npx', ['vite', 'build', '--outDir', publicDir, '--emptyOutDir'], {cwd: new URL('../', import.meta.url).pathname, encoding: 'utf8'});
  assert.equal(build.status, 0, build.stderr);
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {});
  backend = await startBackend({privateDir, publicDir, runtime: {}});
  const walk = dir => readdirSync(dir).flatMap(file => statSync(join(dir, file)).isDirectory() ? walk(join(dir, file)) : [join(dir, file)]);
  const bundle = walk(publicDir).filter(file => /\.(js|css|html|json)$/.test(file)).map(file => readFileSync(file, 'utf8')).join('\n');
  for (const marker of ['tc-stage', 'createTowerLcdm', 'NEXO_ATLAS_PRIVATE_RUNTIME', 'syn-t0', 'science_projection_v1', 'UFRJ', 'CEDERJ']) assert.ok(!bundle.includes(marker), marker);
  assert.ok(bundle.includes('phys@denerpereira.com.br'));
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'pt-BR'}), page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (!request.url().startsWith(backend.base) && !request.url().startsWith('data:')) foreign.push(request.url()); });
  const choose = name => page.getByRole('button', {name, exact: true}).click();
  await page.goto(backend.base); await page.locator('[data-status=empty]').waitFor(); await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('h1').innerText(), 'Cosmologia\ncomputacional.');
  assert.deepEqual(await page.locator('.atlas-section h2').allInnerTexts(), ['Linhas de pesquisa', 'Como a pesquisa é feita', 'Trabalhos', 'Contato']);
  assert.equal(await page.locator('.atlas-research-lines li').count(), 3); assert.equal(await page.locator('.atlas-steps li').count(), 4);
  assert.equal(await page.locator('.atlas-item, .atlas-public-test').count(), 0);
  assert.match(await page.locator('.atlas-empty').innerText(), /Não há trabalhos públicos disponíveis/);
  assert.equal(await page.locator('.atlas-web-art').evaluate(img => img.complete && img.naturalWidth > 1000), true);
  assert.equal(await page.locator('form, input, textarea').count(), 0);
  await choose('Métodos'); assert.equal(await page.evaluate(() => document.activeElement?.id), 's-methods'); assert.equal(await page.evaluate(() => location.hash), '');
  await page.evaluate(() => scrollTo(0, 0));
  for (const [button, name, background] of [['Escuro', 'dark', 'rgb(0, 0, 0)'], ['Claro', 'light', 'rgb(255, 255, 255)']]) {
    await choose(button); assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), background);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (shots) await page.screenshot({path: join(shots, `public-pt-${name}.png`), fullPage: true});
  }
  await choose('EN'); assert.equal(await page.locator('h1').innerText(), 'Computational\ncosmology.');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.deepEqual(await page.locator('.atlas-section h2').allInnerTexts(), ['Research areas', 'Research methods', 'Work', 'Contact']);
  assert.doesNotMatch(await page.locator('main').innerText(), /Linhas de pesquisa|Métodos|Trabalhos|Contato|não |ção\b/);
  if (shots) await page.screenshot({path: join(shots, 'public-en-light.png'), fullPage: true});
  await choose('PT-BR'); await choose('Automático'); await page.waitForFunction(() => document.documentElement.lang === 'pt-BR');

  // A reviewed synthetic response tests rendering only; this data is not included in production.
  const bi = text => ({'pt-BR': text, en: `EN ${text}`});
  await page.route('**/api/atlas-public', route => route.fulfill({contentType: 'application/json', body: JSON.stringify({contract: 'ATLAS_PUBLIC_V1', items: [], links: [], tests: [{id: 'synthetic-public-test', question: bi('Synthetic question?'), answers: bi('Synthetic scope'), method: bi('Synthetic method'), result: bi('Inconclusive; uncertainty remains.'), private: 'PRIVATE_SENTINEL', status: 'DONE'}]})}));
  await page.reload(); await page.locator('.atlas-public-test').waitFor();
  assert.deepEqual(await page.locator('.atlas-public-test dt').allInnerTexts(), ['Pergunta', 'O que o teste responde', 'Método', 'Resultado']);
  assert.equal(await page.locator('.atlas-public-test dd').count(), 4);
  assert.doesNotMatch(await page.locator('main').innerText(), /PRIVATE_SENTINEL|DONE|synthetic-public-test/);
  await page.unroute('**/api/atlas-public');
  await context.close();

  const mobile = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, locale: 'pt-BR', reducedMotion: 'reduce'}), phone = await mobile.newPage();
  await phone.goto(backend.base); await phone.locator('[data-status=empty]').waitFor();
  const menu = phone.getByRole('button', {name: 'Menu', exact: true});
  await menu.tap(); assert.equal(await phone.locator('.atlas-menu-toggle').getAttribute('aria-expanded'), 'true');
  await phone.keyboard.press('Escape'); assert.equal(await phone.locator('.atlas-menu-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await phone.evaluate(() => document.activeElement?.className), 'atlas-menu-toggle');
  await menu.tap(); await phone.getByRole('button', {name: 'Métodos', exact: true}).tap();
  assert.equal(await phone.locator('.atlas-menu-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await phone.evaluate(() => document.activeElement?.id), 's-methods');
  assert.equal(await phone.evaluate(() => location.hash), '');
  await phone.evaluate(() => scrollTo(0, 0)); await menu.tap(); await phone.getByRole('button', {name: 'Escuro', exact: true}).tap(); await phone.getByRole('button', {name: 'Fechar menu', exact: true}).tap();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await phone.locator('.atlas-btn, .atlas-text-action, .atlas-mail, .atlas-menu-toggle').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().height < 44).length), 0);
  if (shots) await phone.screenshot({path: join(shots, 'public-pt-mobile.png'), fullPage: true});
  await mobile.close();
  assert.deepEqual(foreign, [], 'fonts and illustration remain same-origin'); assert.deepEqual(errors, []);
  assert.equal(backend.st.log.some(line => /atlas-private/.test(line)), false);
  results.ok = true;
} finally {
  console.log(JSON.stringify(results)); await backend?.close(); await browser?.close(); rmSync(temp, {recursive: true, force: true});
}
