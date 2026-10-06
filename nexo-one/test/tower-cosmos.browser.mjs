// Real-browser check of the 3D Tower web (#/teia). Synthetic data only. Run: npm run test:cosmos-browser
// Covers: WebGL filament ribbons + node points (draw calls measured from renderer.info), dark/light palette without warm hues, search / filters /
// quality / replay, selection + camera surviving a new generation, reduced motion, Canvas fallback without WebGL, phone portrait, dense and
// empty data. Pixels are read from screenshots taken after render (the renderer does not keep its drawing buffer).
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {buildPrivateUi} from '../scripts/build-private-ui.mjs';
import {startBackend} from './helpers/private-backend.mjs';
import {FP2, makeRuntime, makeTowerSystem} from './helpers/synthetic-runtime.mjs';

const shots = process.env.TOWER_SHOTS; if (shots) mkdirSync(shots, {recursive: true});
const privateDir = mkdtempSync(join(tmpdir(), 'priv-')), publicDir = mkdtempSync(join(tmpdir(), 'pub-'));
await buildPrivateUi(privateDir);
assert.equal(spawnSync('npx', ['vite', 'build', '--outDir', publicDir, '--emptyOutDir'], {cwd: new URL('../', import.meta.url).pathname}).status, 0);
const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}).catch(() => chromium.launch());
const results = {}; const N = 240, N2 = 300; const fp = c => `sha256:${c.repeat(16)}`;
const be = await startBackend({privateDir, publicDir, runtime: makeRuntime({system: makeTowerSystem(N)})});
const errors = [], requests = [], contexts = [];

/** logs in and opens #/teia in a fresh context */
async function open(options = {}, init = null) {
  const ctx = await browser.newContext({viewport: {width: 1400, height: 900}, ...options}); contexts.push(ctx); if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e).slice(0, 200))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('request', r => { if (r.frame() !== page.mainFrame()) requests.push(r.url()); });
  await page.goto(`${be.base}/#/privado`); await page.fill('#atlas-pin', 'synthetic-code-1'); await page.click('button:has-text("Entrar")');
  await page.waitForSelector('iframe.atlas-private-frame'); const fl = page.frameLocator('iframe.atlas-private-frame');
  await fl.locator('.cockpit').first().waitFor({timeout: 20000});
  const frame = () => page.frames().find(f => f !== page.mainFrame());
  await frame().evaluate(() => { location.hash = '#/teia'; }); await fl.locator('[data-testid=tower-cosmos] canvas.tc-2d').waitFor({timeout: 45000}); await page.waitForTimeout(700);
  const stage = () => frame().locator('.tc-stage'); const attr = k => stage().getAttribute(k); const num = async k => Number(await attr(k));
  const count = () => frame().locator('[data-testid=tower-count]').innerText();
  /** pixels of the stage read from a screenshot: {lit: differs from the background, warm: red clearly above green and blue, bg: [r,g,b] of a corner} */
  const pixels = async () => {
    const box = await frame().locator('.tc-stage').boundingBox(); const fb = await page.locator('iframe.atlas-private-frame').boundingBox();
    const png = await page.screenshot({clip: {x: fb.x + box.x, y: fb.y + box.y, width: box.width, height: box.height}});
    return page.evaluate(async b64 => { const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, img.width, img.height).data; const bg = [d[8 * 4], d[8 * 4 + 1], d[8 * 4 + 2]]; let lit = 0, warm = 0; for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 36) lit += 1; if (d[i] > d[i + 1] + 14 && d[i] > d[i + 2] + 14) warm += 1; } return {lit, warm, bg}; }, png.toString('base64'));
  };
  /** warm pixels anywhere in the whole view (bar, canvas and inspector) */
  const warmAll = async () => { const fb = await page.locator('iframe.atlas-private-frame').boundingBox(); const png = await page.screenshot({clip: fb}); return page.evaluate(async b64 => { const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, img.width, img.height).data; let warm = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > d[i + 1] + 14 && d[i] > d[i + 2] + 14) warm += 1; return warm; }, png.toString('base64')); };
  const shot = async name => { if (shots) await page.screenshot({path: join(shots, name)}); };
  return {ctx, page, fl, frame, stage, attr, num, count, pixels, warmAll, shot};
}

try {
  // ---------- desktop, dark ----------
  const d = await open(); const {page, frame, attr, num, count, pixels} = d;
  const TOTAL = 3 + 12 + 60 + N; assert.equal(await count(), `${TOTAL}/${TOTAL} nós`); assert.equal(await num('data-total'), TOTAL);
  assert.equal(await frame().locator('.cockpit').count(), 0, 'legacy app unmounted on #/teia');
  assert.equal(await attr('data-renderer'), 'webgl', 'WebGL2 active (software GL in CI)'); assert.match(await frame().locator('[data-testid=tower-renderer]').innerText(), /WebGL2/);
  const calls = await num('data-draw-calls'); assert.ok(calls >= 1 && calls <= 6, `draw calls ${calls}`); results.drawCalls = calls;
  const cv = d.fl.locator('canvas.tc-2d'); const box = await cv.boundingBox();
  const p0 = await pixels(); assert.ok(p0.lit > 2500, `web painted (${p0.lit})`); assert.equal(p0.warm, 0, 'no warm pixel in the dark theme'); assert.ok(p0.bg.every(v => v <= 2), `black background ${p0.bg}`);
  results.litShareDark = Number((p0.lit / (box.width * box.height)).toFixed(3)); assert.ok(results.litShareDark > 0.06 && results.litShareDark < 0.45, `a continuous structure with voids, not a filled screen: ${results.litShareDark} of the canvas is lit`);
  assert.match(await frame().locator('[data-testid=tower-visual-note]').innerText(), /representação artística de densidade, guiada pela rede real: não é gás observado nem dado físico[\s\S]*Nenhum vínculo é inferido/, 'the artistic character of the cloud is stated');
  assert.equal(await attr('data-drift'), '', 'first view has no drift'); assert.equal(await d.warmAll(), 0, 'no warm pixel in the whole dark view (bar, links, inspector)'); await d.shot('teia-dark.png');

  // orbit / zoom / fit
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2; const cam0 = await attr('data-cam');
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 140, cy + 40, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(200);
  assert.notEqual(await attr('data-cam'), cam0, 'orbit moved the camera');
  for (let i = 0; i < 3; i += 1) await page.mouse.wheel(0, -250); await page.waitForTimeout(200); const zoomed = await attr('data-cam'); assert.ok(Number(zoomed.split('|')[2]) < Number(cam0.split('|')[2]));
  await frame().locator('button', {hasText: 'Ajustar'}).click(); for (let k = 0; k < 60 && (await attr('data-cam')).split('|')[2] !== cam0.split('|')[2]; k += 1) await page.waitForTimeout(100); // software GL frames are slow: wait for the flight to land
  assert.equal((await attr('data-cam')).split('|')[2], cam0.split('|')[2], 'Ajustar restores the framing distance');

  // hover + click a node
  const tip = frame().locator('.tc-tip'); let hit = null;
  for (let gy = 0.2; gy < 0.85 && !hit; gy += 0.05) for (let gx = 0.2; gx < 0.8 && !hit; gx += 0.04) { await page.mouse.move(box.x + box.width * gx, box.y + box.height * gy); if (await tip.isVisible()) hit = {x: box.x + box.width * gx, y: box.y + box.height * gy}; }
  assert.ok(hit, 'a node answers hover'); assert.match(await tip.innerText(), /^(Domínio|Subdomínio|Campanha|Teste) · .+ · \d+ conex/);
  const t0 = Date.now(); await page.mouse.click(hit.x, hit.y); const selPanel = frame().locator('[data-testid=tower-selection]'); await selPanel.waitFor(); results.selectMs = Date.now() - t0;
  assert.ok((await attr('data-selected')).length > 0); assert.match(await selPanel.innerText(), /Conexões/);
  await cv.focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(120); assert.equal(await attr('data-selected'), ''); assert.equal(await selPanel.count(), 0);

  // search by existing id with the keyboard only: "/" focuses, arrows move, Enter focuses the node
  await page.keyboard.press('/'); assert.equal(await frame().evaluate(() => document.activeElement?.getAttribute('role')), 'combobox');
  await page.keyboard.type('syn-t0012'); const list = frame().locator('#tc-results'); await list.waitFor(); assert.equal(await list.locator('[role=option]').count(), 1);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await selPanel.waitFor(); assert.equal(await attr('data-selected'), 'test:syn-t0012');
  assert.match(await selPanel.innerText(), /syn-t0012/); assert.match(await selPanel.innerText(), /Fontes e evidências/); assert.match(await selPanel.innerText(), /indisponível/, 'missing metadata is shown as unavailable, not invented');
  // everyday language for states; the published codes stay available, untouched, in the technical detail only
  { const txt = await selPanel.innerText(); assert.match(txt, /Situação\s+Em revisão/); assert.match(txt, /Andamento\s+Execução terminada/); assert.match(txt, /Revisão\s+Aguardando revisão/); assert.doesNotMatch(txt, /PENDING_REVIEW|\bDONE\b|\bREVIEW\b/, 'no raw code in the reading view');
    assert.match(await frame().locator('[data-testid=tower-state-meaning]').innerText(), /ainda não é uma conclusão confirmada/);
    await selPanel.locator('details.tc-tech summary').click(); const tech = await selPanel.locator('details.tc-tech').innerText(); assert.match(tech, /Detalhe técnico/); assert.match(tech, /REVIEW/); assert.match(tech, /DONE/); assert.match(tech, /PENDING_REVIEW/); await selPanel.locator('details.tc-tech summary').click(); }
  // locale bridge: the shell's real language preference reaches the frame through the guarded channel; only words change (no remount, same camera / selection / generation)
  { const before = [await attr('data-cam'), await attr('data-selected'), await attr('data-generation'), await num('data-total')]; const mark = await frame().evaluate(() => (window.__keep = Math.random()));
    const sw = name => page.evaluate(n => { const b = [...document.querySelectorAll('.atlas-seg button')].find(x => x.textContent.trim() === n); if (!b) throw new Error('no locale switch ' + n); b.click(); }, name);
    assert.equal(await frame().evaluate(() => document.documentElement.lang), 'pt-BR'); await sw('EN');
    await frame().waitForFunction(() => document.documentElement.lang === 'en', null, {timeout: 5000}); await frame().locator('[data-testid=tower-state]', {hasText: 'Under review'}).waitFor({timeout: 5000});
    const en = await selPanel.innerText(); assert.match(en, /Run finished/); assert.match(en, /Waiting for review/); assert.match(en, /Technical detail/); assert.match(await frame().locator('[data-testid=tower-state-meaning]').innerText(), /not a confirmed conclusion yet/);
    assert.match(en, /Fontes e evidências/, 'the rest of this view is still PT-BR: only the state language is bilingual so far');
    assert.deepEqual([await attr('data-cam'), await attr('data-selected'), await attr('data-generation'), await num('data-total')], before, 'camera, selection, generation and data untouched'); assert.equal(await frame().evaluate(() => window.__keep), mark, 'the frame document was not reloaded');
    await sw('PT-BR'); await frame().locator('[data-testid=tower-state]', {hasText: 'Em revisão'}).waitFor({timeout: 5000}); assert.equal(await frame().evaluate(() => document.documentElement.lang), 'pt-BR'); }
  await cv.focus(); assert.equal(await frame().evaluate(() => document.activeElement?.classList.contains('tc-2d')), true, 'the canvas takes focus back');
  const nb = frame().locator('[data-testid=tower-neighbours] button'); assert.ok(await nb.count() >= 1); assert.match(await nb.first().innerText(), /pertence a|depende de|é pré-requisito de|contém/);
  await page.waitForTimeout(600); await d.shot('teia-dark-selecao.png');
  await nb.first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150); assert.notEqual(await attr('data-selected'), 'test:syn-t0012', 'a neighbour is reachable by keyboard');
  await page.keyboard.press('/'); await page.keyboard.type('zzz-nada'); assert.match(await list.innerText(), /Nenhum rótulo ou ID corresponde/); await page.keyboard.press('Escape'); assert.equal(await frame().locator('.tc-search input').inputValue(), '');

  // filters: visibility only, visible/total, clear
  await frame().locator('button[aria-controls=tc-filters]').click(); const fp0 = frame().locator('#tc-filters');
  await cv.focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(150); const full = await pixels();
  await fp0.locator('label', {hasText: 'Teste'}).locator('input').uncheck(); assert.equal(await count(), `75/${TOTAL} nós`); await page.waitForTimeout(150); const few = await pixels(); assert.ok(few.lit < full.lit * 0.8, `fewer nodes drawn (${few.lit} < ${full.lit})`);
  await fp0.locator('input[type=range]').fill('6'); const hubs = Number((await count()).split('/')[0]); assert.ok(hubs > 0 && hubs < 75, `hubs ${hubs}`);
  assert.match(await frame().locator('button[aria-controls=tc-filters]').innerText(), /\(2\)/);
  await fp0.locator('button', {hasText: 'Limpar filtros'}).click(); assert.equal(await count(), `${TOTAL}/${TOTAL} nós`); await frame().locator('button[aria-controls=tc-filters]').click(); assert.equal(await fp0.count(), 0);

  // quality: low = DPR 1, high <= 1.5
  const q = frame().locator('select[aria-label=Qualidade]'); await q.selectOption('low'); await page.waitForTimeout(250); assert.equal(await attr('data-quality'), 'low');
  assert.equal(await cv.evaluate(c => c.width / c.getBoundingClientRect().width), 1); assert.ok((await pixels()).lit > 1500);
  await q.selectOption('high'); await page.waitForTimeout(250); assert.equal(await attr('data-quality'), 'high'); assert.ok(await cv.evaluate(c => c.width / c.getBoundingClientRect().width) <= 1.5);

  // replay over real creation dates; tests without a published date are declared
  const rp = frame().locator('[data-testid=tower-replay]'); assert.match(await rp.innerText(), /Hoje · 10 testes sem data publicada ficam fora do replay/);
  const slider = frame().locator('input[aria-label="Replay no tempo"]'); const [lo, hi] = [Number(await slider.getAttribute('min')), Number(await slider.getAttribute('max'))];
  await slider.fill(String(Math.round(lo + (hi - lo) * 0.4))); await page.waitForTimeout(200); assert.match(await rp.innerText(), /^20\d\d-\d\d-\d\d/); const mid = Number((await count()).split('/')[0]); assert.ok(mid > 20 && mid < TOTAL - 20, `replay shows ${mid}`);
  await frame().locator('button', {hasText: 'Voltar a hoje'}).click(); assert.equal(await count(), `${TOTAL}/${TOTAL} nós`);

  // illustrative ΛCDM motion: disclosed, gated by its toggle, stops stepping when off
  assert.equal(await attr('data-physics-model'), 'illustrative-flat-lcdm-toy'); assert.match(await frame().locator('[data-testid=tower-physics]').innerText(), /ilustrativo[\s\S]*sem massas inferidas dos registros[\s\S]*peso visual igual/);
  await page.waitForTimeout(900); const st1 = await num('data-physics-steps'); assert.ok(st1 > 3, `physics stepping (${st1})`);
  const lc = frame().locator('label', {hasText: 'Dinâmica ΛCDM'}).locator('input'); await lc.uncheck(); await page.waitForTimeout(250); const off = await num('data-physics-steps'); await page.waitForTimeout(600); assert.equal(await num('data-physics-steps'), off); assert.equal(await attr('data-motion'), 'off');

  // light theme: white + ink, light cyan is not the mark, no warm pixel, no bloom
  await frame().locator('button', {hasText: 'Ajustar'}).click(); await page.waitForTimeout(650);
  await frame().evaluate(() => { document.documentElement.dataset.theme = 'light'; }); await frame().locator('.tc[data-theme=light]').waitFor(); await page.waitForTimeout(700);
  const lp = await pixels(); assert.ok(lp.bg.every(v => v >= 253), `white background ${lp.bg}`); assert.ok(lp.lit > 2500, `ink web painted (${lp.lit})`); assert.equal(lp.warm, 0, 'no warm pixel in the light theme');
  results.litShareLight = Number((lp.lit / (box.width * box.height)).toFixed(3)); assert.ok(results.litShareLight > 0.06 && results.litShareLight < 0.45); assert.equal(await d.warmAll(), 0, 'no warm pixel in the whole light view'); await d.shot('teia-light.png');
  await frame().evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await frame().locator('.tc[data-theme=dark]').waitFor();

  // growth: a bigger NEW generation; ids, warm start, camera and selection survive the remount
  await page.keyboard.press('/'); await page.keyboard.type('syn-t0100'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 90, cy + 30, {steps: 5}); await page.mouse.up(); await page.waitForTimeout(250);
  results.desktopFrameMsSoftwareGl = await attr('data-frame-ms');
  const camBefore = await attr('data-cam'), genBefore = await frame().locator('[data-testid=tower-generation]').innerText();
  be.st.runtime = makeRuntime({system: makeTowerSystem(N2, FP2), generated_at: '2030-01-02T00:00:00.000Z'}, FP2);
  await frame().locator('button', {hasText: 'Atualizar agora'}).click(); await frame().locator('[data-testid=tower-births]').waitFor({timeout: 15000});
  assert.match(await frame().locator('[data-testid=tower-births]').innerText(), /\+60 testes novos/); assert.equal(await count(), `${3 + 12 + 60 + N2}/${3 + 12 + 60 + N2} nós`);
  assert.notEqual(await frame().locator('[data-testid=tower-generation]').innerText(), genBefore); await page.waitForTimeout(400);
  assert.equal(await attr('data-selected'), 'test:syn-t0100', 'selection survives the new generation'); assert.equal(await attr('data-cam'), camBefore, 'camera survives the new generation');
  const drift = await num('data-drift'); assert.ok(drift >= 0 && drift < 0.05, `drift ${drift}`); assert.match(await frame().locator('[data-testid=tower-history]').innerText(), /240 → 300 \(\+60\)/);
  await d.shot('teia-dark-crescimento.png'); results.growth = {drift, camBefore};
  await frame().locator('button', {hasText: 'Redefinir'}).click(); await page.waitForTimeout(600); assert.equal(await attr('data-selected'), ''); assert.equal(await frame().locator('.tc-search input').inputValue(), '');

  // organogram stays reachable; back to the legacy app works
  await frame().locator('.tc-bar a', {hasText: 'Organograma'}).click(); await d.fl.locator('[data-testid=tower-web] canvas').waitFor();
  await frame().evaluate(() => { location.hash = '#/agora'; }); await d.fl.locator('.cockpit').first().waitFor({timeout: 10000});

  // ---------- phone portrait: low quality, bottom sheet, 44 px targets, nothing clipped ----------
  const m = await open({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, deviceScaleFactor: 3});
  assert.equal(await m.attr('data-quality'), 'low'); assert.equal(await m.frame().locator('.tc-side').count(), 0, 'inspector closed by default on phones');
  assert.equal(await m.fl.locator('canvas.tc-2d').evaluate(c => c.width / c.getBoundingClientRect().width), 1, 'DPR 1 on phones');
  assert.ok((await m.pixels()).lit > 800); await m.shot('teia-mobile.png');
  await m.frame().locator('button', {hasText: 'Painel'}).tap(); await m.frame().locator('.tc-side').waitFor(); await m.page.waitForTimeout(300);
  const geo = await m.frame().evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const st = r('.tc-stage'), sd = r('.tc-side'); return {stage: [st.top, st.bottom, st.height], side: [sd.top, sd.bottom], vh: innerHeight, vw: innerWidth, sw: document.documentElement.scrollWidth, small: [...document.querySelectorAll('.tc-btn, .tc-search input, .tc-q select')].filter(e => e.getBoundingClientRect().height < 44).length}; });
  assert.ok(geo.stage[1] <= geo.side[0] + 1, 'the sheet sits below the canvas, it does not cover it'); assert.ok(geo.stage[2] > 250, `canvas keeps ${geo.stage[2]} px`); assert.ok(geo.side[1] <= geo.vh + 1); assert.ok(geo.sw <= geo.vw, 'no horizontal page scroll'); assert.equal(geo.small, 0, '44 px touch targets');
  assert.ok((await m.pixels()).lit > 500, 'the web is re-framed in the smaller canvas'); await m.shot('teia-mobile-painel.png');
  await m.ctx.close();

  // ---------- no WebGL + reduced motion: Canvas fallback, honest renderer label, no fly / pulse / autoplay ----------
  const nogl = await open({reducedMotion: 'reduce'}, () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...a) { return /webgl/i.test(type) ? null : g.call(this, type, ...a); }; });
  assert.equal(await nogl.attr('data-renderer'), 'canvas'); assert.match(await nogl.frame().locator('[data-testid=tower-renderer]').innerText(), /Canvas 2D \(WebGL2 indisponível/);
  const fbk = await nogl.pixels(); assert.ok(fbk.lit > 2500, `fallback painted (${fbk.lit})`); assert.equal(fbk.warm, 0); assert.ok(fbk.bg.every(v => v <= 2));
  assert.equal(await nogl.attr('data-motion'), 'off'); assert.equal(await nogl.frame().locator('button', {hasText: 'Reproduzir'}).isDisabled(), true, 'no autoplay under reduced motion');
  assert.equal(await nogl.frame().locator('label', {hasText: 'Dinâmica ΛCDM'}).locator('input').isDisabled(), true); assert.equal(await nogl.attr('data-physics-steps'), null, 'no physics step under reduced motion');
  await nogl.fl.locator('canvas.tc-2d').focus(); await nogl.page.keyboard.press('/'); await nogl.page.keyboard.type('syn-t0033'); const camStart = await nogl.attr('data-cam'); await nogl.page.keyboard.press('Enter'); for (let k = 0; k < 40 && (await nogl.attr('data-cam')) === camStart; k += 1) await nogl.page.waitForTimeout(50);
  assert.equal(await nogl.attr('data-selected'), 'test:syn-t0033'); const camA = await nogl.attr('data-cam'); assert.notEqual(camA, camStart, 'the camera went to the node'); await nogl.page.waitForTimeout(500); assert.equal(await nogl.attr('data-cam'), camA, 'no camera flight: the first frame after Enter is already the final camera (a flight would pass through intermediate values for 420 ms)');
  await nogl.shot('teia-fallback-canvas.png'); await nogl.ctx.close();

  // ---------- dense synthetic data: sampling is declared, the selection keeps its threads ----------
  const DENSE = 3000; be.st.runtime = makeRuntime({system: makeTowerSystem(DENSE, fp('ef56')), generated_at: '2030-01-03T00:00:00.000Z'}, fp('ef56'));
  const dense = await open(); assert.ok((await dense.count()).startsWith(`${3 + 12 + 60 + DENSE}/${3 + 12 + 60 + DENSE} nós`)); assert.equal(await dense.attr('data-quality'), 'low', 'Auto starts dense data in low detail');
  await dense.frame().locator('select[aria-label=Qualidade]').selectOption('low'); await dense.page.waitForTimeout(400);
  const smp = dense.frame().locator('[data-testid=tower-sample]'); await smp.waitFor(); const [, shown, total] = /(\d+)\/(\d+) fios \(amostra\)/.exec(await smp.innerText()); assert.ok(Number(shown) < Number(total) && Number(shown) > 3000 && Number(shown) < 5200, `sample ${shown}/${total}`);
  const dp = await dense.pixels(); assert.ok(dp.lit > 4000); assert.equal(dp.warm, 0); const dcalls = await dense.num('data-draw-calls'); assert.ok(dcalls <= 6);
  { const b = await dense.fl.locator('canvas.tc-2d').boundingBox(); await dense.page.mouse.move(b.x + 300, b.y + 300); await dense.page.mouse.down(); await dense.page.mouse.move(b.x + 520, b.y + 380, {steps: 40}); await dense.page.mouse.up(); await dense.page.waitForTimeout(300); }
  await dense.shot('teia-densa.png'); results.dense = {nodes: 3 + 12 + 60 + DENSE, edges: Number(total), shown: Number(shown), drawCalls: dcalls, frameMsSoftwareGl: await dense.attr('data-frame-ms')};
  await dense.ctx.close();

  // ---------- empty generation ----------
  be.st.runtime = makeRuntime({system: makeTowerSystem(0, fp('0a1b')), generated_at: '2030-01-04T00:00:00.000Z'}, fp('0a1b'));
  const empty = await open(); assert.equal(await empty.count(), '0/0 nós'); assert.match(await empty.frame().locator('.tc-empty').innerText(), /Nenhum teste publicado nesta geração/);
  assert.match(await empty.frame().locator('[data-testid=tower-replay]').innerText(), /Replay indisponível/); await empty.ctx.close();

  const origin = new URL(be.base).origin;
  assert.deepEqual(requests.filter(u => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')), [], 'no foreign requests');
  assert.equal(requests.some(u => /workflow|dispatch|github|\/api\/(recall|mcp|system|world)\b/i.test(u)), false);
  assert.deepEqual(errors, [], 'no uncaught errors');
  results.ok = true;
} finally { console.log(JSON.stringify(results)); for (const c of contexts) await c.close().catch(() => {}); await be.close(); await browser.close(); rmSync(privateDir, {recursive: true, force: true}); rmSync(publicDir, {recursive: true, force: true}); }
