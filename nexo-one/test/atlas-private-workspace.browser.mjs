// Authenticated browser smoke for the new private presentation. Synthetic data only.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {buildPrivateUi} from '../scripts/build-private-ui.mjs';
import {startBackend} from './helpers/private-backend.mjs';
import {makeRuntime,makeWorld} from './helpers/synthetic-runtime.mjs';
import {privateWorkspaceState} from './helpers/private-workspace.fixture.mjs';
const temp=mkdtempSync(join(tmpdir(),'private-workspace-')),publicDir=join(temp,'dist'),privateDir=join(temp,'private');
let browser,backend;
try{
 await buildPrivateUi(privateDir);
 const build=spawnSync('npx',['vite','build','--outDir',publicDir,'--emptyOutDir'],{cwd:new URL('../',import.meta.url).pathname,encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const state=privateWorkspaceState(),fp=state.bus.fingerprint;
 const runtime=makeRuntime({system:state,world:makeWorld(fp),fingerprint:fp,generated_at:state.generated_at,source_revision:fp,topology:null,publication:null,galaxy:null},fp);
 backend=await startBackend({privateDir,publicDir,runtime});
 browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR'}),page=await context.newPage(),errors=[],foreign=[];
 page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>{if(!request.url().startsWith(backend.base)&&!request.url().startsWith('data:'))foreign.push(request.url());});
 await page.goto(`${backend.base}/#/privado`);await page.fill('#atlas-pin','synthetic-code-1');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 const frame=page.frameLocator('.atlas-private-frame');await frame.locator('.pw[data-view=web]').waitFor({timeout:20000});
 await frame.locator('.tc-stage canvas.tc-2d').waitFor();
 await frame.getByRole('link',{name:'Domínios',exact:true}).click();await frame.getByRole('heading',{name:'Olympus',exact:true}).waitFor();
 await frame.locator('.pw-domain').filter({hasText:'Olympus'}).click();
 assert.equal(await frame.locator('.pw-test-row').count(),8);
 await frame.getByRole('link',{name:/Com resultado/}).click();assert.equal(await frame.locator('.pw-test-row').count(),2);
 await frame.locator('.pw-open').first().click();
 assert.deepEqual(await frame.locator('.pw-detail-sections>details>summary').allInnerTexts(),['Dados','Receita','Execução','Revisão']);
 await frame.getByText('Receita',{exact:true}).click();assert.match(await frame.locator('.pw-detail-sections').innerText(),/SYNTHETIC-RECIPE/);
 const f=page.frames().find(value=>value!==page.mainFrame());await f.evaluate(()=>history.back());await frame.locator('.pw-test-list').waitFor();
 await frame.getByRole('link',{name:'Operação',exact:true}).click();assert.match(await frame.locator('.pw-operations').innerText(),/Qual caminho sintético/);
 await frame.getByRole('button',{name:/^Em execução/}).click();assert.equal(await frame.locator('.pw-operation').count(),1);
 await frame.getByRole('button',{name:/^Bloqueados/}).click();assert.equal(await frame.locator('.pw-operation').count(),1);
 await frame.getByRole('button',{name:/^Aguardando/}).click();assert.ok(await frame.locator('.pw-operation').count()>=1);
 // Returning to the web restores the existing renderer, not an image.
 await frame.getByRole('link',{name:'Teia',exact:true}).click();await frame.locator('.tc-stage canvas.tc-2d').waitFor();
 await frame.getByRole('combobox',{name:'Procurar por rótulo ou ID'}).fill('SYNTHETIC-OLYMPUS-3');await frame.getByRole('combobox',{name:'Procurar por rótulo ou ID'}).press('Enter');
 await frame.locator('[data-testid=tower-open-detail]').click();await frame.locator('.pw-test-detail').waitFor();
 if(process.env.WORKSPACE_SHOTS){mkdirSync(process.env.WORKSPACE_SHOTS,{recursive:true});await page.screenshot({path:join(process.env.WORKSPACE_SHOTS,'private-detail-desktop.png'),fullPage:true});}
 await page.setViewportSize({width:390,height:844});assert.ok(await f.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Sair',exact:true}).click();await page.locator('.atlas-private-frame').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>document.body.innerText.includes('Exemplo sintético')),false);
 assert.deepEqual(foreign,[]);assert.deepEqual(errors,[]);console.log('private workspace browser smoke: PASS');await context.close();
}finally{await backend?.close();await browser?.close();rmSync(temp,{recursive:true,force:true});}
