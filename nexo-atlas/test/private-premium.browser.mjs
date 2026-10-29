// Review the actual Sites UI using synthetic owner/session/source adapters only.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {memoryRoute} from '../worker/memory.mjs';
import {continuityView} from '../server/atlas/continuity-view.mjs';

const input=makePrivateTowerFixture(),tower=memoryFixture(),continuity=makePrivateTowerFixture();
input.files['evolution/board.json']={encoding:'json',value:{posts:[
 {id:'ROOT',at:'2025-12-31T12:00:00Z',from:'ENGINEER',to:'EXECUTOR',text:'Synthetic exact canonical board question',refs:['TEST-01'],private:true},
 {id:'REPLY',at:'2025-12-31T13:00:00Z',from:'EXECUTOR',to:'ENGINEER',text:'Synthetic exact canonical board answer',reply_to:'ROOT',refs:[],private:true}
]}};input.file_count=Object.keys(input.files).length;
continuity.files['entities/artifact/ui-memory.json']={encoding:'json',value:{id:'ui-memory',kind:'NEXO_MEMORY_ENTRY',private:true,allowed_roles:[],payload:{contract:'NEXO_CONTINUITY_V1',author:'CHATGPT',recorded_at:'2026-10-07T12:00:00Z',scientific_authority:false,independence:'NOT_ESTABLISHED',scope:'PERSONAL',category:'USER_PREFERENCE',text:'Synthetic owner preference',sources:[]}}};continuity.file_count=Object.keys(continuity.files).length;
const runtime=compilePrivateTowerRuntime(input),control={authenticated:false,sourceError:null,continuityError:null,privateReads:0,continuityReads:0,grantWrites:0,grantActive:false,grantError:false};
const body=async req=>{const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString()||'{}');};
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');const json=(value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(u.pathname==='/api/atlas-access')return json({signedIn:true,owner:true,setupRequired:false});
 if(u.pathname==='/api/atlas-session'){
  if(req.method==='DELETE')control.authenticated=false;
  if(req.method==='POST'){const value=await body(req);control.authenticated=value.pin==='synthetic-demo-only';if(!control.authenticated)return json({error:'AUTH_REQUIRED'},401);}
  return json({configured:true,authenticated:control.authenticated,expiresAt:control.authenticated?new Date(Date.now()+3600000).toISOString():null});
 }
 if(u.pathname==='/api/atlas-private'){control.privateReads++;return control.sourceError?json(control.sourceError,503):json(runtime);}
 if(u.pathname==='/api/atlas-private/continuity'){control.continuityReads++;return control.continuityError?json(control.continuityError,503):json(continuityView(continuity,await body(req)));}
 if(u.pathname==='/api/atlas-private/autonomy')return json({error:'PRIVATE_SOURCE_UNAVAILABLE'},503);
 if(u.pathname==='/api/atlas-public')return json({contract:'ATLAS_PUBLIC_V1',items:[],links:[]});
 if(u.pathname==='/api/atlas-locale')return json({contract:'ATLAS_LOCALE_V1',locale:u.searchParams.get('lang')||'pt-BR',source:'preference',supported:['pt-BR','en']});
 if(u.pathname==='/api/atlas-mcp/grant'){if(req.method!=='GET'){control.grantWrites++;return json({error:'MCP_GRANT_APPROVAL_REQUIRED'},403);}if(control.grantError)return json({error:'MCP_GRANT_UNAVAILABLE'},503);return json({active:control.grantActive,expiresAt:control.grantActive?new Date(Date.now()+86400000).toISOString():null,approvalEnabled:false,role:'LEARNER',scope:'tower-scientific-current-readonly-v13'});}
 if(u.pathname.startsWith('/api/atlas-memory/')){const result=await memoryRoute(u.pathname,await body(req),async()=>tower);return json(result.body,result.status);}
 if(u.pathname.startsWith('/api/atlas-retrieval/'))return json({error:'RETRIEVAL_UNAVAILABLE'},503);
 if(u.pathname.startsWith('/api/atlas-knowledge/'))return json({error:'KNOWLEDGE_UNAVAILABLE'},503);
 let root='dist/client',path=u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(u.pathname==='/api/atlas-private-ui'){root='server/private-ui';path='index.html';}
 else if(u.pathname.startsWith('/api/atlas-private-assets/')){root='server/private-ui';path=u.pathname.replace('/api/atlas-private-assets/','');}
 if(!/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path)){res.statusCode=404;return res.end();}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(await readFile(resolve(root,path)));}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const output=process.env.PRIVATE_PREMIUM_SHOTS||'/workspace/artifacts/private-premium/sites-after',verify=process.env.PRIVATE_PREMIUM_VERIFY==='1',report=[],errors=[],foreign=[];
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',timezoneId:'America/Sao_Paulo'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:'))foreign.push(r.url());});
 await page.goto(origin+'/#/privado');await page.locator('#atlas-pin').waitFor();await page.screenshot({path:output+'/01-login-desktop.png'});
 if(verify){await page.fill('#atlas-pin','synthetic-wrong-code');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('#atlas-pin').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#atlas-pin').inputValue(),'');assert.equal(await page.locator('.atlas-private-frame').count(),0);}
 if(verify)await page.getByRole('button',{name:'Escuro',exact:true}).click();
 await page.fill('#atlas-pin','synthetic-demo-only');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.locator('.atlas-private-frame').waitFor();
 const frame=page.frames().find(f=>f.url().includes('/api/atlas-private-ui'));
 const shot=async name=>{await page.screenshot({path:output+'/'+name+'.png'});};
 const route=async(hash,selector,name)=>{await frame.evaluate(value=>location.hash=value,hash);await frame.locator(selector).first().waitFor();await shot(name);report.push({hash,viewport:await page.viewportSize(),name});assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name);};
 await route('#/teia','.tc-stage canvas','02-web-desktop');
 await route('#/teia/dominios','.pw-index','03-domains-desktop');
 await route('#/teia/dominio/OLYMPUS','.pw-rows','04-domain-desktop');
 await route('#/teia/testes','.pw-rows','05-tests-desktop');
 await frame.getByRole('searchbox').fill('Synthetic');await frame.getByRole('link',{name:/Com resultado/}).click();if(verify)assert.equal(await frame.getByRole('searchbox').inputValue(),'Synthetic');await shot('06-results-filter');
 await route('#/teia/teste/TEST-01','.pw-test','07-test-desktop');
 await frame.locator('.pw-folds>details').nth(1).locator('summary').click();await shot('08-test-method');
 await route('#/teia/operacao','.pw-ops','09-operations-desktop');
 await route('#/teia/mural','.pw-board-post','10-board-desktop');await frame.getByRole('searchbox').fill('no-match');await shot('11-board-empty');
 await route('#/teia/organograma','.tw canvas','12-organogram-desktop');
 if(verify)assert.ok(await frame.evaluate(()=>document.querySelector('.tw').getBoundingClientRect().height<=document.querySelector('.pw-content').getBoundingClientRect().height+1),'organogram stays inside workspace');
 await route('#/teia/continuidade','.pw-outline','13-continuity-desktop');
 await frame.locator('select').first().selectOption('PERSONAL');await frame.getByText('Synthetic owner preference',{exact:true}).first().waitFor();await shot('14-continuity-personal');
 await route('#/teia/memoria','.pr','15-memory-search');
 await frame.getByRole('button',{name:'Registros e rascunhos',exact:true}).click();await frame.locator('.pm-results').waitFor();await shot('16-memory-browse');
 await frame.getByRole('button',{name:/Abrir registro/}).first().click();await frame.locator('.pm-record').waitFor();await shot('17-memory-record');
 if(verify){await frame.getByRole('button',{name:'Adicionar anotação ou correção',exact:true}).click();await frame.getByLabel('Sua anotação',{exact:true}).fill('Synthetic annotation draft only');await frame.getByLabel('Motivo da alteração',{exact:true}).fill('Synthetic UI review');await frame.getByRole('button',{name:'Preparar revisão',exact:true}).click();await frame.getByText('Proposta preparada, ainda não salva',{exact:true}).waitFor();await shot('17b-memory-draft');}
 await route('#/teia/teste/NOT-PRESENT','.pw-page','18-missing-test');
 await page.getByRole('button',{name:'EN',exact:true}).click();await route('#/teia/continuidade','.pw-outline','19-continuity-en');
 if(verify){await frame.getByRole('heading',{name:'Projects and next steps',exact:true}).waitFor();assert.equal(await frame.getByText('Projetos e próximos passos',{exact:true}).count(),0);}
 if(verify){const maximum=await frame.locator('input[type=datetime-local]').getAttribute('max');const expected=await frame.evaluate(()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);});assert.equal(maximum,expected);const reads=control.continuityReads;await frame.locator('input[type=datetime-local]').fill('2999-01-01T00:00');await frame.getByRole('alert').waitFor();assert.equal(control.continuityReads,reads,'future dates never trigger a source request');await frame.locator('input[type=datetime-local]').fill('');await frame.locator('.pw-outline').first().waitFor();}
 await page.getByRole('button',{name:'Light',exact:true}).click();await frame.locator('.pw[data-theme=light]').waitFor();await shot('20-continuity-light');
 if(verify){await route('#/teia/memoria','.mcp-grant','20b-mcp-grant-light');const panel=frame.locator('.mcp-grant');await panel.getByText('No active grant.',{exact:true}).waitFor();assert.equal(await panel.getByRole('checkbox').isDisabled(),true);assert.equal(await panel.getByRole('button',{name:'Authorize for 30 days',exact:true}).isDisabled(),true);await panel.getByRole('button',{name:'Refresh authorization status',exact:true}).click();assert.equal(control.grantWrites,0);await panel.scrollIntoViewIfNeeded();await shot('20c-mcp-grant-inspection');const contrast=await panel.evaluate(el=>{const style=getComputedStyle(el),rgb=value=>value.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{const n=v/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);}),lum=value=>{const c=rgb(value);return .2126*c[0]+.7152*c[1]+.0722*c[2];},a=lum(style.color),b=lum(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert.ok(contrast>=4.5,'MCP grant text must remain legible in light theme: '+contrast);control.grantActive=true;await panel.getByRole('button',{name:'Refresh authorization status',exact:true}).click();await panel.getByRole('button',{name:'Revoke MCP access',exact:true}).waitFor();await shot('20e-mcp-active-readonly');control.grantError=true;await panel.getByRole('button',{name:'Refresh authorization status',exact:true}).click();await panel.getByRole('alert').waitFor();await shot('20f-mcp-status-error');assert.equal(control.grantWrites,0);control.grantError=false;await route('#/teia/continuidade','.pw-outline','20d-continuity-restored');}
 control.continuityError={error:'PRIVATE_SOURCE_UNAVAILABLE'};await frame.getByRole('button',{name:verify?'Refresh':'Atualizar',exact:true}).click();await frame.getByRole('alert').waitFor();await shot('21-continuity-error');control.continuityError=null;
 await page.setViewportSize({width:390,height:844});
 if(verify){await frame.locator('.pd-nav-toggle').click();assert.equal(await frame.locator('.pd-nav-toggle').getAttribute('aria-expanded'),'true');await frame.locator('.pd-nav-menu').getByRole('link',{name:'Board',exact:true}).click();await frame.locator('.pw-board-post').first().waitFor();await frame.locator('.pd-nav-toggle').click();await frame.locator('.pd-nav-toggle').press('Escape');assert.equal(await frame.locator('.pd-nav-toggle').getAttribute('aria-expanded'),'false');assert.equal(await frame.evaluate(()=>document.activeElement?.classList.contains('pd-nav-toggle')),true);}
 for(const [hash,selector,name]of [['#/teia/dominios','.pw-index','22-domains-mobile'],['#/teia/testes','.pw-rows','23-tests-mobile'],['#/teia/teste/TEST-01','.pw-test','24-test-mobile'],['#/teia/operacao','.pw-ops','25-operations-mobile'],['#/teia/mural','.pw-board-post','26-board-mobile'],['#/teia/continuidade','.pw-outline','27-continuity-mobile'],['#/teia/organograma','.tw canvas','28-organogram-mobile'],['#/teia','.tc-stage canvas','29-web-mobile']])await route(hash,selector,name);
 if(verify){await page.getByRole('button',{name:'Research autonomy',exact:true}).click();await page.locator('.research-autonomy').getByRole('alert').waitFor();await shot('29b-autonomy-unavailable');await page.locator('.research-autonomy').getByRole('button',{name:'Back',exact:true}).click();await page.locator('.atlas-private-frame').waitFor();}
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.locator('.atlas-private-frame').waitFor({state:'detached'});await shot('30-login-mobile');
 control.authenticated=true;control.sourceError={error:'PRIVATE_SOURCE_UNAVAILABLE',connectorStatus:'reauthentication_required'};
 await page.reload();await page.getByText(/Google Drive/).first().waitFor();await shot('31-drive-reconnect');
 if(verify){assert.equal(await page.locator('#atlas-pin').count(),0);const connect=page.getByRole('link',{name:'Reconnect Google Drive',exact:true});assert.equal(await connect.getAttribute('target'),'_top');assert.equal(await connect.getAttribute('href'),'/signin-with-chatgpt?return_to=%2F%23%2Fprivado');assert.equal(await page.locator('.atlas-private-frame').count(),0);}
 control.sourceError={error:'PRIVATE_SOURCE_UNAVAILABLE',connectorStatus:'disabled'};
 await page.reload();await page.getByRole('alert').waitFor();await shot('32-drive-unavailable');
 if(verify){assert.equal(await page.locator('#atlas-pin').count(),0);assert.equal(await page.getByRole('link',{name:'Reconnect Google Drive',exact:true}).count(),0);}
 if(verify){control.sourceError={error:'PRIVATE_SOURCE_UNAVAILABLE',retryAfter:1};await page.reload();await page.getByRole('alert').waitFor();const retry=page.getByRole('button',{name:/Try again in/});await retry.waitFor();assert.equal(await retry.isDisabled(),true);const reads=control.privateReads;await page.getByRole('button',{name:'Check connection again',exact:true}).waitFor();assert.equal(control.privateReads,reads,'countdown never automatically reloads a source');await shot('33-source-retry');}
 assert.deepEqual(errors,[]);assert.deepEqual(foreign,[]);await writeFile(output+'/report.json',JSON.stringify({source:'LOCAL SYNTHETIC FIXTURES ONLY',report,errors,foreign,grantWrites:control.grantWrites},null,2));
 console.log('PASS Sites private review: every current tab, PT/EN, light/dark, desktop/mobile, logout, source reconnect/unavailable states.');await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
