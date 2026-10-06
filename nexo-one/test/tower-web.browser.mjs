// Real-browser check of the Tower web (#/teia) inside the private frame. Synthetic data only. Run: npm run test:tower-browser
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {buildPrivateUi} from '../scripts/build-private-ui.mjs';
import {startBackend} from './helpers/private-backend.mjs';
import {makeRuntime, makeTowerSystem} from './helpers/synthetic-runtime.mjs';

const shots = process.env.TOWER_SHOTS; if (shots) mkdirSync(shots, {recursive: true});
const privateDir = mkdtempSync(join(tmpdir(), 'priv-')), publicDir = mkdtempSync(join(tmpdir(), 'pub-'));
await buildPrivateUi(privateDir);
assert.equal(spawnSync('npx', ['vite', 'build', '--outDir', publicDir, '--emptyOutDir'], {cwd: new URL('../', import.meta.url).pathname}).status, 0);
const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}).catch(() => chromium.launch());
const results = {};
const N = 240;
const be = await startBackend({privateDir, publicDir, runtime: makeRuntime({system: makeTowerSystem(N)})});
const ctx = await browser.newContext({viewport: {width: 1400, height: 900}});
const page = await ctx.newPage();
const errors = [], requests = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('request', r => { if (r.frame() !== page.mainFrame()) requests.push(r.url()); }); // the private frame only; the public shell is out of scope here
try {
  await page.goto(`${be.base}/#/privado`);
  await page.fill('#atlas-pin', 'synthetic-code-1'); await page.click('button:has-text("Entrar")');
  await page.waitForSelector('iframe.atlas-private-frame');
  const fl = page.frameLocator('iframe.atlas-private-frame');
  await fl.locator('.cockpit').first().waitFor({timeout: 20000});
  const frame = page.frames().find(f => f !== page.mainFrame());
  await frame.evaluate(() => { location.hash = '#/teia/organograma'; });
  await fl.locator('[data-testid=tower-web] canvas').waitFor({timeout: 15000});
  await page.waitForTimeout(500);
  const stat = k => frame.locator(`[data-stat=${k}]`).innerText();
  assert.equal(await stat('tests'), String(N)); assert.equal(await stat('domains'), '3'); assert.equal(await stat('campaigns'), '60'); assert.equal(await stat('subdomains'), '12');
  assert.ok(Number(await stat('dependencies')) > N - 10);
  assert.equal(await frame.locator('.cockpit').count(), 0, 'legacy app is unmounted on #/teia');
  const cv = fl.locator('canvas'); const box = await cv.boundingBox();
  const painted = async () => frame.evaluate(() => { const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const bg = [d[0], d[1], d[2]]; let n = 0; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) n += 1; return n; });
  const p0 = await painted(); assert.ok(p0 > 2000, `canvas painted (${p0})`);
  if (shots) await page.screenshot({path: join(shots, 'teia-fit.png')});

  // hover + select: sweep the stage until a node answers
  const tip = frame.locator('.tw-tip');
  let hit = null;
  outer: for (let r = 40; r < Math.min(box.width, box.height) / 2; r += 14) for (let a = 0; a < 360; a += 9) {
    const x = box.x + box.width / 2 + r * Math.cos(a * Math.PI / 180), y = box.y + box.height / 2 + r * Math.sin(a * Math.PI / 180);
    await page.mouse.move(x, y); if (await tip.isVisible()) { hit = {x, y}; break outer; }
  }
  assert.ok(hit, 'a node answers hover with a tooltip'); assert.match(await tip.innerText(), /Torre|Domínio|Subdomínio|Campanha|Teste/);
  await page.mouse.click(hit.x, hit.y); await page.waitForTimeout(150);
  const sel = frame.locator('[data-testid=tower-selection]'); await sel.waitFor();
  assert.match(await sel.innerText(), /Tipo/);
  // select a test through the hierarchy list and read its graph metrics
  await frame.locator('aside details summary button').nth(1).click(); await page.waitForTimeout(100);
  // layers toggle redraws
  const before = await painted();
  for (const label of ['Hierarquia', 'Dependências', 'Caminho crítico', 'Pontos de articulação', 'Vazios']) await frame.locator('label', {hasText: label}).locator('input').uncheck();
  await page.waitForTimeout(200); const bare = await painted(); assert.ok(bare < before, `layers off paints less (${bare} < ${before})`);
  for (const label of ['Hierarquia', 'Dependências', 'Caminho crítico', 'Pontos de articulação', 'Vazios']) await frame.locator('label', {hasText: label}).locator('input').check();
  // zoom + pan change the view, double click refits
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, -300);
  await page.waitForTimeout(150); const zoomed = await painted(); assert.notEqual(zoomed, p0, 'wheel zoom changes the picture');
  await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 420, box.y + 360, {steps: 6}); await page.mouse.up();
  if (shots) await page.screenshot({path: join(shots, 'teia-zoom.png')});
  await cv.dblclick({position: {x: 50, y: 50}}); await page.waitForTimeout(150);
  assert.equal(await painted(), p0, 'double click restores the fitted view');
  // keyboard: canvas focusable, Escape clears the selection
  await cv.focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.equal(await sel.count(), 0, 'Escape clears the selection');

  // redraw cost on the 240-test fixture (on-demand rendering, no idle loop)
  const perf = await frame.evaluate(async () => {
    const c = document.querySelector('canvas'); const t0 = performance.now(); let frames = 0;
    await new Promise(res => { const fire = () => { c.dispatchEvent(new WheelEvent('wheel', {deltaY: frames % 2 ? 40 : -40, clientX: 400, clientY: 300, cancelable: true})); frames += 1; if (frames < 60) requestAnimationFrame(fire); else requestAnimationFrame(res); }; fire(); });
    return (performance.now() - t0) / frames;
  });
  assert.ok(perf < 50, `mean frame ${perf.toFixed(1)} ms`); results.msPerFrame = Number(perf.toFixed(1));
  // 'light' theme + legend
  assert.ok(await frame.locator('.tw-legend').first().innerText());

  // back to the legacy app
  await frame.locator('header a', {hasText: 'Atlas'}).click();
  await fl.locator('.cockpit').first().waitFor({timeout: 10000});
  assert.equal(await frame.locator('[data-testid=tower-web]').count(), 0);
  // the Tower web may be revisited and the legacy app is not broken
  await frame.evaluate(() => { location.hash = '#/teia/organograma'; }); await fl.locator('canvas').waitFor();
  await frame.evaluate(() => { location.hash = '#/agora'; }); await fl.locator('.cockpit').first().waitFor();

  const origin = new URL(be.base).origin;
  assert.deepEqual(requests.filter(u => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')), [], 'no foreign requests');
  assert.equal(requests.some(u => /\/api\/(recall|mcp|system|world)\b/.test(u)), false);
  assert.deepEqual(errors, [], 'no uncaught errors');
  results.painted = p0; results.ok = true;
} finally { await ctx.close(); await be.close(); await browser.close(); rmSync(privateDir, {recursive: true, force: true}); rmSync(publicDir, {recursive: true, force: true}); }
console.log(JSON.stringify(results));
