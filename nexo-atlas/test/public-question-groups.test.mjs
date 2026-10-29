import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {guardTests} from '../src/atlas/publicItems.ts';
import {groupPublicQuestions, filterPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';
const rows = guardTests(publicAtlasProjection().tests);
const groups = groupPublicQuestions(rows);
const catalog = JSON.parse(readFileSync('src/atlas/publicQuestionCatalog.json', 'utf8'));

test('reviewed editorial catalog groups all 215 tests into 36 questions exactly once', () => {
  assert.equal(groups.length, 36);
  assert.equal(catalog.length, 36);
  const members = groups.flatMap(group => group.members.map(member => member.test));
  assert.equal(members.length, 215);
  assert.equal(new Set(members.map(row => row.id)).size, 215);
  assert.deepEqual([...members].sort((a,b) => a.id.localeCompare(b.id)), [...rows].sort((a,b) => a.id.localeCompare(b.id)));
  assert.equal(new Set(catalog.flatMap(group => group.members.map(member => member.question))).size, 215);
  assert.equal(catalog.flatMap(group => group.members).length, 215);
  assert.ok(catalog.flatMap(group => group.members).every(member => rows.some(row => row.question['pt-BR'] === member.question)));
});

test('redshift variants share an overview while different scientific comparisons remain separate', () => {
  const groupFor = index => groups.find(group => group.members.some(member => member.test === rows[index]));
  assert.equal(groupFor(5), groupFor(6));
  assert.equal(groupFor(5).members.length, 51);
  assert.notEqual(groupFor(5), groupFor(19));
  assert.notEqual(groupFor(19), groupFor(101));
  assert.notEqual(groupFor(101), groupFor(117));
  assert.notEqual(groupFor(147), groupFor(161));
  assert.notEqual(groupFor(178), groupFor(183)); // field presence is not informative content
});

test('all three verified reruns remain separate members of the same question', () => {
  const reruns = groups.flatMap(group => group.members).filter(member => member.repeat);
  assert.equal(reruns.length, 3);
  for (const [first, repeat] of [[58,59], [60,61], [62,63]]) {
    const group = groups.find(group => group.members.some(member => member.test === rows[first]));
    assert.ok(group.members.some(member => member.test === rows[repeat] && member.repeat));
  }
});

test('grouping never rewrites the four-field public payload or combines results', () => {
  const digest = createHash('sha256').update(JSON.stringify(publicAtlasProjection().tests.map(row => row.result))).digest('hex');
  assert.equal(digest, '7e4a1c35d224b727c20dd50544ff10911bbb920143705420ab6e75be012d67fa');
  for (const group of groups) assert.deepEqual(Object.keys(group).sort(), ['id','members','scope','title','total']);
  for (const group of catalog) assert.deepEqual(Object.keys(group).sort(), ['key','members','scope','title']);
  const raw = JSON.stringify(catalog);
  assert.doesNotMatch(raw, /https?:\/\/|FAM-|CONTEST-|WORK-|HYP-|T-SCI-|T-META-|ROADMAP-|REQ-|INBOX-|appgprj_|actions\/runs|[a-f0-9]{32,}/i);
});

test('unknown questions fail open into individual records instead of similarity grouping', () => {
  const first = {...rows[0], id: 'new-one', question: {'pt-BR': 'Pergunta inédita?', en:'New question?'}};
  const second = {...first, id: 'new-two'};
  const newGroups = groupPublicQuestions([first,second]);
  assert.equal(newGroups.length,2);
  assert.ok(newGroups.every(group => group.members.length === 1));
  assert.deepEqual(newGroups[0].members[0].test,first);
});

test('search finds nested parameters, reruns and results without multiplying question counts', () => {
  const search = q => filterPublicQuestions(groups,q,'pt-BR');
  let found = search('mínimo de 30 casos');
  assert.equal(found.length,1);assert.equal(found[0].members.length,1);assert.equal(found[0].total,3);
  assert.equal(found[0].members[0].test,rows[198]);
  assert.equal(search('minimo de 40 casos')[0].members[0].test,rows[199]);
  assert.equal(search('Repetindo o mesmo desenho')[0].members.length,3);
  assert.equal(search('redshift efetivo 0,919')[0].members.length,2);
  assert.equal(search('O acerto foi de 54%')[0].members[0].test,rows[197]);
  assert.deepEqual(search('not-a-real-research-query'),[]);
  assert.equal(search(groups.find(g=>g.id==='question-faixas-supernovas').title['pt-BR'])[0].members.length,51);
  assert.equal(search(''),groups);
});
