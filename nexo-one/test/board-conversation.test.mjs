import test from 'node:test';
import assert from 'node:assert/strict';
import {boardConversation,boardThreads,boardThreadReplies} from '../src/features/lab/presentation.ts';
const now=Date.parse('2026-10-02T12:00:00Z');
const post={id:'P',at:'2026-10-02T10:00:00Z',from:'GUARDIAO',to:'ADVISOR',text:'Verificar a falha.'};
const reply={id:'R',at:'2026-10-02T11:00:00Z',from:'ADVISOR',to:'GUARDIAO',text:'Recebi e estou verificando.',reply_to:'P'};
test('recipient linked reply leaves inbox and stays in history without resolving anything',()=>{
 const records=[post,reply],before=structuredClone(records);
 const view=boardConversation(post,records,now);
 assert.equal(view.status,'Respondido');assert.equal(view.awaiting,false);assert.equal(view.archived,false);
 assert.deepEqual(boardThreads(records,now),[post]);assert.deepEqual(view.replies,[reply]);
 assert.deepEqual(records,before);assert.equal(post.resolved_at,undefined);
});
test('mentions, transport ACK, wrong author, wrong destination, future or earlier replies cannot answer',()=>{
 for(const candidate of [{...reply,reply_to:undefined,text:'Respondendo P'}, {...reply,from:'EXECUTOR'},
   {...reply,from:'GUARDIAO'}, {...reply,to:'EXECUTOR'}, {...reply,at:'2026-10-03T10:00:00Z'},
   {...reply,at:'2026-10-02T09:00:00Z'}, {...reply,text:''}]){
   assert.equal(boardConversation({...post,status:'ACKNOWLEDGED'},[candidate],now).awaiting,true);
 }
});
test('a broadcast stays pending after one reply when required audience is unpublished',()=>{
 const broadcast={...post,to:'ALL'};
 const view=boardConversation(broadcast,[reply],now);
 assert.equal(view.answered,false);assert.equal(view.awaiting,true);assert.equal(view.replies.length,1);
 assert.equal(view.audienceUnknown,true);
});
test('expiry or explicit closure archives without inventing a response',()=>{
 for(const changed of [{...post,expires_at:'2026-10-02T11:00:00Z'},{...post,resolved_at:'2026-10-02T11:00:00Z'}]){
  const view=boardConversation(changed,[],now);assert.equal(view.awaiting,false);assert.equal(view.answered,false);assert.equal(view.archived,true);
 }
});
test('complaint label requires literal type declaration, not a negative keyword',()=>{
 assert.equal(boardConversation(post,[],now).kind,'Conteúdo');
 assert.equal(boardConversation({...post,text:'Uma reclamação apareceu no histórico.'},[],now).kind,'Conteúdo');
 const view=boardConversation({...post,text:'Tipo: Reclamação\nO dado ainda não chegou.'},[],now);
 assert.equal(view.kind,'Reclamação');assert.equal(view.typeDeclared,true);
});
test('in_reply_to and nested history retain linkage; orphan replies remain visible',()=>{
 const alternative={...reply,reply_to:undefined,in_reply_to:'P'};
 const nested={...post,id:'N',at:'2026-10-02T11:30:00Z',reply_to:'R'};
 assert.deepEqual(boardThreads([post,alternative,nested],now),[post]);
 assert.deepEqual(boardThreadReplies(post,[post,alternative,nested],now),[alternative,nested]);
 assert.deepEqual(boardThreads([alternative],now),[alternative]);
});
test('cyclic links stay visible and cannot erase the history',()=>{
 const first={...post,at:reply.at,reply_to:'R'};
 assert.deepEqual(new Set(boardThreads([first,reply],now).map(p=>p.id)),new Set(['P','R']));
 assert.equal(boardThreadReplies(first,[first,reply],now).length,1);
});
test('an unspecified multi-recipient contract stays pending after one recipient reply',()=>{
 assert.equal(boardConversation({...post,to:'ADVISOR,EXECUTOR'},[reply],now).awaiting,true);
});
