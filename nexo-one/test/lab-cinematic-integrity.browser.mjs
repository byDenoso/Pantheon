// Run against the local forced-remote dev server. Public input stays outside the deployed source.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';

const input = process.env.NEXO_PUBLIC_PROJECTION_INPUT;
assert.ok(input, 'Set NEXO_PUBLIC_PROJECTION_INPUT to the sanctioned public audit projection');
const projection = JSON.parse(await readFile(input, 'utf8'));
const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
const base = process.env.NEXO_BASE_URL || 'http://127.0.0.1:4178';
const output = 'test-output/cinematic';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const reports = [];
const noOverflow = async (page, route) => {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width + 1, route + ': horizontal overflow ' + JSON.stringify(size));
};
try {
  for (const [name, viewport, theme, reduced, fallback] of [
    ['desktop', { width: 1440, height: 1000 }, 'dark', false, false],
    ['mobile', { width: 390, height: 844 }, 'dark', false, false],
    ['mobile-reduced', { width: 390, height: 844 }, 'dark', true, false],
    ['mobile-light-fallback', { width: 390, height: 844 }, 'light', true, true],
  ]) {
    const context = await browser.newContext({ viewport, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: reduced ? 'reduce' : 'no-preference', isMobile: viewport.width < 760, hasTouch: viewport.width < 760 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: Date.parse(projection.manifest.generated_at) + 60_000 });
    await page.addInitScript(({ theme, fallback }) => {
      localStorage.setItem('nexo-theme', theme);
      localStorage.setItem('nexo.intro.seen', '1');
      localStorage.setItem('nexo.legend.seen', '1');
      localStorage.setItem('nexo.quality', 'low');
      if (fallback) {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /^webgl/.test(kind) ? null : getContext.call(this, kind, ...args); };
      }
    }, { theme, fallback });
    await page.route('**/api/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
    await page.route('**/api/system*', route => route.fulfill({ json: system }));
    await page.route('**/build-meta.json*', route => route.fulfill({ json: { projection_fingerprint: projection.manifest.projection_fingerprint } }));
    await page.goto(base + '/#/agora');
    await page.locator('#now-problem').waitFor();
    await page.waitForTimeout(500);
    assert.match(await page.locator('.now-priorities').innerText(), /54 testes parados/);
    assert.match(await page.locator('#now-next').locator('..').innerText(), /recuperar os 54 bloqueios/);
    assert.equal(await page.locator('#now-fronts').locator('..').locator('.fronts>li').count(), 8);
    assert.match(await page.locator('#now-fronts').locator('..').innerText(), /1\.0\.0.*2026-09-28/s);
    assert.match(await page.locator('#now-autonomy').locator('..').innerText(), /30 \/ 33.*9\.4 h.*17 \/ 33.*53 \/ 53/s);
    assert.match(await page.locator('#now-autonomy').locator('..').innerText(), /normalizados contêm 54 BLOCKED/);
    assert.match(await page.locator('.monologue').innerText(), /cobertura parcial/);
    await noOverflow(page, name + ':home');
    if (fallback) assert.equal(await page.locator('.observatory.scene-unavailable').count(), 1);
    else {
      assert.equal(await page.locator('.obs-scene canvas').count(), 1);
      if (theme === 'dark') assert.equal(await page.locator('.observatory').evaluate(el => getComputedStyle(el).getPropertyValue('--o-accent').trim()), '#d4bf95');
    }
    await page.screenshot({ path: output + '/' + name + '-home.png' });
    await page.evaluate(() => { location.hash = '#/e/FAM-DE-FS-GEOGROWTH-ELG-DESI-PP'; });
    await page.locator('.h1-entity').locator('..').waitFor();
    assert.match(await page.locator('.h1-entity').locator('..').innerText(), /Rejeitado pelo critério/);
    assert.doesNotMatch(await page.locator('.story').innerText().catch(() => ''), /Travei aqui/);
    await noOverflow(page, name + ':rejected');
    await page.screenshot({ path: output + '/' + name + '-rejected.png' });
    await page.evaluate(() => { location.hash = '#/roadmap/RM-H0-SYSTEMATICS-VS-PHYSICS-20260923-V1'; });
    await page.locator('.trail').waitFor();
    assert.match(await page.locator('.trail').innerText(), /0 resultados fora da fronteira.*22 na fronteira/s);
    assert.doesNotMatch(await page.locator('.trail').innerText(), /16 andados|6 na fronteira/);
    await noOverflow(page, name + ':roadmap');
    await page.screenshot({ path: output + '/' + name + '-roadmap.png' });
    await page.evaluate(() => { location.hash = '#/ciclo'; });
    await page.locator('.lanes').waitFor();
    assert.match(await page.locator('.lanes').innerText(), /240 eventos recebidos.*cobertura parcial/s);
    assert.doesNotMatch(await page.locator('.crew').innerText(), /ainda sem ações registradas|0 ações em 24 h/);
    await noOverflow(page, name + ':cycle');
    await page.screenshot({ path: output + '/' + name + '-cycle.png' });
    await page.evaluate(() => { location.hash = '#/agora'; });
    await page.locator('#now-problem').waitFor();
    await page.getByRole('button', { name: 'Procurar', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    if (!fallback) {
      await page.getByRole('button', { name: 'Explorar a teia' }).click();
      const controls = page.getByRole('group', { name: /Câmera da teia/ });
      await controls.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('+');
      await page.getByRole('button', { name: 'Recentrar câmera' }).click();
      await page.screenshot({ path: output + '/' + name + '-explore.png' });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.observatory.exploring').count(), 0);
    }
    await page.getByRole('button', { name: /Mostrar só a página/ }).click();
    assert.equal(await page.locator('.observatory.flat').count(), 1);
    await page.getByRole('button', { name: /Mostrar a teia/ }).click();
    assert.equal(await page.locator('.observatory.flat').count(), 0);
    assert.deepEqual(errors, [], name + ': page errors');
    reports.push({ name, routes: ['agora', 'rejected', 'roadmap', 'ciclo'], noOverflow: true, searchEscape: true, cameraKeyboard: !fallback, reducedMotion: reduced, forcedWebGLFallback: fallback, errors });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(output + '/report.json', JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
