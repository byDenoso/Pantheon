import test from 'node:test';
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {mkdir, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {compileGalaxySnapshot} from '../server/compiler/galaxy-v1.mjs';
import {SCENARIOS} from '../src/data/fixtures/scenarios.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'output/atlas-galaxy-component');
const PUBLIC_DATA = resolve(ROOT, 'data/tower-public');
const TOWER_DEPS = dirname(dirname(realpathSync(resolve(ROOT, 'node_modules/@fontsource/ibm-plex-sans'))));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

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
    plugins: [routePlugin],
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
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
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
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
    await page.screenshot({path: resolve(OUTPUT, 'galaxy-view-desktop.png'), fullPage: true});

    const selectedNode = page.locator('.galaxy-three-a11y-list button').first();
    const selectedLabelText = await selectedNode.innerText();
    await selectedNode.focus();
    await page.keyboard.press('Enter');
    await selectedNode.click({force: true});
    const selectedLabel = page.locator('.galaxy-three-label.selected').first();
    await page.waitForTimeout(100);
    const selectedEntityId = await page.evaluate(() => window.__ATLAS_BROWSER_TEST__.selection());
    console.log(JSON.stringify({selectedLabelText, selectedEntityId, firstSnapshotEntity: rawSnapshot.entities[0].id,
      focusedText: await page.evaluate(() => document.activeElement?.textContent)}));
    assert.equal(selectedEntityId, rawSnapshot.entities[0].canonical_id || rawSnapshot.entities[0].id,
      'an entity in the Tower projection remains selectable when absent from Atlas’s SystemState nodes');
    await page.waitForFunction(() => Boolean(document.querySelector('.galaxy-three-label.selected')), null, {timeout: 5000});
    const firstEventKind = rawSnapshot.events[0]?.kind;
    assert.ok(firstEventKind, 'real snapshot has at least one published event');
    await page.locator(`.galaxy-event-legend li[data-kind="${firstEventKind}"] .ev-go`).click();
    await page.locator(`.galaxy-event-panel[data-kind="${firstEventKind}"]`).waitFor();
    const canvas = page.locator('.galaxy-three-canvas');
    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox);
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
    await page.mouse.wheel(0, -360);
    await page.waitForTimeout(850);
    const beforeFailure = await selectedLabel.boundingBox();
    assert.ok(beforeFailure);

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
        'camera framing remains stable across revalidation');
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

    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.setViewportSize({width: 390, height: 844});
    await page.waitForTimeout(300);
    const mobile = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sceneWidth: document.querySelector('.galaxy-three-root')?.clientWidth,
      fixtureLabelVisible: (() => {
        const rect = document.querySelector('#atlas-browser-fixture').getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      })(),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    assert.equal(mobile.width, 390);
    assert.ok(mobile.scrollWidth <= mobile.width, `mobile Atlas overflows horizontally: ${mobile.scrollWidth}px > ${mobile.width}px`);
    assert.ok(mobile.sceneWidth > 0 && mobile.sceneWidth <= 390,
      `the embedded Galaxy scene must fit the Atlas mobile workspace, got ${mobile.sceneWidth}px`);
    assert.equal(mobile.fixtureLabelVisible, true);
    assert.equal(mobile.reducedMotion, true);
    await page.screenshot({path: resolve(OUTPUT, 'galaxy-view-mobile.png'), fullPage: true});
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    await server.close();
    if (previousSource === undefined) delete process.env.VITE_SYSTEM_SOURCE;
    else process.env.VITE_SYSTEM_SOURCE = previousSource;
  }
});
