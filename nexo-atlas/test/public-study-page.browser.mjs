// Investigation-page QA on the REAL application entry, fed by a SYNTHETIC catalog.
// Vite serves the app; the five editorial catalogs are swapped for invented ones and
// the public API is answered locally. No Tower, no credentials, no published value.
// Run: node test/public-study-page.browser.mjs   (STUDY_QA_OUTPUT=<dir> for screenshots)
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';
import {presentLabel} from '../src/atlas/presentNumbers.ts';
import {STUDY_ROUTE, SINGLE_STUDY_ROUTE, SYNTHETIC_STUDY_NOTICE} from './helpers/public-study.fixture.mjs';
import {startStudyServer} from './helpers/public-study-server.mjs';
import {testAnchors} from '../src/atlas/publicStudyRoutes.ts';

const output = process.env.STUDY_QA_OUTPUT ? resolve(process.env.STUDY_QA_OUTPUT) : null;
const widths = process.env.STUDY_QA_WIDTHS ? process.env.STUDY_QA_WIDTHS.split(',').map(Number) : [320, 390, 430, 1280];
const onlyChecks = process.env.STUDY_QA_ONLY ? process.env.STUDY_QA_ONLY.split('|').filter(Boolean) : [];
const site = await startStudyServer(), {origin, fixture, comparisons} = site;
if (output) { await mkdir(output, {recursive: true}); await writeFile(join(output, 'SYNTHETIC-FIXTURE.json'), JSON.stringify({notice: SYNTHETIC_STUDY_NOTICE, ...fixture, comparisons}, null, 2)); }
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
const report = {notice: SYNTHETIC_STUDY_NOTICE, selectedCheckPatterns: onlyChecks, checks: [], limitations: [
  'Vite development server with a synthetic catalog and locally answered APIs; not the production bundle, Worker, CDN or live data.',
  'Chromium desktop and touch emulation only; no physical iOS Safari or Android device.',
  'Timings are not network or production measurements.',
  'The v64 home keeps three text-only research lines; shareable line routes and links are intentionally not part of this port.',
]};
const pageErrors = [];

async function open({width, height = 900, locale = 'pt-BR', theme = 'dark', path = STUDY_ROUTE, reducedMotion = 'reduce'}) {
  const touch = width <= 430;
  const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, colorScheme: theme, locale: locale === 'en' ? 'en-US' : 'pt-BR', reducedMotion});
  await context.addInitScript(({theme, locale}) => { localStorage.setItem('atlas.theme', theme); localStorage.setItem('atlas.locale', locale); sessionStorage.setItem('nexo-motion-paused', 'true'); }, {theme, locale});
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => pageErrors.push(`${width}/${locale}/${theme}: ${error.message}`));
  await page.goto(origin + path, {waitUntil: 'domcontentloaded'});
  await page.locator('.nexo-study-page').waitFor();
  await page.locator('.atlas-question-group').waitFor();
  await page.evaluate(() => document.fonts.ready);
  return {page, context, label: `study-${width}-${locale}-${theme}`};
}
async function openHome({width=390,locale='pt-BR',theme='light'}={}) {
  const touch=width<=430,context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,hasTouch:touch,isMobile:touch,colorScheme:theme,locale:locale==='en'?'en-US':'pt-BR',reducedMotion:'reduce'});
  await context.addInitScript(({theme,locale})=>{localStorage.setItem('atlas.theme',theme);localStorage.setItem('atlas.locale',locale);sessionStorage.setItem('nexo-motion-paused','true');},{theme,locale});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>pageErrors.push(`${width}/${locale}/${theme}: ${error.message}`));
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await page.locator('.atlas-research-lines > li').first().waitFor();await page.locator('.nexo-research-hub').waitFor();
  return {page,context,label:`home-${width}-${locale}-${theme}`};
}
const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const shot = async (session, suffix, fullPage = false) => { if (output) await session.page.screenshot({path: join(output, `${session.label}${suffix}.png`), fullPage}); };
const overflow = page => page.evaluate(() => ({viewport: innerWidth, scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth}));
async function check(name, run) { if (onlyChecks.length && !onlyChecks.some(pattern => name.includes(pattern))) return; try { const evidence = await run(); report.checks.push({name, status: 'PASS', ...(evidence === undefined ? {} : {evidence})}); console.log(`PASS ${name}`); } catch (error) { report.checks.push({name, status: 'FAIL', error: error.message}); console.error(`FAIL ${name}: ${error.message}`); } }

try {
  await check('document head follows the investigation: title, canonical, og:url and description', async () => {
    const s = await open({width: 1280});
    const head = await s.page.evaluate(() => ({title: document.title, canonical: document.querySelector('link[rel=canonical]').href, og: document.querySelector('meta[property="og:url"]').content, description: document.querySelector('meta[name=description]').content, path: location.pathname}));
    assert.equal(head.path, STUDY_ROUTE);
    assert.match(head.title, /^SINTÉTICO: a medida de exemplo depende da faixa retirada\? \| Instituto de Pesquisa Nexo$/);
    assert.ok(head.canonical.endsWith(STUDY_ROUTE) && head.og.endsWith(STUDY_ROUTE), JSON.stringify(head));
    assert.match(head.description, /^SINTÉTICO: nos exemplos inventados/);
    assert.ok(head.description.length <= 201);
    await shot(s, '-top'); await s.context.close(); return head;
  });

  await check('English uses the approved institute name', async () => {
    const s = await open({width: 1280, locale: 'en'});
    assert.match(await s.page.title(), /\| Nexo Cosmology Institute$/);
    assert.equal((await s.page.locator('.atlas-brand small').innerText()).trim(), 'Nexo Cosmology Institute');
    assert.equal(await s.page.getByText(/Research Institute|Cosmology Lab/).count(), 0);
    await s.context.close();
  });

  await check('v64 research lines remain available as three text entries', async () => {
    const s = await openHome({width: 390});
    const items = s.page.locator('.atlas-research-lines > li');
    assert.equal(await items.count(), 3);
    const rows = await items.evaluateAll(nodes => nodes.map(node => ({
      id: node.getAttribute('data-line'),
      title: node.querySelector('h3')?.textContent?.trim() ?? '',
      body: node.querySelector('p')?.textContent?.trim() ?? '',
    })));
    assert.deepEqual(rows.map(row => row.id), ['expansion', 'structure', 'components']);
    const fold = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
    assert.deepEqual(rows.map(row => fold(row.title)), ['supernovas e expansao', 'estrutura em grande escala', 'modelos cosmologicos']);
    assert.ok(rows.every(row => row.body.length > 20), 'all three lines retain their explanatory text');
    const linkCount = await items.locator('a').count();
    await s.context.close();
    return {rows, linkCount, scope: 'existing v64 text entries only; no new shareable line route'};
  });
  await check('comparable figures appear at investigation level, with fixed percentage ticks and localised labels', async () => {
    const s = await open({width: 1280});
    const figures = s.page.locator('.nexo-question-figures');
    await figures.waitFor();
    assert.equal(await figures.locator('.nexo-comparison-card').count(), 2);
    // Newest group first, as in the gallery: B (six rows) then A (four rows).
    assert.deepEqual(await figures.locator('.nexo-comparison-card').evaluateAll(cards => cards.map(card => card.querySelectorAll('.nexo-bar-row').length)), [6, 4]);
    const labels = await figures.locator('.nexo-bar-heading > span').allInnerTexts();
    assert.ok(labels.length === 10 && labels.every(label => !/\d\.\d/.test(label) && !/,\s*·/.test(label)), JSON.stringify(labels.slice(0, 3)));
    // The catalog text itself still has the dot decimal and the joined separator.
    const raw = comparisons.groups[1].members[0].configuration['pt-BR'];
    assert.ok(/\d\.\d/.test(raw) && /,\s*·/.test(raw) && labels[0] === presentLabel(raw, 'pt-BR'), `${labels[0]} <- ${raw}`);
    await figures.locator('.nexo-technical-plot > summary').first().click();
    const plot = figures.locator('.nexo-plot-svg').first(); await plot.waitFor();
    const ticks = await plot.evaluate(svg => [...svg.querySelectorAll('text')].map(t => t.textContent.trim()).filter(t => /^\d+(?:[.,]\d+)?$/.test(t)));
    for (const tick of ['0', '25', '50', '75', '100']) assert.ok(ticks.includes(tick), `tick ${tick} in ${ticks}`);
    assert.ok(!ticks.some(t => /[.,]/.test(t)), `fractional tick in ${ticks}`);
    await figures.scrollIntoViewIfNeeded(); await settle(s.page); await shot(s, '-figures');
    await s.context.close(); return {labels: labels.slice(0, 2), ticks};
  });

  await check('CSV export keeps the catalog text byte for byte', async () => {
    const s = await open({width: 1280});
    const card = s.page.locator('.nexo-question-figures .nexo-comparison-card').nth(1);
    await card.locator('.nexo-technical-plot > summary').click();
    const [download] = await Promise.all([s.page.waitForEvent('download'), card.getByRole('button', {name: /CSV/}).click()]);
    const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    assert.ok(csv.includes(comparisons.groups[0].members[0].configuration['pt-BR']), 'configuration text unchanged in CSV');
    assert.ok(csv.includes('retirar z = 0.01–0.15'), 'dot decimals unchanged in CSV');
    assert.ok(csv.includes('https://nexoresearch.org/'), 'source URL column unchanged in CSV');
    await s.context.close();
  });

  await check('test list: search, grouping, and equal labels kept as separate records', async () => {
    const s = await open({width: 1280});
    await s.page.locator('.atlas-question-details > summary').click();
    const rows = s.page.locator('.atlas-test-variant');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 14);
    assert.equal(await s.page.locator('.atlas-question-section').count(), 2);
    const ordinals = await s.page.locator('.atlas-variant-ordinal').allInnerTexts();
    assert.equal(ordinals.length, 4, JSON.stringify(ordinals));
    assert.ok(ordinals.some(t => /^Registro 1 de 2 com este rótulo · publicado em /.test(t)) && ordinals.some(t => /^Registro 2 de 2/.test(t)));
    const ids = await rows.evaluateAll(list => list.map(el => el.id));
    assert.ok(ids.every(id => /^teste-[0-9a-f]{8}(?:-\d+)?$/.test(id)) && new Set(ids).size === 14, JSON.stringify(ids));
    const search = s.page.getByLabel('Buscar teste nesta investigação');
    await search.fill('conjunto c'); await settle(s.page);
    const matched = await rows.count();
    assert.ok(matched > 0 && matched < 14, String(matched));
    assert.match(await s.page.locator('.nexo-question-search [role=status]').innerText(), new RegExp(`^${matched} de 14 testes correspondem$`));
    await search.fill('zzqqxx'); await settle(s.page);
    assert.equal(await rows.count(), 0);
    await s.page.getByRole('button', {name: 'Limpar busca'}).click(); await settle(s.page);
    assert.equal(await rows.count(), 14);
    await rows.first().scrollIntoViewIfNeeded(); await shot(s, '-tests');
    await s.context.close(); return {ordinals, matched};
  });

  await check('a direct test link opens that test, keeps the address and focuses it', async () => {
    const first = await open({width: 1280});
    await first.page.locator('.atlas-question-details > summary').click();
    await first.page.locator('.atlas-test-variant').first().waitFor();
    const target = await first.page.locator('.atlas-test-variant').nth(6).evaluate(el => ({id: el.id, label: el.querySelector('.atlas-variant-detail').textContent}));
    await first.context.close();
    const s = await open({width: 390, height: 844, path: `${STUDY_ROUTE}#${target.id}`});
    const opened = s.page.locator(`#${target.id}`);
    await opened.waitFor(); await s.page.waitForFunction(id => document.getElementById(id)?.open, target.id);
    assert.equal(await s.page.evaluate(() => location.hash), `#${target.id}`);
    assert.equal(await s.page.locator('.atlas-test-variant[open]').count(), 1);
    assert.equal(await opened.locator('.atlas-public-test').count(), 1);
    assert.ok(await opened.evaluate(el => el.contains(document.activeElement)), 'focus moved into the linked test');
    await settle(s.page);
    const place = await opened.evaluate(el => ({top: el.getBoundingClientRect().top, header: document.querySelector('.atlas-header').getBoundingClientRect().bottom}));
    assert.ok(place.top >= place.header - 1 && place.top < place.header + 200, `linked test at ${place.top}px, sticky header ends at ${place.header}px`);
    await shot(s, '-direct-link');
    assert.equal(await s.page.evaluate(() => location.pathname), STUDY_ROUTE, 'direct test fragment keeps the investigation URL');
    await s.context.close(); return target;
  });

  await check('a real same-page source click mounts and opens a test when its list starts collapsed', async () => {
    const s = await open({width: 390, height: 844});
    const details = s.page.locator('.atlas-question-details').first();
    assert.equal(await details.getAttribute('open'), null, 'the question test list starts collapsed');
    const card = s.page.locator('.nexo-question-figures .nexo-comparison-card').first();
    await card.locator('.nexo-comparison-sources > summary').click();
    await card.locator('.nexo-comparison-sources li details > summary').first().click();
    const link = card.locator('.nexo-figure-sources a[href^="/pesquisa/"]').first();
    const href = await link.getAttribute('href'); assert.ok(href, 'figure exposes a local test link');
    const before = new URL(s.page.url()), destination = new URL(href, before), targetId = destination.hash.slice(1);
    assert.equal(destination.pathname, before.pathname, 'the click is an in-page hash navigation');
    assert.match(targetId, /^teste-[0-9a-f]{8}(?:-\d+)?$/);
    await link.click();
    await s.page.waitForFunction(({id, path}) => location.pathname === path && location.hash === `#${id}` && document.getElementById(id)?.matches('[open]') && document.querySelector('.atlas-question-details')?.open && document.getElementById(id)?.querySelector('.atlas-public-test'), {id: targetId, path: before.pathname});
    const target = s.page.locator(`[id="${targetId}"]`);
    assert.equal(await target.locator('.atlas-public-test').count(), 1, 'hash navigation mounts the target test article');
    assert.ok(await target.evaluate(el => el.contains(document.activeElement)), 'the mounted target receives focus');
    await s.page.goBack(); await s.page.waitForFunction(() => location.hash === '');
    await s.page.goForward();
    await s.page.waitForFunction(({id, path}) => location.pathname === path && location.hash === `#${id}` && document.getElementById(id)?.matches('[open]') && document.querySelector('.atlas-question-details')?.open, {id: targetId, path: before.pathname});
    assert.ok(await target.evaluate(el => el.contains(document.activeElement)), 'Forward reopens and refocuses the target');
    await s.context.close(); return {href, targetId, collapsedAtStart: true, samePath: true};
  });

  await check('an in-page source click opens a filtered test and Back/Forward follows the hash', async () => {
    const s = await open({width: 390, height: 844});
    await s.page.locator('.nexo-comparison-sources > summary').first().click();
    await s.page.locator('.nexo-comparison-sources li details > summary').first().click();
    const link = s.page.locator('.nexo-comparison-sources .nexo-figure-sources a[href^="/pesquisa/"]').first();
    const href = await link.getAttribute('href'); assert.ok(href, 'synthetic source link has a study target');
    assert.equal(new URL(href, s.page.url()).pathname, new URL(s.page.url()).pathname, 'the filtered link changes only the current page hash');
    const targetId = new URL(href, s.page.url()).hash.slice(1); assert.match(targetId, /^teste-[0-9a-f]{8}(?:-\d+)?$/);
    await s.page.locator('.atlas-question-details > summary').click();
    const search = s.page.getByLabel('Buscar teste nesta investigação');
    await search.fill('zzqqxx');
    assert.equal(await s.page.locator('.atlas-test-variant').count(), 0, 'filter hides the linked test before navigation');
    await link.click();
    const target = s.page.locator(`[id="${targetId}"]`);
    await s.page.waitForFunction(id => location.hash === `#${id}` && document.getElementById(id)?.matches('[open]'), targetId);
    assert.equal(await search.inputValue(), '', 'following a direct test link clears a filter that hides its target');
    assert.equal(await target.locator('.atlas-public-test').count(), 1);
    assert.ok(await target.evaluate(el => el.contains(document.activeElement)), 'focus moves into the linked test');
    await s.page.goBack();
    await s.page.waitForFunction(() => location.hash === '');
    await s.page.goForward();
    await s.page.waitForFunction(id => location.hash === `#${id}` && document.getElementById(id)?.matches('[open]'), targetId);
    assert.ok(await target.evaluate(el => el.contains(document.activeElement)), 'Forward reopens and focuses the linked test');
    await s.context.close(); return {href, targetId};
  });

  await check('following an internal source from the plot inspector closes the modal before focusing the test', async () => {
    const s = await open({width: 390, height: 844});
    await s.page.locator('.nexo-question-figures .nexo-bar-row').first().click();
    const dialog = s.page.locator('dialog.nexo-point-dialog[open]'); await dialog.waitFor();
    const link = dialog.getByRole('link', {name: 'Ler a investigação de origem'});
    const href = await link.getAttribute('href'); assert.ok(href, 'inspector exposes a local source investigation');
    const targetId = new URL(href, s.page.url()).hash.slice(1);
    await link.click();
    await s.page.waitForFunction(id => location.hash === `#${id}` && document.getElementById(id)?.matches('[open]'), targetId);
    assert.equal(await s.page.locator('dialog.nexo-point-dialog[open]').count(), 0, 'the modal no longer leaves the page inert');
    const target = s.page.locator(`[id="${targetId}"]`);
    assert.equal(await target.evaluate(el => Boolean(el.closest('[inert]'))), false, 'the target has no inert ancestor after the native dialog closes');
    assert.ok(await target.evaluate(el => el.contains(document.activeElement)), 'the source target receives focus after the modal closes');
    await s.context.close(); return {href, targetId};
  });

  await check('a singleton test has a real, focusable direct-link target on mobile', async () => {
    const single = site.fixture.payload.tests.find(test => test.id === 'SYNTHETIC-STUDY-15');
    assert.ok(single, 'synthetic singleton test exists');
    const targetId = testAnchors([single]).get(single.id); assert.ok(targetId);
    const s = await open({width: 390, height: 844, path: `${SINGLE_STUDY_ROUTE}#${targetId}`});
    const target = s.page.locator(`[id="${targetId}"]`); await target.waitFor();
    assert.equal(await target.count(), 1);
    assert.ok(await target.evaluate(el => el.matches('.atlas-public-test')), 'the singleton anchor is attached to its test article');
    assert.ok(await target.evaluate(el => el.contains(document.activeElement)), 'single test target receives focus');
    assert.equal(await s.page.evaluate(() => location.hash), `#${targetId}`);
    await s.context.close(); return {targetId, path: SINGLE_STUDY_ROUTE};
  });

  await check('"source investigation" links of the comparison point at the exact test', async () => {
    const s = await open({width: 1280});
    const card = s.page.locator('.nexo-question-figures .nexo-comparison-card').first();
    await card.locator('.nexo-comparison-sources > summary').click();
    await card.locator('.nexo-comparison-sources li details > summary').first().click();
    const hrefs = await card.locator('.nexo-comparison-sources .nexo-figure-sources a').evaluateAll(list => list.map(a => a.getAttribute('href')));
    assert.ok(hrefs.length >= 1 && hrefs.every(href => new RegExp(`^${STUDY_ROUTE}#teste-[0-9a-f]{8}(?:-\\d+)?$`).test(href)), JSON.stringify(hrefs));
    await s.context.close(); return hrefs;
  });

  for (const width of widths) for (const locale of ['pt-BR', 'en']) for (const theme of ['dark', 'light']) {
    await check(`layout ${width}px ${locale} ${theme}: no horizontal overflow, readable figure rows, 44px controls`, async () => {
      const s = await open({width, height: width <= 430 ? 844 : 900, locale, theme});
      await s.page.locator('.nexo-question-figures').waitFor();
      await s.page.locator('.atlas-question-details > summary').click(); await s.page.locator('.atlas-test-variant').first().waitFor(); await settle(s.page);
      const o = await overflow(s.page);
      assert.ok(o.scroll <= o.viewport + 1 && o.body <= o.viewport + 1, JSON.stringify(o));
      const m = await s.page.evaluate(() => {
        const box = el => el.getBoundingClientRect();
        const card = document.querySelector('.nexo-question-figures .nexo-comparison-card'), row = card.querySelector('.nexo-bar-row'), heading = row.querySelector('.nexo-bar-heading > span');
        const controls = [...document.querySelectorAll('.nexo-study-page button, .nexo-study-page summary, .nexo-study-page input, .nexo-study-page select')].filter(el => { const r = box(el); return r.width && r.height && !el.closest('details:not([open])') || el.tagName === 'SUMMARY' && el.parentElement.getClientRects().length > 0; });
        return {cardWidth: Math.round(box(card).width), cardHeight: Math.round(box(card).height), rowHeight: Math.round(box(row).height), labelWidth: Math.round(box(heading).width), labelScrollWidth: heading.scrollWidth, labelClientWidth: heading.clientWidth,
          small: controls.map(el => ({tag: el.tagName, text: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), h: Math.round(box(el).height), w: Math.round(box(el).width)})).filter(c => c.h < 44 || c.w < 44),
          h1: Math.round(box(document.querySelector('h1')).height), firstContentY: Math.round(box(document.querySelector('.atlas-campaign-reading')).top + scrollY)};
      });
      assert.deepEqual(m.small, [], JSON.stringify(m.small));
      assert.ok(m.labelClientWidth > 0 && m.labelScrollWidth <= m.labelClientWidth, `figure label remains readable without clipping: ${JSON.stringify({labelWidth:m.labelWidth,labelClientWidth:m.labelClientWidth,labelScrollWidth:m.labelScrollWidth})}`);
      if (output) { await s.page.locator('.nexo-question-figures').scrollIntoViewIfNeeded(); await settle(s.page); await shot(s, '-figures'); await s.page.evaluate(() => scrollTo(0, 0)); await settle(s.page); await shot(s, '-top'); }
      await s.context.close(); return m;
    });
  }

  await check('keyboard: tab order reaches search, tests open with Enter, focus stays visible', async () => {
    const s = await open({width: 1280});
    await s.page.locator('.atlas-question-details > summary').focus(); await s.page.keyboard.press('Enter');
    await s.page.keyboard.press('Tab');
    assert.equal(await s.page.evaluate(() => document.activeElement.id), 'question-exemplo-sintetico-test-search');
    await s.page.keyboard.type('prior'); await s.page.locator('.nexo-question-search [role=status]').filter({hasText: /correspondem/}).waitFor(); await settle(s.page);
    await s.page.keyboard.press('Tab');
    assert.equal(await s.page.evaluate(() => document.activeElement.tagName), 'SUMMARY', 'the first matching test follows the search field');
    await s.page.keyboard.press('Enter'); await settle(s.page);
    const active = await s.page.evaluate(() => ({tag: document.activeElement.tagName, open: document.activeElement.parentElement.open, outline: getComputedStyle(document.activeElement).outlineStyle}));
    assert.deepEqual({tag: active.tag, open: active.open}, {tag: 'SUMMARY', open: true}); assert.notEqual(active.outline, 'none');
    await s.context.close();
  });

  assert.deepEqual(pageErrors, [], pageErrors.join('\n'));
} finally {
  await browser.close(); await site.close();
  report.pageErrors = pageErrors;
  if (output) await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
const failed = report.checks.filter(c => c.status === 'FAIL');
console.log(`${failed.length ? 'FAIL' : 'PASS'}: ${report.checks.length - failed.length}/${report.checks.length} investigation-page checks on the real entry with a synthetic catalog.`);
if (failed.length) process.exit(1);
