// Synthetic layout regression. The baseline mode runs the exact pre-fix public commit.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { labVisualFixture } from './lab-visual-fixture.mjs';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';

const baseline = process.env.NEXO_CREW_EXPECT_BASELINE_BUG === '1';
const base = process.env.NEXO_BASE_URL || 'http://127.0.0.1:4178';
const output = process.env.NEXO_QA_OUTPUT || (baseline ? 'test-output/crew-layout-baseline' : 'test-output/crew-layout');
const projection = labVisualFixture();
const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
const now = Date.parse(projection.manifest.generated_at) + 60_000;
system.evolution.board.push({ id: 'CREW-LAYOUT-FIXTURE', at: new Date(now - 10 * 60_000).toISOString(), from: 'ENGINEER', to: 'EXECUTOR',
  text: 'Fixture de layout: growth_geometry_public_matched_family_public_binding_version_20261001 continua esperando o vínculo publicado. Próxima ação: conferir a referência e o contrato antes de liberar READY.', refs: ['VISUAL-H0-09'] });
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const reports = [];
try {
  const matrix = baseline ? [['desktop', 1440, 1100, 'dark', false, false]] : [
    ['desktop', 1440, 1100, 'dark', false, false], ['screenshot-646', 646, 1100, 'dark', false, false],
    ['mobile-390', 390, 1000, 'dark', false, false], ['mobile-320', 320, 1000, 'dark', false, false],
    ['mobile-reduced', 390, 1000, 'dark', true, false], ['mobile-light-fallback', 390, 1000, 'light', true, true],
  ];
  for (const [name, width, height, theme, reduced, fallback] of matrix) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', reducedMotion: reduced ? 'reduce' : 'no-preference', isMobile: width < 760, hasTouch: width < 760 });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
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
    await page.goto(base + '/#/ciclo');
    const roleDetails = page.locator('.cycle-role-details > summary');
    if (await roleDetails.count()) await roleDetails.click();
    await page.locator('.crew').waitFor(); await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const hud = document.querySelector('.hud'), obs = document.querySelector('.observatory');
      return hud && Number(getComputedStyle(hud).opacity) === 1 && !hud.querySelector('[data-counting="true"],[data-writing="true"]')
        && (obs.classList.contains('scene-unavailable') || !!obs.querySelector('.obs-scene canvas'));
    });
    await page.addStyleTag({ content: 'body::after{content:"' + (baseline ? 'BASELINE · DEFEITO ESPERADO' : 'QA LAYOUT') + ' · FIXTURE SINTÉTICA";position:fixed;left:8px;bottom:3px;z-index:9999;padding:3px 6px;background:#15120c;color:#f4e4bd;font:10px system-ui;pointer-events:none}' });
    await page.locator('.crew').scrollIntoViewIfNeeded();
    const metrics = await page.locator('.crew').evaluate(crew => [...crew.querySelectorAll('.crew-card')].map(card => {
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const style = getComputedStyle(card), box = rect(card);
      const contentWidth = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
      return { name: card.querySelector('.crew-top b').textContent, card: box, contentWidth, columns: style.gridTemplateColumns,
        fields: Object.fromEntries(['crew-top', 'crew-hats', 'crew-does', 'crew-continuity', 'crew-pulse'].map(key => [key, rect(card.querySelector('.' + key))])) };
    }));
    await writeFile(output + '/' + name + '-bounds.json', JSON.stringify(metrics, null, 2));
    await page.screenshot({ path: output + '/' + name + '-cycle.png' });
    if (baseline) {
      const broken = metrics.filter(m => m.columns.trim().split(/\s+/).length > 1 && m.fields['crew-does'].width / m.contentWidth < .85);
      assert.ok(broken.length >= 2, 'exact baseline must reproduce the crushed description column for multiple crew cards');
      reports.push({ name, expectedBaselineBug: true, reproducedCards: broken.map(m => ({ name: m.name, descriptionWidth: m.fields['crew-does'].width, contentWidth: m.contentWidth, height: m.card.height })) });
    } else {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': page overflow');
      for (const m of metrics) {
        assert.equal(m.columns.trim().split(/\s+/).length, 1, name + ': single crew track ' + m.name);
        for (const [key, field] of Object.entries(m.fields)) {
          assert.ok(field.width >= m.contentWidth * .95, name + ': useful full-width ' + key + ' ' + m.name);
          assert.ok(field.right <= m.card.right + 1 && field.x >= m.card.x, name + ': field stays inside card');
        }
        const description = m.fields['crew-does'], continuity = m.fields['crew-continuity'];
        assert.ok(continuity.y >= description.bottom && continuity.y - description.bottom <= 48, name + ': no empty description track');
        assert.ok(m.card.height < (width >= 646 ? 500 : 720), name + ': bounded fixture card height ' + m.name);
      }
      assert.match(await page.locator('.crew').innerText(), /Última entrega do papel.*Pedido original · mural.*Próxima ação declarada/s);
      const pulses = await page.locator('.crew-pulse').allInnerTexts();
      assert.equal(pulses.length, metrics.length, name + ': every role card exposes its coverage');
      assert.ok(pulses.some(text => /^último sinal do papel /.test(text)), name + ': fixture exercises a role with observed events');
      for (const pulse of pulses) {
        assert.match(pulse, /^(?:último sinal do papel .+ · \d+ eventos deste papel em até 24 h(?: · compartilhado entre operadores)? · recorte parcial|Nenhum evento deste papel no recorte recebido; cobertura parcial)$/, name + ': role scope, time window and partial coverage stay explicit');
      }
      assert.ok(pulses.some(text => text.includes('compartilhado entre operadores')), name + ': shared operator role is not presented as an individual event count');
      assert.deepEqual(errors, [], name + ': page errors');
      reports.push({ name, width, cards: metrics.length, fullWidth: true, noOverflow: true, reducedMotion: reduced, webglFallback: fallback, maxHeight: Math.max(...metrics.map(m => m.card.height)), errors });
    }
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(output + '/report.json', JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
