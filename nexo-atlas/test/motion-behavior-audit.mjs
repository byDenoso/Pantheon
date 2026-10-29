// Read-only behavioral audit. Usage: node /tmp/nexo-motion-audit.mjs /tmp/nexo-figures
// Loads project TypeScript into memory; does not build or write project files.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(process.argv[2]||'/tmp/nexo-figures');
const requireProject=createRequire(root+'/package.json');
const ts=requireProject('typescript'),React=requireProject('react');
const {renderToStaticMarkup}=requireProject('react-dom/server');
const noop=()=>{};
const baselineSource=p=>execFileSync('git',['show','HEAD:'+p],{cwd:root,encoding:'utf8'});
const currentSource=p=>readFileSync(resolve(root,p),'utf8');
function pointerAudit(read){
 let effect;let matchCalls=0,rectReads=0,nextId=1,scheduled=0;
 const frames=new Map(),listeners={},styleValues=new Map();
 const style=()=>({setProperty(k,v){styleValues.set(k,v)},removeProperty(k){styleValues.delete(k)}});
 const target={dataset:{},style:style(),classList:{contains:()=>false},isConnected:true,removeAttribute(n){if(n==='data-hover')delete this.dataset.hover},getBoundingClientRect(){rectReads++;return {left:0,top:0,width:100,height:100}}};
 const node={dataset:{},style:style(),querySelectorAll:()=>[],contains:()=>true,addEventListener:(k,f)=>listeners[k]=f,removeEventListener:noop};
 const document={hidden:false,documentElement:{scrollHeight:2000},addEventListener:noop,removeEventListener:noop};
 const window={innerHeight:800,scrollY:0,matchMedia:q=>{matchCalls++;return {matches:!q.includes('reduced-motion')}},addEventListener:noop,removeEventListener:noop,setTimeout,clearTimeout};
 const raf=fn=>{const id=nextId++;frames.set(id,fn);scheduled++;return id},cancel=id=>frames.delete(id);
 const src=read('src/atlas/ui/useVisitorMotion.ts').replace(/^import .*?;\n/,'').replace('export function','function');
 const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const Hook=Function('useEffect','document','window','requestAnimationFrame','cancelAnimationFrame','MutationObserver',js+';return useVisitorMotion')(fn=>effect=fn,document,window,raf,cancel,class{observe(){}disconnect(){}});
 Hook({current:node},true);const cleanup=effect();
 const flush=()=>{const ids=[...frames.keys()];for(const id of ids){const fn=frames.get(id);frames.delete(id);fn?.()}};
 const event=t=>({pointerType:'mouse',target:{closest:()=>t},clientX:50,clientY:50});
 flush();const startupMatchMedia=matchCalls;
 listeners.pointermove(event(target));listeners.pointerleave();flush();
 const hoverRestoredAfterLeave=target.dataset.hover==='true';
 listeners.pointerleave();let prevScheduled=scheduled,prevQueries=matchCalls;
 for(let i=0;i<60;i++){listeners.pointermove(event(null));flush()}
 const outside={events:60,scheduledRafs:scheduled-prevScheduled,matchMediaQueries:matchCalls-prevQueries};
 prevScheduled=scheduled;prevQueries=matchCalls;rectReads=0;
 for(let i=0;i<60;i++){listeners.pointermove(event(target));flush()}
 const inside={events:60,scheduledRafs:scheduled-prevScheduled,matchMediaQueries:matchCalls-prevQueries,geometryReads:rectReads};
 listeners.pointerleave();cleanup();assert.equal(frames.size,0);
 return {startupMatchMedia,hoverRestoredAfterLeave,outside,inside,remainingRafsAfterCleanup:frames.size};
}
const pointer={before:pointerAudit(baselineSource),after:pointerAudit(currentSource)};
assert.equal(pointer.before.hoverRestoredAfterLeave,true);
assert.equal(pointer.after.hoverRestoredAfterLeave,false);
assert.equal(pointer.after.outside.scheduledRafs,0);
assert.equal(pointer.after.outside.matchMediaQueries,0);
console.log('POINTER',JSON.stringify(pointer));

// Actual public fixtures, contract-validated before passing them to rendering.
const {publicAtlasProjection}=await import(pathToFileURL(root+'/worker/public-tests.mjs'));
const {publicEditorialProjection}=await import(pathToFileURL(root+'/worker/public-editorial.mjs'));
const {visualPublicProjection}=await import(pathToFileURL(root+'/worker/public-visuals.mjs'));
const {loadPublic}=await import(pathToFileURL(root+'/src/atlas/publicItems.ts'));
const pub=await loadPublic(async()=>Response.json(visualPublicProjection(publicEditorialProjection(publicAtlasProjection()))));
assert.equal(pub.status,'ready');
const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
globalThis.location={search:'',hash:'#/',pathname:'/'};globalThis.window={location};
function makeLoader(read,{reactOverride}={}){
 const cache=new Map();
 const load=p=>{
  const abs=resolve(p),relative=abs.slice(root.length+1);
  if(cache.has(abs))return cache.get(abs).exports;
  if(relative==='src/atlas/ui/Shell.tsx')return {__esModule:true,default:({children})=>React.createElement('div',null,children)};
  if(relative==='src/atlas/ui/CosmologicalBackdrop.tsx')return {__esModule:true,default:()=>null,CosmologicalHero:()=>null};
  if(relative==='src/atlas/ui/usePublicResearch.ts')return {__esModule:true,default:()=>({pub,checking:false,pending:false,checkedAt:null,refresh:noop})};
  if(relative==='src/atlas/ui/LocaleProvider.tsx')return {useLocale:()=> 'pt-BR',useMessages:()=>load(root+'/src/i18n/messages.ts').MESSAGES['pt-BR']};
  if(extname(abs)==='.css')return {};
  if(extname(abs)==='.json')return JSON.parse(read(relative));
  const module={exports:{}};cache.set(abs,module);
  const raw=read(relative).replaceAll('import.meta.url',JSON.stringify(pathToFileURL(abs).href));
  const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const req=id=>id==='react'&&reactOverride?reactOverride:id.startsWith('.')?load(resolve(dirname(abs),id)):requireProject(id);
  Function('require','module','exports','__filename','__dirname',js)(req,module,module.exports,abs,dirname(abs));
  return module.exports;
 };
 return load;
}
const counts=html=>({questionOverviews:(html.match(/class="atlas-question-group atlas-campaign-update"/g)||[]).length,studyViews:(html.match(/class="atlas-public-test"/g)||[]).length,summaryFigures:(html.match(/class="nexo-summary-figure"/g)||[]).length,detailedPlots:(html.match(/class="nexo-plot-svg"/g)||[]).length,dataTables:(html.match(/class="nexo-data-table"/g)||[]).length,htmlBytes:Buffer.byteLength(html)});
const renderHome=(read,open)=>{storage.clear();if(open)storage.set('nexo.public.explorer.v1.catalog.open','true');const App=makeLoader(read)(root+'/src/atlas/ui/PublicApp.tsx').default;return counts(renderToStaticMarkup(React.createElement(App)))};
const mounts={beforeInitial:renderHome(baselineSource,false),afterInitial:renderHome(currentSource,false),afterCatalogOpened:renderHome(currentSource,true)};
assert.equal(mounts.beforeInitial.studyViews,132);assert.equal(mounts.beforeInitial.detailedPlots,54);
assert.equal(mounts.afterInitial.studyViews,0);assert.equal(mounts.afterInitial.detailedPlots,0);
assert.equal(mounts.afterCatalogOpened.questionOverviews,8);assert.equal(mounts.afterCatalogOpened.studyViews,0);assert.equal(mounts.afterCatalogOpened.summaryFigures,0);assert.equal(mounts.afterCatalogOpened.detailedPlots,0);
console.log('MOUNTS',JSON.stringify(mounts));

// Execute the SummaryFigure's actual toggle handlers and persisted hook state.
const state=[];let cursor=0;
const reactOverride={...React,useMemo:fn=>fn(),useRef:value=>({current:value}),useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v]}};
const Summary=makeLoader(currentSource,{reactOverride})(root+'/src/atlas/ui/SummaryFigure.tsx').default;
const plot=pub.visuals.find(v=>v.plot)?.plot;assert.ok(plot);
const probe=React.createElement('div',{className:'technical-child-probe'},'Technical data');
const find=(element,predicate)=>{if(!element||typeof element!=='object')return null;if(predicate(element))return element;for(const child of React.Children.toArray(element.props?.children)){const found=find(child,predicate);if(found)return found;}return null};
const renderSummary=()=>{cursor=0;return Summary({plot,title:'Audit figure',locale:'pt-BR',children:probe})};
let tree=renderSummary();const probePresent=t=>renderToStaticMarkup(t).includes('technical-child-probe');
const lifecycle={initial:probePresent(tree)};
find(tree,e=>e.type==='details').props.onToggle({currentTarget:{open:false}});tree=renderSummary();lifecycle.afterInitialClosedToggle=probePresent(tree);
find(tree,e=>e.type==='details').props.onToggle({currentTarget:{open:true}});tree=renderSummary();lifecycle.afterFirstOpen=probePresent(tree);
find(tree,e=>e.type==='details').props.onToggle({currentTarget:{open:false}});tree=renderSummary();lifecycle.afterClose=probePresent(tree);
find(tree,e=>e.type==='details').props.onToggle({currentTarget:{open:true}});tree=renderSummary();lifecycle.afterReopen=probePresent(tree);
assert.deepEqual(lifecycle,{initial:false,afterInitialClosedToggle:false,afterFirstOpen:true,afterClose:true,afterReopen:true});
console.log('TECHNICAL_DISCLOSURE',JSON.stringify(lifecycle));
console.log('PASS: behavioral pointer, real React SSR mount counts, and actual disclosure handler lifecycle.');

// Follow actual group and per-test disclosure handlers through all first-page records.
const {groupPublicQuestions,newestPublicQuestions}=await import(pathToFileURL(root+'/src/atlas/publicQuestionGroups.ts'));
const groups=newestPublicQuestions(groupPublicQuestions(pub.tests)).slice(0,8);
let hookState=[],hookCursor=0;
const disclosureReact={...React,useMemo:fn=>fn(),useRef:value=>({current:value}),useState(initial){const own=hookState,i=hookCursor++;if(!(i in own))own[i]=typeof initial==='function'?initial():initial;return [own[i],v=>own[i]=typeof v==='function'?v(own[i]):v]}};
const Question=makeLoader(currentSource,{reactOverride:disclosureReact})(root+'/src/atlas/ui/PublicQuestionView.tsx').default;
const callWith=(Component,props,state)=>{hookState=state;hookCursor=0;return Component(props)};
const collect=(element,predicate,out=[])=>{if(!element||typeof element!=='object')return out;if(predicate(element))out.push(element);if(typeof element.type==='function')return out;for(const child of React.Children.toArray(element.props?.children))collect(child,predicate,out);return out};
let groupClosedRecords=0,variantClosedRecords=0,variantsOpened=0;const revealed=[];
for(const group of groups){
 const props={group,locale:'pt-BR',searching:false,visuals:pub.visuals},groupState=[];
 let tree=callWith(Question,props,groupState);
 groupClosedRecords+=collect(tree,e=>e.type?.name==='PublicTestView'||e.type?.name==='TestDisclosure').length;
 let toggle=find(tree,e=>e.type==='details'&&e.props.className==='atlas-question-details').props.onToggle;
 toggle({currentTarget:{open:true}});tree=callWith(Question,props,groupState);
 const children=collect(tree,e=>e.type?.name==='PublicTestView'||e.type?.name==='TestDisclosure');
 assert.equal(children.length,group.members.length);
 for(const child of children){
  if(child.type.name==='PublicTestView'){revealed.push(child.props.test.id);continue;}
  const local=[];let variant=callWith(child.type,child.props,local);
  variantClosedRecords+=collect(variant,e=>e.type?.name==='PublicTestView').length;
  variant.props.onToggle({currentTarget:{open:true}});variant=callWith(child.type,child.props,local);
  const records=collect(variant,e=>e.type?.name==='PublicTestView');assert.equal(records.length,1);revealed.push(records[0].props.test.id);variantsOpened++;
  variant.props.onToggle({currentTarget:{open:false}});variant=callWith(child.type,child.props,local);assert.equal(collect(variant,e=>e.type?.name==='PublicTestView').length,1);
 }
 toggle({currentTarget:{open:false}});tree=callWith(Question,props,groupState);assert.equal(collect(tree,e=>e.type?.name==='PublicTestView'||e.type?.name==='TestDisclosure').length,group.members.length);
}
const expected=groups.flatMap(g=>g.members.map(m=>m.test.id));assert.deepEqual(revealed,expected);assert.equal(groupClosedRecords,0);assert.equal(variantClosedRecords,0);
console.log('NESTED_DISCLOSURES',JSON.stringify({groupClosedRecords,variantClosedRecords,questionGroupsOpened:groups.length,variantsOpened,recordsRevealed:revealed.length,uniqueRecords:new Set(revealed).size,exactSourceOrderAndIdentity:true,retainedOnClose:true}));
const InteractivePlot=makeLoader(currentSource)(root+'/src/atlas/ui/InteractivePlot.tsx').default;
let technicalPanels=0;
for(const v of pub.visuals)if(v.plot){const html=renderToStaticMarkup(React.createElement(InteractivePlot,{plot:v.plot,title:v.title['pt-BR'],locale:'pt-BR',detailed:true}));assert.equal(counts(html).detailedPlots,1);assert.equal(counts(html).dataTables,1);assert.doesNotMatch(html,/NaN|Infinity/);technicalPanels++;}
console.log('DIRECT_TECHNICAL_CONTENT',JSON.stringify({panelsRendered:technicalPanels,allSvgAndDataTablesPresent:true,nonFiniteOutput:false}));
console.log('PASS: every deferred first-page record remains reachable through actual handlers, and all published technical panels render.');
