import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, rmSync} from 'node:fs';
import {transpileModule, ScriptTarget, ModuleKind, JsxEmit} from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {guardTest, guardTests, loadPublic, MAX_ITEMS} from '../src/atlas/publicItems.ts';
import {fetchPublic} from '../src/atlas/api.ts';
import {publicAtlas} from '../server/atlas/boundary.mjs';
import {APPROVED_PUBLIC_TESTS, projectApprovedPublicTests, publicTestSourceDigest} from '../server/atlas/public-test-projection.mjs';
const bi = text => ({'pt-BR': `${text} PT`, en: `${text} EN`});
const summary = (id = 'public-test') => ({id, question: bi('Question?'), answers: bi('Scope'), method: bi('Method'), result: bi('Inconclusive; uncertainty remains.')});
const raw = () => ({id: 'SYNTHETIC_PRIVATE_ID', kind: 'TEST', question: 'PRIVATE QUESTION', status: 'DONE', scientific_state: 'INCONCLUSIVE', limitations: ['Private limitation'], result_meaning: 'Not conclusive', secret: 'PRIVATE_SENTINEL', semantic: {question_plain: 'PRIVATE PLAIN'}, _source_path: 'private/path'});
const approval = row => ({testId: row.id, sourceDigest: publicTestSourceDigest(row), publicId: 'public-test', ...Object.fromEntries(Object.entries(summary()).filter(([key]) => key !== 'id'))});
const response = payload => new Response(JSON.stringify({contract: 'ATLAS_PUBLIC_V1', items: [], links: [], ...payload}), {headers: {'content-type': 'application/json'}});

test('optional tests list is backward compatible and malformed top-level lists fail closed', async () => {
  assert.deepEqual(await fetchPublic(async () => response({})), {contract: 'ATLAS_PUBLIC_V1', items: [], links: []});
  assert.deepEqual(await loadPublic(async () => response({})), {status: 'empty', items: [], tests: []});
  for (const tests of [null, {}, 'text', 1]) await assert.rejects(fetchPublic(async () => response({tests})), error => error.code === 'CONTRACT');
  assert.equal((await loadPublic(async () => response({tests: [summary()]}))).status, 'ready');
});

test('public test guard keeps exactly four bilingual fields and the opaque UI key', () => {
  const safe = guardTest({...summary(), ...{secret: 'PRIVATE', status: 'DONE', links: ['private'], hypothesis: 'PRIVATE'}});
  assert.deepEqual(safe, summary());
  for (const field of ['question', 'answers', 'method', 'result']) {
    for (const value of [undefined, null, '', 'raw text', {'pt-BR': 'only PT'}, {'pt-BR': '', en: 'EN'}, bi('x'.repeat(4001))]) assert.equal(guardTest({...summary(), [field]: value}), null, field);
  }
  assert.equal(guardTest({...summary(), id: ''}), null);
  assert.equal(guardTests([summary(), summary()]).length, 1);
  assert.equal(guardTests(Array.from({length: 500}, (_, i) => summary(`s${i}`))).length, MAX_ITEMS);
});

test('no approval, source flags or private source input can publish a test', () => {
  assert.deepEqual(APPROVED_PUBLIC_TESTS, []); assert.ok(Object.isFrozen(APPROVED_PUBLIC_TESTS));
  const row = {...raw(), public: true, approved: true, publication_status: 'PUBLISHED'};
  assert.deepEqual(projectApprovedPublicTests({tests: [row]}), []);
  assert.deepEqual(projectApprovedPublicTests({tests: [row]}, []), []);
  assert.deepEqual(publicAtlas({tests: [row], approvals: [approval(row)]}), {contract: 'ATLAS_PUBLIC_V1', items: [], links: []});
});

test('explicit reviewed projection copies approved text only; source IDs, paths, metrics and unknown keys never escape', () => {
  const row = raw(), before = structuredClone(row), a = {...approval(row), injected: row};
  const output = projectApprovedPublicTests({tests: [row]}, [a]);
  assert.deepEqual(output, [summary()]); assert.deepEqual(row, before);
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|DONE|scientific_state|limitations|sourceDigest|source_path/);
  assert.equal(output[0].result.en, 'Inconclusive; uncertainty remains. EN');
});

test('changed result, limitation, review or source record invalidates previous approval; no fallback to DONE', () => {
  const row = raw(), a = approval(row);
  for (const change of [{result_meaning: 'Different'}, {limitations: ['New limit']}, {review_state: 'CONTESTED'}, {status: 'CHECKPOINTED'}, {secret: 'Changed'}]) assert.deepEqual(projectApprovedPublicTests({tests: [{...row, ...change}]}, [a]), []);
  for (const bad of [{...a, result: undefined}, {...a, sourceDigest: 'not-bound'}, {...a, method: {'pt-BR': 'No EN'}}]) assert.deepEqual(projectApprovedPublicTests({tests: [row]}, [bad]), []);
  assert.deepEqual(projectApprovedPublicTests({tests: []}, [a]), []);
  assert.deepEqual(projectApprovedPublicTests({tests: [row, row]}, [a]), []);
  assert.equal(publicTestSourceDigest({...row, semantic: {question_plain: 'PRIVATE PLAIN'}}), publicTestSourceDigest(row));
  assert.equal(publicTestSourceDigest(Object.fromEntries(Object.entries(row).reverse())), publicTestSourceDigest(row));
});

test('actual React test view renders exactly four fields in PT-BR and EN and escapes all reviewed text', async () => {
  const source = new URL('../src/atlas/ui/PublicTestView.tsx', import.meta.url), compiled = new URL(`../src/atlas/ui/.public-test-view-${process.pid}.mjs`, import.meta.url);
  const output = transpileModule(readFileSync(source, 'utf8'), {compilerOptions: {target: ScriptTarget.ES2022, module: ModuleKind.ESNext, jsx: JsxEmit.ReactJSX}}).outputText;
  writeFileSync(compiled, output);
  try {
    const {default: View} = await import(compiled.href);
    for (const [locale, labels] of [['pt-BR', ['Pergunta', 'O que o teste responde', 'Método', 'Resultado']], ['en', ['Question', 'What the test answers', 'Method', 'Result']]]) {
      const html = renderToStaticMarkup(createElement(View, {test: {...summary(), result: bi('<script>PRIVATE_PAYLOAD</script>')}, locale}));
      assert.deepEqual([...html.matchAll(/<dt>(.*?)<\/dt>/g)].map(match => match[1]), labels);
      assert.equal((html.match(/<dd>/g) ?? []).length, 4);
      assert.doesNotMatch(html, /<script>|status|data-source|canonical|href=/);
      assert.match(html, /&lt;script&gt;/);
      assert.match(html, locale === 'en' ? /Scope EN/ : /Scope PT/);
    }
  } finally { rmSync(compiled, {force: true}); }
});
