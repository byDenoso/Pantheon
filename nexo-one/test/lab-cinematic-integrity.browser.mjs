// Run against the local forced-remote dev server. Public input stays outside the deployed source.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { labVisualFixture } from './lab-visual-fixture.mjs';
import { buildLab } from '../src/features/lab/model.ts';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';

const input = process.env.NEXO_PUBLIC_PROJECTION_INPUT;
const projection = input ? JSON.parse(await readFile(input, 'utf8')) : labVisualFixture();
const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
const blocked = buildLab(system).counts.BLOCKED;
const base = process.env.NEXO_BASE_URL || 'http://127.0.0.1:4178';
const output = 'test-output/cinematic';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const reports = [];
const readiness = [];
// Route content existing is not visual readiness: hud-in and text/count animations must finish.
const visualReady = async (page, name, exploring = false) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(expected => {
    const hud = document.querySelector('.hud');
    if (!hud || document.fonts.status !== 'loaded') return false;
    const observatory = document.querySelector('.observatory');
    if (!observatory || (!observatory.classList.contains('flat') && !observatory.classList.contains('scene-unavailable') && !observatory.querySelector('.obs-scene canvas'))) return false;
    const style = getComputedStyle(hud);
    if (Math.abs(Number(style.opacity) - expected) > .001) return false;
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
    sceneCanvasCount: document.querySelectorAll('.obs-scene canvas').length,
    sceneUnavailable: !!document.querySelector('.observatory.scene-unavailable'),
  }));
  readiness.push({ name, ...state });
};
const noOverflow = async (page, route) => {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width + 1, route + ': horizontal overflow ' + JSON.stringify(size));
};
try {
  for (const [name, viewport, theme, reduced, fallback] of [
    ['desktop', { width: 1440, height: 1000 }, 'dark', false, false],
    ['mobile', { width: 390, height: 844 }, 'dark', false, false],
    ['medium', { width: 646, height: 900 }, 'dark', true, false],
    ['narrow', { width: 320, height: 700 }, 'dark', true, false],
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
    if (fallback) assert.equal(await page.locator('.observatory.scene-unavailable').count(), 1);
    else {
      assert.equal(await page.locator('.obs-scene canvas').count(), 1);
      if (theme === 'dark') assert.equal(await page.locator('.observatory').evaluate(el => getComputedStyle(el).getPropertyValue('--o-accent').trim()), '#d4bf95');
    }
    if (!input) await page.addStyleTag({ content: 'body::after{content:"FIXTURE VISUAL · DADOS SINTÉTICOS · SOMENTE TESTE";position:fixed;left:12px;bottom:6px;z-index:9999;padding:4px 8px;background:#15120c;color:#f4e4bd;font:11px system-ui;pointer-events:none}' });
    await page.screenshot({ path: output + '/' + name + '-home.png' });
    await page.evaluate(() => { location.hash = '#/e/FAM-DE-FS-GEOGROWTH-ELG-DESI-PP'; });
    await page.locator('.h1-entity').locator('..').waitFor();
    assert.match(await page.locator('.h1-entity').locator('..').innerText(), /Rejeitado pelo critério/);
    assert.doesNotMatch(await page.locator('.story').innerText().catch(() => ''), /Travei aqui/);
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
    if (!fallback) {
      await page.screenshot({ path: output + '/' + name + '-camera-ready.png' });
      const diagnostics = await page.evaluate(() => ({
        url: location.href,
        sceneUnavailable: !!document.querySelector('.scene-unavailable'),
        canvasCount: document.querySelectorAll('.obs-scene canvas').length,
        buttons: [...document.querySelectorAll('.obs-tools button')].map(button => ({
          label: button.getAttribute('aria-label'), text: button.textContent,
          width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
        })),
      }));
      await writeFile(output + '/' + name + '-camera-diagnostics.json', JSON.stringify(diagnostics, null, 2));
      await page.getByRole('button', { name: 'Explorar a teia' }).click();
      const controls = page.getByRole('group', { name: /Câmera da teia/ });
      if (viewport.width < 760) {
        const bounds = await controls.boundingBox();
        const nav = await page.locator('.instrument-modes').boundingBox();
        assert.ok(bounds && nav && bounds.y + bounds.height < nav.y, 'camera controls above mobile navigation');
      }
      await controls.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('+');
      await page.getByRole('button', { name: 'Recentrar câmera' }).click();
      const crumb = page.getByRole('navigation', { name: 'Onde você está na teia' });
      if (viewport.width < 760) {
        const bounds = await crumb.boundingBox();
        const header = await page.locator('.instrument-header').boundingBox();
        assert.ok(bounds && header && bounds.y >= header.y + header.height, 'scene breadcrumb below mobile header');
      } else if (viewport.width >= 1280) {
        const bounds = await crumb.boundingBox();
        const sidebar = await page.locator('.telemetry').boundingBox();
        assert.ok(bounds && sidebar && bounds.x + bounds.width < sidebar.x, 'scene breadcrumb left of desktop telemetry');
      }
      await crumb.getByRole('button', { name: 'NEXO', exact: true }).click();
      await visualReady(page, name + ':explore', true);
      const hint = await page.locator('.explore-hint').boundingBox();
      assert.ok(hint && hint.x >= 0 && hint.x + hint.width <= viewport.width, 'explore hint within viewport');
      if (viewport.width >= 1280) {
        const sidebar = await page.locator('.telemetry').boundingBox();
        assert.ok(hint.x + hint.width < sidebar.x, 'explore hint must not be clipped by telemetry');
      }
      await page.screenshot({ path: output + '/' + name + '-explore.png' });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.observatory.exploring').count(), 0);
    }
    if (fallback) {
      assert.equal(await page.getByRole('button', { name: 'Explorar a teia' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /Mostrar só a página/ }).count(), 0);
    } else {
      await page.getByRole('button', { name: /Mostrar só a página/ }).click();
      assert.equal(await page.locator('.observatory.flat').count(), 1);
      await page.getByRole('button', { name: /Mostrar a teia/ }).click();
      assert.equal(await page.locator('.observatory.flat').count(), 0);
    }
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
      await problem.screenshot({ path: output + '/' + name + '-blockers.png' });
      const metrics = page.locator('#now-autonomy').locator('..');
      await metrics.screenshot({ path: output + '/' + name + '-counting-bases.png' });
      const bounds = await metrics.locator('.aut-grid>div').evaluateAll(cells => cells.map(cell => {
        const number = cell.querySelector('dt').getBoundingClientRect(), box = cell.getBoundingClientRect();
        return { number: { x: number.x, width: number.width }, cell: { x: box.x, width: box.width }, scrollWidth: cell.scrollWidth, clientWidth: cell.clientWidth };
      }));
      await writeFile(output + '/' + name + '-metric-bounds.json', JSON.stringify(bounds, null, 2));
      assert.equal(await problem.locator('.hud-big').innerText(), 'Motivo do bloqueio não publicado.');
      assert.equal(await problem.locator('.elink').count(), 1);
      for (const box of bounds) assert.ok(box.scrollWidth <= box.clientWidth + 1 && box.number.x >= box.cell.x - 1 && box.number.x + box.number.width <= box.cell.x + box.cell.width + 1, name + ': metric fits its card ' + JSON.stringify(box));
      await noOverflow(page, name + ':counting-bases');
      await page.evaluate(() => { location.hash = '#/saude'; });
      await page.locator('#he-live').waitFor();
      await visualReady(page, name + ':health-sources');
      await page.locator('#he-fail').locator('..').screenshot({ path: output + '/' + name + '-report-time.png' });
      await page.locator('#he-live').locator('..').screenshot({ path: output + '/' + name + '-publication-time.png' });
      const utc = value => new Date(value).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
      assert.ok((await page.locator('#he-fail').locator('..').innerText()).includes(utc(reportAt)));
      assert.ok((await page.locator('#he-live').locator('..').innerText()).includes(utc(projection.manifest.generated_at)));
      assert.match(await page.locator('#he-live').locator('..').innerText(), /não comprova tarefa pausada/);
      await noOverflow(page, name + ':health-sources');
    }
    assert.deepEqual(errors, [], name + ': page errors');
    reports.push({ name, routes: ['agora', 'rejected', 'roadmap', 'ciclo'], noOverflow: true, searchEscape: true, cameraKeyboard: !fallback, flatToggle: !fallback, reducedMotion: reduced, forcedWebGLFallback: fallback, errors });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(output + '/report.json', JSON.stringify(reports, null, 2));
await writeFile(output + '/readiness.json', JSON.stringify(readiness, null, 2));
console.log(JSON.stringify(reports));
