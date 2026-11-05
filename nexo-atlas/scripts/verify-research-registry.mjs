import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateResearchRegistry, validateReleasableResearchRegistry} from '../src/contracts/research-registry.mjs';
import {assertSourceIntegrity} from '../src/contracts/public-source-integrity.mjs';
import {groupPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';
import {guardTests} from '../src/atlas/publicItems.ts';

const root = new URL('../', import.meta.url);
async function readJson(path) {
  try {return JSON.parse(await readFile(new URL(path, root), 'utf8'));}
  catch (error) {throw new Error(`JSON público inválido (${path}): ${error.message}`);}
}
export const contentKey = row => createHash('sha256').update(JSON.stringify(Object.fromEntries(['question','answers','method','result'].map(k=>[k,{'pt-BR':row[k]['pt-BR'],en:row[k].en}])))).digest('hex');
const artifact = await readJson('worker/public-cosmology.json');
const index = await readJson('src/atlas/reviewedSourceIndex.json');
const registry = await readJson('src/atlas/researchRegistry.json');
const sourceBytes = await readFile(new URL('worker/public-cosmology.json', root));
if (index.contract !== 'NEXO_PUBLIC_SOURCE_INDEX_V1' || index.sourceCommit !== '4b7b14a031d1667dfd951760bbb723d06e25e835' || !Array.isArray(index.rows)) throw new Error('Índice público inválido ou desatualizado: revise a origem antes de atualizar o índice.');
let sourceBlob=null;
try {sourceBlob=execFileSync('git',['show',`${index.sourceCommit}:nexo-atlas/worker/public-cosmology.json`],{cwd:root,maxBuffer:5*1024*1024});}
catch {if (process.env.NEXO_REQUIRE_SOURCE_COMMIT==='1') throw new Error('Não foi possível conferir o artefato na revisão Git de referência.');}
const sourceVerification=assertSourceIntegrity(sourceBytes,index.sourceSha256,sourceBlob);
if (sourceVerification==='PINNED_BLOB_ONLY') console.warn('Vínculo commit→blob não verificado neste checkout; bytes conferem com o blob fixado.');
const expected = Object.entries(artifact.records).map(([sourceKey, row])=>({sourceKey, contentKey:contentKey(row)})).sort((a,b)=>a.sourceKey.localeCompare(b.sourceKey));
if (JSON.stringify(expected) !== JSON.stringify(index.rows)) throw new Error('Índice público não corresponde às linhas do artefato revisado.');
const rows = new Map(expected.map(({sourceKey,contentKey:hash})=>[hash,artifact.records[sourceKey]]));
// A correct text hash alone is insufficient: it must also belong to the
// question this public editorial catalog actually assigns it to.
const grouped = groupPublicQuestions(guardTests([...rows.values()]));
const membership = new Map();
for (const group of grouped) for (const {test} of group.members) {
  const key = contentKey(test), groups = membership.get(key) ?? new Set();
  groups.add(group.id); membership.set(key, groups);
}
validateResearchRegistry(registry, rows, membership);
validateReleasableResearchRegistry(registry);
const questionIds = new Set(grouped.map(group => group.id));
if (registry.records.some(record => !questionIds.has(record.questionId))) throw new Error('Registro público aponta para pergunta ausente do catálogo versionado.');
if ([...questionIds].some(id => !registry.records.some(record => record.questionId === id))) throw new Error('Pergunta do catálogo versionado sem registro público correspondente.');
console.log(`Registro público verificado: ${registry.records.length} perguntas, ${registry.records.reduce((n,r)=>n+r.versions.length,0)} versões editoriais e ${rows.size} textos públicos de referência; fonte ${sourceVerification}.`);
