import {studyHref,testAnchors,testHref} from './publicStudyRoutes.ts';
import {pick, type Bilingual, type PublicState} from './publicItems.ts';
import type {Locale} from './api.ts';
import {groupPublicQuestions, publicRecency} from './publicQuestionGroups.ts';
import {campaignBrief} from './publicCampaigns.ts';
import {visualsForTest,type PublicVisual} from './publicVisuals.ts';

export const SOFTWARE_QUESTIONS = new Set(['objetivos','temas-testes','calibracao-previsoes','regras-antigas','temas-registros','simulacao','tarefas-antigas','presenca-explicacoes','qualidade-explicacoes','motivos-interrupcao','pergunta-187','pergunta-194','tempo-hipoteses','prontidao','pergunta-201','pergunta-213','pergunta-214']);
export const TOPICS = [
  {id:'supernovas', label:{'pt-BR':'Supernovas',en:'Supernovae'}, match:/supernov|pantheon|union\d|SH0ES|TRGB|JAGB/i},
  {id:'bao', label:{'pt-BR':'Oscilações acústicas (BAO)',en:'Acoustic oscillations (BAO)'}, match:/\bBAO\b|DESI/i},
  {id:'cmb', label:{'pt-BR':'Radiação de fundo (CMB)',en:'Microwave background (CMB)'}, match:/\bCMB\b|Planck|radiação cósmica de fundo/i},
  {id:'expansao', label:{'pt-BR':'Expansão cósmica',en:'Cosmic expansion'}, match:/H[₀0]|expansão|expansion|Hubble|redshift/i},
  {id:'software', label:{'pt-BR':'Validação de software',en:'Software validation'}, match:/$a/},
] as const;
/** Public research-line URLs select only existing topic projections; they never identify a record or bypass catalog admission. */
export const RESEARCH_LINE_TOPICS = {
  expansion: ['supernovas', 'expansao'],
  structure: ['bao'],
  components: ['supernovas', 'bao', 'cmb', 'expansao'],
} as const satisfies Record<string, readonly Topic[]>;
export const researchLineTopics = (line: string | null | undefined): readonly Topic[] | null => line && Object.hasOwn(RESEARCH_LINE_TOPICS, line) ? RESEARCH_LINE_TOPICS[line as keyof typeof RESEARCH_LINE_TOPICS] : null;
export type Topic = typeof TOPICS[number]['id'];
export type ResearchEntry = {id:string; question:Bilingual; method:Bilingual|null; summary:Bilingual|null; limits:Bilingual[]; nextStep:Bilingual|null; href:string; state:'ongoing'|'completed'|'published'; stage:string|null; tests:number; complete:boolean; reviewed:number|null; topics:Topic[]; updatedAt:string|null};
export const questionHref = studyHref;
export const mentionedTopics = (text:string, software=false):Topic[] => software ? ['software'] : TOPICS.filter(t=>t.id!=='software'&&t.match.test(text)).map(t=>t.id);
export const normalized = (text:string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
export function researchEntries(pub:PublicState):ResearchEntry[] {
  if(pub.campaigns!==undefined) return pub.campaigns.map(c=>{const reviewed=c.tests.filter(t=>t.stage==='REVIEWED'&&t.result).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)),t=reviewed[0];return {id:c.id,question:c.question,method:c.method,summary:t?.result?{'pt-BR':`Teste: ${t.question['pt-BR']}\n${t.result.summary['pt-BR']}`,en:`Test: ${t.question.en}\n${t.result.summary.en}`}:null,limits:[...(c.limitations??[]),...(t?.result?.limitations??[])],nextStep:c.nextStep,href:`/?campanha=${encodeURIComponent(c.id)}#/`,state:c.state,stage:c.currentStage?.['pt-BR']??null,tests:c.tests.length,complete:c.testsCoverage==='COMPLETE',reviewed:reviewed.length,topics:mentionedTopics([c.question['pt-BR'],c.method?.['pt-BR']??''].join(' ')),updatedAt:c.updatedAt};});
  return groupPublicQuestions(pub.tests).map(g=>{
    const brief=campaignBrief(g), latest=Math.max(...g.members.map(m=>publicRecency(m.test)));
    return {id:g.id,question:g.title,method:brief?.basis??null,summary:brief?.summary??null,limits:brief?[brief.limits]:[],nextStep:null,href:questionHref(g.id),state:'published',stage:null,tests:g.total,complete:true,reviewed:null,topics:mentionedTopics([g.title['pt-BR'],...g.members.map(m=>m.test.method['pt-BR'])].join(' '),SOFTWARE_QUESTIONS.has(g.id.replace(/^question-/,''))),updatedAt:Number.isFinite(latest)?new Date(latest).toISOString():null};
  });
}
export function visualLinks(visuals:PublicVisual[],pub:PublicState){const groups=groupPublicQuestions(pub.tests),anchors=new Map(groups.map(g=>[g.id,testAnchors(g.members.map(m=>m.test))]));return Object.fromEntries(visuals.flatMap(v=>{const s=v.subject;if(s.kind==='campaign-test'){const c=pub.campaigns?.find(c=>c.id===s.campaignId),t=c?.tests.find(t=>t.id===s.testId);return t?[[v.id,{question:t.question,href:`/?campanha=${encodeURIComponent(s.campaignId)}#/`}]]:[];}const test=pub.tests.find(t=>visualsForTest([v],t).length),group=groups.find(g=>g.members.some(m=>m.test.id===test?.id));return test&&group?[[v.id,{question:test.question,href:group.total>1?testHref(group.id,anchors.get(group.id)?.get(test.id)):questionHref(group.id)}]]:[];}));}
export function filterResearch(entries:ResearchEntry[], options:{query?:string;topic?:string;state?:string;locale:Locale}) {
  const q=normalized(options.query?.trim()??'');
  return entries.filter(e=>(!options.topic||e.topics.includes(options.topic as Topic))&&(!options.state||e.state===options.state)&&(!q||normalized([pick(e.question,options.locale),e.method?pick(e.method,options.locale):'',e.summary?pick(e.summary,options.locale):''].join(' ')).includes(q)));
}
export function publicActivity(pub:PublicState, locale:Locale) {
  const en=locale==='en';
  const events=pub.campaigns!==undefined ? pub.campaigns.flatMap(c=>[
    {key:c.id,date:c.updatedAt,title:pick(c.question,locale),label:en?'Investigation updated':'Investigação atualizada',href:`/?campanha=${encodeURIComponent(c.id)}#/`},
    ...c.tests.filter(t=>t.result&&t.stage==='REVIEWED').map(t=>({key:`${c.id}:${t.id}`,date:t.updatedAt,title:pick(t.question,locale),label:en?'Reviewed result published':'Resultado revisado publicado',href:`/?campanha=${encodeURIComponent(c.id)}#/`}))
  ]) : groupPublicQuestions(pub.tests).flatMap(g=>g.members.flatMap(({test})=>{
    const d=test.updated_at??test.published_at;
    return d?[{key:test.id,date:d,title:pick(test.question,locale),label:en?'Published study':'Estudo publicado',href:questionHref(g.id)}]:[];
  }));
  // Publication dates describe the public records; they do not date scientific execution.
  return events.filter(e=>Number.isFinite(Date.parse(e.date))&&Date.parse(e.date)<=Date.now()).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,6);
}
