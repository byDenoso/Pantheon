const STOP = new Set(['a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','sem','the','of','and','or','to','for','in','on','with','from','an']);
const HASH = /\b[a-f0-9]{24,}\b/i;
const UUIDISH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;
/** A canonical code is the name people actually use for a test (INV-004,
 *  DISC26-010-R1). It must start like an identifier and carry a digit, so plain
 *  prose never masquerades as a code and no uuid or hash ever reaches the map. */
const CODE = /^[A-Z0-9][A-Za-z0-9._/-]+$/;

/** Curated short forms for the twelve canonical science domains. The canonical
 *  English titles stay untouched in the source and in the inspector; this is a
 *  display alias so the map is readable when the projection has no
 *  short_label_pt of its own. */
const SCIENCE_DOMAIN_LABELS = Object.freeze({
 'domain:D1':'Expansão',
 'domain:D2':'LSS & Clusters',
 'domain:D3':'Late-Time / DE',
 'domain:D4':'DM Galáctica',
 'domain:D5':'Reionização',
 'domain:D6':'SMBH',
 'domain:D7':'CMB',
 'domain:D8':'PEER / Teoria',
 'domain:D9':'Particle DM',
 'domain:D10':'AGN / LRD',
 'domain:D11':'Megastructures',
 'domain:M1':'Método / Inferência'
});

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

export function cockpitCopy(entity={}){
 const meta=entity.metadata||{};
 const what=pt(meta,['what_pt','o_que','oque_pt','what_pt_br']);
 const how=pt(meta,['how_pt','como','como_pt','method_pt']);
 const why=pt(meta,['why_pt','por_que','porque_pt','rationale_pt','objective_pt']);
 return{
  what:what||'Conteúdo ainda não indexado em português.',
  how:how||'Como ainda não indexado em português.',
  why:why||'Por quê ainda não indexado em português.'
 };
}

/** Shortens a segmented code while keeping what identifies it: the leading
 *  family segments and the trailing ordinal that separates siblings.
 *  T-CMB-BIREFRINGENCE-ACTDR6-SYSTEMATICS-001 → T-CMB-BIREFRINGE…-001 */
function shortenCode(code,max){
 if(code.length<=max)return code;
 const parts=code.split('-');
 const tail=parts.length>1&&/^\d+[A-Z]?$/i.test(parts[parts.length-1])?parts.pop():'';
 const suffix=(tail?'-'+tail:''),budget=max-suffix.length-1;
 if(budget<4)return code.slice(0,Math.max(3,max-1))+'…';
 let head='';
 for(const part of parts){
  const next=head?head+'-'+part:part;
  if(next.length<=budget){head=next;continue}
  if(head.length<budget-2)head=next.slice(0,budget);
  break;
 }
 return (head||code.slice(0,budget))+'…'+suffix;
}

/** The canonical code of an entity, when it is human-readable.
 *  A uuid, a hash or a revision key is not a name and never becomes a label. */
function readableCode(raw,max){
 const text=clean(String(raw??'').split(':').pop());
 if(!text)return '';
 if(UUIDISH.test(text)||!CODE.test(text)||!/\d/.test(text))return '';
 return shortenCode(text,max);
}

/** Display label for a node on the map.
 *  Order: the indexed PT short label, then a title that already fits, then the
 *  canonical code people use, then a declared acronym, and only as a last
 *  resort a derived short form. A generated initialism therefore never wins
 *  over a real name or a real code. */
export function nodeDisplayLabel(node,max=30){
 const meta=node?.metadata||{};
 // The curated science alias wins on the map: it is the name these twelve
 // domains are actually called by, and it fits where the indexed sentence does not.
 const short=SCIENCE_DOMAIN_LABELS[node?.id]||clean(meta.short_label_pt||meta.shortLabelPt)||'';
 if(short)return short.length<=max?short:short.slice(0,Math.max(3,max-1))+'…';
 const title=clean(node?.label||node?.canonicalTitle);
 if(title&&title.length<=max)return title;
 const code=readableCode(node?.canonicalId||node?.id,max);
 if(code)return code;
 return compactLabel(title||node?.canonicalId||node?.id||'—',{max,acronym:meta.acronym||meta.sigla||''});
}
