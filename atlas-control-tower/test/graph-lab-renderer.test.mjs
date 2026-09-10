import test from 'node:test';
import assert from 'node:assert/strict';
import {PALETTE_A,getPalette,colorForNode} from '../graph-lab/graph/palette.mjs';
import {filamentStyle} from '../graph-lab/graph/filaments.mjs';

test('Graph Lab defaults to Observatory Premium palette A',()=>{assert.equal(getPalette().id,'A');assert.equal(PALETTE_A.name,'Observatório Premium')});
test('semantic node colors preserve NEXO, domain and state mappings',()=>{assert.equal(colorForNode({id:'system:NEXO'},PALETTE_A),PALETTE_A.semantic.NEXO);assert.equal(colorForNode({id:'x',domain:'SCIENCE'},PALETTE_A),PALETTE_A.semantic.SCIENCE);assert.equal(colorForNode({id:'x',status:'blocked'},PALETTE_A),PALETTE_A.states.blocked)});
test('filament styles preserve canonical and cross-domain semantics',()=>{assert.equal(filamentStyle({type:'CANONICAL'},PALETTE_A).width,1.35);assert.equal(filamentStyle({type:'CROSS_DOMAIN'},PALETTE_A).stroke,PALETTE_A.filaments.crossDomain)});
