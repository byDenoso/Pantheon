#!/usr/bin/env node
// Auditoria de consistência da Tower (TOWER_V06).
//
// Lê a Tower de uma de duas formas e aplica os mesmos checks:
//   --bundle <arquivo>   bundle ao vivo NEXO_TOWER_LIVE_V1 ({files:{path:{encoding,value}}})
//   --dir <diretório>    árvore TOWER_V06/ (export ou cópia de proveniência)
// Opcional: --projection <projection.json> compara a projeção pública com a Tower.
//           --json imprime o relatório em JSON; sem ele, imprime um resumo legível.
// Sai com código 1 quando há achado de severidade ERROR.

import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';

const args=process.argv.slice(2);
const opt=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const asJson=args.includes('--json');

function loadFiles(){
  const bundlePath=opt('--bundle'),dir=opt('--dir');
  if(bundlePath){
    const payload=JSON.parse(readFileSync(bundlePath,'utf8'));
    const files={};
    for(const [path,entry] of Object.entries(payload.files||{}))if(entry?.encoding==='json')files[path]=entry.value;
    return {files,meta:{source:'bundle',revision:payload.revision,updated_at:payload.updated_at,file_count:payload.file_count}};
  }
  if(dir){
    const files={};
    const walk=d=>{for(const name of readdirSync(d)){const full=join(d,name);if(statSync(full).isDirectory())walk(full);else if(name.endsWith('.json')){try{files[relative(dir,full)]=JSON.parse(readFileSync(full,'utf8'));}catch{files[relative(dir,full)]=Symbol.for('INVALID_JSON');}}}};
    walk(dir);
    return {files,meta:{source:'dir',path:dir}};
  }
  throw new Error('use --bundle <arquivo> ou --dir <TOWER_V06>');
}

const {files,meta}=loadFiles();
const findings=[];
const add=(severity,code,where,detail,fix)=>findings.push({severity,code,where,detail,fix});

// ── Identidade ─────────────────────────────────────────────
// Cada tipo de entidade usa hoje um campo de ID diferente.
const ID_FIELDS=['work_id','id','entity_id','test_id','hypothesis_id'];
const entities=new Map(); // id -> [{path,kind,value}]
const idFieldByKind=new Map();
for(const [path,value] of Object.entries(files)){
  const m=/^entities\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if(!m)continue;
  if(typeof value!=='object'||!value){add('ERROR','INVALID_JSON',path,'entidade não é JSON válido','reparar ou remover');continue;}
  const kind=m[1];
  const field=ID_FIELDS.find(f=>typeof value[f]==='string');
  if(!field){add('ERROR','ENTITY_WITHOUT_ID',path,'nenhum campo de ID','atribuir ID canônico');continue;}
  (idFieldByKind.get(kind)??idFieldByKind.set(kind,new Set()).get(kind)).add(field);
  const id=value[field];
  if(id!==m[2])add('WARN','ID_FILENAME_MISMATCH',path,`${field}=${id} difere do nome do arquivo`,'renomear arquivo ou corrigir ID');
  (entities.get(id)??entities.set(id,[]).get(id)).push({path,kind,value});
}
for(const [id,list] of entities)if(list.length>1)add('ERROR','DUPLICATE_ID',list.map(e=>e.path).join(' | '),`ID ${id} em ${list.length} arquivos`,'MERGE');
const idFields=[...idFieldByKind].map(([k,s])=>`${k}:${[...s].join('/')}`);
if(new Set([...idFieldByKind.values()].flatMap(s=>[...s])).size>1)
  add('WARN','ID_FIELD_NAMING',"entities/*",`campo de ID varia por tipo (${idFields.join(', ')})`,'RENAME para um campo único (id) com alias de leitura');

// ── Referências ────────────────────────────────────────────
const REF_KEY=/(^|_)(ids?|refs?)$|^(dependency_ids|depends_on|blocks|parent_refs|test_ids|related_ids|source_nodes|related_work_refs)$/;
const ID_SHAPE=/^(ACT|WORK|TEST|HYP|CAND|CAMP|TG|PROG|H|IDM|GOV|SYS)[-:_A-Z0-9]*[-_][A-Z0-9]/i;
const knownIds=new Set(entities.keys());
// IDs publicados em índices e contratos também contam como existentes (programas, campanhas…).
for(const [path,value] of Object.entries(files)){
  if(!/^(indexes|contracts|manifests|roadmaps)\//.test(path)||typeof value!=='object')continue;
  JSON.stringify(value,(k,v)=>{if((k==='id'||k.endsWith('_id'))&&typeof v==='string')knownIds.add(v);return v;});
}
let refCount=0;
for(const [id,list] of entities){
  const {path,value}=list[0];
  const visit=(node,key)=>{
    if(Array.isArray(node)){node.forEach(n=>visit(n,key));return;}
    if(node&&typeof node==='object'){for(const [k,v] of Object.entries(node))visit(v,k);return;}
    if(typeof node!=='string'||!key||!REF_KEY.test(key)||key==='entity_id'||key==='id'||key==='work_id')return;
    if(!ID_SHAPE.test(node)||node.includes('/')||node.includes('@')||node.startsWith('github:'))return;
    refCount++;
    if(knownIds.has(node))return;
    const bare=node.replace(/^[A-Z_]+::/,'');
    if(bare!==node&&knownIds.has(bare)){add('WARN','UNDECLARED_ALIAS',path,`${key} → ${node} resolve só sem o prefixo (${bare})`,'RENAME referência para o ID canônico');return;}
    add('WARN','DANGLING_REF',path,`${key} → ${node} não existe`,'corrigir referência ou remover aresta');
  };
  visit(value,null);
}

// ── Estado: índice materializado vs entidade ───────────────
const activeWork=files['indexes/active-work.json'];
if(activeWork&&typeof activeWork==='object'){
  const rows=Array.isArray(activeWork.work)?activeWork.work:Object.values(activeWork.work||{});
  if(typeof activeWork.count==='number'&&activeWork.count!==rows.length)
    add('ERROR','INDEX_COUNT_DRIFT','indexes/active-work.json',`count=${activeWork.count}, itens=${rows.length}`,'DERIVE count');
  for(const row of rows){
    const id=row.id||row.work_id;
    // O índice é de WORK: compara com a entidade work quando o mesmo ID existe em mais de um tipo.
    const candidates=entities.get(id)||entities.get(String(id).replace(/^WORK::/,''))||[];
    const entity=(candidates.find(e=>e.kind==='work')||candidates[0])?.value;
    if(row.ops_materialization_probe)add('WARN','PROBE_DEBRIS','indexes/active-work.json',`${id} carrega ops_materialization_probe`,'DELETE campo de sonda');
    if(!entity){add('WARN','INDEX_ORPHAN','indexes/active-work.json',`${id} no índice sem entidade`,'DERIVE índice das entidades');continue;}
    if(entity.status&&row.status&&entity.status!==row.status)
      add('ERROR','STATE_DIVERGENCE','indexes/active-work.json',`${id}: índice=${row.status} entidade=${entity.status}`,'DERIVE índice das entidades');
  }
}

// ── Contratos e manifests ──────────────────────────────────
const canon=v=>JSON.stringify(v,Object.keys(v??{}).sort());
for(const path of Object.keys(files).filter(p=>p.startsWith('contracts/'))){
  const twin='manifests/'+path.slice('contracts/'.length);
  if(files[twin]!==undefined)
    add('WARN','CONTRACT_MANIFEST_TWIN',`${path} | ${twin}`,canon(files[path])===canon(files[twin])?'conteúdo idêntico':'mesmo nome, conteúdo diferente','MERGE ou definir papel distinto');
  const c=files[path];
  if(c&&typeof c==='object'&&/SUPERSEDED|FORBIDDEN/.test(String(c.activation||c.status||'')))
    add('WARN','SUPERSEDED_CONTRACT_PRESENT',path,`activation=${c.activation||c.status}`,'DELETE (histórico fica no git/revisões)');
}
const writeModels=Object.entries(files).filter(([p,v])=>/^contracts\/WRITE_CONTRACT/.test(p)&&v&&typeof v==='object').map(([p,v])=>`${p.replace('contracts/','')}=${v.write_model}`);
const control=files['CONTROL.json'];
if(writeModels.length>1)add('ERROR','MULTIPLE_WRITE_CONTRACTS','contracts/WRITE_CONTRACT_*',`${writeModels.join(', ')}; CONTROL.write_model=${control?.write_model}`,'manter só o contrato do write_model vigente');

// ── CONTROL ────────────────────────────────────────────────
if(control&&typeof control==='object'){
  const keys=Object.keys(control);
  const policyKeys=keys.filter(k=>/_policy$|_semantics$|_mode$/.test(k));
  add('INFO','CONTROL_SIZE','CONTROL.json',`${keys.length} chaves de topo, ${policyKeys.length} de política`,'MOVE estado/conhecimento para fora do CONTROL');
  const batteryKeys=keys.filter(k=>/(_state|_latest_run|_synthesis|_battery|_manifest)$/.test(k));
  if(batteryKeys.length)add('WARN','STATE_IN_CONTROL','CONTROL.json',`${batteryKeys.length} chaves de estado/execução no CONTROL (ex.: ${batteryKeys.slice(0,3).join(', ')})`,'MOVE para execution.*/state.*');
}

// ── Projeção pública ───────────────────────────────────────
const projectionPath=opt('--projection');
if(projectionPath){
  const projection=JSON.parse(readFileSync(projectionPath,'utf8'));
  const man=projection.manifest||{};
  const rev=man.tower_revision;
  if(meta.revision&&rev!==meta.revision)add('ERROR','PROJECTION_STALE','projection.manifest.tower_revision',`${rev} ≠ Tower ${meta.revision}`,'rebuild da projeção a partir da revisão atual');
  const seen=new Map();
  for(const section of ['work','tests','campaigns','capabilities']){
    const rows=projection[section];for(const row of Array.isArray(rows)?rows:Object.values(rows||{})){const id=row.id||row.work_id;if(!id)continue;if(seen.has(id)&&seen.get(id)!==section)add('WARN','PROJECTION_ID_COLLISION',section,`${id} também em ${seen.get(id)}`,'namespace por grafo');seen.set(id,section);}
  }
  for(const row of (Array.isArray(projection.work)?projection.work:Object.values(projection.work||{})))if(!entities.has(row.id)&&meta.source==='bundle')add('ERROR','PROJECTION_WITHOUT_ORIGIN','projection.work',`${row.id} sem entidade na Tower`,'remover da projeção');
}

// ── Relatório ──────────────────────────────────────────────
const bySeverity=s=>findings.filter(f=>f.severity===s).length;
const byCode=findings.reduce((acc,f)=>(acc[f.code]=(acc[f.code]||0)+1,acc),{});
const summary={meta,entities:entities.size,files:Object.keys(files).length,references_checked:refCount,errors:bySeverity('ERROR'),warnings:bySeverity('WARN'),by_code:byCode,
  duplicate_canonical_entities:byCode.DUPLICATE_ID||0,orphans:(byCode.INDEX_ORPHAN||0)+(byCode.DANGLING_REF||0)};
if(asJson)console.log(JSON.stringify({summary,findings},null,2));
else{
  console.log(JSON.stringify(summary,null,2));
  const seen=new Set();
  for(const f of findings){const key=f.code+f.where;if(seen.has(key))continue;seen.add(key);if(f.severity!=='INFO'||true)console.log(`[${f.severity}] ${f.code} · ${f.where} · ${f.detail} → ${f.fix}`);}
}
process.exitCode=summary.errors?1:0;
