import {z} from 'zod';

export function parsePublicRegistryJson(text, path) {
  try {return JSON.parse(text);}
  catch (error) {throw new Error(`JSON público inválido (${path}): ${error.message}`);}
}

// This contract describes public editorial records, never Tower identities. Unknown
// values stay null; a publication on the website is not a scientific publication.
const bilingual = z.object({'pt-BR': z.string().trim().min(1).max(4000), en: z.string().trim().min(1).max(4000)}).strict();
const digest = z.string().regex(/^[a-f0-9]{64}$/, 'expected SHA-256 of a reviewed public row');
const doi = z.string().regex(/^10\.\d{4,9}\/[\x21-\x7e]+$/i, 'expected DOI without a URL');
const sourcedFields = ['analysisId','version','status','date','datasets','code','result','uncertainty','scope','limits','evidenceLevel','changeReason','publication'];
const reference = z.object({commit:z.string().regex(/^[a-f0-9]{40}$/),path:z.string().trim().min(1).max(240),sha256:digest,pointer:z.string().min(1).max(500)}).strict();
const version = z.object({
  analysisId:z.string().trim().min(1).max(200).optional(),
  version: z.string().trim().min(1).max(80),
  status: z.enum(['ongoing', 'published', 'retracted', 'unknown']),
  date: z.iso.date().nullable(),
  datasets: z.array(z.object({name: z.string().trim().min(1).max(200), doi: doi.nullable()}).strict()).nullable(),
  code: z.object({commit: z.string().regex(/^[a-f0-9]{40}$/).nullable(), zenodoDoi: doi.nullable()}).strict().nullable(),
  result: bilingual.nullable(), uncertainty: bilingual.nullable(), scope: bilingual.nullable(), limits: bilingual.nullable(),
  evidenceLevel: z.enum(['unclassified', 'exploratory', 'replicated', 'peer-reviewed']).nullable(),
  sourceKeys: z.array(digest).min(1),
  changeReason: bilingual.nullable(),
  publication:z.object({doi:doi.nullable(),arxiv:z.string().regex(/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/).nullable()}).strict().nullable().optional(),
  provenance:z.partialRecord(z.enum(sourcedFields),reference).optional(),
}).strict();
const record = z.object({questionId: z.string().regex(/^question-[a-z0-9-]+$/), versions: z.array(version)}).strict();
export const researchRegistrySchema = z.object({contract: z.literal('NEXO_PUBLIC_RESULT_REGISTRY_V1'), records: z.array(record)}).strict().superRefine((registry, ctx) => {
  const ids = new Set();
  const analysisOwners=new Map();
  registry.records.forEach((entry, i) => {
    if (ids.has(entry.questionId)) ctx.addIssue({code:'custom', path:['records', i, 'questionId'], message:'duplicate question ID'});
    ids.add(entry.questionId);
    const versions = new Set();
    entry.versions.forEach((item, j) => {
      if(item.analysisId) {
        const owner=analysisOwners.get(item.analysisId);
        if(owner&&owner!==entry.questionId)ctx.addIssue({code:'custom',path:['records',i,'versions',j,'analysisId'],message:'scientific identity assigned to multiple questions'});
        analysisOwners.set(item.analysisId,entry.questionId);
      }
      const identity=JSON.stringify([item.analysisId??null,item.version]);
      if (versions.has(identity)) ctx.addIssue({code:'custom', path:['records',i,'versions',j,'version'], message:'duplicate version'});
      versions.add(identity);
      if(item.status==='published'&&!item.publication?.doi&&!item.publication?.arxiv) ctx.addIssue({code:'custom',path:['records',i,'versions',j,'publication'],message:'metadado científico: scientific publication requires DOI or arXiv'});
      if (entry.versions.slice(0,j).some(prior=>prior.analysisId===item.analysisId) && !item.changeReason) ctx.addIssue({code:'custom', path:['records',i,'versions',j,'changeReason'], message:'a correction must explain why the prior version changed'});
    });
  });
});

export function validateResearchRegistry(value, reviewedRows, membership) {
  const parsed = researchRegistrySchema.safeParse(value);
  if (!parsed.success) throw new Error('Registro público inválido: ' + parsed.error.issues.map(i => `${i.path.join('.') || 'root'}: ${i.message}`).join('; '));
  for (const item of parsed.data.records) for (const revision of item.versions) {
    const rows = revision.sourceKeys.map(key => reviewedRows.get(key));
    if (rows.some(row => !row)) throw new Error(`Registro ${item.questionId}: fonte pública ausente`);
    if (revision.sourceKeys.some(key => !membership.get(key)?.has(item.questionId)))
      throw new Error(`Registro ${item.questionId}: fonte pertence a outra pergunta`);
    // A result must be identical to the reviewed result for a referenced row.
    if (revision.result && !rows.some(row => JSON.stringify(row.result) === JSON.stringify(revision.result)))
      throw new Error(`Registro ${item.questionId}: resultado não corresponde à fonte pública`);
    // Until a field-level public provenance format exists, do not accept invented
    // datasets, DOI, version semantics or status inferred from public summaries.
    if (!revision.provenance && (revision.datasets !== null || revision.code !== null || revision.uncertainty !== null || revision.scope !== null || revision.limits !== null || revision.evidenceLevel !== null || revision.status !== 'unknown' || revision.date !== null))
      throw new Error(`Registro ${item.questionId}: metadado científico sem fonte pública vinculada`);
  }
  return parsed.data;
}

// Contexts come from the build's pinned, byte-verified public artifacts. Never
// load a URL or filesystem path supplied by a registry entry.
export function validateReleasableResearchRegistry(registry, contexts = []) {
  for(const entry of registry.records) for(const revision of entry.versions) {
    if(!revision.analysisId)throw new Error(`Registro ${entry.questionId}: identidade científica exige fontes públicas estruturadas por campo.`);
    if(revision.sourceKeys.length!==1)throw new Error(`Registro ${entry.questionId}: cada versão exige uma única chave de alegação canônica.`);
    for(const field of sourcedFields) {
      const value=revision[field],ref=revision.provenance?.[field];
      const populated=value!==null&&value!==undefined&&!(field==='status'&&value==='unknown');
      if(!populated&&!ref)continue;
      if(!ref)throw new Error(`Registro ${entry.questionId}: ${field} exige fontes públicas estruturadas por campo.`);
      const source=contexts.find(source=>source.commit===ref.commit&&source.path===ref.path&&source.sha256===ref.sha256);
      if(!source)throw new Error(`Registro ${entry.questionId}: origem pública não verificada para ${field}.`);
      const matching=revision.sourceKeys.flatMap(key=>source.records.get(key)??[])
        .find(record=>ref.pointer===`${record.pointer}/${field==='result'?'result':`research/${field}`}`);
      if(!matching)throw new Error(`Registro ${entry.questionId}: fonte de ${field} não pertence ao campo e à pergunta declarados.`);
      const expected=field==='result'?matching.row.result:matching.row.research?.[field];
      if(expected===undefined||!sameJson(value,expected))throw new Error(`Registro ${entry.questionId}: ${field} diverge da fonte pública.`);
      if(field==='analysisId'&&(source.records.get(revision.sourceKeys[0])??[]).some(record=>record.row.research?.analysisId!==revision.analysisId))
        throw new Error(`Registro ${entry.questionId}: hash editorial ambíguo entre identidades científicas.`);
    }
  }
  return registry;
}

function sameJson(a,b) {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a).sort(),other=Object.keys(b).sort();
  return keys.length===other.length&&keys.every((key,i)=>key===other[i]&&sameJson(a[key],b[key]));
}

export function validateAppendOnlyHistory(previous, current) {
  const oldRegistry = researchRegistrySchema.parse(previous);
  const newRegistry = researchRegistrySchema.parse(current);
  const next = new Map(newRegistry.records.map(record=>[record.questionId,record]));
  for (const prior of oldRegistry.records) {
    const updated=next.get(prior.questionId);
    if (!updated) throw new Error(`Histórico removido: ${prior.questionId}`);
    for (let i=0;i<prior.versions.length;i++) {
      if (!updated.versions[i] || JSON.stringify(updated.versions[i])!==JSON.stringify(prior.versions[i]))
        throw new Error(`Versão anterior removida ou alterada: ${prior.questionId} / ${prior.versions[i].version}`);
    }
  }
}
