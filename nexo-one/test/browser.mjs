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

// Fixture do Universal Projection Bus, preservada do main: o readback do bus
// continua sendo verificado em toda viewport.
const projection={contract:'ProjectionEnvelope/v1',bus:'Pantheon/UniversalProjectionBus',fingerprint:'BUS-FIXTURE-V1',generated_at:new Date(now).toISOString(),state:'DEGRADED',sources:[{id:'NEXO_SSOT',state:'DEGRADED',revision:'ssot-r1',count:1},{id:'ACTION_REGISTER',state:'LIVE',revision:'action-r1',count:1},{id:'GITHUB',state:'LIVE',revision:'github-r1',count:1},{id:'VERCEL',state:'LIVE',revision:'vercel-r1',count:1}],envelopes:[{entity_id:'entity:ssot',domain:'NEXO',authority_class:'CANONICAL',source_ref:'https://source/ssot',source_revision:'ssot-r1',fingerprint:'PRJ-FIXTURE-1',freshness:{state:'STALE',observed_at:new Date(now-60000).toISOString(),expires_at:new Date(now-1).toISOString(),age_ms:60000},derivation_rule:'nexo-ssot:item->projection',state:'DEGRADED',source:'NEXO_SSOT',checked_at:new Date(now).toISOString(),projection_role:'NON_AUTHORITATIVE',error:{code:'UNAVAILABLE',message:'fixture degraded'}}]};

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

const browser = await chromium.launch({ headless: true });
const reports = [];

const newPage = async (width, height, theme, view = 'OVERVIEW') => {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: now });
  await page.addInitScript(([theme, view]) => {
    localStorage.setItem('nexo-theme', theme);
    localStorage.setItem('nexo-view', view);
  }, [theme, view]);
  await page.route('**/api/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
  await page.route('**/api/world*', route => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify(world) + '\n' }));
  await page.route('**/api/projections*', route => route.fulfill({ json: projection }));
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
    await page.goto(baseUrl);

    // 1. Overview carrega com estado global e os quatro domínios.
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByRole('heading', { name: 'Estado atual' }).waitFor();
    assert.equal(await page.locator('.domain-tile').count(), 4, 'quatro domínios no estado atual');
    await noOverflow(page, `${name}/Overview`);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });

    // 1b. Readback do Universal Projection Bus (verificação preservada do main).
    await page.getByTestId('projection-bus').waitFor();
    assert.equal((await page.getByTestId('projection-state').textContent())?.trim(), 'DEGRADED');
    await page.getByText('PROJECTION BUS', { exact: true }).click();
    assert.equal((await page.getByTestId('projection-fingerprint').textContent())?.trim(), 'BUS-FIXTURE-V1');
    assert.match((await page.getByTestId('projection-source-NEXO_SSOT').textContent()) || '', /DEGRADED.*ssot-r1/);
    await page.getByText('PROJECTION BUS', { exact: true }).click();

    // 2. Navegação: percorre as visões preservando um H1 por tela.
    const navigate = async view => {
      if (mobile) {
        await page.getByRole('button', { name: 'Mais' }).click();
        await page.getByRole('dialog', { name: 'TODAS AS VISÕES' }).waitFor();
        await page.getByRole('dialog').getByRole('button', { name: new RegExp(view, 'i') }).first().click();
      } else {
        await page.getByRole('navigation', { name: 'Navegação principal' })
          .getByRole('button', { name: new RegExp(view, 'i') }).first().click();
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
    assert.match(await page.locator('.rule-note').first().innerText(), /UNVERIFIED não é funcionalidade parcial/);

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

    // 6. Atlas: seleção de entidade abre o inspector (painel no desktop, folha no mobile).
    await navigate('Atlas');
    await page.locator('.atlas-canvas').waitFor();
    assert.ok(await page.locator('.atlas-node').count() > 10, 'grafo praticamente vazio');
    await page.locator('.atlas-node').first().click();
    await page.locator('.entity-inspector').waitFor();
    const inspector = (await page.locator('.entity-inspector').innerText()).toLowerCase();
    for (const field of ['upstream', 'downstream', 'fingerprint', 'source_revision', 'checked_at']) {
      assert.ok(inspector.includes(field), `inspector sem ${field}`);
    }
    await page.screenshot({ path: `${output}/atlas-${name}.png`, fullPage: true });
    // No mobile o inspector é uma folha inferior que cobre o conteúdo: fecha antes de seguir.
    if (mobile) {
      await page.getByRole('button', { name: 'Fechar inspector' }).click();
      await page.locator('.atlas-sheet').waitFor({ state: 'detached' });
    }

    // 7. Filtros do Atlas reduzem o grafo e podem ser limpos.
    const countNodes = () => page.locator('.atlas-node').count();
    const before = await countNodes();
    await page.getByRole('button', { name: /Filtros/ }).click();
    await page.locator('.atlas-filters').waitFor();
    await page.locator('.chip-group', { hasText: 'DOMÍNIO' }).getByRole('button', { name: 'OLYMPUS' }).click();
    assert.ok(await countNodes() < before, 'o filtro de domínio não reduziu o grafo');
    if (name === 'desktop-dark') await page.screenshot({ path: `${output}/atlas-filtered.png`, fullPage: true });
    await page.getByRole('button', { name: 'Limpar' }).click();
    assert.equal(await countNodes(), before, 'limpar filtros não restaurou o grafo');

    // 8. Contexto preservado: o filtro de busca sobrevive à ida e volta entre visões.
    await page.getByRole('textbox', { name: 'Buscar no grafo' }).fill('olympus');
    const filtered = await countNodes();
    await navigate('Integrity');
    await navigate('Atlas');
    assert.equal(await page.getByRole('textbox', { name: 'Buscar no grafo' }).inputValue(), 'olympus',
      'a busca do Atlas não sobreviveu à navegação');
    assert.equal(await countNodes(), filtered, 'o resultado filtrado não foi preservado');
    await page.getByRole('textbox', { name: 'Buscar no grafo' }).fill('');

    // 9. Command Bar: navega e recusa escrita explicitamente.
    const commandBar = page.getByRole('textbox', { name: 'Comando global' });
    await commandBar.fill('truthgraph');
    await commandBar.press('Enter');
    await page.locator('.p0-banner').waitFor();
    await commandBar.fill('deploy produção');
    await commandBar.press('Enter');
    assert.match(await page.locator('.notice-box').first().innerText(), /não executa escrita/);

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
    await page.keyboard.press('Control+k');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Comando global');
    await page.getByRole('button', { name: theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro' }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'dark' ? 'light' : 'dark');

    assert.deepEqual(errors, [], `erros de runtime em ${name}`);
    reports.push({ name, status: 'pass', viewport: `${width}x${height}`, theme, overflow: false,
      runtimeErrors: errors, projectionState: 'DEGRADED', projectionFingerprint: 'BUS-FIXTURE-V1' });
    await context.close();
  }

  // Passagem visual por cenário: cada estado crítico ganha uma captura própria.
  for (const [scenarioId, view] of SCENARIO_SHOTS) {
    const { context, page, errors } = await newPage(1440, 1000, 'dark', view);
    await page.goto(baseUrl);
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
  JSON.stringify({ status: 'pass', scenarios: reports, projectionReadback: 'pass', visualBaseline: 'pending-initial-review' }, null, 2));
console.log(JSON.stringify(reports.map(r => r.name)));
