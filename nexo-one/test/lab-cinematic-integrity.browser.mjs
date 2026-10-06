// Component visual QA on a loopback fixture entry. Explicit supplied public
// projection input stays outside deployed source; default input is synthetic.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { legacyVisualUrl } from './helpers/legacy-visual-url.mjs';
import { labVisualFixture } from './lab-visual-fixture.mjs';
import { buildLab } from '../src/features/lab/model.ts';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';

const input = process.env.NEXO_PUBLIC_PROJECTION_INPUT;
const projection = input ? JSON.parse(await readFile(input, 'utf8')) : labVisualFixture();
const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
const blocked = buildLab(system).counts.BLOCKED;
const base = process.env.NEXO_BASE_URL || 'http://127.0.0.1:4178';
const output = 'test-output/cinematic';
const nativeScene = '.obs-scene svg[data-tower-svg-native="observatory"][data-ready="true"]';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
const reports = [];
const readiness = [];
let activePage, activeName = 'component-replay';
// The current renderer groups projected samples into SVG paths. Measure that
// real output, not retired WebGL buffer attributes or the unmounted AtlasPortal.
const vectorReady = async (page, sampleBudget) => {
  await page.locator(nativeScene).waitFor();
  await page.waitForFunction(selector => !!document.querySelector(selector)?.querySelector('.obs-vector-environment path[d]'), nativeScene);
  const metrics = await page.locator(nativeScene).evaluate(svg => {
    const paths = [...svg.querySelectorAll('.obs-vector-environment path')];
    const data = paths.map(path => path.getAttribute('d') || '');
    return {
      renderer: 'svg', pathBatches: paths.length,
      drawnSamples: data.reduce((sum, d) => sum + (d.match(/M/g) || []).length, 0),
      finite: data.every(d => !/NaN|Infinity/.test(d)), frames: Number(svg.dataset.renderCount),
      canvases: svg.parentElement.querySelectorAll('canvas').length,
      foreignObjects: svg.querySelectorAll('foreignObject').length,
    };
  });
  assert.ok(metrics.finite && metrics.frames > 0, 'materialized finite SVG output');
  assert.ok(metrics.drawnSamples > 0 && metrics.drawnSamples <= sampleBudget, 'projected samples within rendering budget: ' + JSON.stringify(metrics));
  assert.ok(metrics.pathBatches > 0 && metrics.pathBatches <= 2_048, 'bounded SVG path batches: ' + JSON.stringify(metrics));
  assert.equal(metrics.canvases, 0, 'no hidden second canvas renderer');
  assert.equal(metrics.foreignObjects, 0, 'native vector primitives');
  assert.equal(await page.locator('[data-tower-svg-host]').count(), 0, 'normal browsing must not duplicate the entire page');
  return metrics;
};
// Route content existing is not visual readiness: HUD and text/count animations must finish.
const visualReady = async (page, name, exploring = false) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(expected => {
    const hud = document.querySelector('.hud');
    if (!hud || document.fonts.status !== 'loaded') return false;
    const observatory = document.querySelector('.observatory');
    if (!observatory || (!observatory.classList.contains('flat') && !observatory.querySelector('.obs-scene svg[data-tower-svg-native="observatory"][data-ready="true"]'))) return false;
    if (Math.abs(Number(getComputedStyle(hud).opacity) - expected) > .001) return false;
    const finite = hud.getAnimations({ subtree: true }).filter(animation => {
      const effect = animation.effect?.getComputedTiming();
      return effect && Number.isFinite(effect.endTime);
    });
    return finite.every(animation => ['finished', 'idle'].includes(animation.playState))
      && !hud.querySelector('[data-writing="true"], [data-counting="true"]');
  }, exploring ? 0 : 1, { timeout: 15_000 });
  const state = await page.evaluate(() => ({
    fonts: document.fonts.status, hudOpacity: Number(getComputedStyle(document.querySelector('.hud')).opacity),
    exploring: !!document.querySelector('.observatory.exploring'),
    sceneSvgCount: document.querySelectorAll('.obs-scene svg[data-tower-svg-native="observatory"]').length,
    sceneUnavailable: !!document.querySelector('.observatory.scene-unavailable'),
  }));
  readiness.push({ name, ...state });
};
const noOverflow = async (page, route) => {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width + 1, route + ': horizontal overflow ' + JSON.stringify(size));
};
try {
  // /api/system is private after migration. Anonymous denial is checked against
  // the real handler in mcp-browser; rendering replays this test's explicit input.
  const publishedSystem = system;
  const replaySource = input ? 'SUPPLIED_PROJECTION_REPLAY' : 'SYNTHETIC_COMPONENT_REPLAY';
  assert.ok(Object.keys(publishedSystem.read_model?.tests || {}).length > 0, 'visual replay contains source records');
  const publishedContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const publishedPage = activePage = await publishedContext.newPage();
  const publishedErrors = [];
  publishedPage.on('pageerror', error => publishedErrors.push(error.message));
  await publishedPage.addInitScript(() => { localStorage.setItem('nexo-theme','dark'); localStorage.setItem('nexo.quality','medium'); localStorage.setItem('nexo.intro.seen','1'); localStorage.setItem('nexo.legend.seen','1'); });
  await publishedPage.route('**/api/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
  await publishedPage.route('**/api/system*', route => route.fulfill({ json: publishedSystem }));
  await publishedPage.goto(legacyVisualUrl(base, '#/agora'));
  await publishedPage.locator('#now-problem').waitFor();
  await publishedPage.evaluate(() => document.fonts.ready);
  const publishedDiagnostics = await vectorReady(publishedPage, 42_000);
  await publishedPage.addStyleTag({ content: 'body::after{content:"' + replaySource + ' · SOMENTE TESTE";position:fixed;left:12px;bottom:6px;z-index:9999;padding:4px 8px;background:#15120c;color:#f4e4bd;font:11px system-ui;pointer-events:none}' });
  await publishedPage.screenshot({ path: output + '/component-replay-atlas-svg.png' });
  await writeFile(output + '/component-replay-atlas-svg.json', JSON.stringify({ ...publishedDiagnostics, source: replaySource, live_endpoint_checked: false, generated_at: publishedSystem.generated_at, errors: publishedErrors }, null, 2));
  assert.deepEqual(publishedErrors, [], 'published graph rendering and page errors');
  await publishedContext.close();
  for (const [name, viewport, theme, reduced, webglDisabled] of [
    ['desktop', { width: 1440, height: 1000 }, 'dark', false, false],
    ['mobile', { width: 390, height: 844 }, 'dark', false, false],
    ['medium', { width: 646, height: 900 }, 'dark', true, false],
    ['narrow', { width: 320, height: 700 }, 'dark', true, false],
    ['mobile-reduced', { width: 390, height: 844 }, 'dark', true, false],
    ['mobile-light-no-webgl', { width: 390, height: 844 }, 'light', true, true],
  ]) {
    activeName = name;
    const context = await browser.newContext({ viewport, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: reduced ? 'reduce' : 'no-preference', isMobile: viewport.width < 760, hasTouch: viewport.width < 760 });
    const page = activePage = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(Date.parse(projection.manifest.generated_at) + 60_000);
    await page.addInitScript(({ theme, webglDisabled }) => {
      localStorage.setItem('nexo-theme', theme);
      localStorage.setItem('nexo.intro.seen', '1');
      localStorage.setItem('nexo.legend.seen', '1');
      localStorage.setItem('nexo.quality', 'low');
      if (webglDisabled) {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /^webgl/.test(kind) ? null : getContext.call(this, kind, ...args); };
      }
    }, { theme, webglDisabled });
    await page.route('**/api/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
    await page.route('**/api/system*', route => route.fulfill({ json: system }));
    await page.route('**/build-meta.json*', route => route.fulfill({ json: { projection_fingerprint: projection.manifest.projection_fingerprint } }));
    await page.goto(legacyVisualUrl(base, '#/agora'));
    await page.locator('#now-problem').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await vectorReady(page, 6_000);
    if (!input) await page.addStyleTag({ content: 'body::after{content:"FIXTURE VISUAL · DADOS SINTÉTICOS · SOMENTE TESTE";position:fixed;left:12px;bottom:6px;z-index:9999;padding:4px 8px;background:#15120c;color:#f4e4bd;font:11px system-ui;pointer-events:none}' });
    await page.screenshot({ path: output + '/' + name + '-atlas-entry.png' });
    await visualReady(page, name + ':home');
    assert.match(await page.locator('.now-priorities').innerText(), new RegExp(`${blocked} testes parados`));
    assert.match(await page.locator('#now-next').locator('..').innerText(), new RegExp(`Conferir requisitos dos ${blocked} bloqueios`));
    assert.equal(await page.locator('#now-fronts').locator('..').locator('.fronts>li').count(), 8);
    assert.match(await page.locator('#now-fronts').locator('..').innerText(), /1\.0\.0.*2026-09-28/s);
    assert.match(await page.locator('#now-autonomy').locator('..').innerText(), /30 \/ 33.*9\.4 h.*17 \/ 33.*53 \/ 53/s);
    assert.equal(await page.locator('#now-autonomy').locator('..').locator('.aut-grid').last().locator('dt').last().innerText(), '53 / 53');
    assert.match(await page.locator('#now-autonomy').locator('..').innerText(), new RegExp(`${blocked} bloqueados entre ${buildLab(system).tests.size} testes recebidos`));
    assert.match(await page.locator('#now-autonomy').locator('..').innerText(), new RegExp(`normalizados contêm ${blocked} BLOCKED`));
    assert.match(await page.locator('.monologue').innerText(), /cobertura parcial/);
    assert.equal(await page.locator('.monologue > .feed-kind').innerText(), 'Eventos narrados · interface');
    if (!input) assert.equal(await page.locator('.board-text').first().innerText(), system.evolution.board[0].text);
    if (viewport.width >= 1280) {
      assert.equal(await page.locator('.tele-note .feed-kind').first().innerText(), 'Mural · original');
      if (!input) assert.equal(await page.locator('.tele-note .tele-t').first().innerText(), system.evolution.board[0].text);
      assert.ok((await page.locator('.tele-feed > li:not(.tele-note) > .feed-kind').allTextContents()).every(text => text === 'Evento narrado · interface'));
    }
    await noOverflow(page, name + ':home');
    const tools = page.locator('.obs-tools');
    await tools.getByRole('button', { name: 'Explorar a teia', exact: true }).waitFor();
    assert.equal(await tools.getByRole('button', { name: 'Mostrar só a página', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.observatory.scene-unavailable').count(), 0, 'native SVG remains functional without WebGL');
    assert.equal(await page.locator(nativeScene).count(), 1);
    if (theme === 'dark') assert.equal(await page.locator('.observatory').evaluate(el => getComputedStyle(el).getPropertyValue('--o-accent').trim()), '#6890ff');
    await page.screenshot({ path: output + '/' + name + '-home.png' });
    await page.evaluate(() => { location.hash = '#/e/FAM-DE-FS-GEOGROWTH-ELG-DESI-PP'; });
    await page.locator('.h1-entity').locator('..').waitFor();
    assert.match(await page.locator('.h1-entity').locator('..').innerText(), /Não atendeu ao critério do teste/);
    await page.locator('.story').waitFor();
    assert.equal(await page.locator('.story .beat-block').count(), 0, 'a rejected result is not an operational blocker');
    await noOverflow(page, name + ':rejected');
    await visualReady(page, name + ':rejected');
    await page.screenshot({ path: output + '/' + name + '-rejected.png' });
    await page.evaluate(() => { location.hash = '#/roadmap/RM-H0-SYSTEMATICS-VS-PHYSICS-20260923-V1'; });
    await page.locator('.trail').waitFor();
    assert.match(await page.locator('.trail').innerText(), /0 resultados fora da fronteira.*22 na fronteira/s);
    assert.doesNotMatch(await page.locator('.trail').innerText(), /16 andados|6 na fronteira/);
    await noOverflow(page, name + ':roadmap');
    await visualReady(page, name + ':roadmap');
    await page.screenshot({ path: output + '/' + name + '-roadmap.png' });
    await page.evaluate(() => { location.hash = '#/ciclo'; });
    await page.locator('.lanes').waitFor();
    assert.match(await page.locator('.lanes').innerText(), /240 eventos recebidos.*cobertura parcial/s);
    assert.doesNotMatch(await page.locator('.crew').innerText(), /ainda sem ações registradas|0 ações em 24 h/);
    await noOverflow(page, name + ':cycle');
    await visualReady(page, name + ':cycle');
    await page.screenshot({ path: output + '/' + name + '-cycle.png' });
    await page.evaluate(() => { location.hash = '#/agora'; });
    await page.locator('#now-problem').waitFor();
    await page.getByRole('button', { name: 'Procurar', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await visualReady(page, name + ':camera-ready');
    await page.screenshot({ path: output + '/' + name + '-camera-ready.png' });
    await page.getByRole('button', { name: 'Explorar a teia', exact: true }).click();
    assert.equal(await tools.getByRole('button', { name: 'Voltar ao painel', exact: true }).getAttribute('aria-pressed'), 'true');
    const controls = page.getByRole('group', { name: /Câmera da teia/ });
    await controls.waitFor();
    if (viewport.width < 760) {
      const bounds = await controls.boundingBox();
      const nav = await page.locator('.instrument-modes').boundingBox();
      assert.ok(bounds && nav && bounds.y + bounds.height < nav.y, 'camera controls above mobile navigation');
    }
    await controls.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('+');
    await page.getByRole('button', { name: 'Recentrar câmera', exact: true }).click();
    // Current scene navigation is the domain breadcrumb, not AtlasPortal scales.
    const crumb = page.getByRole('navigation', { name: 'Onde você está na teia', exact: true });
    await crumb.getByRole('button', { name: 'NEXO', exact: true }).click();
    assert.equal(await crumb.getByRole('button', { name: 'NEXO', exact: true }).getAttribute('aria-current'), 'location');
    await noOverflow(page, name + ':atlas');
    await page.screenshot({ path: output + '/' + name + '-explore.png' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.observatory.exploring').count(), 0);
    assert.equal(await tools.getByRole('button', { name: 'Explorar a teia', exact: true }).getAttribute('aria-pressed'), 'false');
    await page.getByRole('button', { name: 'Mostrar só a página', exact: true }).click();
    assert.equal(await page.locator('.observatory.flat').count(), 1);
    assert.equal(await page.locator(nativeScene).count(), 0, 'flat mode tears down the scene');
    assert.equal(await tools.getByRole('button', { name: 'Mostrar a teia', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Mostrar a teia', exact: true }).click();
    assert.equal(await page.locator('.observatory.flat').count(), 0);
    await vectorReady(page, 6_000);
    if (!input) {
      const audit = structuredClone(system);
      for (const record of Object.values(audit.read_model.tests)) delete record.blocker;
      for (const node of audit.graph.nodes) delete node.blocker;
      const reportAt = new Date(Date.parse(projection.manifest.generated_at) - 2 * 3600e3).toISOString();
      audit.guardian = { status: 'YELLOW', checked_at: projection.manifest.generated_at, live_checked_at: projection.manifest.generated_at, report_checked_at: reportAt, checks_total: 5, checks_failing: 2, failing_areas: ['science', 'automations'], live_areas: ['automations', 'cycle'] };
      await page.unroute('**/api/system*');
      await page.route('**/api/system*', route => route.fulfill({ json: audit }));
      await page.reload();
      await page.locator('#now-problem').waitFor();
      await visualReady(page, name + ':blocker-semantics');
      await page.addStyleTag({ content: 'body::after{content:"FIXTURE VISUAL · DADOS SINTÉTICOS · SOMENTE TESTE";position:fixed;left:12px;bottom:6px;z-index:9999;padding:4px 8px;background:#15120c;color:#f4e4bd;font:11px system-ui;pointer-events:none}' });
      const problem = page.locator('#now-problem').locator('..');
      await problem.scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/' + name + '-blockers.png' });
      const metrics = page.locator('#now-autonomy').locator('..');
      await metrics.locator('.aut-grid').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/' + name + '-recent-metrics.png' });
      await metrics.locator('.aut-grid').last().locator('dt').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/' + name + '-counting-bases.png' });
      const bounds = await metrics.locator('.aut-grid>div').evaluateAll(cells => cells.map(cell => {
        const number = cell.querySelector('dt').getBoundingClientRect(), box = cell.getBoundingClientRect();
        return { value: cell.querySelector('dt').textContent, fontSize: getComputedStyle(cell.querySelector('dt')).fontSize, tracks: getComputedStyle(cell).gridTemplateColumns, number: { x: number.x, width: number.width }, cell: { x: box.x, width: box.width }, scrollWidth: cell.scrollWidth, clientWidth: cell.clientWidth };
      }));
      await writeFile(output + '/' + name + '-metric-bounds.json', JSON.stringify(bounds, null, 2));
      assert.equal(await problem.locator('.hud-big').innerText(), 'Motivo do bloqueio não publicado.');
      assert.equal(await problem.locator('.elink').count(), 1);
      for (const box of bounds) assert.ok(box.scrollWidth <= box.clientWidth + 1 && box.number.x >= box.cell.x - 1 && box.number.x + box.number.width <= box.cell.x + box.cell.width + 1, name + ': metric fits its card ' + JSON.stringify(box));
      await noOverflow(page, name + ':counting-bases');
      await page.evaluate(() => { location.hash = '#/saude'; });
      await page.locator('#he-live').waitFor();
      await visualReady(page, name + ':health-sources');
      await page.locator('#he-fail').locator('..').scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/' + name + '-report-time.png' });
      await page.locator('#he-live').locator('..').scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/' + name + '-publication-time.png' });
      const utc = value => new Date(value).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
      assert.ok((await page.locator('#he-fail').locator('..').innerText()).includes(utc(reportAt)));
      assert.ok((await page.locator('#he-live').locator('..').innerText()).includes(utc(projection.manifest.generated_at)));
      assert.match(await page.locator('#he-live').locator('..').innerText(), /não comprova tarefa pausada/);
      assert.match(await page.locator('#he-live').locator('..').innerText(), /sem evento recente no recorte publicado/);
      assert.doesNotMatch(await page.locator('#he-live').locator('..').innerText(), /automação não rodou|automação parada/);
      await noOverflow(page, name + ':health-sources');
    }
    assert.deepEqual(errors, [], name + ': page errors');
    reports.push({ name, routes: ['agora', 'rejected', 'roadmap', 'ciclo'], noOverflow: true, searchEscape: true, cameraKeyboard: true, domainBreadcrumb: true, flatToggle: true, reducedMotion: reduced, webglDisabled, geometry, errors });
    console.log('PASS observatory profile: ' + name);
    await context.close();
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: output + '/' + activeName + '-failure.png', timeout: 5000 }).catch(() => {});
    const diagnostics = await activePage.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 12000), nativeScenes: document.querySelectorAll('[data-tower-svg-native]').length })).catch(() => null);
    await writeFile(output + '/' + activeName + '-failure.json', JSON.stringify({ error: String(error), diagnostics }, null, 2));
  }
  throw error;
} finally {
  await writeFile(output + '/report.json', JSON.stringify(reports, null, 2));
  await writeFile(output + '/readiness.json', JSON.stringify(readiness, null, 2));
  await browser.close();
}
console.log(JSON.stringify(reports));
