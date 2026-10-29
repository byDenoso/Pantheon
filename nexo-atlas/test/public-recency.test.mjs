import test from 'node:test';import assert from 'node:assert/strict';
import {newestPublicQuestions,publicRecency,groupPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';
import {guardTests} from '../src/atlas/publicItems.ts';import {publicAtlasProjection} from '../worker/public-tests.mjs';
const g=(id,dates)=>({id,members:dates.map((d,i)=>({test:{id:id+i,...d}}))});
test('newest publication/update first, missing/invalid dates last, ties stable, no mutation',()=>{
 const source=[g('unknown',[{}]),g('old',[{published_at:'2026-01-01'}]),g('mixed',[{updated_at:'bad'},{published_at:'2026-02-01'},{published_at:'2026-01-01',updated_at:'2026-03-01'}]),g('tie',[{published_at:'2026-03-01'}])];const before=JSON.stringify(source);const sorted=newestPublicQuestions(source);
 assert.deepEqual(sorted.map(x=>x.id),['mixed','tie','old','unknown']);assert.deepEqual(sorted[0].members.map(x=>x.test.id),['mixed2','mixed1','mixed0']);assert.equal(JSON.stringify(source),before);
});
test('actual public corpus retains all tests and ordered groups/members',()=>{
 const groups=groupPublicQuestions(guardTests(publicAtlasProjection().tests));const sorted=newestPublicQuestions(groups);assert.equal(sorted.length,36);assert.equal(sorted.flatMap(x=>x.members).length,215);
 const check=values=>{for(let i=1;i<values.length;i++)assert.ok(values[i-1]>=values[i]);};check(sorted.map(g=>publicRecency(g.members[0].test)));for(const g of sorted)check(g.members.map(m=>publicRecency(m.test)));
});
