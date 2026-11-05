import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parsePublicRegistryJson,validateResearchRegistry, validateReleasableResearchRegistry} from '../src/contracts/research-registry.mjs';
import {assertSourceIntegrity} from '../src/contracts/public-source-integrity.mjs';
import {publicSourceContext,readPublicSourceContexts} from '../src/contracts/public-history-sources.mjs';
import {groupPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';
import {guardTests} from '../src/atlas/publicItems.ts';

const root = new URL('../', import.meta.url);
async function readJson(path) {
  let text;
  try {text=await readFile(new URL(path, root), 'utf8');}
  catch (error) {throw new Error(`Não foi possível ler ${path}: ${error.message}`);}
  return parsePublicRegistryJson(text,path);
}
export const contentKey = row => createHash('sha256').update(JSON.stringify(Object.fromEntries(['question','answers','method','result'].map(k=>[k,{'pt-BR':row[k]['pt-BR'],en:row[k].en}])))).digest('hex');
const artifact = await readJson('worker/public-cosmology.json');
const index = await readJson('src/atlas/reviewedSourceIndex.json');
const registry = await readJson('src/atlas/researchRegistry.json');
const sourceCatalog = await readJson('src/atlas/researchSourceCatalog.json');
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
const hasVersions=registry.records.some(record=>record.versions.length);
let contexts=[publicSourceContext({commit:index.sourceCommit,path:'nexo-atlas/worker/public-cosmology.json',sha256:index.sourceSha256},sourceBytes)];
if(hasVersions) {
  let baseCommit=process.env.NEXO_PUBLIC_BASE_COMMIT;
  if(!baseCommit)try {baseCommit=execFileSync('git',['rev-parse','refs/remotes/origin/main'],{cwd:root,encoding:'utf8'}).trim();}catch {throw new Error('Base pública indisponível para verificar histórico.');}
  contexts=readPublicSourceContexts(sourceCatalog,{cwd:root,baseCommit});
  for(const context of contexts)for(const [key,entries] of context.records)if(!rows.has(key))rows.set(key,entries[0].row);
}
// A correct text hash alone is insufficient: it must also belong to the
// question this public editorial catalog actually assigns it to.
const grouped = groupPublicQuestions(guardTests([...rows.values()]));
const membership = new Map();
for (const group of grouped) for (const {test} of group.members) {
  const key = contentKey(test), groups = membership.get(key) ?? new Set();
  groups.add(group.id); membership.set(key, groups);
}
validateResearchRegistry(registry, rows, membership);
if(registry.records.some(record=>record.versions.length)&&sourceVerification!=='COMMIT_BLOB_VERIFIED')
  throw new Error('Versões preenchidas exigem confirmação dos bytes no commit público declarado.');
validateReleasableResearchRegistry(registry,contexts);
const questionIds = new Set(grouped.map(group => group.id));
if (registry.records.some(record => !questionIds.has(record.questionId))) throw new Error('Registro público aponta para pergunta ausente do catálogo versionado.');
if ([...questionIds].some(id => !registry.records.some(record => record.questionId === id))) throw new Error('Pergunta do catálogo versionado sem registro público correspondente.');
console.log(`Registro público verificado: ${registry.records.length} perguntas, ${registry.records.reduce((n,r)=>n+r.versions.length,0)} versões editoriais e ${rows.size} textos públicos de referência; fonte ${sourceVerification}.`);
