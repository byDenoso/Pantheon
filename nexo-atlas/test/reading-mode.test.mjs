import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {annotate, GLOSSARY} from '../src/atlas/glossary.ts';

const catalog = JSON.parse(readFileSync('src/atlas/publicCampaignCatalog.json', 'utf8'));
const plain = JSON.parse(readFileSync('src/atlas/publicPlain.json', 'utf8'));

test('plain summaries exist only for reviewed catalog entries and carry both locales', () => {
  for (const [key, value] of Object.entries(plain)) {
    assert.ok(catalog[key], `${key} has no reviewed brief`);
    assert.deepEqual(Object.keys(value).sort(), ['en', 'pt-BR']);
    assert.ok(value['pt-BR'].length > 40 && value.en.length > 40);
  }
});

test('plain summaries add no number that the reviewed summary does not state', () => {
  const numbers = text => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => n.replace(',', '.'));
  for (const [key, value] of Object.entries(plain)) {
    for (const locale of ['pt-BR', 'en']) {
      const allowed = new Set([...numbers(catalog[key].summary[locale]), ...numbers(catalog[key].limits[locale])]);
      for (const n of numbers(value[locale])) assert.ok(allowed.has(n), `${key} (${locale}) introduces ${n}`);
    }
  }
});

test('glossary annotates the first mention of each term and leaves the text intact', () => {
  const text = 'Na comparação DES-SN5YR/Union3 com Ωm = 0,3 ± 0,01 e faixas z = 0,01–0,15, excluir a primeira faixa reduziu a melhora do ajuste. Ωm = 0,33 também.';
  const segments = annotate(text, 'pt-BR');
  assert.equal(segments.map(s => typeof s === 'string' ? s : s.term).join(''), text);
  const terms = segments.filter(s => typeof s !== 'string').map(s => s.term);
  assert.deepEqual(terms, ['DES-SN5YR', 'Ωm', 'z', 'melhora do ajuste']);
  assert.equal(annotate('Texto sem termos técnicos.', 'pt-BR').length, 1);
});

test('glossary entries explain terms without stating results', () => {
  for (const entry of GLOSSARY) for (const locale of ['pt-BR', 'en']) {
    assert.doesNotMatch(entry.definition[locale], /\d+(?:[.,]\d+)?\s?σ|preferência por|preference for|detec[çt]/i, entry.id);
  }
});
