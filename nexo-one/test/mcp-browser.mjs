// Browser contract for the authenticated local-snapshot query panel.
// Uses the production public/private builds and existing synthetic backend only.
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import handler from '../server/handler.mjs';
import {startBackend} from './helpers/private-backend.mjs';
import {makeRuntime} from './helpers/synthetic-runtime.mjs';
import {describeTools} from '../src/private-legacy/mcpClient.ts';
import {MUTATIONS} from '../server/mcp/operational-tools.mjs';

const nativeFetch=globalThis.fetch;
let providerReads=0;
globalThis.fetch=async()=>{providerReads++;throw Error('Unexpected provider request from the synthetic MCP browser test');};
const denialServer=http.createServer((req,res)=>handler(req,res));
await new Promise(resolve=>denialServer.listen(0,'127.0.0.1',resolve));
const denialBase=`http://127.0.0.1:${denialServer.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.MCP_BROWSER_EXECUTABLE?{executablePath:process.env.MCP_BROWSER_EXECUTABLE}:{})});
await mkdir('test-output',{recursive:true});
async function noOverflow(target,label){const widths=await target.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert(widths[0]<=widths[1]+1,`${label}: overflow ${widths}`);}
try{
  // Exercise the real HTTP handler from an anonymous browser, with no fixture auth.
  const anonymous=await browser.newContext();const probe=await anonymous.newPage();
  try{
    for(const route of ['/api/system','/api/mcp/status','/api/atlas-private','/api/atlas-private-ui']){
      const response=await probe.goto(denialBase+route);
      assert.equal(response.status(),401);assert.deepEqual(await response.json(),{error:'AUTH_REQUIRED'});
    }
    const anonymousMcp=await probe.evaluate(async(writeToolName)=>{
      const request=async(id,method,params={},protocolVersion,sessionId)=>{
        const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
        if(protocolVersion)headers['Mcp-Protocol-Version']=protocolVersion;
        if(sessionId)headers['Mcp-Session-Id']=sessionId;
        const response=await fetch('/api/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
        const text=await response.text();
        let body=null;
        if(text){
          if((response.headers.get('Content-Type')||'').includes('text/event-stream')){
            const data=text.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
            body=data?JSON.parse(data):null;
          }else body=JSON.parse(text);
        }
        return {status:response.status,body,protocolVersion:response.headers.get('Mcp-Protocol-Version'),sessionId:response.headers.get('Mcp-Session-Id')};
      };
      const notify=async(method,protocolVersion,sessionId)=>{
        const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
        if(protocolVersion)headers['Mcp-Protocol-Version']=protocolVersion;
        if(sessionId)headers['Mcp-Session-Id']=sessionId;
        const response=await fetch('/api/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',method})});
        return response.status;
      };
      const initialized=await request(1,'initialize',{
        protocolVersion:'2026-07-28',capabilities:{},clientInfo:{name:'mcp-browser-anonymous',version:'1.0.0'}
      });
      const negotiated=initialized.body?.result?.protocolVersion;
      const sessionId=initialized.sessionId;
      const initializedNotification=await notify('notifications/initialized',negotiated,sessionId);
      const listed=await request(2,'tools/list',{},negotiated,sessionId);
      const catalog=await request(3,'tools/call',{name:'get_public_catalog_status',arguments:{}},negotiated,sessionId);
      const privateCall=await request(4,'tools/call',{name:'get_science_state',arguments:{}},negotiated,sessionId);
      const mutation=await request(5,'tools/call',{name:writeToolName,arguments:{}},negotiated,sessionId);
      return {
        initialized:{status:initialized.status,protocolVersion:negotiated},
        initializedNotification,
        tools:{status:listed.status,names:listed.body?.result?.tools?.map(tool=>tool.name)},
        catalog:{status:catalog.status,payload:catalog.body?.result?.content?.[0]?.text?JSON.parse(catalog.body.result.content[0].text):null},
        privateCall:{status:privateCall.status,body:privateCall.body},
        mutation:{status:mutation.status,body:mutation.body}
      };
    },MUTATIONS[0]);
    assert.equal(anonymousMcp.initialized.status,200);
    assert.equal(typeof anonymousMcp.initialized.protocolVersion,'string');
    assert.ok(anonymousMcp.initialized.protocolVersion.length>0);
    assert.equal(anonymousMcp.initializedNotification,202);
    assert.deepEqual(anonymousMcp.tools,{status:200,names:['get_public_catalog_status']});
    assert.deepEqual(anonymousMcp.catalog,{status:200,payload:{
      contract:'NEXO_PUBLIC_CATALOG_STATUS_V1',status:'DEGRADED',availability:'UNAVAILABLE',items:[],reason:'CATALOG_UNAVAILABLE'
    }});
    assert.deepEqual(anonymousMcp.privateCall,{status:401,body:{error:'AUTH_REQUIRED'}});
    assert.deepEqual(anonymousMcp.mutation,{status:401,body:{error:'AUTH_REQUIRED'}});
    assert.equal(providerReads,0,'anonymous public discovery and private/write denials never read provider data');
  }finally{await anonymous.close();}

  console.log('MCP_BROWSER_ANONYMOUS_CONTRACT_OK');
  for(const [width,height,theme] of [[1440,1000,'dark'],[1440,1000,'light'],[390,844,'dark'],[390,844,'light']]){
    const runtime=makeRuntime(),expectedTools=describeTools(runtime);
    const expectedNode=runtime.system.graph.nodes.find(node=>node.label);
    assert.ok(expectedNode,'the fixture supplies a searchable source record');
    const before=JSON.stringify(runtime);
    const backend=await startBackend({privateDir:path.resolve('server/private-ui'),publicDir:path.resolve('dist'),runtime});
    const context=await browser.newContext({viewport:{width,height},locale:'pt-BR'});
    const page=await context.newPage(),errors=[],consoleMessages=[],requestFailures=[],responses=[],frameEvents=[],requests=[],foreign=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    page.on('console',message=>consoleMessages.push({type:message.type(),text:message.text().slice(0,1000)}));
    page.on('requestfailed',request=>requestFailures.push({url:request.url(),failure:request.failure()?.errorText||null}));
    page.on('response',response=>{const url=response.url();if(/\/api\/(?:atlas-private|atlas-private-ui|atlas-private-assets|autonomy-status)/.test(new URL(url).pathname))responses.push({url,status:response.status(),contentType:response.headers()['content-type']||null});});
    page.on('frameattached',frame=>frameEvents.push({event:'attached',url:frame.url()}));
    page.on('framenavigated',frame=>frameEvents.push({event:'navigated',url:frame.url()}));
    page.on('framedetached',frame=>frameEvents.push({event:'detached',url:frame.url()}));
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(new URL(url).origin!==backend.base){foreign.push(url);return route.abort('blockedbyclient');}
      return route.continue();
    });
    try{
      await page.goto(`${backend.base}/#/sistema?tab=mcp&theme=${theme}`);
      await page.locator('.atlas-public-main').waitFor();
      assert.equal(await page.locator('[data-mcp-control-ready],iframe.atlas-private-frame').count(),0,'the public entry exposes no private query panel');
      await page.goto(`${backend.base}/#/privado`);
      await page.locator('#atlas-pin').fill('synthetic-code-1');
      await page.getByRole('group',{name:'Tema',exact:true}).getByRole('button',{name:theme==='dark'?'Escuro':'Claro',exact:true}).click();
      await page.waitForFunction(expected=>document.documentElement.dataset.theme===expected,theme);
      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      await page.locator('iframe.atlas-private-frame').waitFor();
      const frame=await page.locator('iframe.atlas-private-frame').elementHandle().then(element=>element.contentFrame());
      assert.ok(frame);await frame.locator('.pw').waitFor();
      await frame.waitForFunction(expected=>document.documentElement.dataset.theme===expected,theme);
      await frame.evaluate(expected=>{location.hash=`#/sistema?tab=mcp&theme=${expected}`;},theme);
      await frame.locator('[data-mcp-control-ready="true"]').waitFor();
      await frame.waitForFunction(expected=>document.documentElement.dataset.theme===expected,theme);
      const registered=await frame.locator('.mcp-tool-grid article button strong').allTextContents();
      assert.deepEqual(registered,expectedTools.map(tool=>tool.name),'the real panel registers the private runtime query catalog');
      const panel=await frame.locator('.mcp-control').innerText();
      assert.match(panel,/PRIVATE · consultas somente leitura/);assert.match(panel,/local:\/\/snapshot-privado/);
      assert.match(panel,/sem saúde ao vivo de servidor, sem telemetria e sem acesso de máquina/);
      assert.doesNotMatch(panel,/ferramentas públicas|Servidor conectado pelo protocolo MCP/);
      await noOverflow(page,`${width}/${theme}/shell`);await noOverflow(frame,`${width}/${theme}/catalog`);

      const select=frame.getByRole('combobox',{name:'Ferramenta',exact:true});
      await select.selectOption('search_atlas');
      await frame.getByRole('textbox',{name:'query',exact:true}).fill(expectedNode.label);
      const execute=frame.getByRole('button',{name:'Executar consulta',exact:true});
      await execute.focus();await execute.press('Enter');
      await frame.locator('.mcp-result-human').waitFor();
      assert((await frame.locator('.mcp-result-human').innerText()).includes(expectedNode.label));
      await frame.getByRole('button',{name:'JSON estruturado',exact:true}).click();
      const result=JSON.parse(await frame.locator('.mcp-control-section').filter({has:frame.getByRole('heading',{name:'Console MCP'})}).locator('pre').innerText());
      assert.equal(result.access,'PRIVATE');assert.equal(result.scope,'LOCAL_SNAPSHOT');assert.equal(result.authority,null);
      assert.equal(result.fingerprint,runtime.fingerprint);assert.equal(result.sourceVersion,runtime.source_revision);
      assert.ok(result.items.some(item=>item.id===expectedNode.id&&item.label===expectedNode.label),'call readback preserves the declared source record');
      await frame.getByRole('button',{name:'Visão humana',exact:true}).click();await noOverflow(frame,`${width}/${theme}/result`);
      await page.screenshot({path:`test-output/mcp-${width}-${theme}.png`,fullPage:true});

      await select.selectOption('get_program');assert.equal(await execute.isDisabled(),true,'missing runtime capability stays unavailable');
      await select.selectOption('search_atlas');await frame.getByRole('textbox',{name:'query',exact:true}).fill('synthetic-record-that-does-not-exist');
      await execute.click();await frame.getByText('Nenhum registro publicado para esta consulta.').waitFor();
      await frame.getByRole('button',{name:'Atualizar servidor',exact:true}).click();
      await frame.locator('[data-mcp-control-ready="true"]').waitFor();
      assert.equal(JSON.stringify(runtime),before,'local read-only queries do not mutate the source generation');
      assert.equal(requests.some(url=>/^\/api\/(?:mcp(?:\/|$)|system$|world$|session$|recall$)/.test(new URL(url).pathname)),false,'the private console makes no live MCP or legacy adapter request');
      assert.deepEqual(foreign,[],'no external service is contacted');
      assert.deepEqual(errors,[],`${width}/${theme}: runtime errors`);
      await page.evaluate(()=>{location.hash='#/';});await page.locator('iframe.atlas-private-frame').waitFor({state:'detached'});
      assert.equal(await page.locator('[data-mcp-control-ready]').count(),0,'leaving the private area destroys the query panel');
      assert.equal((await page.locator('body').innerText()).includes(expectedNode.label),false,'private result is absent from public DOM');
      console.log(`MCP_BROWSER_${width}_${theme.toUpperCase()}_OK`);
    }catch(error){
      await page.screenshot({path:`test-output/mcp-failed-${width}-${theme}.png`,fullPage:true}).catch(()=>{});
      const diagnostic={url:page.url(),frames:await Promise.all(page.frames().map(async frame=>({url:frame.url(),body:(await frame.locator('body').innerText().catch(()=>'' )).slice(0,6000)}))),errors,consoleMessages,requestFailures,responses,frameEvents,requests,foreign};
      await writeFile(`test-output/mcp-failed-${width}-${theme}.json`,JSON.stringify(diagnostic,null,2));
      console.error('MCP_BROWSER_FAILURE',JSON.stringify(diagnostic));
      throw error;
    }finally{await context.close();await backend.close();}
  }
}finally{await browser.close();await new Promise(resolve=>denialServer.close(resolve));globalThis.fetch=nativeFetch;}
