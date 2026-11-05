import {z} from 'zod';

// This contract describes public editorial records, never Tower identities. Unknown
// values stay null; a publication on the website is not a scientific publication.
const bilingual = z.object({'pt-BR': z.string().trim().min(1).max(4000), en: z.string().trim().min(1).max(4000)}).strict();
const digest = z.string().regex(/^[a-f0-9]{64}$/, 'expected SHA-256 of a reviewed public row');
const doi = z.string().regex(/^10\.\d{4,9}\/[\x21-\x7e]+$/i, 'expected DOI without a URL');
const version = z.object({
  version: z.string().trim().min(1).max(80),
  status: z.enum(['ongoing', 'published', 'retracted', 'unknown']),
  date: z.iso.date().nullable(),
  datasets: z.array(z.object({name: z.string().trim().min(1).max(200), doi: doi.nullable()}).strict()).nullable(),
  code: z.object({commit: z.string().regex(/^[a-f0-9]{40}$/).nullable(), zenodoDoi: doi.nullable()}).strict().nullable(),
  result: bilingual.nullable(), uncertainty: bilingual.nullable(), scope: bilingual.nullable(), limits: bilingual.nullable(),
  evidenceLevel: z.enum(['unclassified', 'exploratory', 'replicated', 'peer-reviewed']).nullable(),
  sourceKeys: z.array(digest).min(1),
  changeReason: bilingual.nullable(),
}).strict();
const record = z.object({questionId: z.string().regex(/^question-[a-z0-9-]+$/), versions: z.array(version)}).strict();
export const researchRegistrySchema = z.object({contract: z.literal('NEXO_PUBLIC_RESULT_REGISTRY_V1'), records: z.array(record)}).strict().superRefine((registry, ctx) => {
  const ids = new Set();
  registry.records.forEach((entry, i) => {
    if (ids.has(entry.questionId)) ctx.addIssue({code:'custom', path:['records', i, 'questionId'], message:'duplicate question ID'});
    ids.add(entry.questionId);
    const versions = new Set();
    entry.versions.forEach((item, j) => {
      if (versions.has(item.version)) ctx.addIssue({code:'custom', path:['records',i,'versions',j,'version'], message:'duplicate version'});
      versions.add(item.version);
      if (j > 0 && !item.changeReason) ctx.addIssue({code:'custom', path:['records',i,'versions',j,'changeReason'], message:'a correction must explain why the prior version changed'});
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
    if (revision.datasets !== null || revision.code !== null || revision.uncertainty !== null || revision.scope !== null || revision.limits !== null || revision.evidenceLevel !== null || revision.status !== 'unknown' || revision.date !== null)
      throw new Error(`Registro ${item.questionId}: metadado científico sem fonte pública vinculada`);
  }
  return parsed.data;
}
