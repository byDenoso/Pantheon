// Real-browser parity/containment check for the private legacy Atlas shell.
// Synthetic runtime only, local mock backend, no external services. Run: npm run test:private-browser
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {buildPrivateUi} from '../scripts/build-private-ui.mjs';
import {startBackend} from './helpers/private-backend.mjs';
import {FP2, makeRuntime, makeSystem} from './helpers/synthetic-runtime.mjs';

const root = new URL('../', import.meta.url).pathname;
const privateDir = mkdtempSync(join(tmpdir(), 'priv-')), publicDir = join(mkdtempSync(join(tmpdir(), 'pub-')), 'dist');
await buildPrivateUi(privateDir);
assert.equal(spawnSync('npx', ['vite', 'build', '--outDir', publicDir, '--emptyOutDir'], {cwd: root}).status, 0);
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({executablePath: exe}).catch(() => chromium.launch());
const results = {};
const FORBIDDEN_NET = ['/api/system', '/api/world', '/api/session', '/api/recall', '/api/mcp', '/build-meta.json', '/galaxy/latest.json', '/mcp/topology.json', '/tower-projection/', 'unpkg', 'jsdelivr', 'googleapis', 'script.google'];

async function session(opts = {}, fn) {
  const be = await startBackend({privateDir, publicDir, runtime: opts.runtime ?? makeRuntime(), sessionMs: opts.sessionMs});
  const ctx = await browser.newContext({viewport: {width: 1400, height: 900}});
  const page = await ctx.newPage();
  const errors = [], requests = [], popups = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.on('popup', p => popups.push(p.url()));
  const frameRequests = [];
  page.on('request', r => { requests.push(r.url()); if (r.frame() !== page.mainFrame()) frameRequests.push(r.url()); });
  const login = async () => {
    await page.goto(`${be.base}/#/privado`);
    await page.fill('#atlas-pin', 'synthetic-code-1'); await page.click('button:has-text("Entrar")');
  };
  const frame = () => page.frames().find(f => f !== page.mainFrame());
  const ready = async () => { await page.waitForSelector('iframe.atlas-private-frame'); await page.frameLocator('iframe.atlas-private-frame').locator('.pw').waitFor({timeout: 20000}); await frame().evaluate(() => { location.hash = '#/agora'; }); await page.frameLocator('iframe.atlas-private-frame').locator('.cockpit').first().waitFor({timeout: 20000}); await page.waitForTimeout(300); assert.ok(await page.evaluate(() => document.querySelector('iframe').getBoundingClientRect().top < 4), 'frame is scrolled to the top of the viewport'); };
  try { await fn({be, ctx, page, errors, requests, frameRequests, popups, login, frame, ready}); } finally { await ctx.close(); await be.close(); }
}
const noPrivateDom = async page => assert.equal(await page.evaluate(() => document.body.innerText.includes('Sintético') || !!document.querySelector('iframe')), false, 'no private content or frame left in the DOM');

// 1. mount, navigation, graph, lab, cockpit and human actions with the real legacy screens
await session({}, async ({be, page, errors, requests, frameRequests, popups, login, frame, ready}) => {
  await login(); await ready();
  const f = frame();
  assert.equal(await f.evaluate(() => document.querySelector('.cockpit')?.dataset.access), 'PRIVATE');
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
  assert.equal(await page.locator('iframe').getAttribute('referrerpolicy'), 'no-referrer');
  const seen = {};
  for (const label of ['Universo', 'Ciclo', 'Roadmaps', 'Evidência', 'Saúde', 'Pessoal', 'Sistema', 'Agora']) {
    await f.locator('button', {hasText: new RegExp(`^${label}$`)}).first().click();
    await page.waitForTimeout(350);
    seen[label] = await f.evaluate(() => ({hash: location.hash, view: document.querySelector('.cockpit')?.dataset.view ?? null, text: document.body.innerText.length}));
    assert.ok(seen[label].text > 50, `${label} rendered content`);
  }
  assert.equal(new Set(Object.values(seen).map(v => v.hash + '|' + v.view)).size >= 5, true, 'navigation changes the legacy route/view');
  // atlas / galaxy graph (real G6 module bundled in the shell)
  await f.evaluate(() => { location.hash = '#/atlas'; });
  await f.waitForFunction(() => document.documentElement.dataset.atlasG6Source === 'module', null, {timeout: 20000});
  await f.locator('.cockpit[data-view=ATLAS]').waitFor({timeout: 10000});
  await page.waitForTimeout(1500);
  const graph = await f.evaluate(() => ({svg: document.querySelectorAll('svg').length, shapes: document.querySelectorAll('svg circle, svg path').length, title: document.body.innerText.includes('Galáxia 3D')}));
  assert.ok(graph.svg > 0 && graph.shapes > 30 && graph.title, 'G6 graph surface rendered with graph content');
  results.graph = graph;
  // one in-memory generation also serves the galaxy snapshot adapter (the legacy galaxy route itself is disabled in App)
  assert.equal(await f.evaluate(() => fetch('/api/galaxy/latest.json').then(r => r.json()).then(j => j.contract)), 'NEXO_ONE_GALAXY_V1');
  await f.evaluate(() => { location.hash = '#/sistema'; }); await page.waitForTimeout(500);
  await f.evaluate(() => { location.hash = '#/agora'; }); await page.waitForTimeout(300);
  // human actions: theme toggle, command bar, focus (item click), account modal
  const theme0 = await f.evaluate(() => document.documentElement.dataset.theme);
  await f.locator('.instrument-theme').click();
  assert.notEqual(await f.evaluate(() => document.documentElement.dataset.theme), theme0, 'theme toggles');
  // external links cannot leave the container; denied adapters answer 501 without touching the network
  const before = frame().url();
  await f.evaluate(() => { const a = document.createElement('a'); a.href = 'https://elsewhere.example.test/x'; a.target = '_blank'; a.textContent = 'x'; document.body.appendChild(a); a.click(); const b = document.createElement('a'); b.href = '/api/atlas-private'; b.textContent = 'y'; document.body.appendChild(b); b.click(); });
  await page.waitForTimeout(300);
  assert.equal(frame().url(), before); assert.equal(popups.length, 0);
  assert.equal(await f.evaluate(() => fetch('/api/recall?q=x').then(r => r.status)), 501);
  assert.equal(await f.evaluate(() => fetch('https://elsewhere.example.test/x').then(r => r.status)), 501);
  assert.equal(await f.evaluate(() => window.open('https://elsewhere.example.test') === null), true);
  assert.equal(await f.evaluate(() => { try { new WebSocket('wss://elsewhere.example.test'); return 'open'; } catch { return 'closed'; } }), 'closed');
  // network audit: nothing but the authenticated shell/session/private-data/asset paths ever hit the server
  const paths = requests.map(u => new URL(u)).filter(u => u.origin === be.base);
  const foreign = u => !(new URL(u).origin === be.base || u.startsWith('data:'));
  assert.ok(frameRequests.length > 10, 'frame traffic was observed');
  assert.deepEqual(frameRequests.filter(foreign), [], 'the private frame makes no foreign-origin requests');
  // the pre-existing public index.html still links Google Fonts (unchanged this round; reported as a limitation)
  assert.deepEqual(requests.filter(foreign).filter(u => !u.startsWith('https://fonts.googleapis.com/css2?')), [], 'no other foreign request from the page');
  assert.equal(frameRequests.every(u => new URL(u).pathname === '/api/atlas-private-ui' || new URL(u).pathname.startsWith('/api/atlas-private-assets/') || u.startsWith('data:')), true, 'frame only loads its shell and manifest assets');
  for (const bad of FORBIDDEN_NET) assert.equal(frameRequests.some(u => u.includes(bad)), false, `the frame makes no request to ${bad}`);
  for (const bad of FORBIDDEN_NET.filter(x => x !== 'googleapis')) assert.equal(requests.some(u => u.includes(bad)), false, `the page makes no request to ${bad}`);
  assert.ok(paths.some(u => u.pathname === '/api/atlas-private-ui'));
  // storage audit: only generic theme/language keys ever persist
  const keys = await page.evaluate(() => Object.keys(localStorage));
  for (const k of keys) assert.ok(['atlas.locale', 'atlas.theme', 'nexo-theme'].includes(k), `unexpected persisted key ${k}`);
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)), []);
  // account modal -> session action delegated to the external shell -> real logout, frame removed
  await f.evaluate(() => { location.hash = '#/inbox'; }); await f.locator('.cockpit[data-view=INBOX]').waitFor(); await page.waitForTimeout(500);
  const cmd = f.getByLabel('Buscar e navegar');
  await cmd.fill('atlas'); await cmd.press('Enter'); await page.waitForTimeout(400);
  results.command = await f.evaluate(() => location.hash);
  assert.match(results.command, /atlas/i, 'command bar navigates to the typed view');
  await f.evaluate(() => { location.hash = '#/inbox'; }); await f.locator('.cockpit[data-view=INBOX]').waitFor();
  await f.locator('.instrument-sync').click(); await page.waitForTimeout(600); // reload from the in-memory generation, no network
  const row = f.locator('main [class*=inbox] button, main .row button, main article button').first();
  if (await row.count()) { await row.click({timeout: 5000}).catch(() => {}); await page.waitForTimeout(300); results.inboxAction = await f.locator('[role=dialog], .modal, .drawer-body').count() > 0 ? 'detail opened' : 'no detail'; await page.keyboard.press('Escape'); }
  await f.locator('.instrument-account').click();
  await f.getByText('Sessão privada ativa.').waitFor();
  await f.getByRole('button', {name: /Sair da sessão/}).click();
  await page.waitForSelector('text=confirmou a revogação', {timeout: 10000});
  assert.equal(be.st.deletes, 1); await noPrivateDom(page);
  assert.deepEqual(errors, [], 'no uncaught errors');
  results.navigation = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.hash || v.view]));
});

// 2. expiry removes frame + data
await session({sessionMs: 4000}, async ({page, login, ready}) => {
  await login(); await ready();
  await page.waitForSelector('iframe.atlas-private-frame', {state: 'detached', timeout: 15000});
  await noPrivateDom(page); results.expiry = 'frame and data removed';
});

// 3. pagehide / pageshow(persisted) revalidate; 503 on revalidation; route leave
await session({}, async ({be, page, login, ready}) => {
  await login(); await ready();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.atlasPrivate), 'hidden');
  await page.waitForSelector('iframe.atlas-private-frame', {state: 'detached'}); await noPrivateDom(page);
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('pageshow'), {persisted: true})));
  await ready(); assert.equal(await page.evaluate(() => document.documentElement.dataset.atlasPrivate ?? null), null);
  // revalidation sees 503 -> no frame, no data
  be.st.privateStatus = 503;
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(Object.assign(new Event('pageshow'), {persisted: true})); });
  await page.waitForSelector('[role=alert]'); await noPrivateDom(page);
  be.st.privateStatus = 200;
  // leaving the private route destroys the frame; returning revalidates before mounting a new one
  await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('iframe', {state: 'detached'}); await noPrivateDom(page);
  const hits = be.st.log.filter(x => x === 'GET /api/atlas-private').length;
  await page.evaluate(() => { location.hash = '#/privado'; }); await ready();
  assert.ok(be.st.log.filter(x => x === 'GET /api/atlas-private').length > hits, 'revalidated before returning');
  results.lifecycle = 'pagehide/pageshow/503/route ok';
});

// 4. inconsistent runtime fails closed inside the frame; nothing of the App mounts
await session({runtime: makeRuntime({system: makeSystem(FP2)})}, async ({page, login, frame}) => {
  await login();
  await page.waitForSelector('text=A visão privada não abriu', {timeout: 30000});
  assert.equal(await page.locator('.cockpit').count(), 0); await noPrivateDom(page);
  results.inconsistent = 'failed closed';
});

// 5. opening the shell URL outside the guarded frame shows nothing
await session({}, async ({be, ctx, page, login}) => {
  await login(); await page.waitForSelector('iframe.atlas-private-frame');
  const top = await ctx.newPage(); await top.goto(`${be.base}/api/atlas-private-ui`);
  await top.waitForSelector('text=só abre dentro da área privada');
  assert.equal(await top.locator('.cockpit').count(), 0);
  results.orphan = 'no app outside frame';
});


// ---- addendum scenarios: recall, MCP panel, galaxy route, refresh, explicit source links ----
const richWorld = () => {
  const w = makeRuntime().world;
  w.items[0].actions = [{id: 'ok', label: 'Abrir fonte validada', kind: 'OPEN_SOURCE', url: 'https://source.example.test/doc/1'}];
  w.items[1].actions = [{id: 'bad', label: 'Abrir fonte sensivel', kind: 'OPEN_SOURCE', url: 'https://source.example.test/doc/2?token=abc'}, {id: 'plain', label: 'Abrir fonte http', kind: 'OPEN_SOURCE', url: 'http://source.example.test/doc/3'}];
  return w;
};
const syntheticSite = ctx => ctx.route('https://source.example.test/**', route => route.fulfill({status: 200, contentType: 'text/html', body: '<title>ok</title>'}));
const synthetic = n => `Item sintético ${n}`;

// 6. recall (local snapshot), explicit source links, MCP panel, galaxy route
await session({runtime: makeRuntime({world: richWorld()})}, async ({be, ctx, page, errors, requests, frameRequests, popups, login, frame, ready}) => {
  await syntheticSite(ctx);
  await login(); await ready();
  const f = frame();
  // recall: lexical search over the authenticated world.items; query and ids never leave the document
  await f.evaluate(() => { location.hash = '#/cockpit/pessoal/recall'; }); await page.waitForTimeout(500);
  await f.getByLabel('Buscar nas fontes').fill('sintético 1'); await f.getByRole('button', {name: 'Buscar ↗'}).click();
  await f.getByText(synthetic(1)).first().waitFor({timeout: 10000});
  assert.equal(await f.getByText(synthetic(2)).count(), 0, 'only matching items are listed');
  const body = await f.evaluate(() => document.body.innerText);
  assert.match(body, /PRIVATE · busca lexical local no snapshot/);
  assert.doesNotMatch(body, /Busca lexical em Drive, Gmail e GitHub/);
  const pills = await f.locator('.provider-pill').allInnerTexts();
  assert.equal(pills.length, 5, 'one coverage pill per source');
  assert.ok(pills.some(t => /drive/i.test(t) && /indispon/i.test(t)), `absent source is reported unavailable: ${pills.join('|')}`);
  assert.ok(pills.some(t => /fonte sintética · 1/i.test(t)), `present source counts local matches: ${pills.join('|')}`);
  await f.getByLabel('Buscar nas fontes').fill('zzz-sem-resultado'); await f.getByRole('button', {name: 'Buscar ↗'}).click();
  await f.getByText('Nenhum resultado disponível.').waitFor({timeout: 10000});
  assert.equal(requests.concat(frameRequests).some(u => /recall|sint|zzz/i.test(decodeURIComponent(u))), false, 'neither query nor path of the search reached the network');
  // explicit click on a validated https source link opens a new tab, no opener/referrer; the frame never navigates
  await f.getByLabel('Buscar nas fontes').fill('sintético 1'); await f.getByRole('button', {name: 'Buscar ↗'}).click();
  await f.getByText(synthetic(1)).first().click();
  const okLink = f.getByRole('link', {name: /Abrir fonte validada/});
  await okLink.waitFor({timeout: 10000});
  const before = frame().url();
  const [pop] = await Promise.all([page.waitForEvent('popup', {timeout: 10000}), okLink.click()]);
  await pop.waitForLoadState('domcontentloaded');
  assert.equal(pop.url(), 'https://source.example.test/doc/1');
  assert.equal(await pop.evaluate(() => window.opener), null, 'noopener');
  assert.equal(await pop.evaluate(() => document.referrer), '', 'noreferrer');
  assert.equal(frame().url(), before, 'the private frame itself never navigates');
  await pop.close(); await page.keyboard.press('Escape');
  // sensitive / non-https links stay blocked and are visibly marked, not silently dead
  await f.getByLabel('Buscar nas fontes').fill('sintético 2'); await f.getByRole('button', {name: 'Buscar ↗'}).click();
  await f.getByText(synthetic(2)).first().click();
  const popsBefore = popups.length;
  for (const name of [/fonte sensivel/, /fonte http/]) {
    const l = f.getByRole('link', {name}); await l.waitFor({timeout: 10000}); await l.click(); await page.waitForTimeout(300);
    assert.equal(await l.getAttribute('data-private-blocked'), 'true'); assert.equal(await l.getAttribute('aria-disabled'), 'true');
  }
  assert.equal(popups.length, popsBefore, 'no new tab for unapproved links');
  await page.keyboard.press('Escape');
  // no automatic navigation / script-initiated open, even to an approved URL
  assert.equal(await f.evaluate(() => { const r = window.open('https://source.example.test/auto'); return r; }), null);
  assert.equal(await f.evaluate(() => { const a = document.createElement('a'); a.href = 'https://source.example.test/auto'; a.target = '_blank'; document.body.appendChild(a); a.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true})); return 'dispatched'; }), 'dispatched');
  await page.waitForTimeout(400); assert.equal(popups.length, popsBefore, 'untrusted/script clicks and window.open do not open anything');

  // MCP panel: PRIVATE, local snapshot, read-only; unavailable capabilities cannot be run
  await f.evaluate(() => { location.hash = '#/sistema?tab=mcp'; });
  await f.locator('[data-mcp-control-ready=true]').waitFor({timeout: 15000});
  const mcp = await f.locator('.mcp-control').innerText();
  assert.match(mcp, /PRIVATE · consultas somente leitura/); assert.match(mcp, /Consultas locais/); assert.match(mcp, /local:\/\/snapshot-privado/);
  assert.match(mcp, /sem saúde ao vivo de servidor, sem telemetria e sem acesso de máquina/);
  assert.match(mcp, /Sem servidor MCP: telemetria não se aplica/);
  assert.doesNotMatch(mcp, /ferramentas públicas|Servidor conectado|Fonte científica indisponível/);
  const cards = await f.locator('.mcp-tool-grid article').allInnerTexts();
  assert.ok(cards.length === 11 && cards.every(c => /PRIVATE/.test(c) && /read-only/.test(c)), 'all tools labelled PRIVATE read-only');
  assert.ok(cards.find(c => /get_program/.test(c) && /UNAVAILABLE/.test(c) && /modelo científico compilado no servidor/.test(c)));
  await f.locator('.mcp-control label:has-text("Ferramenta") select').selectOption('search_atlas');
  await f.locator('.mcp-control label:has-text("query") input').fill('Sint');
  await f.getByRole('button', {name: 'Executar consulta'}).click();
  await f.getByText(/Tempo de execução/).waitFor({timeout: 10000});
  await f.getByRole('button', {name: 'JSON estruturado'}).click();
  const json = JSON.parse(await f.locator('.mcp-control pre').last().innerText());
  assert.equal(json.access, 'PRIVATE'); assert.equal(json.scope, 'LOCAL_SNAPSHOT'); assert.equal(json.authority, null); assert.ok(json.items.length >= 1 && json.total >= json.items.length);
  await f.locator('.mcp-control label:has-text("Ferramenta") select').selectOption('get_program');
  assert.equal(await f.getByRole('button', {name: 'Executar consulta'}).isDisabled(), true, 'a capability absent from the runtime cannot be executed');
  assert.equal(frameRequests.concat(requests).some(u => /\/api\/mcp/.test(u)), false, 'no /api/mcp traffic (machine/Writer untouched)');

  // galaxy: the legacy entry (#/galaxia) is restored privately; the same generation feeds it
  await f.evaluate(() => { location.hash = '#/galaxia'; });
  await f.locator('.cockpit[data-view=GALAXY]').waitFor({timeout: 15000});
  await page.waitForTimeout(1500);
  const gal = await f.evaluate(() => document.querySelector('.galaxy-workspace')?.innerText ?? '');
  results.galaxyText = gal.replace(/\s+/g, ' ').slice(0, 300);
  assert.ok(gal.includes('syn-entity-1'), 'the real node of the private galaxy snapshot is rendered');
  // the Atlas graph route is untouched
  await f.evaluate(() => { location.hash = '#/atlas'; });
  await f.waitForFunction(() => document.documentElement.dataset.atlasG6Source === 'module', null, {timeout: 20000});
  assert.deepEqual(errors, [], 'no uncaught errors'); results.addendum = 'recall/links/mcp/galaxy ok';
});

// 7. refresh obtains a NEW generation from the parent (session revalidated + /api/atlas-private re-fetched)
const gets = (be, path) => be.st.log.filter(x => x === `GET ${path}`).length;
const frameFp = f => f.evaluate(() => fetch('/api/system').then(r => r.json()).then(j => j.bus.fingerprint));
await session({}, async ({be, page, errors, frameRequests, login, frame, ready}) => {
  await login(); await ready();
  let f = frame();
  assert.equal(await frameFp(f), (makeRuntime().system).bus.fingerprint);
  await f.evaluate(() => { location.hash = '#/inbox'; }); await f.locator('.cockpit[data-view=INBOX]').waitFor();
  // same generation re-served: honest "same generation", but the parent really re-fetched
  const s0 = gets(be, '/api/atlas-session'), p0 = gets(be, '/api/atlas-private');
  await f.locator('.instrument-sync').click();
  await page.waitForTimeout(1200);
  assert.match(await f.evaluate(() => document.body.innerText + [...document.querySelectorAll('[title],[aria-label]')].map(e => e.title + e.getAttribute('aria-label')).join(' ')), /Mesma geração · sem alterações/);
  assert.equal(gets(be, '/api/atlas-session'), s0 + 1, 'session revalidated'); assert.equal(gets(be, '/api/atlas-private'), p0 + 1, 'private runtime fetched again');
  // a NEW generation (other fingerprint, newer) replaces the old one atomically; whole store rebuilt
  be.st.runtime = makeRuntime({generated_at: '2031-01-01T00:00:00.000Z'}, FP2);
  f = frame(); await f.locator('.instrument-sync').click();
  await page.waitForFunction(() => document.querySelector('iframe'), null, {timeout: 5000});
  await page.waitForTimeout(1500);
  f = frame(); assert.equal(await frameFp(f), FP2, 'the frame now serves the new generation');
  assert.equal(await f.evaluate(() => document.querySelectorAll('.cockpit').length), 1);
  // transient network failure: honest unavailable, previous generation kept
  be.st.dropPrivate = true;
  await f.locator('.instrument-sync').click(); await page.waitForTimeout(1200);
  assert.equal(await frameFp(frame()), FP2, 'previous generation preserved on a transient failure');
  assert.match(await frame().evaluate(() => document.body.innerText), /Sincronização (falhou|não confirmada)|indispon/i);
  be.st.dropPrivate = false;
  // a stale (older) generation is refused and reported, never installed
  be.st.runtime = makeRuntime({generated_at: '2000-01-01T00:00:00.000Z'});
  await frame().locator('.instrument-sync').click(); await page.waitForTimeout(1200);
  assert.equal(await frameFp(frame()), FP2, 'an older generation never replaces the current one');
  assert.match(await frame().evaluate(() => document.body.innerText), /Sincronização (falhou|não confirmada)|indispon/i);
  assert.equal(frameRequests.some(u => /workflow|dispatch|github/i.test(u)), false, 'no public workflow is triggered');
  assert.deepEqual(errors, [], 'no uncaught errors');
  results.refresh = 'new generation, transient failure kept, stale refused';
});

// 8. refresh with the source down (503) or the session expired (401) tears the area down and revalidates
for (const [label, mutate, expected] of [
  ['503', be => { be.st.privateStatus = 503; }, '[role=alert]'],
  ['401', be => { be.st.authed = false; }, '#atlas-pin'],
]) {
  await session({}, async ({be, page, login, frame, ready}) => {
    await login(); await ready();
    await frame().evaluate(() => { location.hash = '#/inbox'; }); await frame().locator('.cockpit[data-view=INBOX]').waitFor();
    mutate(be);
    await frame().locator('.instrument-sync').click();
    await page.waitForSelector('iframe.atlas-private-frame', {state: 'detached', timeout: 15000});
    await page.waitForSelector(expected, {timeout: 10000}); await noPrivateDom(page);
    results[`refresh${label}`] = 'frame and data removed';
  });
}

await browser.close(); rmSync(privateDir, {recursive: true, force: true}); rmSync(publicDir, {recursive: true, force: true});
console.log(JSON.stringify(results, null, 1));
