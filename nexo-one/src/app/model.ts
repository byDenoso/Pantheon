import type {CockpitItem,WorldState,WorldDiff} from '../contracts/world';
export const tabs=['NOW','LOOPS','DAY','CONTEXT','RECALL'] as const;
export type Tab=typeof tabs[number];
export const titles:Record<Tab,string>={NOW:'O que merece sua atenção.',LOOPS:'Compromissos em movimento.',DAY:'Um dia que cabe no dia.',CONTEXT:'Entre no contexto certo.',RECALL:'Encontre. Retome. Avance.'};
export const providerLabel:Record<string,string>={drive:'Google Drive',gmail:'Gmail',calendar:'Calendar',github:'GitHub',vercel:'Vercel',nexo:'NEXO SSoT',atlas:'Atlas'};
export const stateLabel:Record<string,string>={NEEDS_ME:'Precisa de mim',WAITING_OTHER:'Aguardando',SCHEDULED:'Agendado',BLOCKED:'Bloqueado',DONE:'Concluído',AVAILABLE:'Disponível',STALE:'Leitura anterior',UNAVAILABLE:'Indisponível',AUTH_REQUIRED:'Conectar',RATE_LIMITED:'Limite atingido',ACT:'Ação',ESCALATE:'Atenção',NOTICE:'Contexto',IGNORE:'Encerrado'};
export const time=(date?:string)=>date?new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(date)):'—';
export const dateTime=(date?:string|null)=>date?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(date)):'Sem leitura válida';
export function diffWorld(old:WorldState|null,current:WorldState):WorldDiff {
  const key=(i:CockpitItem)=>JSON.stringify({...i,observedAt:undefined,freshness:{state:i.freshness.state}});
  const before=new Map(old?.items.map(i=>[i.id,key(i)])||[]), after=new Map(current.items.map(i=>[i.id,key(i)]));
  return {previous:old?.fingerprint||null,current:current.fingerprint,added:old?[...after.keys()].filter(id=>!before.has(id)):[],removed:old?[...before.keys()].filter(id=>!after.has(id)):[],updated:old?[...after.keys()].filter(id=>before.has(id)&&after.get(id)!==before.get(id)):[],providerChanges:old?current.providers.filter(p=>{const prev=old.providers.find(x=>x.id===p.id);return !prev||p.revision!==prev.revision||p.status!==prev.status||p.partial!==prev.partial}).map(p=>p.id):[]};
}
export function dayItems(items:CockpitItem[],date:string) {
  const start=new Date(`${date}T00:00:00`).getTime(),end=new Date(`${date}T23:59:59.999`).getTime();
  return items.filter(i=>i.kind==='EVENT'&&i.dueAt&&(i.allDay?i.dueAt.slice(0,10)<=date&&(i.endAt?i.endAt.slice(0,10)>date:i.dueAt.slice(0,10)===date):Date.parse(i.dueAt)<=end&&Date.parse(i.endAt||i.dueAt)>=start)).sort((a,b)=>(a.dueAt||'').localeCompare(b.dueAt||''));
}
export function localDate() {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function overlap(a:CockpitItem,b:CockpitItem) {return !a.allDay&&!b.allDay&&!!a.dueAt&&!!b.dueAt&&!!a.endAt&&!!b.endAt&&Date.parse(a.dueAt)<Date.parse(b.endAt)&&Date.parse(b.dueAt)<Date.parse(a.endAt);}
export function parseCommand(input:string):{tab:Tab;query?:string;context?:string;message?:string} {
  const q=input.trim(),upper=q.toUpperCase().replace(/^\//,'');
  if((tabs as readonly string[]).includes(upper))return {tab:upper as Tab};
  const context=upper.match(/^(NEXO|COSMOLOGY|COSMOLOGIA|OLYMPUS|ENGINEERING|ENGENHARIA|PERSONAL|PESSOAL)$/)?.[1];
  if(context)return {tab:'CONTEXT',context:({COSMOLOGIA:'COSMOLOGY',ENGENHARIA:'ENGINEERING',PESSOAL:'PERSONAL'} as Record<string,string>)[context]||context};
  if(/^(criar|enviar|agendar|excluir|apagar|deploy)\b/i.test(q))return {tab:'LOOPS',message:'Escritas ainda não estão habilitadas. Abra a fonte para registrar a ação.'};
  return {tab:'RECALL',query:q};
}
