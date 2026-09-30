import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import handler from '../server/handler.mjs';
import {publication} from './fixtures/mcp-publication.mjs';
import {MCP_TOOL_REGISTRY} from '../server/mcp/server.mjs';

const nativeFetch=globalThis.fetch;
let sourceUnavailable=false;
let statusUnavailable=false;
const published=publication();
globalThis.fetch=async(url,init)=>{
  if(String(url)==='https://bydenoso.github.io/Pantheon/tower-projection/publication.json'){
    if(sourceUnavailable)throw Error('secret-canary');
    return Response.json(published);
  }
  return nativeFetch(url,init);
};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const root=path.resolve('dist');
const server=http.createServer(async(req,res)=>{
  if(statusUnavailable&&req.url==='/api/mcp/status'){res.writeHead(404);return res.end('Not found');}
  if(req.url.startsWith('/api/'))return handler(req,res);
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname.endsWith('/tower-projection/publication.json')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(published));}
  if(pathname.endsWith('/mcp/topology.json')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({contract:'NEXO_MCP_TOPOLOGY_V1',generated_at:published.manifest.generated_at,source:{projection_fingerprint:published.manifest.projection_fingerprint},stats:{tools:0,remote_tools:0,internal_tools:0,capabilities:0,backends:0,roles:0,backend_counts:{}},nodes:[],links:[]}));}
  try{const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(process.env.MCP_BROWSER_PORT||0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
if(process.argv.includes('--serve')){console.log(base);await new Promise(()=>{});}
const browser=await chromium.launch({headless:true,...(process.env.MCP_BROWSER_EXECUTABLE?{executablePath:process.env.MCP_BROWSER_EXECUTABLE}:{})});
await mkdir('test-output',{recursive:true});
async function noOverflow(page,label){const widths=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert(widths[0]<=widths[1]+1,`${label}: overflow ${widths}`);}
try{
  for(const [width,height,theme] of [[1440,1000,'dark'],[1440,1000,'light'],[390,844,'dark'],[390,844,'light']]){
    const context=await browser.newContext({viewport:{width,height},locale:'pt-BR'});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/#/sistema?tab=mcp&theme=${theme}`);
    await page.locator('[data-mcp-control-ready="true"]').waitFor();
    assert.equal(await page.locator('.mcp-tool-grid article').count(),Object.keys(MCP_TOOL_REGISTRY).length);
    assert.equal(await page.locator('[data-mcp-theme]').first().getAttribute('data-mcp-theme'),theme);
    await noOverflow(page,`${width}/${theme}/status`);
    const select=page.getByRole('combobox',{name:'Ferramenta',exact:true});await select.selectOption('get_campaign');
    await page.getByRole('textbox',{name:'id',exact:true}).fill('C1');
    const execute=page.getByRole('button',{name:'Executar consulta',exact:true});await execute.focus();await page.keyboard.press('Enter');
    await page.locator('.mcp-result-human').waitFor();assert((await page.locator('.mcp-result-human').innerText()).includes('Campanha H0'));
    assert((await page.locator('.mcp-result-human').innerText()).includes('Teste H0'));
    assert(!((await page.locator('.mcp-control').innerText()).includes('secret-canary')));
    await page.getByRole('button',{name:'JSON estruturado',exact:true}).click();assert((await page.locator('.mcp-control-section').filter({has:page.getByRole('heading',{name:'Console MCP'})}).innerText()).includes('"fingerprint"'));
    await noOverflow(page,`${width}/${theme}/result`);
    await page.getByRole('button',{name:'Visão humana',exact:true}).click();
    await page.screenshot({path:`test-output/mcp-${width}-${theme}.png`,fullPage:true});
    await select.selectOption('search_atlas');await page.getByRole('textbox',{name:'query',exact:true}).fill('does-not-exist');await execute.click();await page.getByText('Nenhum registro publicado para esta consulta.').waitFor();
    sourceUnavailable=true;await execute.click();await page.getByRole('alert').filter({hasText:'MCP_SOURCE_UNAVAILABLE'}).waitFor();await page.getByText('Fonte científica indisponível. As políticas continuam disponíveis.').waitFor();
    await select.selectOption('get_style_policy');await execute.click();await page.getByRole('heading',{name:'Política',exact:true}).waitFor();
    sourceUnavailable=false;await page.getByRole('button',{name:'Atualizar servidor'}).click();
    statusUnavailable=true;await page.getByRole('button',{name:'Atualizar servidor'}).click();
    await page.getByText('Servidor conectado pelo protocolo MCP.',{exact:false}).waitFor();
    assert.equal(await page.locator('.mcp-tool-grid article').count(),Object.keys(MCP_TOOL_REGISTRY).length);
    await page.getByText('Telemetria indisponível nesta versão do servidor.',{exact:false}).waitFor();
    await select.selectOption('get_style_policy');await execute.click();await page.getByRole('heading',{name:'Política',exact:true}).waitFor();
    await noOverflow(page,`${width}/${theme}/legacy-protocol`);
    await page.route('**/api/mcp',route=>route.abort('failed'));
    await page.getByRole('button',{name:'Atualizar servidor'}).click();
    await page.getByRole('alert').filter({hasText:'Servidor MCP indisponível.'}).waitFor();
    await page.unroute('**/api/mcp');
    statusUnavailable=false;
    assert.deepEqual(errors,[],`${width}/${theme}: runtime errors`);
    console.log(`MCP_BROWSER_${width}_${theme.toUpperCase()}_OK`);await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=nativeFetch;}
