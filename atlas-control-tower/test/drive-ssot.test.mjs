import test from 'node:test';
import assert from 'node:assert/strict';
import {driveRoute,DRIVE_SSOT_META} from '../lib/drive-ssot.mjs';
import {SOURCES,FRESHNESS} from '../lib/graph-contract.mjs';

test('Drive is the declared canonical authority and snapshot is projection-only',()=>{
 assert.equal(DRIVE_SSOT_META.authority,'GOOGLE_DRIVE');
 assert.equal(DRIVE_SSOT_META.sourceFileId,'1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY');
 assert.equal(DRIVE_SSOT_META.projectionOnly,true);
});

test('health declares Drive snapshot without fallback',async()=>{
 const health=await driveRoute('health',{});
 assert.equal(health.ok,true);
 assert.equal(health.dataSource.source,SOURCES.DRIVE);
 assert.equal(health.dataSource.freshness,FRESHNESS.SNAPSHOT);
 assert.equal(health.dataSource.usedFallback,false);
 assert.equal(health.dataSource.authority,'GOOGLE_DRIVE');
});

test('Atlas root exposes only the three declared product domains',async()=>{
 const graph=await driveRoute('graph',{focus:'system:NEXO',depth:1});
 assert.equal(graph.source,SOURCES.DRIVE);
 const ids=new Set(graph.nodes.map(node=>node.id));
 assert.deepEqual([...ids].sort(),['system:ENGINEERING','system:NEXO','system:OLYMPUS','system:SCIENCE'].sort());
 assert.ok(!ids.has('system:AI'));
 assert.ok(!ids.has('system:LEARNING'));
 assert.ok(graph.edges.every(edge=>ids.has(edge.source)&&ids.has(edge.target)));
});

test('Science subgraphs come from Drive campaign domains, not a synthetic taxonomy',async()=>{
 const graph=await driveRoute('graph',{focus:'system:SCIENCE',depth:1});
 const domains=graph.nodes.filter(node=>node.type==='DOMAIN').map(node=>node.domain);
 assert.ok(domains.includes('D1'));
 assert.ok(domains.includes('D3'));
 assert.ok(domains.every(id=>/^D\\d+$|^M\\d+$/.test(id)));
});

test('Learning is projected from StructuralLearning and CrossDomain rows',async()=>{
 const report=await driveRoute('learning',{});
 assert.equal(report.source,SOURCES.DRIVE);
 assert.ok(Array.isArray(report.ladder));
 assert.ok(report.ladder.flatMap(stage=>stage.items||[]).some(item=>item.id==='SL-NEXO-SEMANTIC-PROCEDURAL-ASSOCIATIVE-NET-V0P1'));
 assert.ok(report.ladder.flatMap(stage=>stage.items||[]).some(item=>item.id==='CD-EMERG-SEMANTIC-PROCEDURAL-NULL-AUDIT-V0P1'));
});

test('audit is derived from Drive Integrity and writes fail closed',async()=>{
 const audit=await driveRoute('audit',{});
 assert.equal(audit.source,SOURCES.DRIVE);
 assert.ok(audit.total>0);
 await assert.rejects(()=>driveRoute('sync',{}, {method:'POST'}),/READ_ONLY_DRIVE_SSOT/);
});
