import test from 'node:test';
import assert from 'node:assert/strict';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {agentBoard,filterBoard,postStatus} from '../src/private-workspace/agent-board.ts';
const post=(id,extra={})=>({id,at:'2025-12-31T12:00:00Z',from:'ENGINEER',to:'EXECUTOR',text:'Canonical coordination text',refs:['TEST-01'],private:true,...extra});
const stateOf=posts=>{const tower=makePrivateTowerFixture();if(posts!==undefined)tower.files['evolution/board.json']={encoding:'json',value:{posts}};tower.file_count=Object.keys(tower.files).length;return {tower,state:compilePrivateTowerRuntime(tower).data.system};};

test('real canonical board shape remains readable even when evolution is partial',()=>{
 const {tower,state}=stateOf([post('POST-1'),post('POST-2',{text:'Different source text'})]);const before=JSON.stringify(state);
 assert.equal(state.evolution,null);assert.equal(state.evolution_partial.board.length,2);
 const board=agentBoard(state);assert.equal(board.availability,'available');assert.equal(board.sourceCount,2);assert.deepEqual(board.posts.map(p=>p.text),tower.files['evolution/board.json'].value.posts.map(p=>p.text));
 assert.equal(board.sourceRevision,state.bus.fingerprint);assert.equal(board.sourcePath,'evolution/board.json');assert.equal(board.posts[1].sourceIndex,1);assert.equal(JSON.stringify(state),before);
});
test('canonical absence, empty board, malformed posts and stale revision stay distinct',()=>{
 assert.equal(agentBoard(stateOf().state).availability,'unavailable');
 assert.equal(agentBoard(stateOf([]).state).availability,'available');assert.equal(agentBoard(stateOf([]).state).sourceCount,0);
 const {state}=stateOf([null,{id:'INVALID'},post('GOOD')]);const board=agentBoard(state);assert.equal(board.availability,'partial');assert.equal(board.invalidCount,2);assert.equal(board.posts.length,1);assert.equal(board.posts[0].sourceIndex,2);
 state.bus.fingerprint='different';assert.equal(agentBoard(state).availability,'unavailable');assert.equal(agentBoard(state).posts.length,0);
 const {state:absent}=stateOf();absent.evolution_partial.board=[post('FAKE-SNAPSHOT')];assert.equal(agentBoard(absent).posts.length,0);
});
test('all posts including private, expired, resolved and duplicate source IDs remain available',()=>{
 const posts=[post('SAME'),post('SAME',{text:'Separate source occurrence'}),post('RESOLVED',{resolved_at:'2025-12-31T13:00:00Z'}),post('EXPIRED',{expires_at:'2025-12-31T13:00:00Z'})];const board=agentBoard(stateOf(posts).state);
 const self=agentBoard(stateOf([post('SELF',{from:'ENGINEER',to:'ENGINEER'})]).state);assert.equal(postStatus(self.posts[0],self.posts,self.observedAt),'note');
 assert.equal(board.posts.length,4);assert.equal(filterBoard(board).length,4);assert.equal(filterBoard(board,{status:'resolved'})[0].id,'RESOLVED');assert.equal(filterBoard(board,{status:'expired'})[0].id,'EXPIRED');assert.equal(filterBoard(board,{query:'Separate',role:'EXECUTOR'}).length,1);
});
test('reply status requires a linked addressed-role response, not matching text or resolution inference',()=>{
 const root=post('ROOT'),answer=post('ANSWER',{reply_to:'ROOT',from:'EXECUTOR',to:'ENGINEER',at:'2025-12-31T13:00:00Z'}),wrong=post('WRONG',{reply_to:'ROOT',from:'LEARNER'}),future=post('FUTURE',{...answer,id:'FUTURE',at:'2026-01-02T13:00:00Z'});
 for(const posts of [[root,wrong],[root,future]]){const board=agentBoard(stateOf(posts).state);assert.equal(postStatus(board.posts[0],board.posts,board.observedAt),'open');}
 const board=agentBoard(stateOf([root,answer]).state);assert.equal(postStatus(board.posts[0],board.posts,board.observedAt),'answered');assert.equal(board.posts[0].resolved_at,null);assert.equal(filterBoard(board,{query:'ROOT'}).length,2);
});
