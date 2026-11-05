import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {validateAppendOnlyHistory} from '../src/contracts/research-registry.mjs';

const commit=process.env.NEXO_REGISTRY_BASE;
if (!commit || !/^[a-f0-9]{40}$/i.test(commit)) throw new Error('NEXO_REGISTRY_BASE deve identificar o commit base completo.');
const root=new URL('../',import.meta.url),relative='nexo-atlas/src/atlas/researchRegistry.json';
try {execFileSync('git',['cat-file','-e',`${commit}^{commit}`],{cwd:root,stdio:'pipe'});}
catch {throw new Error('Revisão base do registro não está disponível no checkout.');}
const entries=execFileSync('git',['ls-tree','--name-only',commit,'--',relative],{cwd:root,encoding:'utf8'}).trim();
const previous=entries ? JSON.parse(execFileSync('git',['show',`${commit}:${relative}`],{cwd:root,encoding:'utf8'})) : {contract:'NEXO_PUBLIC_RESULT_REGISTRY_V1',records:[]};
const current=JSON.parse(await readFile(new URL('../src/atlas/researchRegistry.json',import.meta.url),'utf8'));
validateAppendOnlyHistory(previous,current);
console.log('Histórico público anterior preservado.');
