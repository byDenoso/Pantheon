import test from 'node:test';
import assert from 'node:assert/strict';
import {projectGithubCanonical} from '../lib/github-canonical-projection.mjs';
import {validateGithubAuthority} from '../lib/github-authority.mjs';

const state={
 authority:{contract:'NEXO_CANONICAL_GITHUB_V1',authority:'GITHUB',repository:'byDenoso/Pantheon',ref:'main',projection:{transportPath:'atlas-control-tower/data/nexo-drive-projection.json'}},
 payload:{meta:{authority:'GOOGLE_DRIVE'},science:[],engineering:[],olympus:[],learning:[],crossDomain:[],integrity:[],actions:[]},
 fingerprint:'sha256:test'
};

test('GitHub authority validator rejects competing canonical owners',()=>{
 assert.equal(validateGithubAuthority(state.authority).authority,'GITHUB');
 assert.throws(()=>validateGithubAuthority({...state.authority,authority:'GOOGLE_DRIVE'}),/INVALID_GITHUB_AUTHORITY/);
});

test('root graph keeps Operations reachable while GitHub remains authority',()=>{
 const graph=projectGithubCanonical(state,'graph',{focus:'system:NEXO'});
 assert.equal(graph.authority,'GITHUB');
 assert.ok(graph.nodes.some(node=>node.id==='system:OPERATIONS'));
});

test('failed refresh projection can never silently become canonical',()=>{
 const health=projectGithubCanonical(state,'health');
 assert.equal(health.dataSource.authority,'GITHUB');
 assert.equal(health.dataSource.projectionAuthority,'GOOGLE_DRIVE');
});
