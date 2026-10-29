import routes from './publicStudyRoutes.json' with {type:'json'};
const entries=Object.entries(routes);
export const studyHref=(id:string)=>(routes as Record<string,string>)[id]??`/?pergunta=${encodeURIComponent(id)}#/`;
export function requestedQuestion(pathname:string,search:string){return entries.find(([,path])=>path===pathname.replace(/\/$/,''))?.[0]??new URLSearchParams(search).get('pergunta');}
// Stable fragment for one test inside its investigation page. The client-side test id is
// positional (`study-N`) and changes when the catalog is reordered, so the fragment is an
// opaque checksum (FNV-1a) of the test's four reviewed public fields instead. It carries no
// record identifier, and a link keeps pointing at the same text while that text is published.
type AnchoredTest={id:string;question:{'pt-BR':string};answers:{'pt-BR':string};method:{'pt-BR':string};result:{'pt-BR':string}};
const checksum=(value:string)=>{let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0');};
/** Anchor per test id. Tests with identical public text stay distinct: the later ones get `-2`, `-3`… */
export function testAnchors(tests:readonly AnchoredTest[]):Map<string,string>{
 const used=new Map<string,number>(),anchors=new Map<string,string>();
 for(const test of [...tests].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
  const base=`teste-${checksum([test.question,test.method,test.result,test.answers].map(field=>field['pt-BR']).join('\u0001'))}`,count=(used.get(base)??0)+1;
  used.set(base,count);anchors.set(test.id,count===1?base:`${base}-${count}`);
 }
 return anchors;
}
/** Direct link to a test. Only investigations with their own page accept a fragment; the legacy `?pergunta=` form keeps its `#/` route. */
export function testHref(groupId:string,anchor:string|undefined){const href=studyHref(groupId);return anchor&&href.startsWith('/pesquisa/')?`${href}#${anchor}`:href;}
export const requestedTestAnchor=(hash:string)=>/^#teste-[0-9a-f]{8}(?:-\d{1,3})?$/.test(hash)?hash.slice(1):null;
