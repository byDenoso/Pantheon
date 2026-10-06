import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTACT_EMAIL, PRESENTATION} from '../src/i18n/presentation.ts';
import {MESSAGES} from '../src/i18n/messages.ts';
import {loadPublic} from '../src/atlas/publicItems.ts';
const root = new URL('../', import.meta.url), rd = path => readFileSync(new URL(path, root), 'utf8');
const strings = value => typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const shape = value => typeof value === 'string' ? 's' : Array.isArray(value) ? value.map(shape) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, x]) => [key, shape(x)])) : typeof value;

test('approved direct opening and PT-BR metadata; document title retains the NEXO identity', () => {
  assert.deepEqual(PRESENTATION['pt-BR'].hero.title, ['Cosmologia', 'computacional.']);
  assert.equal(PRESENTATION['pt-BR'].hero.eyebrow, 'Pesquisa independente em cosmologia');
  assert.equal(MESSAGES['pt-BR'].heroLead, 'O NEXO estuda a expansão do Universo e a formação de suas estruturas, comparando modelos cosmológicos com dados de observações.');
  assert.deepEqual(PRESENTATION.en.hero.title, ['Computational', 'cosmology.']);
  assert.match(MESSAGES.en.heroLead, /comparing cosmological models with observational data/);
  assert.match(rd('index.html'), /<title>NEXO — Laboratório de Cosmologia Computacional<\/title>/);
  assert.match(rd('index.html'), /comparando modelos cosmológicos com dados de observações/);
  assert.match(rd('src/atlas/ui/PublicApp.tsx'), /document\.title = m\.heroTitle/);
});

test('both languages preserve structure, three research lines, four method steps and the exact four test labels', () => {
  const pt = PRESENTATION['pt-BR'], en = PRESENTATION.en;
  assert.deepEqual(shape(pt), shape(en));
  for (const text of strings(PRESENTATION)) assert.ok(text.trim());
  assert.deepEqual(pt.lines.items.map(row => row.id), ['expansion', 'structure', 'components']);
  assert.equal(pt.methods.steps.length, 4); assert.equal(en.methods.steps.length, 4);
  assert.deepEqual(Object.values(pt.test), ['Pergunta', 'O que o teste responde', 'Método', 'Resultado']);
  assert.deepEqual(Object.values(en.test), ['Question', 'What the test answers', 'Method', 'Result']);
  assert.match(rd('src/atlas/ui/PublicApp.tsx'), /const t = PRESENTATION\[locale\]/);
});

test('public copy contains no personal credentials, private projects, unapproved metrics or claimed discoveries', () => {
  const texts = [...strings(PRESENTATION), ...strings(MESSAGES)];
  for (const text of texts) {
    assert.doesNotMatch(text, /UFRJ|CEDERJ|\bPEER\b|\bPCDM\b|Antigravity|\bTower\b|\bPantheon\b|\bTCC\b|\bHerald\b|gradua[çc][aã]o|bacharel|undergraduate|bachelor|\bPhD\b/i);
    assert.doesNotMatch(text, /arxiv|doi\.org|\bdoi\b|preprint|\d+(?:[.,]\d+)?\s*(?:%|σ|sigma|km\/s|Mpc|Gyr)/i);
    assert.doesNotMatch(text, /confirmamos|comprovamos|descobrimos|demonstramos|we (?:confirmed|proved|discovered|showed)/i);
  }
  assert.doesNotMatch(rd('src/i18n/presentation.ts'), /import(?!\s+type)/);
});

test('the approved methods name CAMB and MCMC while uncertainty remains explicit', () => {
  for (const locale of ['pt-BR', 'en']) {
    const copy = PRESENTATION[locale];
    assert.match(copy.methods.steps[1].body, /CAMB/); assert.match(copy.methods.steps[2].body, /MCMC/);
    assert.match(copy.methods.steps[3].body, locale === 'en' ? /uncertainties.*assumptions/ : /incertezas.*hipóteses/);
    assert.match(MESSAGES[locale].vizNote, locale === 'en' ? /Artistic.*No observational data/ : /artística.*Sem dados observacionais/);
  }
  assert.doesNotMatch(rd('src/atlas/ui/PublicTestView.tsx'), /DONE|CONFIRMED|scientific_state|operational_status/);
});

test('empty allowlist is an honest sentence, errors remain distinct, no placeholder research is bundled', async () => {
  const response = () => new Response(JSON.stringify({contract: 'ATLAS_PUBLIC_V1', items: [], links: []}), {headers: {'content-type': 'application/json'}});
  assert.deepEqual(await loadPublic(response), {status: 'empty', items: [], tests: []});
  assert.deepEqual(await loadPublic(async () => new Response('nope', {status: 503})), {status: 'unavailable', items: [], tests: []});
  assert.equal(MESSAGES['pt-BR'].emptyTitle, 'Não há trabalhos públicos disponíveis nesta página por enquanto.');
  assert.equal(MESSAGES.en.emptyTitle, 'No public research materials are available on this page yet.');
  const app = rd('src/atlas/ui/PublicApp.tsx');
  assert.match(app, /pub\.status === 'empty' && <p className="atlas-empty">\{m\.emptyTitle\}<\/p>/);
  assert.match(app, /pub\.status === 'ready' && pub\.tests\.map/);
  assert.match(app, /pub\.status === 'ready' && pub\.items\.map/);
  assert.doesNotMatch(app, /fixture|demo|sample|synthetic/i);
});

test('open layout, self-hosted replaceable fonts and retained decorative animation', () => {
  const app = rd('src/atlas/ui/PublicApp.tsx'), css = rd('src/atlas/public-presentation.css');
  for (const section of ['lines', 'methods', 'works', 'contact']) assert.match(app, new RegExp(`id="s-${section}"`));
  assert.match(css, /--action:#1e5bff/); assert.match(css, /font-family:Atlas Rounded/); assert.match(css, /NunitoBlack\.ttf/);
  assert.match(css, /font-display:swap/); assert.match(css, /@media\(max-width:600px\)/);
  assert.match(app, /<CosmicWebCanvas/); assert.match(app, /cosmic-web\.png/);
  assert.doesNotMatch(app, /atlas-card|atlas-callout/);
  assert.doesNotMatch(rd('index.html'), /fonts\.googleapis|fonts\.gstatic/);
  assert.match(css, /SIL OPEN FONT LICENSE Version 1\.1/);
});

test('contact, accessible mobile navigation and no new network or public-private import', () => {
  assert.equal(CONTACT_EMAIL, 'phys@denerpereira.com.br');
  const app = rd('src/atlas/ui/PublicApp.tsx'), shell = rd('src/atlas/ui/Shell.tsx');
  assert.equal((app.match(/href=\{`mailto:\$\{CONTACT_EMAIL\}`\}/g) ?? []).length, 2);
  assert.doesNotMatch(app, /<form|<input|<textarea|PrivateApp|privateSession|TowerWeb/);
  assert.equal((app.match(/fetch\(/g) ?? []).length, 1);
  assert.match(shell, /aria-expanded=\{menuOpen\}/); assert.match(shell, /event.key === 'Escape'/);
  assert.match(shell, /setMenuOpen\(false\); goToPublicSection\(id\)/);
  assert.doesNotMatch(rd('src/atlas/publicNavigation.ts'), /location\.hash\s*=/);
});
