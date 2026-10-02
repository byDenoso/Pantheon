// Reference palette and readable state labels across published LAB routes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { labVisualFixture } from './lab-visual-fixture.mjs';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';
const projection = labVisualFixture();
const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
const base = process.env.NEXO_BASE_URL || 'http://127.0.0.1:4178';
const output = 'test-output/reference-cyan';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const reports = [];
try {
  for (const theme of ['dark', 'light']) for (const width of [1440, 783, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: Date.parse(projection.manifest.generated_at) + 60_000 });
    await page.addInitScript(theme => {
      localStorage.setItem('nexo-theme', theme);
      localStorage.setItem('nexo.intro.seen', '1');
      localStorage.setItem('nexo.legend.seen', '1');
      localStorage.setItem('nexo.quality', 'low');
    }, theme);
    await page.route('**/api/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
    await page.route('**/api/system*', route => route.fulfill({ json: system }));
    await page.route('**/build-meta.json*', route => route.fulfill({ json: { projection_fingerprint: projection.manifest.projection_fingerprint } }));
    await page.goto(base + '/#/agora');
    await page.locator('.observatory .hud').waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const route of ['agora', 'universo', 'ciclo', 'roadmaps', 'evidencia', 'saude']) {
      await page.evaluate(route => { location.hash = '#/' + route; }, route);
      await page.locator('.observatory[data-page="' + route + '"]').waitFor();
      const result = await page.evaluate(() => {
        const rgb = value => { const m = value.match(/[\d.]+/g)?.map(Number); return m?.length >= 3 ? [m[0], m[1], m[2], m[3] ?? 1] : null; };
        const lum = color => color.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((n, c, i) => n + c * [.2126, .7152, .0722][i], 0);
        const contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
        const background = element => {
          const ancestors = []; for (let current = element; current; current = current.parentElement) ancestors.unshift(current);
          let value = document.documentElement.dataset.theme === 'light' ? [251, 252, 249, 1] : [7, 10, 16, 1];
          for (const ancestor of ancestors) { const layer = rgb(getComputedStyle(ancestor).backgroundColor); if (layer) value = value.map((n, i) => i < 3 ? layer[i] * layer[3] + n * (1 - layer[3]) : 1); }
          return value;
        };
        const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
        const selectors = '.instrument-modes button.active,.vchip,.incident-state,.board-state,.board-route,.hud-kicker,.obs-camera-controls button';
        const contrasts = [...document.querySelectorAll(selectors)].filter(visible).map(element => ({
          selector: element.className, text: element.textContent.trim().slice(0, 70),
          ratio: contrast(rgb(getComputedStyle(element).color), background(element)),
        }));
        const warm = color => {
          if (!color || color[3] < .2) return false;
          const [r,g,b] = color, high = Math.max(r,g,b), low = Math.min(r,g,b), delta = high-low;
          if (delta < 35 || high === 0 || delta/high < .25) return false;
          let h = high === r ? (g-b)/delta + (g<b?6:0) : high === g ? (b-r)/delta+2 : (r-g)/delta+4;
          h *= 60; return h >= 5 && h <= 70;
        };
        const warmColors = [...document.querySelectorAll('.lab-route button,.lab-route .vchip,.lab-route .incident,.lab-route .incident-state,.lab-route .trail,.lab-route .vbar>*,.lab-route svg *')]
          .filter(visible).flatMap(element => ['color','backgroundColor','borderLeftColor','borderTopColor','fill','stroke','stopColor'].filter(property => warm(rgb(getComputedStyle(element)[property]))).map(property => ({ selector: element.className, property, value: getComputedStyle(element)[property] })));
        // Pale cream and gradient definitions can evade saturation/visibility heuristics.
        const acousticStops = [...document.querySelectorAll('.sig-acoustic stop')].map(stop => getComputedStyle(stop).stopColor);
        const shell = document.querySelector('.lab-route'), obs = document.querySelector('.observatory');
        return { contrasts, warmColors, acousticStops, accent: getComputedStyle(shell).getPropertyValue('--atlas-cyan').trim(),
          surface: getComputedStyle(obs).getPropertyValue('--o-void').trim(),
          decoGlow: getComputedStyle(shell).getPropertyValue('--deco-glow-a').trim(),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          verdicts: [...document.querySelectorAll('.vchip')].map(x => ({ label: x.textContent.trim(), glyph: x.querySelector('i')?.textContent.trim() })) };
      });
      assert.deepEqual(result.acousticStops, theme === 'light'
        ? ['rgb(39, 148, 243)','rgb(183, 237, 255)','rgb(39, 148, 243)','rgb(183, 237, 255)']
        : ['rgb(152, 210, 255)','rgb(183, 237, 255)','rgb(152, 210, 255)','rgb(183, 237, 255)'],
        theme + '/' + width + '/' + route + ': acoustic gradient uses the cyan palette, including pale stops');
      assert.equal(result.accent, theme === 'light' ? '#2794f3' : '#98d2ff');
      assert.equal(result.surface, theme === 'light' ? '#fbfcf9' : '#070a10');
      assert.equal(result.decoGlow, '0');
      assert.equal(result.overflow, false, route + ': no horizontal overflow');
      assert.deepEqual(result.warmColors, [], theme + '/' + width + '/' + route + ': no residual warm accents');
      assert.ok(result.contrasts.every(x => x.ratio >= 4.5), JSON.stringify({ theme, width, route, lowContrast: result.contrasts.filter(x => x.ratio < 4.5) }));
      assert.ok(result.verdicts.every(x => x.label && x.glyph), 'verdicts retain words and glyphs');
      reports.push({ theme, width, route, ...result });
    }
    await page.getByRole('button', { name: 'Agora', exact: true }).click();
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement !== document.body), 'keyboard focus stays usable');
    await page.screenshot({ path: output + '/' + theme + '-' + width + '.png' });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('REFERENCE_CYAN ' + JSON.stringify(reports.map(({ theme, width, route, contrasts }) => ({ theme, width, route, minTextContrast: Math.min(...contrasts.map(x => x.ratio)) }))));
} finally {
  await writeFile(output + '/report.json', JSON.stringify(reports, null, 2));
  await browser.close();
}
