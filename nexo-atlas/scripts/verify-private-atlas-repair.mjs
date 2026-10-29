// Local read-only replay; keep the authorized source outside the Site checkout.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {buildLab} from '../src/features/lab/model.ts';
import {agentBoard} from '../src/private-workspace/agent-board.ts';
import {domainSummary,filterTests} from '../src/private-workspace/model.ts';
if (!process.argv[2]) throw new Error('Usage: node scripts/verify-private-atlas-repair.mjs /absolute/path/to/authorized-tower.json');
const bytes=await readFile(process.argv[2]),tower=JSON.parse(bytes),before=JSON.stringify(tower),sourcePosts=tower.files?.['evolution/board.json']?.value?.posts;
const state=compilePrivateTowerRuntime(tower).data.system,board=agentBoard(state),tests=[...buildLab(state).tests.values()],summary=domainSummary(tests,state);
assert.equal(JSON.stringify(tower),before,'Source must remain byte-value unchanged');
assert.equal(board.sourceCount,sourcePosts.length);assert.equal(board.invalidCount,0);assert.equal(board.posts.length,sourcePosts.length);
for (const post of board.posts) assert.equal(post.text,sourcePosts[post.sourceIndex].text);
for(const entry of state.domain_catalog.domains.filter(row=>row.navigation_redirect)){
 assert.equal(entry.counts.entities,0);assert.equal(entry.members.length,0);
 assert.equal(summary.some(row=>row.domain===entry.id),false);
 assert.deepEqual(filterTests(tests,entry.id,'all','',state).map(row=>row.id),filterTests(tests,entry.navigation_redirect.to,'all','',state).map(row=>row.id));
}
console.log(JSON.stringify({raw_sha256:createHash('sha256').update(bytes).digest('hex'),revision:tower.revision,snapshot_at:tower.updated_at,source_unchanged:true,evolution_partial:state.evolution===null,board:{source_count:board.sourceCount,displayable_count:board.posts.length,invalid_count:board.invalidCount,availability:board.availability,exact_text:true},navigation_redirects:state.domain_catalog.domains.filter(row=>row.navigation_redirect).map(row=>({from:row.id,to:row.navigation_redirect.to,canonical_entities:row.counts.entities,target_test_count:filterTests(tests,row.id,'all','',state).length}))},null,2));
