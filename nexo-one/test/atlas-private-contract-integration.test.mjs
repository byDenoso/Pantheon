import test from 'node:test';
import assert from 'node:assert/strict';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {validateRuntime} from '../src/private-legacy/runtime.ts';

test('preserved private UI accepts the actual canonical backend runtime without public relabeling',()=>{
 const output=compilePrivateTowerRuntime(makePrivateTowerFixture());
 const result=validateRuntime(output.data);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.runtime.publication.contract,'NEXO_PRIVATE_PROJECTION_PUBLICATION_V1');
 assert.equal(result.runtime.galaxy.access,'PRIVATE');
 assert.equal(result.runtime.galaxy.tower_revision,output.data.source_revision);
});
test('private UI rejects a public-labeled section even in an otherwise valid private generation',()=>{
 assert.equal(validateRuntime(compilePrivateTowerRuntime(makePrivateTowerFixture()).data).ok,true,'valid control must pass before negative tests');
 for(const section of ['system','world','topology','publication','galaxy']){const data=compilePrivateTowerRuntime(makePrivateTowerFixture()).data;data[section].access='PUBLIC';assert.equal(validateRuntime(data).ok,false,section);}
});
test('private UI refuses public manifest and mismatched topology contract inside private envelope',()=>{
 const data=compilePrivateTowerRuntime(makePrivateTowerFixture()).data;
 data.publication.manifest.access='PUBLIC';assert.equal(validateRuntime(data).ok,false);
 const other=compilePrivateTowerRuntime(makePrivateTowerFixture()).data;
 other.topology.contract='OTHER';assert.equal(validateRuntime(other).ok,false);
});
