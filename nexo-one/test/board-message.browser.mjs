// Local interaction and pixel QA. Synthetic messages never enter the production projection.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { labVisualFixture } from './lab-visual-fixture.mjs';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';
import { latestBoardRecord, boardConversation, boardThreads } from '../src/features/lab/presentation.ts';

const input = process.env.NEXO_PUBLIC_PROJECTION_INPUT;
const projection = input ? JSON.parse(await readFile(input, 'utf8')) : labVisualFixture();
const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
const now = Date.parse(projection.manifest.generated_at) + 60_000;
if (!input) {
  const raw = system.evolution.board[0];
  const long = Array.from({ length: 12 }, (_, i) => `Linha ${i + 1}: TEST-A & <texto literal> · conferir o vínculo publicado.`).join('\n');
  system.evolution.board = [
    { ...raw, id: 'VISUAL-NEWEST', at: new Date(now - 90_000).toISOString(), text: 'Fixture de teste · recado original\n' + long, refs: [...raw.refs, 'RM-H0-SYSTEMATICS-VS-PHYSICS-20260923-V1', 'VISUAL-UNKNOWN'] },
    ...Array.from({ length: 9 }, (_, i) => ({ ...raw, id: 'VISUAL-BOARD-' + i, at: new Date(now - (i + 3) * 600_000).toISOString(),
      from: i % 2 ? 'PITIA' : 'EXECUTOR', to: i % 2 ? 'ALL' : 'ENGINEER', text: 'Fixture de teste · recado ' + i,
      ...(i === 1 ? { resolved_at: new Date(now - 60_000).toISOString() } : {}), ...(i === 2 ? { expires_at: new Date(now - 60_000).toISOString() } : {}),
    })),
  ];
  const answered = system.evolution.board.find(post => post.id === 'VISUAL-BOARD-0');
  system.evolution.board.push({ ...answered, id: 'VISUAL-REPLY', reply_to: answered.id,
    from: answered.to, to: answered.from, at: new Date(now - 120_000).toISOString(),
    text: 'Fixture de teste — resposta vinculada do destinatário; problema ainda em investigação.' });
}
const roots = boardThreads(system.evolution.board, now);
const pending = roots.filter(post => boardConversation(post, system.evolution.board, now).awaiting);
const latest = latestBoardRecord(pending, now);
assert.ok(latest, 'published board input required for this focused QA');
const base = process.env.NEXO_BASE_URL || 'http://127.0.0.1:4187';
const output = process.env.NEXO_QA_OUTPUT || 'test-output/board-message';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const reports = [];
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow');
const ready = async page => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.hud')).opacity) === 1 && !document.querySelector('[data-writing="true"],[data-counting="true"]'));
};
try {
  for (const [name, width, height, theme, reduced, fallback] of [
    ['desktop', 1440, 1000, 'dark', false, false], ['iphone', 390, 844, 'dark', false, false],
    ['narrow-mobile', 320, 700, 'dark', false, false], ['iphone-reduced', 390, 844, 'dark', true, false],
    ['iphone-light-fallback', 390, 844, 'light', true, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', reducedMotion: reduced ? 'reduce' : 'no-preference', isMobile: width < 760, hasTouch: width < 760 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: now });
    await page.addInitScript(({ theme, fallback }) => {
      localStorage.setItem('nexo-theme', theme); localStorage.setItem('nexo.intro.seen', '1'); localStorage.setItem('nexo.legend.seen', '1'); localStorage.setItem('nexo.quality', 'low');
      if (fallback) {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind, ...args) { return /^webgl/.test(kind) ? null : get.call(this, kind, ...args); };
      }
    }, { theme, fallback });
    await page.route('**/api/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
    await page.route('**/api/system*', route => route.fulfill({ json: system }));
    await page.route('**/build-meta.json*', route => route.fulfill({ json: { projection_fingerprint: projection.manifest.projection_fingerprint } }));
    await page.goto(base + '/#/cockpit/comando');
    const focus = page.locator('.board-focus');
    await focus.waitFor(); await ready(page); await noOverflow(page);
    assert.equal(await focus.locator('.board-text').textContent(), latest.text, 'literal original preserved');
    assert.match(await focus.innerText(), /Narração · interface.*Mural · original/s);
    const bounds = await focus.boundingBox();
    assert.ok(bounds.y < height - 50, 'focus starts in the opening viewport');
    const originalBounds = await focus.locator('.board-text').boundingBox();
    const hudBounds = await page.locator('.hud').boundingBox();
    await writeFile(output + '/' + name + '-opening-layout.json', JSON.stringify({ name, width, height, focus: bounds, original: originalBounds, hud: hudBounds }, null, 2));
    if (!input) await page.addStyleTag({ content: 'body::after{content:"FIXTURE · DADOS SINTÉTICOS · SOMENTE TESTE";position:fixed;left:8px;bottom:3px;z-index:9999;background:#15120c;color:#f4e4bd;padding:3px 6px;font:10px system-ui;pointer-events:none}' });
    await page.screenshot({ path: output + '/' + name + '-opening.png' });
    assert.ok(originalBounds.y < Math.min(height - 60, hudBounds.y + hudBounds.height) - 20, name + ': original message starts in the opening viewport; ' + JSON.stringify({ originalY: originalBounds.y, hud: hudBounds }));
    if (width < 760 && !fallback) {
      await page.getByRole('button', { name: 'Explorar a teia' }).waitFor();
      const diagnostics = await page.evaluate(() => {
        const bounds = selector => {
          const element = document.querySelector(selector), rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, topStyle: getComputedStyle(element).top };
        };
        return { sky: getComputedStyle(document.querySelector('.observatory')).getPropertyValue('--sky').trim(),
          scene: bounds('.obs-scene'), hud: bounds('.hud'), hero: bounds('.hud-hero'), toggle: bounds('.explore-toggle') };
      });
      await writeFile(output + '/' + name + '-opening-bounds.json', JSON.stringify(diagnostics, null, 2));
      assert.ok(diagnostics.toggle.width >= 44 && diagnostics.toggle.height >= 44, 'mobile exploration target is at least 44px');
      assert.ok(diagnostics.toggle.y >= diagnostics.scene.y && diagnostics.toggle.bottom <= diagnostics.scene.bottom + 1, 'exploration control stays inside the sky');
      assert.ok(diagnostics.toggle.bottom <= diagnostics.hero.y, 'exploration control stays outside the hero');
      assert.ok(diagnostics.scene.bottom <= diagnostics.hud.y + 1, 'reading panel starts below the sky');
    }
    if (!input) {
      assert.equal(await focus.locator('.board-state').innerText(), 'Aguardando resposta');
    }
    const more = focus.getByRole('button', { name: 'Ler recado inteiro' });
    if (await more.count()) {
      await more.click();
      assert.equal(await focus.getByRole('button', { name: 'Recolher recado' }).getAttribute('aria-expanded'), 'true');
      assert.equal(await focus.locator('.board-text').textContent(), latest.text);
      await focus.getByRole('button', { name: 'Recolher recado' }).click();
      assert.equal(await more.getAttribute('aria-expanded'), 'false');
    }
    await focus.locator('.board-provenance summary').click();
    assert.ok((await focus.locator('.board-provenance').innerText()).includes(latest.id));
    await focus.locator('.board-provenance summary').click();
    if (!input) {
      assert.equal(await focus.locator('.board-evidence a').count(), 2);
      assert.match(await focus.locator('.board-evidence').innerText(), /VISUAL-UNKNOWN · ficha ausente/);
    }
    const firstLink = focus.locator('.board-evidence a[href^="#/e/"]').first();
    if (await firstLink.count()) {
      await firstLink.click(); await page.locator('.h1-entity').waitFor();
      await page.goBack(); await focus.waitFor(); await ready(page);
    }
    await focus.getByRole('button', { name: 'Ver todos os recados' }).click();
    const waitForOpenBoard = () => page.waitForFunction(total => {
      const heading = document.getElementById('now-board');
      const section = heading?.parentElement;
      return document.activeElement === heading && section?.querySelectorAll('.board > li').length === total
        && section.querySelector('[aria-label="Para"]').value === ''
        && section.querySelector('[aria-label="Tipo"]').value === ''
        && section.querySelector('[aria-label="Mostrar"]').value === 'Aguardando resposta';
    }, pending.length);
    await waitForOpenBoard();
    const board = page.locator('#now-board').locator('..');
    assert.equal(await board.locator('.board > li').count(), pending.length);
    assert.equal(await board.getByLabel('Mostrar', { exact: true }).inputValue(), 'Aguardando resposta');
    await noOverflow(page);
    await page.screenshot({ path: output + '/' + name + '-mural.png' });
    const owner = await board.getByLabel('Para', { exact: true }).locator('option').nth(1).getAttribute('value');
    await board.getByLabel('Para', { exact: true }).selectOption(owner);
    await board.getByLabel('Mostrar', { exact: true }).selectOption('Aguardando resposta');
    const expected = pending.filter(post => post.to === owner);
    await page.waitForFunction(total => document.getElementById('now-board')?.parentElement?.querySelectorAll('.board > li').length === total, Math.min(8, expected.length));
    assert.equal(await board.locator('.board > li').count(), Math.min(8, expected.length), 'selected filters are respected');
    await focus.getByRole('button', { name: 'Ver todos os recados' }).click();
    await waitForOpenBoard();
    assert.equal(await board.getByLabel('Para', { exact: true }).inputValue(), '');
    assert.equal(await board.getByLabel('Mostrar', { exact: true }).inputValue(), 'Aguardando resposta');
    if (!input) {
      assert.equal(await board.locator('.board > li').filter({ hasText: 'recado 0' }).count(), 0, 'answered conversation leaves pending');
      await board.getByLabel('Mostrar', { exact: true }).selectOption('Histórico');
      const answered = board.locator('.board > li').filter({ hasText: 'recado 0' });
      await answered.waitFor();
      assert.equal(await answered.locator('.board-state').innerText(), 'Respondido');
      await answered.locator('.board-replies summary').click();
      assert.match(await answered.locator('.board-replies').innerText(), /resposta vinculada do destinatário; problema ainda em investigação/);
      assert.match(await answered.locator('.board-text').innerText(), /recado 0/);
      await focus.getByRole('button', { name: 'Ver todos os recados' }).click();
      await waitForOpenBoard();
    }
    const motions = await focus.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length);
    assert.equal(motions, 0, 'no message activity animation');
    assert.deepEqual(errors, [], name + ': page errors');
    reports.push({ name, input: input ? 'public-projection' : 'synthetic-test-only', focusY: bounds.y, originalY: originalBounds.y, literal: true, keyboardFocus: true, repeatedOpen: true, filters: true, mobileControlBounds: width < 760 && !fallback, reducedMotion: reduced, webglFallback: fallback, errors });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(output + '/report.json', JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
