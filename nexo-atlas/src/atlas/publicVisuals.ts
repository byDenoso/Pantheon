import {isObj} from './api.ts';
import type {Bilingual, PublicTest} from './publicItems.ts';
import {isCompletePublicTest} from './publicCompleteness.ts';
import type {PublicResult} from './canonicalPublicCampaigns.ts';

export type VisualSubject = {kind:'legacy-test';question:Bilingual;answers:Bilingual;method:Bilingual;result:Bilingual}|{kind:'campaign-test';campaignId:string;testId:string;updatedAt:string;result:PublicResult};
export type PlotPoint={x:number;y:number;low?:number;high?:number};
export type PublicPlot={x:{label:Bilingual;unit:string};y:{label:Bilingual;unit:string};style:'line'|'scatter';series:{id:string;label:Bilingual;points:PlotPoint[]}[]};
export type PublicVisual={presentation?:'PUBLISHED_SUMMARY';id:string;subject:VisualSubject;title:Bilingual;caption:Bilingual;limitations:Bilingual[];publishedAt:string;evidenceKind:'SCIENTIFIC_RESULT'|'SOFTWARE_VALIDATION';sources:{label:Bilingual;url:string}[];image?:{path:string;sha256:string;width:number;height:number;alt:Bilingual};plot?:PublicPlot};
const forbidden=/(?:\bBOARD\b|\bolymp[a-z0-9_-]*\b|(?<![\p{L}\p{N}])p[. _-]*e[. _-]*e?[. _-]*r(?![\p{L}\p{N}])|\b(?:PCDM|pNGB|Miqueias)\b|CONTEST-|WORK-|NEXO_INBOX|-----BEGIN|\bBearer\s|[A-Z]:\\|file:\/\/|(?:token|secret|password|api[_-]?key)\s*[:=])/iu;
const internal=/(?:^|[\s('"=:\[])\/(?:tmp|home|Users|var|workspace|opt)(?:\/|$|[\s.,;:)\]"'])/i;
const text=(v:unknown,max=4000):v is string=>typeof v==='string'&&Boolean(v.trim())&&v.length<=max&&!forbidden.test(v)&&!internal.test(v);
const bi=(v:unknown):Bilingual|null=>isObj(v)&&text(v['pt-BR'])&&text(v.en)?{'pt-BR':v['pt-BR'],en:v.en}:null;
const id=(v:unknown):v is string=>text(v,120)&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(v);
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e15;
export function publicSourceUrl(value:unknown):string|null {
  if(!text(value,2048))return null;
  try {const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||/(?:^|\.)(?:localhost|local|internal|invalid|google\.com)$/.test(u.hostname)||/^(?:\d+\.|\[)/.test(u.hostname))return null;
    if([...u.searchParams.keys(),...new URLSearchParams(u.hash.slice(1)).keys()].some(k=>/token|secret|password|credential|signature|^sig$|^key$|auth|session|jwt|bearer|^x-(amz|goog)-/i.test(k)))return null;
    return u.href;
  }catch{return null;}
}
export function guardVisual(raw:unknown):PublicVisual|null {
  if(!isObj(raw)||!id(raw.id)||!bi(raw.title)||!bi(raw.caption)||!Array.isArray(raw.limitations)||raw.limitations.length>20||!raw.limitations.every(bi)||!['SCIENTIFIC_RESULT','SOFTWARE_VALIDATION'].includes(String(raw.evidenceKind))||typeof raw.publishedAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(raw.publishedAt)||!Number.isFinite(Date.parse(raw.publishedAt))||Date.parse(raw.publishedAt)>Date.now())return null;
  if(raw.presentation!==undefined&&raw.presentation!=='PUBLISHED_SUMMARY')return null;
  const s=raw.subject;let subject:VisualSubject;
  if(!isObj(s))return null;
  if(s.kind==='legacy-test'&&isCompletePublicTest(s)&&['question','answers','method','result'].every(k=>bi(s[k])))subject={kind:'legacy-test',question:bi(s.question)!,answers:bi(s.answers)!,method:bi(s.method)!,result:bi(s.result)!};
  else if(s.kind==='campaign-test'&&id(s.campaignId)&&id(s.testId)&&typeof s.updatedAt==='string'&&/^\d{4}-\d\d-\d\dT/.test(s.updatedAt)&&Number.isFinite(Date.parse(s.updatedAt))&&isObj(s.result)&&['SUPPORTS','NULL','FALSIFIES','INCONCLUSIVE'].includes(String(s.result.verdict))&&bi(s.result.summary)&&(s.result.limitations===null||(Array.isArray(s.result.limitations)&&s.result.limitations.length<=40&&s.result.limitations.every(bi))))subject={kind:'campaign-test',campaignId:s.campaignId,testId:s.testId,updatedAt:s.updatedAt,result:{verdict:s.result.verdict as PublicResult['verdict'],summary:bi(s.result.summary)!,limitations:s.result.limitations===null?null:(s.result.limitations as unknown[]).map(v=>bi(v)! )}};else return null;
  if(!Array.isArray(raw.sources)||!raw.sources.length||raw.sources.length>10)return null;
  const sources=raw.sources.flatMap(r=>isObj(r)&&bi(r.label)&&publicSourceUrl(r.url)?[{label:bi(r.label)!,url:publicSourceUrl(r.url)!}]:[]);if(sources.length!==raw.sources.length)return null;
  let image:PublicVisual['image'];
  if(raw.image!==undefined){const i=raw.image;if(!isObj(i)||typeof i.path!=='string'||!/^\/assets\/research-[a-z0-9_-]+\.(?:png|jpg|webp)$/.test(i.path)||typeof i.sha256!=='string'||!/^[a-f0-9]{64}$/.test(i.sha256)||!Number.isInteger(i.width)||!Number.isInteger(i.height)||Number(i.width)<1||Number(i.height)<1||Number(i.width)>16000||Number(i.height)>16000||!bi(i.alt))return null;
    image={path:i.path,sha256:i.sha256,width:i.width as number,height:i.height as number,alt:bi(i.alt)!};}
  let plot:PublicPlot|undefined;
  if(raw.plot!==undefined){const p=raw.plot;if(!isObj(p)||!isObj(p.x)||!isObj(p.y)||!bi(p.x.label)||!bi(p.y.label)||![p.x.unit,p.y.unit].every(u=>u===''||text(u,60))||!['line','scatter'].includes(String(p.style))||!Array.isArray(p.series)||!p.series.length||p.series.length>8)return null;
    const seen=new Set<string>();const series:PublicPlot['series']=[];
    for(const s of p.series){if(!isObj(s)||!id(s.id)||seen.has(s.id)||!bi(s.label)||!Array.isArray(s.points)||!s.points.length||s.points.length>2000)return null;seen.add(s.id);
      const points:PlotPoint[]=[];for(const point of s.points){if(!isObj(point)||!num(point.x)||!num(point.y)||((point.low===undefined)!==(point.high===undefined))||(point.low!==undefined&&(!num(point.low)||!num(point.high)||point.low>point.y||point.high<point.y)))return null;points.push({x:point.x,y:point.y,...(point.low===undefined?{}:{low:point.low as number,high:point.high as number})});}series.push({id:s.id,label:bi(s.label)!,points});}
    plot={x:{label:bi(p.x.label)!,unit:p.x.unit as string},y:{label:bi(p.y.label)!,unit:p.y.unit as string},style:p.style as PublicPlot['style'],series};}
  if(!image&&!plot)return null;
  return {...(raw.presentation==='PUBLISHED_SUMMARY'?{presentation:'PUBLISHED_SUMMARY' as const}:{}),id:raw.id,subject,title:bi(raw.title)!,caption:bi(raw.caption)!,limitations:raw.limitations.map(v=>bi(v)!),publishedAt:raw.publishedAt,evidenceKind:raw.evidenceKind as PublicVisual['evidenceKind'],sources,...(image?{image}:{}),...(plot?{plot}:{})};
}
export function visualsForTest(visuals:PublicVisual[],test:PublicTest){return visuals.filter(v=>{const s=v.subject;return s.kind==='legacy-test'&&(['question','answers','method','result'] as const).every(k=>JSON.stringify(s[k])===JSON.stringify(test[k]));});}
export function plotDomain(plot:PublicPlot,visible:Set<string>){const pts=plot.series.filter(s=>visible.has(s.id)).flatMap(s=>s.points);if(!pts.length)return null;const xs=pts.map(p=>p.x),ys=pts.flatMap(p=>[p.low??p.y,p.high??p.y]);const range=(a:number[])=>{let min=Infinity,max=-Infinity;for(const x of a){min=Math.min(min,x);max=Math.max(max,x);}const pad=(max-min||Math.abs(max)||1)*.06;return [min-pad,max+pad] as const;};return {x:range(xs),y:range(ys)};}
const csvCell=(v:string)=>'"'+(/^[\s]*[=+@-]/.test(v)?"'"+v:v).replace(/"/g,'""')+'"';
export function plotCsv(plot:PublicPlot,locale:'pt-BR'|'en'){return '\uFEFF'+[['series',plot.x.label[locale]+(plot.x.unit?` (${plot.x.unit})`:''),plot.y.label[locale]+(plot.y.unit?` (${plot.y.unit})`:''),'low','high'].map(csvCell).join(','),...plot.series.flatMap(s=>s.points.map(p=>[csvCell(s.label[locale]),p.x,p.y,p.low??'',p.high??''].join(',')))].join('\r\n');}
