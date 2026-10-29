// Local private UI replay against the freshly built bundle and synthetic Tower data only.
// Checks the existing private backdrop and fixed-camera a(t) rendering. No source writes.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';
import {startPrivateUiServer} from './helpers/private-ui-browser.mjs';

const output = process.env.PRIVATE_MOTION_QA_OUTPUT ? resolve(process.env.PRIVATE_MOTION_QA_OUTPUT) : null;
const executablePath = process.env.CHROMIUM_PATH || process.env.CHROMIUM_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server = await startPrivateUiServer(), browser = await chromium.launch({headless: true, executablePath, args: ['--no-sandbox']});
const report = {source: 'synthetic local fixture; not live Tower data', executablePath, checks: [], limitations: [
  'The private interface is served from the local built bundle with synthetic records, session and APIs.',
  'Canvas points are display geometry for source fixture nodes, not measurements of cosmological data.',
  'No live source, grant, auth backend, write endpoint, or hosted site is exercised.',
]};
const errors = [], foreign = [];

function attach(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(server.origin) && !request.url().startsWith('data:')) foreign.push(request.url()); });
}

async function login({reducedMotion = 'no-preference', width = 390, height = 844, patchCanvas = false} = {}) {
  const context = await browser.newContext({viewport: {width, height}, isMobile: width <= 430, hasTouch: width <= 430, reducedMotion, locale: 'pt-BR'});
  await context.addInitScript(({patchCanvas}) => {
    if (window === window.top) {
      localStorage.setItem('atlas.theme', 'dark');
      localStorage.setItem('atlas.locale', 'pt-BR');
      sessionStorage.setItem('nexo-motion-paused', 'false');
    }
    if (!patchCanvas) return;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
    const frames = new WeakMap();
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    const arc = CanvasRenderingContext2D.prototype.arc;
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fillRect = function(...args) {
      if (this.canvas.classList.contains('tc-2d')) frames.set(this, []);
      return fillRect.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.arc = function(x, y, r, ...args) {
      if (this.canvas.classList.contains('tc-2d') && r <= 4) frames.get(this)?.push({x, y, r});
      return arc.call(this, x, y, r, ...args);
    };
    CanvasRenderingContext2D.prototype.fill = function(...args) {
      const points = frames.get(this) || [];
      if (this.canvas.classList.contains('tc-2d') && points.length) window.__atlasRenderedPoints = points.slice();
      return fill.apply(this, args);
    };
  }, {patchCanvas});
  const page = await context.newPage();
  page.setDefaultTimeout(20000); attach(page);
  await page.goto(server.origin + '/#/privado', {waitUntil: 'domcontentloaded'});
  await page.locator('#atlas-pin,.atlas-private-frame').first().waitFor();
  if (await page.locator('#atlas-pin').isVisible()) {
    await page.fill('#atlas-pin', 'synthetic-demo-only');
    await page.getByRole('button', {name: 'Entrar', exact: true}).click();
  }
  await page.locator('.atlas-private-frame').waitFor();
  await page.frameLocator('.atlas-private-frame').locator('.pw').waitFor();
  const frame = page.frames().find(candidate => candidate.url().includes('/api/atlas-private-ui'));
  await frame.locator('.pw').waitFor();
  return {context, page, frame};
}

async function route(frame, hash, selector) {
  await frame.evaluate(value => { location.hash = value; }, hash);
  await frame.locator(selector).first().waitFor();
}

async function setOuterControl(page, label) {
  const toggle = page.locator('.atlas-menu-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('button', {name: label, exact: true}).click();
}

async function chooseTheme(page, frame, theme) {
  const toggle = page.locator('.atlas-menu-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('button', {name: theme === 'light' ? 'Claro' : 'Escuro', exact: true}).click();
  await frame.locator(`.pw[data-theme=${theme}]`).waitFor();
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
}

async function check(name, run) {
  try {
    const evidence = await run();
    report.checks.push({name, status: 'PASS', evidence});
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({name, status: 'FAIL', error: error.stack || error.message});
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  if (output) await mkdir(output, {recursive: true});

  await check('private backdrop preserves dark drift, pauses globally, and leaves light CMB fixed', async () => {
    const {context, page, frame} = await login();
    try {
      await route(frame, '#/teia/testes', '.pw-content:not(.pw-web-content)');
      const readBackdrop = () => frame.evaluate(() => {
        const content = document.querySelector('.pw-content:not(.pw-web-content)');
        const style = content && getComputedStyle(content, '::before');
        return style ? {animationName: style.animationName, duration: style.animationDuration, playState: style.animationPlayState, opacity: Number(style.opacity), transform: style.transform} : null;
      });
      assert.equal(await frame.locator('.pw').getAttribute('data-theme'), 'dark');
      const darkBefore = await readBackdrop();
      assert.ok(darkBefore, 'private non-web route has its existing backdrop');
      assert.equal(darkBefore.animationName, 'pd-drift');
      assert.equal(darkBefore.duration, '90s');
      assert.equal(darkBefore.playState, 'running');
      await page.waitForTimeout(1400);
      const darkMoved = await readBackdrop();
      assert.notEqual(darkMoved.transform, darkBefore.transform, 'dark background transform advances');

      await setOuterControl(page, 'Pausar animação');
      await frame.locator('html[data-motion=paused]').waitFor({state: 'attached'});
      await page.waitForTimeout(120);
      const darkPaused = await readBackdrop();
      assert.equal(darkPaused.playState, 'paused');
      await page.waitForTimeout(800);
      const darkHeld = await readBackdrop();
      assert.equal(darkHeld.transform, darkPaused.transform, 'global pause holds the private background');

      await setOuterControl(page, 'Reproduzir animação');
      await frame.locator('html[data-motion=running]').waitFor({state: 'attached'});
      await page.waitForTimeout(800);
      const darkResumed = await readBackdrop();
      assert.equal(darkResumed.playState, 'running');
      assert.notEqual(darkResumed.transform, darkHeld.transform, 'dark background resumes after global playback');

      await chooseTheme(page, frame, 'light');
      const lightBefore = await readBackdrop();
      assert.equal(lightBefore.animationName, 'none');
      assert.equal(lightBefore.playState, 'running');
      assert.ok(Math.abs(lightBefore.opacity - 0.38) < 0.001, `expected light opacity .38, got ${lightBefore.opacity}`);
      await page.waitForTimeout(1000);
      const lightAfter = await readBackdrop();
      assert.equal(lightAfter.transform, lightBefore.transform, 'light background remains fixed without drift');
      if (output) await page.screenshot({path: join(output, 'private-background-light-390.png')});
      await chooseTheme(page, frame, 'dark');
      return {darkBefore, darkMoved, darkPaused, darkHeld, darkResumed, lightBefore, lightAfter, route: '#/teia/testes'};
    } finally { await context.close(); }
  });

  await check('reduced motion keeps private background and Tower timeline static', async () => {
    const {context, frame} = await login({reducedMotion: 'reduce'});
    try {
      await route(frame, '#/teia/testes', '.pw-content:not(.pw-web-content)');
      const backdrop = await frame.evaluate(() => {
        const content = document.querySelector('.pw-content:not(.pw-web-content)');
        const style = content && getComputedStyle(content, '::before');
        return style ? {animationName: style.animationName, transform: style.transform} : null;
      });
      assert.equal(backdrop?.animationName, 'none');
      await route(frame, '#/teia', '.tc-stage');
      const stage = frame.locator('.tc-stage');
      await stage.locator('canvas.tc-2d').waitFor();
      assert.equal(await frame.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
      assert.equal(await stage.getAttribute('data-motion'), 'off');
      assert.equal(await stage.getAttribute('data-replay-playing'), 'false');
      assert.equal(await frame.locator('.tc-playback-dock').getByRole('button').first().isDisabled(), true);
      return {backdrop, stageMotion: await stage.getAttribute('data-motion'), replayPlaying: await stage.getAttribute('data-replay-playing')};
    } finally { await context.close(); }
  });

  await check('Tower a(t) changes visible node geometry at fixed camera, scales with rate, and pauses', async () => {
    const {context, page, frame} = await login({patchCanvas: true});
    try {
      await page.clock.install();
      await route(frame, '#/teia', '.tc-stage');
      const stage = frame.locator('.tc-stage');
      await stage.locator('canvas.tc-2d').waitFor();
      await frame.locator('html[data-motion=running]').waitFor({state: 'attached'});
      const selectTest = async id => {
        const search = frame.locator('.tc-search input');
        await search.fill(id);
        await frame.getByRole('option').first().waitFor();
        await search.press('Enter');
        await frame.locator(`.tc-stage[data-selected="test:${id}"]`).waitFor();
      };
      const runAtRate = async rate => {
        await selectTest('TEST-01');
        await frame.locator('.tc-playback-dock select').selectOption(String(rate));
        await frame.locator('.tc-stage[data-motion=on]').waitFor();
        await page.clock.runFor(1200);
        const sample = () => frame.evaluate(() => {
          const stage = document.querySelector('.tc-stage'), canvas = stage?.querySelector('canvas.tc-2d'), rect = canvas?.getBoundingClientRect();
          const positions = window.__atlasRenderedPoints || [];
          const center = positions.reduce((sum, p) => ({x: sum.x + p.x / positions.length, y: sum.y + p.y / positions.length}), {x: 0, y: 0});
          return {camera: stage?.dataset.cam ?? '', selected: stage?.dataset.selected ?? '', scaleFactor: Number(stage?.dataset.scaleFactor), count: positions.length,
            radialRms: Math.sqrt(positions.reduce((sum, p) => sum + (p.x-center.x)**2 + (p.y-center.y)**2, 0) / positions.length),
            canvasRect: rect ? {left: rect.left, top: rect.top, width: rect.width, height: rect.height} : null, positions: positions.map(({x, y}) => [x, y])};
        });
        const before = await sample();
        assert.ok(before.count > 1, `rate ${rate}: source fixture node circles were rendered`);
        await page.clock.runFor(120_000);
        const after = await sample();
        const visible = before.positions.map((_, i) => i).filter(i => {
          const inRect = (p, r) => r && p[0] >= 0 && p[1] >= 0 && p[0] < r.width && p[1] < r.height;
          return inRect(before.positions[i], before.canvasRect) && inRect(after.positions[i], after.canvasRect);
        });
        assert.ok(visible.length > 0, `rate ${rate}: same source nodes are inside both canvas frames`);
        const spread = sampleAt => {
          const center = visible.reduce((sum, i) => ({x: sum.x + sampleAt.positions[i][0] / visible.length, y: sum.y + sampleAt.positions[i][1] / visible.length}), {x: 0, y: 0});
          return Math.sqrt(visible.reduce((sum, i) => sum + (sampleAt.positions[i][0]-center.x)**2 + (sampleAt.positions[i][1]-center.y)**2, 0) / visible.length);
        };
        const displacementRms = Math.sqrt(visible.reduce((sum, i) => sum + (after.positions[i][0]-before.positions[i][0])**2 + (after.positions[i][1]-before.positions[i][1])**2, 0) / visible.length);
        assert.equal(after.camera, before.camera, `rate ${rate}: camera remains fixed`);
        assert.equal(after.selected, before.selected, `rate ${rate}: same node remains selected`);
        assert.equal(after.count, before.count, `rate ${rate}: same renderer point count`);
        assert.deepEqual(after.canvasRect, before.canvasRect, `rate ${rate}: same CSS canvas bounds`);
        assert.ok(after.scaleFactor > before.scaleFactor, `rate ${rate}: a(t) scale factor advances`);
        assert.ok(spread(after) > spread(before), `rate ${rate}: visible node radial RMS changes`);
        return {rate, before, after, visibleIndices: visible, visibleSpreadCssPx: {before: spread(before), after: spread(after), delta: spread(after)-spread(before)}, visibleNodeDisplacementRmsCssPx: displacementRms,
          formula: 'RMS radial distance from centroid over same point indices inside both canvas rectangles; displacement RMS separately uses matched point coordinates.'};
      };

      const slow = await runAtRate(0.25), fast = await runAtRate(1);
      assert.ok(fast.after.scaleFactor - fast.before.scaleFactor > (slow.after.scaleFactor - slow.before.scaleFactor) * 2, '1x advances the display scale faster than 0.25x');
      assert.deepEqual(fast.visibleIndices, slow.visibleIndices, 'both rates use the same visible renderer indices');
      assert.ok(fast.visibleSpreadCssPx.delta > slow.visibleSpreadCssPx.delta * 2, '1x produces the larger visible radial spread change');

      await frame.locator('.tc-motion-control').click();
      await frame.locator('.tc-stage[data-motion=off]').waitFor();
      await page.clock.runFor(1200);
      const pausedAt = await frame.evaluate(() => ({scaleFactor: document.querySelector('.tc-stage')?.dataset.scaleFactor, camera: document.querySelector('.tc-stage')?.dataset.cam,
        positions: (window.__atlasRenderedPoints || []).map(({x, y}) => [x, y])}));
      await page.clock.runFor(30_000);
      const pausedAfter = await frame.evaluate(() => ({scaleFactor: document.querySelector('.tc-stage')?.dataset.scaleFactor, camera: document.querySelector('.tc-stage')?.dataset.cam,
        positions: (window.__atlasRenderedPoints || []).map(({x, y}) => [x, y])}));
      assert.deepEqual(pausedAfter, pausedAt, 'pause holds camera, scale and rendered node coordinates');
      if (output) await page.screenshot({path: join(output, 'tower-teia-mobile.png')});
      return {slow, fast, pausedAt, pausedAfter};
    } finally { await context.close(); }
  });
} finally {
  await browser.close();
  await server.close();
  report.errors = errors; report.foreignRequests = foreign; report.serverControl = server.control;
  if (output) await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}

assert.deepEqual(errors, [], errors.join('\n'));
assert.deepEqual(foreign, [], foreign.join('\n'));
assert.equal(server.control.writes, 0, 'synthetic browser replay performs no writes');
assert.equal(server.control.grantWrites, 0, 'synthetic browser replay performs no grant writes');
const failed = report.checks.filter(check => check.status === 'FAIL');
console.log(`${failed.length ? 'FAIL' : 'PASS'}: ${report.checks.length - failed.length}/${report.checks.length} private background/a(t) checks; synthetic local fixture only.`);
if (failed.length) process.exit(1);
