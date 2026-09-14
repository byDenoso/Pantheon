import test from 'node:test';
import assert from 'node:assert/strict';
import {projectGithubCanonical} from '../lib/github-canonical-projection.mjs';
import {validateGithubAuthority} from '../lib/github-authority.mjs';
import {loadGithubCanonical} from '../lib/github-canonical-runtime.mjs';

const state={
 authority:{contract:'NEXO_ATLAS_AUTHORITY_V2',authority:'TOWER_V06',truthOwner:'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',repository:'byDenoso/NEXO-Obsidian-Vault',ref:'main',controlPath:'TOWER_V06/CONTROL.json',projection:{repository:'byDenoso/Pantheon',ref:'main',transportPath:'atlas-control-tower/data/nexo-drive-projection.json',role:'READ_ONLY_PROJECTION'}},
 payload:{meta:{authority:'GOOGLE_DRIVE'},science:[],engineering:[],olympus:[],learning:[],crossDomain:[],integrity:[],actions:[]},
 fingerprint:'sha256:test'
};
const fetchSequence=values=>async()=>({ok:true,json:async()=>values.shift()});

test('Tower authority validator rejects competing canonical owners',()=>{
 assert.equal(validateGithubAuthority(state.authority).authority,'TOWER_V06');
 assert.throws(()=>validateGithubAuthority({...state.authority,authority:'GITHUB'}),/INVALID_ATLAS_AUTHORITY/);
});

test('root graph keeps Operations reachable while the projection remains non-authoritative',()=>{
 const graph=projectGithubCanonical(state,'graph',{focus:'system:NEXO'});
 assert.equal(graph.authority,'GITHUB');
 assert.ok(graph.nodes.some(node=>node.id==='system:OPERATIONS'));
});

test('projection provenance never silently becomes canonical authority',()=>{
 const health=projectGithubCanonical(state,'health');
 assert.equal(health.dataSource.authority,'GITHUB');
 assert.equal(health.dataSource.projectionAuthority,'GOOGLE_DRIVE');
});

test('canonical runtime accepts only the projection fingerprint authorized by Tower locator',async()=>{
 const authority={...state.authority,projection:{...state.authority.projection,fingerprint:'sha256:authorized'}};
 const payload={...state.payload,meta:{authority:'GOOGLE_DRIVE',fingerprint:'sha256:authorized'}};
 const loaded=await loadGithubCanonical({force:true,fetcher:fetchSequence([authority,payload])});
 assert.equal(loaded.authority.authority,'TOWER_V06');
 assert.equal(loaded.fingerprint,'sha256:authorized');
 const mismatchAuthority={...authority,projection:{...authority.projection,fingerprint:'sha256:expected'}};
 const mismatchPayload={...payload,meta:{...payload.meta,fingerprint:'sha256:wrong'}};
 await assert.rejects(()=>loadGithubCanonical({force:true,fetcher:fetchSequence([mismatchAuthority,mismatchPayload])}),/ATLAS_PROJECTION_FINGERPRINT_MISMATCH/);
});