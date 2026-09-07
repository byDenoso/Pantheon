const STOP = new Set(['a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','sem','the','of','and','or','to','for','in','on','with','from','an']);
const HASH = /\b[a-f0-9]{24,}\b/i;

const clean = value => {
 const text=String(value??'').replace(/\s+/g,' ').trim();
 if(!text||HASH.test(text))return '';
 return text;
};

export function compactLabel(label,{max=30,shortLabel='',acronym=''}={}){
 const preferred=clean(shortLabel)||clean(acronym);
 if(preferred)return preferred.length<=max?preferred:preferred.slice(0,Math.max(3,max-1))+'…';
 const text=clean(label);
 if(!text)return '—';
 if(text.length<=max)return text;
 const words=(text.match(/[A-Za-zÀ-ÿ0-9]+/g)||[]).filter(w=>!STOP.has(w.toLocaleLowerCase('pt-BR')));
 if(words.length>1){
  const sigla=words.map(w=>w[0]).join('').toUpperCase();
  if(sigla.length>=2&&sigla.length<=Math.max(6,Math.min(12,max)))return sigla;
 }
 return text.slice(0,Math.max(4,max-1)).trimEnd()+'…';
}

function pt(meta,keys){
 for(const key of keys){const value=clean(meta?.[key]);if(value)return value}
 return '';
}

function fallbackCopy(entity={}){
 const label=clean(entity.label||entity.canonicalTitle||entity.canonicalId||entity.id)||'esta entidade';
 const type=String(entity.type||'ENTITY').toUpperCase();
 const whatByType={
  SYSTEM:`Sistema ${label} no NEXO Atlas.`,
  DOMAIN:`Domínio ${label} no NEXO Atlas.`,
  CAMPAIGN:`Campanha ${label} registrada no NEXO Atlas.`,
  TEST:`Teste ${label} registrado no NEXO Atlas.`,
  RESULT:`Resultado ${label} registrado no NEXO Atlas.`,
  CLAIM:`Hipótese ou claim ${label} registrada no NEXO Atlas.`,
  ACTION:`Ação operacional ${label} registrada no NEXO Atlas.`,
  AUTOMATION_RUN:`Execução ${label} registrada pela Black Box do NEXO Atlas.`,
  RUNTIME_EVENT:`Evento de runtime ${label} registrado pela Black Box do NEXO Atlas.`,
  LEARNING_RELATION:`Registro de aprendizado ${label} publicado no NEXO Atlas.`,
  PUBLICATION:`Publicação ${label} registrada no NEXO Atlas.`
 };
 return{
  what:whatByType[type]||`Entidade ${label} registrada no NEXO Atlas.`,
  how:'O Atlas a projeta a partir das fontes publicadas e preserva sua autoridade original, sem inventar conteúdo ausente.',
  why:'Permitir navegação e rastreabilidade do estado publicado enquanto a descrição semântica específica é atualizada.'
 };
}

export function cockpitCopy(entity={}){
 const meta=entity.metadata||{};
 const what=pt(meta,['what_pt','o_que','oque_pt','what_pt_br']);
 const how=pt(meta,['how_pt','como','como_pt','method_pt']);
 const why=pt(meta,['why_pt','por_que','porque_pt','rationale_pt','objective_pt']);
 const fallback=fallbackCopy(entity);
 return{
  what:what||fallback.what,
  how:how||fallback.how,
  why:why||fallback.why
 };
}

export function nodeDisplayLabel(node,max=30){
 const meta=node?.metadata||{};
 return compactLabel(node?.label||node?.canonicalTitle||node?.canonicalId||node?.id||'—',{
  max,
  shortLabel:meta.short_label_pt||meta.shortLabelPt||'',
  acronym:meta.acronym||meta.sigla||''
 });
}
