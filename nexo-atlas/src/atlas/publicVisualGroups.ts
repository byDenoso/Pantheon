import catalog from './publicVisualComparisons.json' with {type:'json'};
import type {Bilingual} from './publicItems.ts';
import type {Locale} from './api.ts';
import type {PublicPlot,PublicVisual} from './publicVisuals.ts';

export type VisualLink={question:Bilingual;href:string};
export type VisualGroup={id:string;title:Bilingual;caption:Bilingual|null;members:PublicVisual[];configurations:Record<string,Bilingual>;plot?:PublicPlot};

/** A presentation revision checksum, NOT an approval, integrity or security boundary.
 * The normal public guard remains authoritative. Any changed public content loses
 * its manually reviewed comparison assignment and is displayed on its own. */
export function comparisonRevision(visual:PublicVisual):string {
 const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,stable(v)])):value;
 const value=JSON.stringify(stable(visual));let a=2166136261,b=5381;
 for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i);}
 return `${value.length}:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
}
const membership=new Map(catalog.groups.flatMap(g=>g.members.map(m=>[m.id,{group:g,member:m}] as const)));
export function groupPublicVisuals(visuals:PublicVisual[],compact=false):VisualGroup[]{
 const groups:VisualGroup[]=[];const byId=new Map<string,VisualGroup>();
 for(const visual of visuals){
  const entry=compact?undefined:membership.get(visual.id);
  const eligible=entry&&entry.member.revision===comparisonRevision(visual)&&visual.presentation==='PUBLISHED_SUMMARY'&&visual.evidenceKind==='SCIENTIFIC_RESULT'&&!visual.image&&visual.plot?.style==='scatter'&&visual.plot.series.length===1&&visual.plot.series[0].points.length===1;
  if(!eligible){groups.push({id:visual.id,title:visual.title,caption:null,members:[visual],configurations:{}});continue;}
  let group=byId.get(entry.group.id);
  if(!group){group={id:entry.group.id,title:entry.group.title,caption:entry.group.caption,members:[],configurations:{}};groups.push(group);byId.set(group.id,group);}
  group.members.push(visual);group.configurations[visual.id]=entry.member.configuration;
 }
 const result=groups.map<VisualGroup>(g=>{
  if(g.members.length===1)return {id:g.members[0].id,title:g.members[0].title,caption:null,members:g.members,configurations:{}};
  // Only the categorical display position changes. Every original object and x
  // value survives untouched in members, source details and provenance exports.
  const first=g.members[0].plot!;
  return {...g,plot:{...first,style:'scatter',series:g.members.map((v,index)=>({id:v.id,label:g.configurations[v.id],points:v.plot!.series[0].points.map(p=>({...p,x:index+1}))}))}};
 });
 return compact?result:result.sort((a,b)=>Math.max(...b.members.map(v=>Date.parse(v.publishedAt)))-Math.max(...a.members.map(v=>Date.parse(v.publishedAt))));
}
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
export function visualMatches(visual:PublicVisual,query:string,locale:Locale,configuration?:Bilingual){
 const subject=visual.subject;const fields=[visual.title,visual.caption,...visual.limitations,...visual.sources.map(s=>s.label),...(configuration?[configuration]:[]),...(visual.plot?[visual.plot.x.label,visual.plot.y.label,...visual.plot.series.map(s=>s.label)]:[]),...(subject.kind==='legacy-test'?[subject.question,subject.answers,subject.method,subject.result]:[subject.result.summary,...subject.result.limitations??[]])];
 return !query.trim()||normalize(fields.map(b=>b[locale]).join(' ')).includes(normalize(query.trim()));
}
export function filterVisualGroups(groups:VisualGroup[],query:string,kind:string,locale:Locale){return groups.filter(g=>g.members.some(v=>(!kind||v.evidenceKind===kind)&&visualMatches(v,query,locale,g.configurations[v.id])));}
export function visualAnalysisCount(visuals:PublicVisual[]){return new Set(visuals.map(v=>JSON.stringify(v.subject))).size;}
const csvCell=(v:unknown)=>'"'+(/^[\s]*[=+@-]/.test(String(v))&&typeof v!=='number'?"'"+String(v):String(v)).replace(/"/g,'""')+'"';
export function comparisonCsv(group:VisualGroup,locale:Locale,links:Record<string,VisualLink>={}){
 const rows:unknown[][]=[['figure','source_visual_id','configuration','source_series_id','source_series','original_x','display_category','value','low','high','unit','question','method','answers','result','caption','limitations','source_urls','source_investigation','published_at','comparison_qualification']];
 group.members.forEach((v,i)=>v.plot?.series.forEach(s=>s.points.forEach(p=>rows.push([group.title[locale],v.id,group.configurations[v.id]?.[locale]??s.label[locale],s.id,s.label[locale],p.x,i+1,p.y,p.low??'',p.high??'',v.plot!.y.unit,v.subject.kind==='legacy-test'?v.subject.question[locale]:links[v.id]?.question[locale]??'',v.subject.kind==='legacy-test'?v.subject.method[locale]:'',v.subject.kind==='legacy-test'?v.subject.answers[locale]:'',v.subject.kind==='legacy-test'?v.subject.result[locale]:v.subject.result.summary[locale],v.caption[locale],v.limitations.map(l=>l[locale]).join('\n'),v.sources.map(source=>source.url).join('\n'),links[v.id]?.href??'',v.publishedAt,group.caption?.[locale]??'']))));
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
export function comparisonProvenance(group:VisualGroup,links:Record<string,VisualLink>={}){
 return JSON.stringify({presentation:'PUBLIC_VISUAL_COMPARISON',figure:group.id,title:group.title,qualification:group.caption,displayPositions:'Categorical positions only; original x values remain in source plots.',configurations:group.configurations,sourceInvestigations:Object.fromEntries(group.members.filter(v=>links[v.id]).map(v=>[v.id,links[v.id]])),originalVisuals:group.members},null,2);
}
