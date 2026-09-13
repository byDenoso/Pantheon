import test from 'node:test';
import assert from 'node:assert/strict';
import {projectGithubCanonical} from '../lib/github-canonical-projection.mjs';
import {validateGithubAuthority} from '../lib/github-authority.mjs';
import {loadGithubCanonical} from '../lib/github-canonical-runtime.mjs';

const state={
 authority:{contract:'NEXO_CANONICAL_GITHUB_V1',authority:'GITHUB',repository:'byDenoso/Pantheon',ref:'main',projection:{transportPath:'atlas-control-tower/data/nexo-drive-projection.json'}},
 payload:{meta:{authority:'GOOGLE_DRIVE'},science:[],engineering:[],olympus:[],learning:[],crossDomain:[],integrity:[],actions:[]},
 fingerprint:'sha256:test'
};
const fetchSequence=values=>async()=>({ok:true,json:async()=>values.shift()});

test('GitHub authority validator rejects competing canonical owners',()=>{
 assert.equal(validateGithubAuthority(state.authority).authority,'GITHUB');
 assert.throws(()=>validateGithubAuthority({...state.authority,authority:'GOOGLE_DRIVE'}),/INVALID_GITHUB_AUTHORITY/);
});

test('root graph keeps Operations reachable while GitHub remains authority',()=>{
 const graph=projectGithubCanonical(state,'graph',{focus:'system:NEXO'});
 assert.equal(graph.authority,'GITHUB');
 assert.ok(graph.nodes.some(node=>node.id==='system:OPERATIONS'));
});

test('projection provenance never silently becomes canonical authority',()=>{
 const health=projectGithubCanonical(state,'health');
 assert.equal(health.dataSource.authority,'GITHUB');
 assert.equal(health.dataSource.projectionAuthority,'GOOGLE_DRIVE');
});

test('canonical runtime accepts only the projection fingerprint authorized by GitHub',async()=>{
 const authority={...state.authority,projection:{...state.authority.projection,fingerprint:'sha256:authorized'}};
 const payload={...state.payload,meta:{authority:'GOOGLE_DRIVE',fingerprint:'sha256:authorized'}};
 const loaded=await loadGithubCanonical({force:true,fetcher:fetchSequence([authority,payload])});
 assert.equal(loaded.authority.authority,'GITHUB');
 assert.equal(loaded.fingerprint,'sha256:authorized');
 const mismatchAuthority={...authority,projection:{...authority.projection,fingerprint:'sha256:expected'}};
 const mismatchPayload={...payload,meta:{...payload.meta,fingerprint:'sha256:wrong'}};
 await assert.rejects(()=>loadGithubCanonical({force:true,fetcher:fetchSequence([mismatchAuthority,mismatchPayload])}),/GITHUB_CANONICAL_FINGERPRINT_MISMATCH/);
});
