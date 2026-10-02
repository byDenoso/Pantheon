// Verificação de browser: desktop e mobile, claro e escuro, mais uma passagem
// visual por cada cenário crítico de fixture.
//
// O plano PESSOAL continua sendo servido por rotas /api/* interceptadas aqui,
// exatamente como antes. O plano SISTEMA roda com as fixtures embutidas no bundle.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { compile } from '../server/compiler/world-state.mjs';
import { item } from '../server/adapters/http.mjs';
import { pending } from '../server/adapters/registry.mjs';
import { PROVIDERS } from '../src/contracts/validate.mjs';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');

const output = 'test-output';
await mkdir(output, { recursive: true });
const now = Date.parse('2026-09-10T09:00:00Z');
const baseUrl = process.env.NEXO_BASE_URL || 'http://127.0.0.1:4173';

// Fixtures do plano pessoal (mesma abordagem da verificação anterior).
const records = [
  item('github', 'fixture-1', 'Revisar contrato de integração', 'https://github.com/example/project/issues/1', now,
    { kind: 'ISSUE', status: 'BLOCKED', contextId: 'ENGINEERING' }),
  item('calendar', 'fixture-2', 'Bloco de trabalho', 'https://calendar.google.com/calendar/u/0/r', now,
    { kind: 'EVENT', status: 'SCHEDULED', dueAt: '2026-09-10T12:30:00Z', endAt: '2026-09-10T13:00:00Z', contextId: 'PERSONAL' }),
  item('drive', 'fixture-3', 'CAMB · referência de teste', 'https://drive.google.com/file/d/fixture/view', now,
    { kind: 'FILE', contextId: 'COSMOLOGY' }),
];
const results = PROVIDERS.map(id => {
  const base = pending(id, now);
  const mine = records.filter(x => x.source === id);
  return mine.length
    ? { items: mine, provider: { ...base.provider, status: 'AVAILABLE', count: mine.length,
        lastSuccessAt: new Date(now).toISOString(), revision: 'fixture-v1', message: 'FIXTURE · ONLY IN TEST' } }
    : base;
});
const world = compile(results, { now });

const VIEWPORTS = [
  ['desktop-dark', 1440, 1000, 'dark'],
  ['desktop-light', 1440, 1000, 'light'],
  ['mobile-dark', 390, 844, 'dark'],
  ['mobile-light', 390, 844, 'light'],
];

// Um cenário por estado crítico, capturado no desktop escuro.
const SCENARIO_SHOTS = [
  ['all-live', 'OVERVIEW'],
  ['olympus-conflict', 'TRUTHGRAPH'],
  ['github-unverified', 'CAPABILITIES'],
  ['provider-missing', 'SOURCES'],
  ['source-stale', 'SOURCES'],
  ['projection-degraded', 'OVERVIEW'],
  ['readback-failed', 'EXECUTION'],
  ['no-op-applied', 'EXECUTION'],
  ['waiting-side-quest', 'ACTIONS'],
  ['human-decision', 'INBOX'],
];

const VIEW_ROUTES = {
  OVERVIEW: '#/OVERVIEW',
  'Precisa de você': '#/INBOX',
  Actions: '#/ACTIONS',
  Execution: '#/EXECUTION',
  TruthGraph: '#/TRUTHGRAPH',
  Capabilities: '#/CAPABILITIES',
  Sources: '#/SOURCES',
  Integrity: '#/INTEGRITY',
  Atlas: '#/ATLAS',
  Learning: '#/LEARNING',
  Now: '#/NOW',
  INBOX: '#/INBOX',
  TRUTHGRAPH: '#/TRUTHGRAPH',
  CAPABILITIES: '#/CAPABILITIES',
  SOURCES: '#/SOURCES',
  EXECUTION: '#/EXECUTION',
  ACTIONS: '#/ACTIONS',
};

const browser = await chromium.launch({ headless: true });
const reports = [];

const newPage = async (width, height, theme, view = 'OVERVIEW') => {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.clock.install({ time: now });
  await page.addInitScript(([theme, view]) => {
    localStorage.setItem('nexo-theme', theme);
    localStorage.setItem('nexo-view', view);
  }, [theme, view]);
  await page.route('**/api/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
  await page.route('**/api/world*', route => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify(world) + '\n' }));
  await page.route('**/api/recall*', route => route.fulfill({ json: { ...world, items: records.filter(x => x.source === 'drive') } }));
  return { context, page, errors };
};

/** Falha nomeando o elemento que estourou: overflow sem culpado é impossível de corrigir. */
const noOverflow = async (page, where = '') => {
  const report = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5)
      .map(element => `${element.tagName.toLowerCase()}.${typeof element.className === 'string' ? element.className : ''}`.slice(0, 80)),
  }));
  assert.ok(report.scrollWidth <= report.innerWidth + 1,
    `overflow horizontal em ${where}: ${report.scrollWidth} > ${report.innerWidth} · ${report.offenders.join(' | ')}`);
};

try {
  for (const [name, width, height, theme] of VIEWPORTS) {
    const { context, page, errors } = await newPage(width, height, theme);
    const mobile = width < 860;
    await page.goto(`${baseUrl}${VIEW_ROUTES.OVERVIEW}`);

    // 1. O cockpit de sistema atual carrega o estado e os quatro domínios.
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByRole('heading', { name: 'Estado do sistema' }).waitFor();
    assert.equal(await page.locator('.domain-tile').count(), 4, 'quatro domínios no estado atual');
    assert.equal(await page.getByTestId('projection-bus').count(), 0,
      'overlay legado do Projection Bus não pode competir com o SystemState');
    await noOverflow(page, `${name}/Overview`);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });

    // 2. Navegação: percorre as visões preservando um H1 por tela.
    const navigate = async view => {
      const route = VIEW_ROUTES[view];
      assert.ok(route, `rota canônica ausente para ${view}`);
      await page.evaluate(path => { window.location.hash = path; }, route.slice(1));
      if (view === 'Atlas' && mobile) {
        // On mobile, the details H1 lives inside the intentionally closed side sheet.
        await page.locator('.atlas3d-page[data-atlas-renderer="metro-cluster"]').waitFor();
        return;
      }
      try {
        await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 8000 });
      } catch (error) {
        const hash = await page.evaluate(() => window.location.hash);
        throw new Error(`No H1 after navigating ${view} (${hash}) at ${name}`, { cause: error });
      }
      assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1, `${view} sem H1 único`);
    };
    for (const view of ['Precisa de você', 'Actions', 'Execution', 'TruthGraph', 'Capabilities', 'Sources', 'Integrity', 'Atlas', 'Learning']) {
      await navigate(view);
      await noOverflow(page, `${name}/${view}`);
    }

    // 3. Conflito P0 é inequívoco no TruthGraph.
    await navigate('TruthGraph');
    await page.locator('.p0-banner').waitFor();
    assert.match(await page.locator('.p0-banner').innerText(), /conflito/i);
    assert.ok(await page.locator('.truth-card.conflict').count() >= 1, 'conflito sem tratamento visual próprio');
    if (name === 'desktop-dark') await page.screenshot({ path: `${output}/truthgraph-conflict.png`, fullPage: true });

    // 4. UNVERIFIED nunca é apresentado como parcialmente funcional.
    await navigate('Capabilities');
    assert.match(await page.locator('.rule-note').first().innerText(), /Sem comprovação não significa funcionamento parcial/);

    // 5. Proveniência acessível a partir de qualquer estado importante.
    await navigate('Sources');
    await page.locator('.provenance-button').first().click();
    await page.getByRole('dialog', { name: 'PROVENIÊNCIA' }).waitFor();
    // innerText aplica text-transform, então a comparação ignora caixa.
    const provenance = (await page.locator('.provenance-list').innerText()).toLowerCase();
    for (const field of ['source_ref', 'source_revision', 'fingerprint', 'checked_at', 'freshness', 'derivation_rule', 'projection_role']) {
      assert.ok(provenance.includes(field), `proveniência sem ${field}`);
    }
    if (name === 'desktop-dark') await page.screenshot({ path: `${output}/provenance-panel.png`, fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);

    // 6. Atlas actual: Metro/G6 renders public source entities and supports accessible selection.
    await navigate('Atlas');
    const atlas = page.locator('.atlas3d-page[data-atlas-renderer="metro-cluster"]');
    await atlas.waitFor();
    const canvas = page.getByTestId('atlas-metro-2d');
    await canvas.waitFor();
    const g6 = page.locator('#atlas-metro-g6');
    await page.waitForFunction(() => document.querySelector('#atlas-metro-g6')?.dataset.g6Ready === 'true');
    assert.ok(await g6.locator('canvas').count() > 0, 'o renderer Metro/G6 não materializou seu canvas');
    assert.equal(await page.locator('.atlas-render-error').count(), 0, 'o renderer Metro/G6 reportou falha');
    const graphNodes = page.locator('.atlas-a11y-stations button');
    const initialNodeCount = await graphNodes.count();
    assert.ok(initialNodeCount >= Number(await atlas.getAttribute('data-atlas-root-count')),
      'a lista acessível deve expor ao menos todos os hubs publicados');
    assert.equal(initialNodeCount, Number(await atlas.getAttribute('data-atlas-visible-count')),
      'a lista acessível deve acompanhar o total de nós atualmente visíveis');
    const detailsToggle = page.locator('.atlas-mobile-details-toggle');
    if (mobile) await detailsToggle.click();
    const firstStation = await graphNodes.first().innerText();
    await graphNodes.first().focus();
    await page.keyboard.press('Enter');
    await page.locator('.atlas-detail h1').waitFor();
    assert.equal((await page.locator('.atlas-detail h1').innerText()).trim().toLocaleLowerCase(), firstStation.trim().toLocaleLowerCase(),
      'selecionar uma estação acessível deve abrir seus detalhes');
    // A capability-only group used to fall through to LIVE without a live
    // observation. Check its accessible label from the corrected Atlas model.
    const capabilityStation = page.locator('.atlas-a11y-stations button[data-domain="SCIENCE"][data-depth="1"]')
      .filter({ hasText: 'Capacidades científicas' });
    await capabilityStation.waitFor();
    assert.equal(await capabilityStation.count(), 1, 'the deterministic Atlas fixture must expose its capability group');
    assert.equal(await capabilityStation.getAttribute('aria-label'), 'Capacidades científicas: Ainda não verificado',
      'a group without an explicit LIVE member and freshness proof must not render as “Ao vivo”');
    if (name === 'desktop-dark') await page.screenshot({ path: `${output}/atlas-aggregate-status.png`, fullPage: true });
    if (name === 'mobile-dark') await page.screenshot({ path: `${output}/atlas-aggregate-status-mobile.png`, fullPage: true });

    if (mobile) await page.locator('.atlas-mobile-sidebar-close').click();

    // Lenses filter the published graph, and the table exposes the same visible nodes.
    const lensGroup = page.getByRole('group', { name: 'Lente do mapa' });
    await lensGroup.getByRole('button', { name: 'Tudo' }).click();
    await page.waitForFunction(() => document.querySelector('.atlas3d-page')?.dataset.atlasLens === 'tudo');
    const allLensCount = await graphNodes.count();
    await lensGroup.getByRole('button', { name: 'Ciência' }).click();
    await page.waitForFunction(() => document.querySelector('.atlas3d-page')?.dataset.atlasLens === 'ciencia');
    const scienceLensCount = await graphNodes.count();
    assert.ok(scienceLensCount > 0 && scienceLensCount < allLensCount,
      'a lente de Ciência deve restringir o conjunto completo sem o esvaziar');
    if (name === 'desktop-dark') await page.screenshot({ path: `${output}/atlas-${name}.png`, fullPage: true });
    await lensGroup.getByRole('button', { name: 'Tudo' }).click();
    await page.waitForFunction(() => document.querySelector('.atlas3d-page')?.dataset.atlasLens === 'tudo');
    const expandAll = page.getByRole('button', { name: 'Expandir tudo' });
    await expandAll.click();
    await page.waitForFunction(() => document.querySelector('.atlas3d-page')?.dataset.atlasExpansion === 'all');
    assert.ok(await graphNodes.count() > allLensCount, 'expandir tudo deve materializar nós descendentes');
    await page.getByRole('button', { name: 'Contrair tudo' }).click();
    await page.waitForFunction(() => document.querySelector('.atlas3d-page')?.dataset.atlasExpansion === 'context');
    assert.equal(await graphNodes.count(), allLensCount, 'contrair tudo deve restaurar a contagem inicial da lente');

    const tableButton = page.getByRole('button', { name: 'Ver como tabela' });
    await tableButton.click();
    const graphTable = page.locator('.nexo-graph-table');
    await graphTable.waitFor();
    assert.equal(await graphTable.locator('tbody tr').count(), await graphNodes.count(),
      'a tabela deve apresentar os mesmos nós abertos que o mapa');
    await page.getByRole('button', { name: 'Ver grafo' }).click();
    await canvas.waitFor();

    if (mobile) await detailsToggle.click();
    const scienceStations = page.locator('.atlas-a11y-stations button[data-domain="SCIENCE"]');
    const scienceStationCount = await scienceStations.count();
    assert.ok(scienceStationCount > 0, 'a fixture do Atlas deve expor estações de Ciência para testar seleção e proveniência');
    const firstScienceStation = scienceStations.first();
    const scienceStationLabel = (await firstScienceStation.innerText()).trim();
    await firstScienceStation.focus();
    await page.keyboard.press('Enter');
    const selectedScience = page.locator('.atlas-detail');
    await selectedScience.waitFor();
    const selectedId = await selectedScience.getAttribute('data-selected-node');
    assert.ok(selectedId, 'a seleção atual deve identificar a entidade no painel de detalhes');
    assert.equal((await selectedScience.locator('h1').innerText()).trim().toLocaleLowerCase(), scienceStationLabel.toLocaleLowerCase(),
      'selecionar a estação de Ciência deve abrir exatamente seus detalhes');
    const details = selectedScience.locator('.atlas-provenance');
    assert.equal(await details.count(), 1, 'a estação selecionada deve expor a origem e os dados técnicos');
    await details.locator('summary').click();
    const stationProvenance = (await details.innerText()).toLowerCase();
    assert.match(stationProvenance, /identificador/);
    assert.match(stationProvenance, /impressão digital/);
    assert.match(stationProvenance, /revisão da fonte/);
    await noOverflow(page, `${name}/Atlas`);
    if (name === 'desktop-dark') await page.screenshot({ path: `${output}/atlas-${name}-selected.png`, fullPage: true });
    if (mobile) {
      assert.equal(await detailsToggle.getAttribute('aria-expanded'), 'true');
      await page.locator('.atlas-mobile-sidebar-close').click();
      assert.equal(await detailsToggle.getAttribute('aria-expanded'), 'false');
    }

    // 9. Command Bar navigates and refuses writes where the responsive header exposes it.
    const commandInput = page.locator('.instrument-search input[aria-label="Buscar e navegar"]');
    if (mobile) {
      assert.equal(await commandInput.count(), 1, 'the command input remains present in the mobile header markup');
      assert.equal(await commandInput.isVisible(), false, 'the mobile design hides the command input');
      const productNavigation = page.getByRole('navigation', { name: 'Modo do produto' });
      assert.equal(await productNavigation.isVisible(), true, 'a navegação responsiva deve continuar visível no mobile');
      const nowMode = productNavigation.getByRole('button', { name: 'Agora', exact: true });
      assert.equal(await nowMode.count(), 1, 'o modo Agora deve estar disponível na navegação mobile');
      await nowMode.click();
      await page.waitForFunction(() => location.hash === '#/agora');
      await page.locator('.lab-route[data-view="LAB"]').waitFor();
    } else {
      const commandBar = page.getByRole('textbox', { name: 'Buscar e navegar' });
      await commandBar.fill('truthgraph');
      await commandBar.press('Enter');
      await page.locator('.p0-banner').waitFor();
      await commandBar.fill('deploy produção');
      await commandBar.press('Enter');
      assert.match(await page.locator('.notice-box').first().innerText(), /não executa escrita/);
    }

    // 10. Execution trace com as cinco etapas e readback explícito.
    await navigate('Execution');
    assert.equal(await page.locator('.trace-step').count(), 5, 'trace fora do contrato de cinco etapas');
    assert.equal(await page.locator('.readback-panel').count(), 1);

    // 11. Plano pessoal continua funcionando contra /api/world.
    await navigate('Now');
    await page.getByRole('button', { name: /Revisar contrato de integração/ }).waitFor();
    await page.getByRole('button', { name: /Revisar contrato de integração/ }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('link', { name: /Abrir na fonte/ }).getAttribute('href'),
      'https://github.com/example/project/issues/1');
    await page.keyboard.press('Escape');
    if (name === 'mobile-dark') await page.screenshot({ path: `${output}/personal-mobile.png`, fullPage: true });

    // 12. Navegação por teclado alcança a Command Bar e o tema alterna.
    if (!mobile) {
      await page.keyboard.press('Control+k');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Buscar e navegar');
    }
    await page.getByRole('button', { name: theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro' }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'dark' ? 'light' : 'dark');

    assert.deepEqual(errors, [], `erros de runtime em ${name}`);
    reports.push({ name, status: 'pass', viewport: `${width}x${height}`, theme, overflow: false,
      runtimeErrors: errors });
    await context.close();
  }

  // Passagem visual por cenário: cada estado crítico ganha uma captura própria.
  for (const [scenarioId, view] of SCENARIO_SHOTS) {
    const { context, page, errors } = await newPage(1440, 1000, 'dark', view);
    await page.goto(`${baseUrl}${VIEW_ROUTES[view] || VIEW_ROUTES.OVERVIEW}`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByLabel('Cenário de fixture').selectOption(scenarioId);
    await page.waitForFunction(id => document.querySelector('.fixture-strip select')?.value === id, scenarioId);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await noOverflow(page, `scenario-${scenarioId}`);
    await page.screenshot({ path: `${output}/scenario-${scenarioId}.png`, fullPage: true });
    assert.deepEqual(errors, [], `erros de runtime no cenário ${scenarioId}`);
    reports.push({ name: `scenario-${scenarioId}`, status: 'pass', view, runtimeErrors: errors });
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(`${output}/browser-report.json`,
  JSON.stringify({ status: 'pass', scenarios: reports, visualBaseline: 'pending-initial-review' }, null, 2));
console.log(JSON.stringify(reports.map(r => r.name)));
