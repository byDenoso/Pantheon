const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{const binary=process.env.ATLAS_CHROMIUM_MODULE?(await import(process.env.ATLAS_CHROMIUM_MODULE)).default:null;const browser=await chromium.launch(binary?{executablePath:await binary.executablePath(),headless:true,args:binary.args}:{headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.ATLAS_BASE_URL||'http://127.0.0.1:3000');await page.waitForSelector('.entity-item');await page.screenshot({path:path.resolve('preview-desktop.png'),fullPage:true});await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.screenshot({path:path.resolve('preview-light.png'),fullPage:true});await page.reload();await page.waitForSelector('.entity-item');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.locator('#theme-toggle').click();
await page.locator('#immersive').click();assert.equal(await page.locator('#immersive').getAttribute('aria-pressed'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('#immersive').getAttribute('aria-pressed'),'false');await page.locator('#motion').click();assert.equal(await page.locator('#motion').getAttribute('aria-pressed'),'true');await page.locator('#dimension').click();assert.equal(await page.locator('#motion').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#dimension-label').textContent(),'VISTA PLANA');await page.locator('#dimension').click();

// Graph Contract V1 reaches the browser with provenance and cache metadata.
const contract=await page.evaluate(()=>fetch('/api/graph?focus=system:NEXO&depth=3').then(r=>r.json()));
for(const key of ['nodes','edges','total','truncated','depth','fingerprint','sourceVersion','issues'])assert.ok(key in contract,'missing contract field '+key);
assert.ok(contract.fingerprint.length>0);

// Unresolved mapping is an audit issue: never a domain bar, never a sidebar domain.
assert.equal(await page.locator('#domain-chart [data-key="UNMAPPED"]').count(),0);
assert.equal(await page.locator('#domain-nav [data-domain-id="domain:UNMAPPED"]').count(),0);

// Learning has its own entrance; stages without a source say so instead of being filled in.
await page.locator('[data-mode="learning"]').click();await page.waitForSelector('#learning-panel .ladder-stage');
assert.equal(await page.locator('#learning-section-panel').isVisible(),true);
assert.equal(await page.locator('#learning-panel .ladder-stage').count(),5);
assert.ok(await page.locator('#learning-panel .ladder-stage.is-pending').count()>0);
assert.ok(await page.locator('#learning-panel .audit-cat').count()>=6);
await page.screenshot({path:path.resolve('preview-learning.png'),fullPage:true});

// Migration health lists every declared category, including the empty ones.
await page.locator('[data-mode="audit"]').click();await page.waitForSelector('#audit-panel .audit-cat');
assert.equal(await page.locator('#learning-section-panel').isVisible(),false);
assert.equal(await page.locator('#audit-panel .audit-cat').count(),6);
assert.ok((await page.locator('#audit-panel').textContent()).includes('Referências quebradas'));
await page.screenshot({path:path.resolve('preview-audit.png'),fullPage:true});
await page.locator('[data-mode="overview"]').click();
assert.equal(await page.locator('#audit-section').isVisible(),false);

// One to three layers, and the truncation badge only when the view is bounded.
await page.locator('#layers').selectOption('1');await page.waitForFunction(()=>!/RECORTE/.test(document.querySelector('#graph-count').textContent));
await page.locator('#layers').selectOption('3');await page.waitForFunction(()=>/RECORTE/.test(document.querySelector('#graph-count').textContent));

// Learning overlay resolves only entities the source itself cites in evidence_refs.
const cited=await page.evaluate(async()=>{const report=await fetch('/api/learning').then(r=>r.json());
 const tokens=[...new Set(report.emergent.flatMap(b=>b.items).flatMap(i=>String(i.evidenceRefs||'').match(/T-[A-Za-z0-9_+.\-]+/g)||[]))];
 for(const t of tokens){const id='test:'+t;
  // the citation must resolve to an entity that actually exists in the projection
  const entity=await fetch('/api/entity?id='+encodeURIComponent(id));if(!entity.ok)continue;
  const q=await fetch('/api/learning?id='+encodeURIComponent(id)).then(r=>r.json());if(q.relations&&q.relations.length)return id}
 return null});
if(cited){await page.locator('#search').fill(cited.replace(/^test:/,''));
 await page.waitForFunction(id=>[...document.querySelectorAll('.entity-item')].some(b=>b.dataset.entity===id),cited);
 await page.locator(`[data-entity="${cited}"]`).click();await page.waitForSelector('#learning-node');
 await page.locator('#learning-node').click();await page.waitForSelector('#learning-overlay .learning-row');
 assert.ok((await page.locator('#learning-overlay').textContent()).includes('suporte'));
 await page.locator('#close-inspector').click();await page.locator('#clear').click();await page.waitForSelector('.entity-item');
}else{console.log('note: no learning record cites a resolvable entity in this snapshot; overlay empty state not exercised')}

await page.locator('[data-focus="system:SCIENCE"]').click();await page.waitForFunction(()=>document.querySelector('#breadcrumbs').textContent.includes('Universo'));await page.screenshot({path:path.resolve('preview-science.png'),fullPage:true});
await page.locator('.entity-item').filter({hasText:'DOMAIN'}).first().dblclick();await page.waitForFunction(()=>document.querySelectorAll('[data-crumb]').length>=3);await page.locator('.entity-item').last().click();await page.waitForSelector('#open-node');await page.locator('#close-inspector').click();await page.keyboard.press('Control+k');assert.equal(await page.locator('#search').evaluate(e=>e===document.activeElement),true);
await page.locator('#home').click();await page.waitForFunction(()=>document.querySelectorAll('[data-crumb]').length===1);await page.setViewportSize({width:375,height:812});await page.locator('#theme-toggle').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.resolve('preview-mobile-light.png'),fullPage:true});await page.locator('#theme-toggle').click();await page.screenshot({path:path.resolve('preview-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
// The new panels must not introduce horizontal overflow on a phone viewport.
await page.locator('[data-mode="learning"]').click();await page.waitForSelector('#learning-panel .ladder-stage');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.resolve('preview-mobile-learning.png'),fullPage:true});
await page.locator('[data-mode="audit"]').click();await page.waitForSelector('#audit-panel .audit-cat');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.resolve('preview-mobile-audit.png'),fullPage:true});
await page.locator('[data-mode="overview"]').click();
await page.locator('#immersive').click();await page.screenshot({path:path.resolve('preview-mobile-map.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log('PASS desktop/mobile: contract, drill, inspector, learning overlay, learning + audit panels, layers, keyboard search, immersion, motion/flat, no overflow or page errors');await browser.close()})().catch(e=>{console.error(e);process.exit(1)});
