import test from 'node:test';
import assert from 'node:assert/strict';
import {CONNECTOME_PALETTE,aggregateDomainFilaments,domainSpringLength,repulsion} from '../src/atlas3d/connectomePhysics.mjs';
test('filamentos agregam por par com media*sqrt(n), cap 2.0',()=>{const rows=aggregateDomainFilaments(Array.from({length:16},()=>({fromDomain:'NEXO',toDomain:'SCIENCE',weight:.72,status:'ESTABLISHED'})));assert.equal(rows.length,1);assert.equal(rows[0].count,16);assert.equal(rows[0].weight,2);assert.equal(rows[0].cadence,2)});
test('ordem de separacao segue filamentos: NEXO-Ciencia mais perto e Engenharia-Olympus mais longe',()=>{const d={ns:domainSpringLength(16,.72),ne:domainSpringLength(1,.72),so:domainSpringLength(1,.72),eo:domainSpringLength(0,.72)};assert.ok(d.ns<d.ne);assert.ok(d.ns<d.so);assert.ok(d.ne<d.eo);assert.ok(d.so<d.eo)});
test('repulsao interdominio aplica x3.4 a sqrt(mi*mj)/d2',()=>{const a=repulsion(157,77,100,false),b=repulsion(157,77,100,true);assert.ok(Math.abs(b/a-3.4)<1e-12)});
test('paleta usa os quatro valores equalizados especificados',()=>assert.deepEqual(CONNECTOME_PALETTE,{NEXO:'#dfaa53',SCIENCE:'#63bbfa',ENGINEERING:'#5dc791',OLYMPUS:'#ff8bbd'}));
