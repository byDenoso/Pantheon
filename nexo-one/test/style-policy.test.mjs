import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STYLE_POLICY,
  detectStyleViolations,
  validateStyleText,
  buildStyleInstruction,
  enforceStyleText,
} from '../server/policy/style-policy.mjs';

const banned = [
  'Não é uma questão de força, é uma questão de técnica.',
  'Não falta infraestrutura, falta integração.',
  'Não é sobre dados, é sobre contexto.',
  'Não se trata de volume, e sim de qualidade.',
  'O problema não é latência. É coordenação.',
  'Não falta outro painel. Falta fechar o circuito.',
];

const allowed = [
  'A técnica é o principal limitador atual.',
  'A integração é a prioridade de infraestrutura.',
  'O contexto determina a interpretação dos dados.',
  'A qualidade determina o volume útil.',
  'A coordenação é o gargalo principal.',
  'A API não é compatível com Node 18.',
  'O endpoint não está disponível durante a migração.',
];

test('policy is canonical and enabled for every generated surface', () => {
  assert.equal(STYLE_POLICY.id, 'STYLE_DIRECT_AFFIRMATIVE_V1');
  assert.equal(STYLE_POLICY.bannedContrastiveReframe, true);
  assert.deepEqual(STYLE_POLICY.surfaces, [
    'chat','ui','artifact','report','paper','letter','slide','infographic','automation','agent',
  ]);
});

test('detects explicit contrastive rhetorical reframing', () => {
  for (const sample of banned) {
    const violations = detectStyleViolations(sample);
    assert.ok(violations.length > 0, `expected violation for: ${sample}`);
    assert.equal(violations[0].code, 'CONTRASTIVE_REFRAME');
  }
});

test('keeps ordinary factual negation valid', () => {
  for (const sample of allowed) {
    assert.deepEqual(detectStyleViolations(sample), [], `unexpected violation for: ${sample}`);
    assert.deepEqual(validateStyleText(sample), {ok: true, violations: []});
  }
});

test('returns fail-closed validation metadata for banned phrasing', () => {
  const result = validateStyleText('Não é sobre velocidade, é sobre confiabilidade.');
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].code, 'CONTRASTIVE_REFRAME');
  assert.equal(result.violations[0].severity, 'ERROR');
});

test('builds a reusable instruction for agents and generators', () => {
  const instruction = buildStyleInstruction();
  assert.match(instruction, /frases afirmativas diretas/i);
  assert.match(instruction, /reformulações binárias contrastivas/i);
  assert.match(instruction, /reescreva/i);
});

test('enforcement rewrites and validates before release', async () => {
  const out = await enforceStyleText('Não falta integração, falta coordenação.', {
    rewrite: () => 'A coordenação da integração é a prioridade atual.',
  });
  assert.equal(out.text, 'A coordenação da integração é a prioridade atual.');
  assert.equal(out.rewritten, true);
  assert.equal(out.validation.ok, true);
});

test('enforcement fails closed without a rewrite path', async () => {
  await assert.rejects(
    () => enforceStyleText('Não é sobre A, é sobre B.'),
    error => error.code === 'STYLE_POLICY_VIOLATION',
  );
});
