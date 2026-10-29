/** Local private-fixture replay only. No network, hosted DB or Tower mutation.
 * node scripts/verify-source-linked-context.mjs source.json plan.json output-dir baseline-repo observed-at
 * Writes a NEW local SQLite fixture and private receipts to output-dir.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {readSource,importDocuments,authorizedView} from '../worker/retrieval/source-producer.mjs';
import {prepareView,emitView} from '../worker/retrieval/view-builder.mjs';
import {stageContentShards,finishContentBuild} from '../worker/retrieval/content-store.mjs';
import {verifyGeneration} from '../worker/retrieval/import.mjs';
import {VerifiedD1View} from '../worker/retrieval/storage.mjs';
import {searchCurrentView} from '../worker/retrieval/search.mjs';
const [sourcePath,planPath,out,baselineRepo,observedAt]=process.argv.slice(2);
assert(sourcePath&&planPath&&out&&baselineRepo&&observedAt,'Source, plan, output, baseline repository and frozen observation are required');
const resume=process.env.RESUME_LOCAL_FIXTURE==='1';
assert(resume||!fs.existsSync(path.join(out,'fixture.sqlite')),'Use a fresh output directory; never replace a prior receipt');
fs.mkdirSync(out,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex'),write=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');
const raw=fs.readFileSync(sourcePath),sourceHash=sha(raw),source=await readSource(raw,{fixtureOnly:true});
// Preserve the canonical snapshot metadata. The separately supplied frozen
// clock controls authorization/expiry; it does not rewrite source timestamps.
const sourceUpdatedAt=source.observed_at;
const generation=await importDocuments(source),authorized=await authorizedView(generation,{role:'LEARNER',now:observedAt}),prepared=await prepareView(authorized);
console.log(JSON.stringify({stage:'prepared',documents:authorized.documents.length,chunks:authorized.chunks.length,edges:authorized.edges.length}));
const sqlite=new DatabaseSync(path.join(out,'fixture.sqlite'));sqlite.exec(fs.readFileSync(new URL('../worker/retrieval/schema.sql',import.meta.url),'utf8'));
const db = {
 withSession() { return db; },
 prepare(sql) {
  return { bind(...args) {
   const stmt=sqlite.prepare(sql), values=args.map(v=>v instanceof Uint8Array?Buffer.from(v):v);
   return {
    async first() { return stmt.get(...values)??null; },
    async all() { return {results:stmt.all(...values)}; },
    async run() { return {meta:{changes:Number(stmt.run(...values).changes)}}; }
   };
  }};
 },
 async batch(rows) {
  sqlite.exec('BEGIN');
  try { const values=[];for(const r of rows)values.push(await r.run());sqlite.exec('COMMIT');return values; }
  catch(e) { sqlite.exec('ROLLBACK');throw e; }
 }
};
let receipt;
if(resume){
 const stored=sqlite.prepare('SELECT * FROM retrieval_generations WHERE generation=?').get(prepared.generation);
 assert(stored&&stored.state==='verified','Resume accepts only this exact already-verified local fixture');
 receipt={generation:prepared.generation,manifestJson:stored.manifest_json,manifestHash:stored.manifest_sha256,manifest:JSON.parse(stored.manifest_json)};
 assert.equal(receipt.manifest.snapshot.source_sha256,sourceHash);
}else{
 receipt=await emitView(prepared,rows=>stageContentShards(db,prepared.generation,rows),{contentAddressed:true,compress:true});
 await finishContentBuild(db,receipt);
}
const verification=await verifyGeneration(db,prepared.generation,receipt.manifestHash,async m=>{
 assert.equal(m.snapshot.source_sha256,sourceHash);assert.equal(m.snapshot.revision,source.revision);assert.equal(sha(fs.readFileSync(sourcePath)),sourceHash);
});
write('generation-receipt.json',{...receipt,manifest:JSON.parse(receipt.manifestJson),verification,source_updated_at:sourceUpdatedAt,frozen_observed_at:observedAt});
const baseline=await import(pathToFileURL(path.join(baselineRepo,'worker/retrieval/search.mjs')));
const cases=JSON.parse(fs.readFileSync(planPath,'utf8')).cases,results=[];
const qso='FAM-DE-FS-TRACER-QSO-Z0-DESI-U3',review='BOARD_POST::BP-2026-10-06T13:27-REFEREE_1-CBCCC98EFE41';
cases.push(...[
 ['qso_portuguese_expanded',`Quais evidências e relações corrigem a interpretação de ${qso}?`],
 ['qso_english_review',`Review ${qso}: does QSO alone reject, or is the total dominated by the Planck prior?`],
 ['qso_english_evidence',`What evidence supports the interpretation of ${qso}?`]
].map(([id,query])=>({id,query,required:[review],decision_markers:['prior/CMB-dominada','QSO_z0=+2,56']})));
for(const c of cases){const pair={case:c.id,query:c.query,required:c.required};
 for(const [name,search]of [['baseline',baseline.searchCurrentView],['candidate',searchCurrentView]]){
  const view=await VerifiedD1View.open(db,prepared.generation,receipt.manifestHash),r=await search(view,{query:c.query,k:12,mode:'auto'});
  write(`${c.id}-${name}.json`,r);
  pair[name]={mode:r.mode,route:r.route,hits:r.hits.map(h=>h.id),required_found:c.required.every(id=>r.hits.some(h=>h.id===id)),marker_found:Object.fromEntries(c.decision_markers.map(m=>[m,r.hits.some(h=>h.excerpt.includes(m))])),read_bytes:view.readBytes,shards:view.shardsRead};
  for(const h of r.hits){assert.equal(h.citation.tower_revision,source.revision);assert.match(h.citation.content_sha256,/^[a-f0-9]{64}$/);assert.equal(h.authority,'evidence_only');}
  if(name==='candidate'&&c.id.startsWith('qso')){assert.equal(r.hits[0].id,'TEST::'+qso);assert(pair[name].required_found);assert(Object.values(pair[name].marker_found).every(Boolean));
   const h=r.hits.find(h=>h.id===review);assert.equal(h.citation.json_pointer,'/posts/297');assert.equal(h.graph_path.edges[0].citation.json_pointer,'/posts/297/refs/0');assert.equal(r.graph_summary.scientific_independence,'NOT_ESTABLISHED');}
 }
 results.push(pair);console.log(JSON.stringify(pair));
}
const rawIds=[qso,...authorized.documents.filter(d=>d.kind==='TEST'&&d.object_id!==qso).map(d=>d.object_id).sort().slice(0,23)],rawRegression=[];
for(const query of rawIds){const pair=[];for(const search of [baseline.searchCurrentView,searchCurrentView])pair.push(await search(await VerifiedD1View.open(db,prepared.generation,receipt.manifestHash),{query,k:8}));
 assert.equal(pair[1].mode,'exact');assert.deepEqual(pair[1].hits,pair[0].hits);assert(pair[1].hits.some(h=>h.citation.object_id===query));rawRegression.push({query,identical_hits:true,mode:pair[1].mode});}
assert.equal(sha(fs.readFileSync(sourcePath)),sourceHash);
const summary={scope:'SOURCE_DERIVED_DEVELOPMENT_CHECKS_NOT_INDEPENDENT_GOLD',runtime:'Node SQLite D1 API shim with verified immutable shards',source_sha256:sourceHash,source_revision:source.revision,source_updated_at:sourceUpdatedAt,snapshot_observed_at:source.observed_at,frozen_query_clock:observedAt,original_five_cases:results.slice(0,5),additional_cases:results.slice(5),raw_id_regression:rawRegression,source_unchanged:true,external_requests:0,production_changed:false,fixture_only:true,live_current_claim:false};
write('targeted-summary.json',summary);sqlite.close();
