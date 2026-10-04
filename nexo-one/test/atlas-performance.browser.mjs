import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import ts from 'typescript';

// Exercise the shipped hook in a real DOM without mocking layout or observers.
// This is a component lifecycle/performance regression, not a full-app FPS test.
const source = readFileSync(new URL('../src/app/useCinematics.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {}),
});
const report = [];
try {
  for (const width of [1440, 390]) for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({viewport: {width, height: 900}, reducedMotion});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<style>body{margin:12px}article{padding:8px}svg{width:100%;height:80px}table{width:100%}</style>
      <main id="workspace" class="workspace"><h1 class="workspace-heading">Atlas lifecycle regression</h1>
      <div class="card-grid"><article>Published data</article></div>
      <div class="scene"><svg data-tower-svg-native="observatory"><g id="particles"></g></svg></div>
      <table class="system-table"><tbody><tr><td><span id="first">One<b id="nested">Nested</b></span></td><td id="second">Two</td></tr><tr><td>Three</td><td>Four</td></tr></tbody></table></main>`);
    await page.evaluate(() => {
      window.metrics = {scans: 0, tableMutations: 0};
      const root = document.getElementById('workspace');
      const query = root.querySelectorAll.bind(root);
      root.querySelectorAll = selector => { if (selector.includes('.workspace')) window.metrics.scans++; return query(selector); };
      window.intervals = new Set();
      const interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
      window.setInterval = (...args) => { const id = interval(...args); window.intervals.add(id); return id; };
      window.clearInterval = id => { window.intervals.delete(id); clear(id); };
      new MutationObserver(records => { window.metrics.tableMutations += records.length; })
        .observe(document.querySelector('table'), {attributes: true, subtree: true, attributeFilter: ['class']});
      window.exports = {};
      window.require = name => {
        if (name !== 'react') throw new Error(`Unexpected dependency ${name}`);
        return {useEffect: effect => { window.cleanup = effect(); }};
      };
    });
    await page.addScriptTag({content: compiled});
    await page.evaluate(() => window.exports.useCinematics('regression'));
    if (reducedMotion === 'no-preference') {
      await page.waitForFunction(() => document.querySelector('.card-grid article').dataset.reveal === 'in');
      assert.equal(await page.evaluate(() => window.intervals.size), 0, 'no idle polling after reveal');
    } else {
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('cinematic')), false);
      assert.equal(await page.evaluate(() => window.intervals.size), 0);
    }
    const scans = await page.evaluate(async () => {
      window.metrics.scans = 0;
      const particles = document.getElementById('particles');
      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        particles.replaceChildren(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
      return window.metrics.scans;
    });
    assert.equal(scans, 0, '60 SVG updates must not rescan the workspace');
    await page.evaluate(() => {
      const el = document.createElement('article'); el.id = 'added'; el.textContent = 'New published card';
      document.querySelector('.card-grid').append(el);
    });
    if (reducedMotion === 'no-preference') {
      await page.waitForFunction(() => document.getElementById('added').dataset.reveal === 'in');
    }
    await page.evaluate(() => document.getElementById('first').dispatchEvent(new PointerEvent('pointerover', {bubbles: true})));
    assert.equal(await page.locator('td.is-col').count(), 2);
    await page.evaluate(() => { window.metrics.tableMutations = 0; document.getElementById('nested').dispatchEvent(new PointerEvent('pointerover', {bubbles: true})); });
    assert.equal(await page.evaluate(() => window.metrics.tableMutations), 0, 'same-column movement must not rewrite classes');
    await page.evaluate(() => document.getElementById('second').dispatchEvent(new PointerEvent('pointerover', {bubbles: true})));
    assert.equal(await page.locator('td.is-col').count(), 2);
    assert.equal(await page.locator('#second').evaluate(el => el.classList.contains('is-col')), true);
    if (reducedMotion === 'no-preference') {
      await page.evaluate(() => {
        for (const id of ['owned', 'updated']) {
          const el = document.createElement('article');
          el.innerHTML = `<div class="pulse-metric"><strong id="${id}">100000</strong></div>`;
          document.querySelector('.card-grid').append(el);
        }
      });
      await page.waitForFunction(() => document.getElementById('owned').textContent !== '100000' && document.getElementById('updated').textContent !== '100000');
      await page.evaluate(() => { document.getElementById('updated').textContent = '999999'; window.cleanup(); });
      assert.equal(await page.locator('#owned').textContent(), '100000', 'cleanup restores the final published value');
      assert.equal(await page.locator('#updated').textContent(), '999999', 'cleanup must preserve a newer React value');
    } else {
      await page.evaluate(() => window.cleanup());
    }
    assert.equal(await page.locator('td.is-col').count(), 0);
    assert.equal(await page.locator('[data-reveal="wait"]').count(), 0);
    assert.equal(await page.evaluate(() => window.intervals.size), 0);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('cinematic')), false);
    await page.evaluate(() => { window.metrics.scans = 0; document.querySelector('.card-grid').append(document.createElement('article')); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.metrics.scans), 0, 'unmount disconnects observers');
    assert.deepEqual(errors, []);
    report.push({width, reducedMotion, svgUpdates: 60, workspaceRescans: scans, result: 'PASS'});
    await context.close();
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  mkdirSync('test-output/atlas-performance', {recursive: true});
  writeFileSync('test-output/atlas-performance/lifecycle.json', JSON.stringify(report, null, 2));
  await browser.close();
}
