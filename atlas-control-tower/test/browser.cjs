const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const path = require('node:path');
const assert = require('node:assert/strict');

const baseUrl = process.env.ATLAS_BASE_URL || 'http://127.0.0.1:4173';
const screenshotDir = path.resolve(process.env.ATLAS_SCREENSHOT_DIR || '.');

async function launchBrowser() {
  const binary = process.env.ATLAS_CHROMIUM_MODULE ? (await import(process.env.ATLAS_CHROMIUM_MODULE)).default : null;
  return chromium.launch(binary ? { executablePath: await binary.executablePath(), headless: true, args: binary.args } : { headless: true, args: ['--no-sandbox'] });
}

async function expectRoute(page, route) {
  await page.waitForURL(url => url.pathname === route || url.pathname.startsWith(route + '?'));
  assert.equal(new URL(page.url()).pathname, route, `expected ${route}, got ${page.url()}`);
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(baseUrl + '/graphs', { waitUntil: 'networkidle' });
  await page.waitForSelector('.atlas-topbar');
  assert.equal(await page.locator('.premium-shell').isVisible(), true, 'premium-shell is not visible');
  assert.equal(await page.locator('.atlas-context-bar').isVisible(), true, 'atlas-context-bar is not visible');
  assert.equal(await page.locator('.atlas-command-trigger').isVisible(), true, 'atlas-command-trigger is not visible');
  assert.equal(await page.locator('.spatial-navigation-hud').isVisible(), true, 'spatial-navigation-hud is not visible');
  assert.equal(await page.locator('[aria-label="Navegação principal"] a').count(), 4);
  assert.equal(await page.locator('.graphs-page').isVisible(), true);
  await page.screenshot({ path: path.join(screenshotDir, 'preview-desktop.png'), fullPage: true });

  await page.getByRole('link', { name: 'OBSERVATÓRIO' }).click();
  await expectRoute(page, '/observatory');
  for (const id of ['knowledge-map-panel', 'weighted-h0-panel', 'hubble-tension-panel', 'directional-signal-panel', 'universe-snapshot-panel']) {
    assert.equal(await page.locator('#' + id).isVisible(), true, id + ' is not visible');
  }
  assert.ok((await page.locator('#weighted-h0-panel').textContent()).includes('H0 ponderado'));
  assert.ok((await page.locator('#directional-signal-panel').textContent()).length > 0);
  await page.screenshot({ path: path.join(screenshotDir, 'preview-observatory.png'), fullPage: true });

  await page.locator('.filter-bar select').first().selectOption('D3');
  await expectRoute(page, '/observatory');
  assert.equal(new URL(page.url()).searchParams.get('domain'), 'D3');
  assert.ok((await page.locator('.filter-bar').textContent()).includes('D3'));
  await page.getByRole('button', { name: 'ABRIR NO MODO GRAFOS' }).click();
  await expectRoute(page, '/graphs/science/d3');

  await page.getByRole('link', { name: 'LABORATÓRIO' }).click();
  await expectRoute(page, '/lab');
  assert.equal(await page.locator('#lab-knowledge-map').isVisible(), true);
  assert.equal(await page.locator('#lab-stages').isVisible(), true);
  assert.ok((await page.locator('.pipeline-strip').textContent()).includes('HYPOTHESIS'));
  assert.ok((await page.locator('.read-only-notice').textContent()).includes('somente leitura'));

  await page.getByRole('link', { name: 'RESUMO DO UNIVERSO' }).click();
  await expectRoute(page, '/universe');
  assert.equal(await page.locator('#universe-parameters').isVisible(), true);
  assert.equal(await page.locator('.universe-questions').isVisible(), true);
  const universeText = await page.locator('.universe-page').textContent();
  assert.ok(universeText.includes('Sem síntese publicada') || universeText.includes('Parâmetros publicados'));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'GRAFOS' }).click();
  await page.waitForSelector('.graphs-page');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile graph horizontal overflow');
  assert.equal(await page.locator('.atlas-context-bar').isVisible(), true, 'mobile context bar is not visible');
  assert.equal(await page.locator('.spatial-navigation-hud').isVisible(), true, 'mobile graph HUD is not visible');
  assert.equal(await page.locator('.atlas-command-trigger').isVisible(), true, 'mobile command entry is not visible');
  await page.screenshot({ path: path.join(screenshotDir, 'preview-graph-mobile.png'), fullPage: true });

  await page.getByRole('link', { name: 'OBSERVATÓRIO' }).click();
  await expectRoute(page, '/observatory');
  await page.screenshot({ path: path.join(screenshotDir, 'preview-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile horizontal overflow');
  assert.equal(await page.locator('.atlas-topbar').isVisible(), true);
  await page.getByRole('link', { name: 'LABORATÓRIO' }).click();
  await expectRoute(page, '/lab');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'lab mobile horizontal overflow');

  await page.keyboard.press('Control+k');
  assert.equal(await page.locator('#global-search').evaluate(element => element === document.activeElement), true, 'command palette shortcut did not focus search');
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS NEXO Atlas premium browser acceptance: shell, graph context/HUD, routes, mobile graph, responsive layout, keyboard search, no page errors');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
