import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {validatePublicTests, publicAtlasProjection} from '../worker/public-tests.mjs';
import {guardTests, MAX_PUBLIC_TESTS} from '../src/atlas/publicItems.ts';
import {isCompletePublicTest} from '../src/atlas/publicCompleteness.ts';
const text = value => ({'pt-BR':value,en:value});
const sample=()=>({question:text('A estimativa resiste à mudança da amostra?'),answers:text('Avalia a sensibilidade à seleção dos dados.'),method:text('Compara as mesmas estimativas em duas amostras independentes.'),result:text('A estimativa permaneceu dentro do intervalo definido nas duas amostras.')});
test('public payload has four science fields and publication dates, without source identifiers',()=>{
 const payload=publicAtlasProjection();assert.equal(payload.contract,'ATLAS_PUBLIC_V1');assert.deepEqual(payload.items,[]);assert.deepEqual(payload.links,[]);
 for(const row of payload.tests)assert.deepEqual(Object.keys(row).sort(),['answers','method','published_at','question','result','updated_at']);
 assert.deepEqual(validatePublicTests([sample()]),[sample()]);
 assert.throws(()=>validatePublicTests([{...sample(),id:'source-test-id'}]),/PUBLIC_PROJECTION_INVALID/);
 assert.throws(()=>validatePublicTests([{...sample(),status:'CONFIRMED'}]),/PUBLIC_PROJECTION_INVALID/);
});
test('protected aliases and sensitive or operational tokens reject the whole public record',()=>{
 for(const forbidden of ['Olympus','OLYAUT26','OLY-PRIVATE','PEER','P.E.E.R','PER','PCDM','pNGB','Miqueias','GOOGLE_REFRESH_TOKEN','WORK-PRIVATE-ID','https://private.invalid/a','person@example.invalid','abcdef1234567890abcdef1234567890']){
  for(const field of ['question','answers','method','result'])assert.throws(()=>validatePublicTests([{...sample(),[field]:text('Texto '+forbidden)}]),/PUBLIC_PROJECTION_INVALID/,forbidden);
 }
});
test('ordinary Portuguese words with accented letters do not collide with model aliases',()=>{
 assert.equal(validatePublicTests([{...sample(),result:text('Não estabelece uma conclusão para períodos futuros.')}]).length,1);
});
test('public client keeps every reviewed test within bound, assigns only local UI keys',()=>{
 const rows=Array.from({length:332},sample),parsed=guardTests(rows);assert.equal(parsed.length,332);assert.equal(MAX_PUBLIC_TESTS,1000);assert.equal(parsed[0].id,'study-1');assert.equal(parsed.at(-1).id,'study-332');
 assert.equal(guardTests([{...sample(),id:'PRIVATE-SOURCE-ID'}])[0].id,'study-1');
});
test('public list is paginated and renders only four-field test components',()=>{
 const ui=readFileSync('src/atlas/ui/PublicTestList.tsx','utf8');assert.match(ui,/const PAGE_SIZE = 8/);assert.match(ui,/filtered\.slice\(/);assert.match(ui,/<PublicQuestionView/);const grouped=readFileSync('src/atlas/ui/PublicQuestionView.tsx','utf8');assert.match(grouped,/<PublicTestView/);assert.doesNotMatch(ui,/test\.id\}</);
 const view=readFileSync('src/atlas/ui/PublicTestView.tsx','utf8');assert.equal((view.match(/<dt>/g)||[]).length,4);assert.doesNotMatch(view,/test\.(?:status|domain|source|id)\}/);
});
test('anonymous public handler cannot reach Drive or use visitor identity',()=>{
 const source=readFileSync('worker/index.mjs','utf8');const route=source.slice(source.indexOf("if (path === '/api/atlas-public')"),source.indexOf("if (path === '/api/atlas-locale')"));
 assert.match(route,/publicAtlasProjection\(\)/);assert.doesNotMatch(route,/readPrivate|readSource|CONNECTORS|ownerAccess|fetch\(/);
});
test('all four public fields must be present without absence placeholders in either language',()=>{
 for(const missing of ['Método indisponível em descrição pública suficiente no registro atual.','Resultado científico indisponível no registro atual.','Não há resultado disponível que permita concluir este teste.','O alcance da resposta ainda não está descrito de forma suficiente no registro atual.','O método detalhado não está disponível para esta síntese.','Method is not available.','Result unavailable.','TBD',''])for(const field of ['question','answers','method','result'])for(const locale of ['pt-BR','en']){
  const row=sample();row[field][locale]=missing;assert.equal(isCompletePublicTest(row),false,missing);assert.deepEqual(guardTests([row]),[]);
 }
 const published=publicAtlasProjection().tests;assert.ok(published.length>0);assert.ok(published.every(isCompletePublicTest));
 const artifact=JSON.parse(readFileSync('worker/public-tests.json','utf8'));assert.ok(artifact.every(isCompletePublicTest));
});
test('concrete negative and inconclusive observations remain publishable without invented conclusions',()=>{
 for(const result of ['Não foi encontrado um ramo estável no modelo examinado.','O cálculo do tempo estava indisponível, e o alerta permaneceu ativo nos 25 casos examinados.','A comparação permaneceu inconclusiva porque apenas sete tarefas tinham idade calculável.']){
  const row={...sample(),result:text(result)};assert.equal(isCompletePublicTest(row),true);assert.equal(guardTests([row]).length,1);
 }
});
