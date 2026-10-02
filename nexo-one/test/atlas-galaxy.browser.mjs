import test from 'node:test';
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {compileGalaxySnapshot} from '../server/compiler/galaxy-v1.mjs';
import {SCENARIOS} from '../src/data/fixtures/scenarios.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_BASE = resolve(ROOT, 'output/atlas-galaxy-component');
const OUTPUT = resolve(OUTPUT_BASE, `fixture-${new Date().toISOString().replaceAll(':', '-')}`);
const PUBLIC_DATA = resolve(ROOT, 'data/tower-public');
const TOWER_DEPS = dirname(dirname(realpathSync(resolve(ROOT, 'node_modules/@fontsource/ibm-plex-sans'))));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

// Read the browser's actual WebGL framebuffer after its render callback. This
// catches blank scenes even when React's data attributes report a ready scene.
const renderedFrame = page => page.evaluate(() => new Promise(resolveFrame => {
  requestAnimationFrame(() => {
    const canvas = document.querySelector('.galaxy-three-canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!gl || gl.isContextLost()) return resolveFrame({bright: 0, blue: 0, warm: 0});
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let bright = 0, blue = 0, warm = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (Math.max(r, g, b) < 40) continue;
      bright++;
      if (b > r + 12 && b >= g) blue++;
      if (r > b + 12 && r >= g) warm++;
    }
    resolveFrame({bright, blue, warm});
  });
}));
const assertColdFrame = async page => {
  const frame = await renderedFrame(page);
  assert.ok(frame.bright > 100, `WebGL scene must contain rendered stars/filaments: ${JSON.stringify(frame)}`);
  assert.ok(frame.blue > 10 && frame.blue > frame.warm,
    `published web must visibly use the cold spectrum: ${JSON.stringify(frame)}`);
  return frame;
};
const selectedPosition = page => page.locator('.galaxy-three-label.selected').evaluate(label => {
  const matrix = new DOMMatrixReadOnly(getComputedStyle(label).transform);
  return {x: matrix.m41, y: matrix.m42};
});
const displacement = (before, after) => Math.hypot(after.x - before.x, after.y - before.y);
const scenePositions = page => page.locator('.galaxy-event, .galaxy-three-label.selected').evaluateAll(markers => markers.map(marker => {
  const matrix = new DOMMatrixReadOnly(getComputedStyle(marker).transform);
  return {x: matrix.m41, y: matrix.m42};
}));
const maximumDisplacement = (before, after) => Math.max(...before.map((position, index) => displacement(position, after[index])));


test('GalaxyView accepts the real public snapshot and preserves it through failed revalidation', async t => {
  await mkdir(OUTPUT, {recursive: true});
  const [projection, manifestFile] = await Promise.all([
    readJson(resolve(PUBLIC_DATA, 'projection.json')),
    readJson(resolve(PUBLIC_DATA, 'manifest.json')),
  ]);
  const rawSnapshot = compileGalaxySnapshot({projection, manifestFile});
  const expectedFingerprint = manifestFile.projection_fingerprint;
  assert.equal(rawSnapshot.provenance.source_fingerprint, expectedFingerprint);
  assert.equal(rawSnapshot.entities.length, 236, 'the checked-in public projection compiles to the validated 236-entity snapshot');

  // The checked-in scenario is used only as SystemState scaffolding. Its source
  // markers are downgraded and the visible test banner prevents a LIVE claim.
  const systemFixture = structuredClone(SCENARIOS[0].build());
  systemFixture.global_state = 'SNAPSHOT';
  systemFixture.bus.state = 'SNAPSHOT';
  systemFixture.bus.fingerprint = expectedFingerprint;
  systemFixture.bus.sources = systemFixture.bus.sources.map(source => ({...source, state: 'SNAPSHOT'}));
  systemFixture.providers = systemFixture.providers.map(provider => ({...provider, state: 'SNAPSHOT'}));

  const appSource = await readFile(resolve(ROOT, 'src/app/App.tsx'), 'utf8');
  assert.match(appSource, /const isGalaxyRoute = \(_hash: string\) => false;/,
    'the standalone #\/galaxia route stays disabled');

  const routePlugin = {
    name: 'atlas-galaxy-browser-fixture-hook',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.replaceAll('\\', '/');
      if (normalizedId.endsWith('/src/atlas3d/GalaxyView.tsx')) {
        const old = 'const { system, atlasObservation, loadAtlasSnapshot } = useNexoStore();';
        if (!code.includes(old)) throw new Error('Galaxy store hook anchor changed; refusing to inject test controls.');
        const testHook = `${old}\n  (window as any).__ATLAS_BROWSER_TEST__ = {\n    revalidate: (fingerprint: string) => loadAtlasSnapshot(ENDPOINT, fingerprint),\n    snapshot: () => atlasObservation.snapshot,\n    status: () => atlasObservation.status,\n    selection: () => galaxySelectedId,\n  };`;
        return code.replace(old, testHook);
      }
      return null;
    },
    transformIndexHtml(html) {
      const badge = '<style>#atlas-browser-fixture{position:fixed;z-index:99999;top:3.2rem;left:.5rem;padding:.35rem .6rem;background:#07121c;color:#a8d8f0;border:1px solid #47718c;border-radius:.35rem;font:600 10px/1.2 monospace;letter-spacing:.06em}</style><div id="atlas-browser-fixture">BROWSER TEST FIXTURE · NÃO É LIVE</div>';
      return html.replace('</body>', `${badge}</body>`);
    },
  };

  const previousSource = process.env.VITE_SYSTEM_SOURCE;
  process.env.VITE_SYSTEM_SOURCE = 'remote';
  const server = await createServer({
    configFile: false,
    root: ROOT,
    cacheDir: resolve(OUTPUT_BASE, 'vite-cache-fixture'),
    plugins: [routePlugin],
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      hmr: false,
      watch: null,
      fs: {allow: [ROOT, TOWER_DEPS]},
    },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'],
    });
  } catch (error) {
    await server.close();
    if (previousSource === undefined) delete process.env.VITE_SYSTEM_SOURCE;
    else process.env.VITE_SYSTEM_SOURCE = previousSource;
    t.skip(`Chromium could not initialize WebGL in this environment: ${error.message}`);
    return;
  }

  let mode = 'valid';
  const reads = [];
  const evidence = {started_at: new Date().toISOString(), fingerprint: expectedFingerprint, fixture: true, result: 'RUNNING'};
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const installFixtureRoutes = async page => {
      await page.route('**/api/session*', route => route.fulfill({json: {configured: false, authenticated: false}}));
      await page.route('**/api/system*', route => route.fulfill({json: systemFixture, headers: {'Cache-Control': 'no-store'}}));
      await page.route('**/api/world*', route => route.fulfill({
        contentType: 'application/x-ndjson',
        body: JSON.stringify({version: '1', items: [], providers: [], contexts: [], fingerprint: 'LOCAL_BROWSER_FIXTURE'}) + '\n',
      }));
      await page.route('**/galaxy/latest.json*', async route => {
        reads.push({mode, url: route.request().url()});
        if (mode === 'http-failure') {
          return route.fulfill({status: 503, contentType: 'text/plain', body: 'LOCAL TEST FAILURE'});
        }
        if (mode === 'wrong-fingerprint') {
          const bad = structuredClone(rawSnapshot);
          bad.provenance.source_fingerprint = `sha256:${'0'.repeat(64)}`;
          return route.fulfill({json: bad, headers: {'Cache-Control': 'no-store'}});
        }
        if (mode === 'out-of-order') {
          return route.fulfill({json: {...rawSnapshot, generated_at: '2000-01-01T00:00:00.000Z'}, headers: {'Cache-Control': 'no-store'}});
        }
        return route.fulfill({json: rawSnapshot, headers: {'Cache-Control': 'no-store'}});
      });
    };
    await installFixtureRoutes(page);

    await page.goto(`${baseUrl}/#/atlas?view=galaxy`, {waitUntil: 'networkidle'});
    assert.equal(await page.evaluate(() => window.location.hash), '#/atlas?view=galaxy',
      'the browser test enters through the existing embedded Atlas route');
    await page.waitForSelector('.atlas3d-page[data-atlas-mode="galaxy"]');
    await page.waitForSelector('.atlas3d-shell[data-observation-state="available"]', {timeout: 30000});
    await page.waitForFunction(() => window.__ATLAS_BROWSER_TEST__?.snapshot()?.entities?.length === 236);
    assert.equal(await page.locator('#atlas-browser-fixture').innerText(), 'BROWSER TEST FIXTURE · NÃO É LIVE');
    assert.equal(await page.locator('.atlas3d-shell').getAttribute('data-projection-fingerprint'), expectedFingerprint);
    assert.match(await page.locator('.galaxy-three-status').innerText(), /236 nós/);
    assert.equal(await page.locator('.galaxy-observation-status').getAttribute('data-state'), 'available');
    const publicRelations = rawSnapshot.relations;
    const publicSemanticRelations = publicRelations.filter(relation => relation.semantic !== false && relation.derived !== true);
    assert.ok(publicRelations.length > 0, 'the real projection supplies published grouping relations');
    assert.equal(await page.locator('.galaxy-three-root').getAttribute('data-web-palette'), 'cold');
    assert.equal(Number(await page.locator('.galaxy-three-root').getAttribute('data-web-filament-count')), publicRelations.length,
      'GalaxyView resolves every published relation into the renderer without inventing links');
    assert.equal(Number(await page.locator('.galaxy-three-root').getAttribute('data-web-semantic-count')), publicSemanticRelations.length,
      'presentation grouping is never promoted to scientific/semantic evidence');
    await page.waitForSelector('.galaxy-three-root[data-webgl-state="ready"]');
    await assertColdFrame(page);
    await page.screenshot({path: resolve(OUTPUT, 'galaxy-view-desktop.png'), fullPage: true});

    const selectedNode = page.locator('.galaxy-three-a11y-list button').first();
    const selectedLabelText = await selectedNode.innerText();
    await selectedNode.focus();
    await page.keyboard.press('Enter');
    const selectedLabel = page.locator('.galaxy-three-label.selected').first();
    await page.waitForTimeout(100);
    const selectedEntityId = await page.evaluate(() => window.__ATLAS_BROWSER_TEST__.selection());
    assert.equal(selectedEntityId, rawSnapshot.entities[0].canonical_id || rawSnapshot.entities[0].id,
      'an entity in the Tower projection remains selectable when absent from Atlas’s SystemState nodes');
    await page.waitForFunction(() => Boolean(document.querySelector('.galaxy-three-label.selected')), null, {timeout: 5000});
    const firstEventKind = rawSnapshot.events[0]?.kind;
    assert.ok(firstEventKind, 'real snapshot has at least one published event');
    const canvas = page.locator('.galaxy-three-canvas');
    await canvas.focus(); // Close the accessible entity list before a canvas gesture.
    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox);
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
    const hitTarget = await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.className,
      {x: canvasBox.x + canvasBox.width * 0.5, y: canvasBox.y + canvasBox.height * 0.5});
    assert.equal(hitTarget, 'galaxy-three-canvas', 'orbit gesture must reach the canvas');
    const beforeOrbit = await scenePositions(page);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.67, canvasBox.y + canvasBox.height * 0.58, {steps: 12});
    await page.mouse.up();
    await page.waitForTimeout(600);
    const afterOrbit = await scenePositions(page);
    assert.ok(maximumDisplacement(beforeOrbit, afterOrbit) > 5,
      `dragging the WebGL canvas changes the projected entity position: ${JSON.stringify({beforeOrbit, afterOrbit})}`);
    assert.equal(await page.evaluate(() => window.__ATLAS_BROWSER_TEST__.selection()), selectedEntityId,
      'orbit drag does not accidentally select a different entity');
    await page.mouse.wheel(0, -360);
    await page.waitForTimeout(850);
    await page.locator(`.galaxy-event-legend li[data-kind="${firstEventKind}"] .ev-go`).click();
    await page.locator(`.galaxy-event-panel[data-kind="${firstEventKind}"]`).waitFor();
    await page.waitForTimeout(1100); // Let event-focus flight settle before testing orbit input.
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.waitForTimeout(450);
    const reducedBefore = await selectedPosition(page);
    await page.waitForTimeout(550);
    assert.ok(displacement(reducedBefore, await selectedPosition(page)) < 0.5,
      'changing reduced-motion preference stops real idle rotation without a reload');
    const beforeFailure = await selectedLabel.boundingBox();
    assert.ok(beforeFailure);

    const mobileContext = await browser.newContext({
      viewport: {width: 390, height: 844}, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, reducedMotion: 'reduce',
    });
    try {
      const mobilePage = await mobileContext.newPage();
      mobilePage.on('pageerror', error => pageErrors.push(error.message));
      await installFixtureRoutes(mobilePage);
      await mobilePage.goto(`${baseUrl}/#/atlas?view=galaxy`, {waitUntil: 'networkidle'});
      await mobilePage.waitForSelector('.atlas3d-shell[data-observation-state="available"]');
      await mobilePage.waitForSelector('.galaxy-three-root[data-particle-profile="mobile"][data-webgl-state="ready"]');
      assert.equal(await mobilePage.locator('.galaxy-three-root').getAttribute('data-web-palette'), 'cold');
      assert.equal(Number(await mobilePage.locator('.galaxy-three-root').getAttribute('data-web-filament-count')), publicRelations.length);
      await assertColdFrame(mobilePage);
      // Keyboard selection remains available to a phone's external keyboard.
      await mobilePage.locator('.galaxy-three-a11y-list button').first().focus();
      await mobilePage.keyboard.press('Enter');
      await mobilePage.waitForSelector('.galaxy-three-label.selected');
      assert.equal(await mobilePage.evaluate(() => window.__ATLAS_BROWSER_TEST__.selection()), selectedEntityId);
      await mobilePage.waitForTimeout(450);
      const stillBefore = await selectedPosition(mobilePage);
      await mobilePage.waitForTimeout(550);
      assert.ok(displacement(stillBefore, await selectedPosition(mobilePage)) < 0.5,
        'reduced motion stops idle rotation of the actual projected scene');

      await mobilePage.locator('.galaxy-three-canvas').focus(); // Leave the keyboard entity list before a canvas gesture.
      const touchCanvas = await mobilePage.locator('.galaxy-three-canvas').boundingBox();
      assert.ok(touchCanvas && touchCanvas.width > 0 && touchCanvas.height > 0);
      const touch = await mobileContext.newCDPSession(mobilePage);
      await mobilePage.screenshot({path: resolve(OUTPUT, 'galaxy-view-mobile-before-touch.png'), fullPage: true});
      const touchStart = await mobilePage.locator('.galaxy-three-canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        for (const row of [0.75, 0.65, 0.55, 0.45]) for (const column of [0.15, 0.25, 0.35]) {
          const x = rect.x + rect.width * column, y = rect.y + rect.height * row;
          if (document.elementFromPoint(x, y) === canvas && document.elementFromPoint(x + 90, y + 20) === canvas) return {x, y};
        }
        const hit = document.elementFromPoint(rect.x + rect.width * 0.35, rect.y + rect.height * 0.4);
        throw new Error(`No unobstructed canvas gesture region: ${hit?.outerHTML.slice(0, 400)}`);
      });
      const {x, y} = touchStart;
      const beforeTouch = await scenePositions(mobilePage);
      await mobilePage.locator('.galaxy-three-canvas').evaluate(canvas => {
        window.__ATLAS_TOUCH_TEST__ = [];
        for (const type of ['pointerdown', 'pointermove', 'pointerup']) canvas.addEventListener(type, event => {
          window.__ATLAS_TOUCH_TEST__.push({type: event.type, pointerType: event.pointerType});
        });
      });
      await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
      for (let step = 1; step <= 10; step++) {
        await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + step * 9, y: y + step * 2, id: 1}]});
      }
      await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await mobilePage.waitForTimeout(650);
      const afterTouch = await scenePositions(mobilePage);
      const touchEvents = await mobilePage.evaluate(() => window.__ATLAS_TOUCH_TEST__);
      assert.ok(touchEvents.some(event => event.type === 'pointerdown' && event.pointerType === 'touch'),
        `mobile test must deliver real touch pointer input: ${JSON.stringify(touchEvents)}`);
      const maximumTouchMovement = maximumDisplacement(beforeTouch, afterTouch);
      assert.ok(maximumTouchMovement > 5,
        `real touch drag orbits the 390px scene even with reduced motion: ${JSON.stringify({beforeTouch, afterTouch, maximumTouchMovement, touchEvents})}`);
      assert.equal(await mobilePage.evaluate(() => window.__ATLAS_BROWSER_TEST__.selection()), selectedEntityId,
        'touch drag preserves entity selection');
      await touch.detach();
      // Verify overflow while the mobile event sheet is open as well.
      await mobilePage.locator(`.galaxy-event-legend li[data-kind="${firstEventKind}"] .ev-go`).tap();
      await mobilePage.locator(`.galaxy-event-panel[data-kind="${firstEventKind}"]`).waitFor();
      const mobile = await mobilePage.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sceneWidth: document.querySelector('.galaxy-three-root')?.clientWidth,
        fixtureLabelVisible: (() => {
          const rect = document.querySelector('#atlas-browser-fixture').getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        })(),
        touchEnabled: navigator.maxTouchPoints > 0,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      }));
      assert.equal(mobile.width, 390);
      assert.ok(mobile.scrollWidth <= mobile.width, `mobile Atlas overflows horizontally: ${mobile.scrollWidth}px > ${mobile.width}px`);
      assert.ok(mobile.sceneWidth > 0 && mobile.sceneWidth <= 390,
        `the embedded Galaxy scene must fit the Atlas mobile workspace, got ${mobile.sceneWidth}px`);
      assert.equal(mobile.fixtureLabelVisible, true);
      assert.equal(mobile.touchEnabled, true);
      assert.equal(mobile.reducedMotion, true);
      await mobilePage.screenshot({path: resolve(OUTPUT, 'galaxy-view-mobile.png'), fullPage: true});
      await assertColdFrame(mobilePage);
    } finally {
      await mobileContext.close();
    }

    const revalidate = async nextMode => {
      mode = nextMode;
      await page.evaluate(fingerprint => window.__ATLAS_BROWSER_TEST__.revalidate(fingerprint), expectedFingerprint);
      await page.waitForFunction(() => document.querySelector('.atlas3d-shell')?.dataset.observationState === 'stale', null, {timeout: 15000});
      assert.equal(await page.locator('.atlas3d-shell').getAttribute('data-projection-fingerprint'), expectedFingerprint,
        'the last validated source fingerprint remains visible');
      assert.match(await page.locator('.galaxy-three-status').innerText(), /236 nós/,
        'the last validated scene remains rendered');
      assert.equal((await page.locator('.galaxy-three-label.selected').first().innerText()).split('\n')[0], selectedLabelText,
        'the selected entity is preserved across the scene update');
      assert.equal(await page.locator('.galaxy-event-panel').getAttribute('data-kind'), firstEventKind,
        'the focused event context is preserved');
      const afterFailure = await page.locator('.galaxy-three-label.selected').first().boundingBox();
      assert.ok(afterFailure);
      assert.ok(Math.hypot(afterFailure.x - beforeFailure.x, afterFailure.y - beforeFailure.y) < 24,
        `camera framing remains stable across revalidation: ${JSON.stringify({nextMode, beforeFailure, afterFailure})}`);
      return await page.locator('.galaxy-observation-status').innerText();
    };

    const failedStatus = await revalidate('http-failure');
    assert.match(failedStatus, /HTTP_503/);
    await page.screenshot({path: resolve(OUTPUT, 'galaxy-view-stale-preserved.png'), fullPage: true});

    mode = 'valid';
    await page.evaluate(fingerprint => window.__ATLAS_BROWSER_TEST__.revalidate(fingerprint), expectedFingerprint);
    await page.waitForFunction(() => document.querySelector('.atlas3d-shell')?.dataset.observationState === 'available');

    const wrongStatus = await revalidate('wrong-fingerprint');
    assert.match(wrongStatus, /FINGERPRINT_MISMATCH/);
    mode = 'valid';
    await page.evaluate(fingerprint => window.__ATLAS_BROWSER_TEST__.revalidate(fingerprint), expectedFingerprint);
    await page.waitForFunction(() => document.querySelector('.atlas3d-shell')?.dataset.observationState === 'available');

    const orderedStatus = await revalidate('out-of-order');
    assert.match(orderedStatus, /OUT_OF_ORDER_SNAPSHOT/);
    assert.ok(reads.length >= 10, `expected initial/revalidation reads with retry sequences, got ${reads.length}`);
    assert.deepEqual(pageErrors, []);

    // Native loss/restore exercises Three's GPU resources and our render loop;
    // synthetic DOM events cannot prove the restored framebuffer is usable.
    mode = 'valid';
    await page.evaluate(fingerprint => window.__ATLAS_BROWSER_TEST__.revalidate(fingerprint), expectedFingerprint);
    await page.waitForSelector('.atlas3d-shell[data-observation-state="available"]');
    const beforeLoss = await selectedPosition(page);
    await page.evaluate(() => {
      const canvas = document.querySelector('.galaxy-three-canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('Chromium must expose WEBGL_lose_context for lifecycle coverage');
      window.__ATLAS_GPU_TEST__ = {extension, lost: false, restored: false};
      canvas.addEventListener('webglcontextlost', () => { window.__ATLAS_GPU_TEST__.lost = true; }, {once: true});
      canvas.addEventListener('webglcontextrestored', () => { window.__ATLAS_GPU_TEST__.restored = true; }, {once: true});
      extension.loseContext();
    });
    await page.waitForFunction(() => window.__ATLAS_GPU_TEST__.lost);
    await page.waitForSelector('.galaxy-three-root[data-webgl-state="lost"]');
    assert.equal(await page.locator('.atlas3d-shell').getAttribute('data-projection-fingerprint'), expectedFingerprint);
    await page.evaluate(() => window.__ATLAS_GPU_TEST__.extension.restoreContext());
    await page.waitForFunction(() => window.__ATLAS_GPU_TEST__.restored);
    await page.waitForSelector('.galaxy-three-root[data-webgl-state="ready"]');
    await page.waitForTimeout(350);
    await assertColdFrame(page);
    assert.equal(await page.evaluate(() => window.__ATLAS_BROWSER_TEST__.selection()), selectedEntityId);
    assert.equal(await page.locator('.galaxy-event-panel').getAttribute('data-kind'), firstEventKind);
    assert.ok(displacement(beforeLoss, await selectedPosition(page)) < 24,
      'GPU restoration preserves camera framing and selection');
    await page.screenshot({path: resolve(OUTPUT, 'galaxy-view-context-restored.png'), fullPage: true});

    assert.deepEqual(pageErrors, []);
    evidence.result = 'PASS';
  } catch (error) {
    evidence.result = 'FAIL';
    evidence.error = error.stack;
    throw error;
  } finally {
    evidence.finished_at = new Date().toISOString();
    evidence.reads = reads;
    await writeFile(resolve(OUTPUT, 'fixture-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(`Fixture browser evidence: ${OUTPUT}`);
    await browser.close();
    await server.close();
    if (previousSource === undefined) delete process.env.VITE_SYSTEM_SOURCE;
    else process.env.VITE_SYSTEM_SOURCE = previousSource;
  }
});
