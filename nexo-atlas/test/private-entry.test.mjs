import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {privateEntryHash} from '../src/atlas/privateEntry.ts';
import {workspaceRoute} from '../src/private-workspace/model.ts';
test('normal private entry selects the Conhecimento view, with the WebGL Tower route at #/teia/cosmos',()=>{
 for(const hash of ['', '#/privado', '#/private', '#/']) assert.equal(privateEntryHash(hash),'#/teia');
 assert.deepEqual(workspaceRoute(privateEntryHash('#/privado')),{page:'web'});
 const workspace=readFileSync('src/private-workspace/PrivateWorkspace.tsx','utf8');assert.match(workspace,/route\.page === 'web' && <KnowledgeGraph/);assert.match(workspace,/route\.page === 'cosmos' && <TowerCosmos/);
});
test('retired bookmarks resolve into current private routes without a legacy fallback',()=>{
 const routes = {'#/cockpit/comando':'#/teia/operacao','#/cockpit/pipeline':'#/teia/operacao','#/cockpit/ciencia?tab=mural':'#/teia/mural','#/cockpit/ciencia':'#/teia/testes','#/cockpit/prova?tab=fontes':'#/teia/memoria','#/galaxia':'#/teia','#/atlas3d':'#/teia','#/tower':'#/teia','#/e/TEST-1':'#/teia/teste/TEST-1'};
 for(const [old,next] of Object.entries(routes)) {assert.equal(privateEntryHash(old),next);assert.notEqual(workspaceRoute(privateEntryHash(old)),null);}
 for(const hash of ['#/teia','#/teia/operacao','#/teia/teste/example','#/teia/mural'])assert.equal(privateEntryHash(hash),hash);
 const host=readFileSync('src/private-legacy/Host.tsx','utf8'),shell=readFileSync('src/private-workspace/PrivateWorkspace.tsx','utf8'),router=readFileSync('src/private-legacy/TowerRoute.tsx','utf8');
 assert.doesNotMatch(host,/LegacyApp/);assert.doesNotMatch(shell,/pw-legacy|cockpit|m\.legacy/);assert.doesNotMatch(router,/children|pw-legacy-return/);assert.match(router,/history\.replaceState/);
 assert.deepEqual(workspaceRoute('#/teia/mural'),{page:'board'});
 assert.doesNotMatch(readFileSync('src/private-workspace/Views.tsx','utf8'),/labHref|hashForView/);
});
test('private frame uses available viewport and does not force scroll on READY',()=>{
 const frame=readFileSync('src/atlas/ui/PrivateFrame.tsx','utf8'),css=readFileSync('src/atlas/atlas-theme.css','utf8');
 assert.doesNotMatch(frame,/scrollIntoView/);assert.doesNotMatch(css,/min-height:760px/);assert.match(css,/\.atlas-private-frame\{[^}]*flex:1[^}]*min-height:0/);
});
