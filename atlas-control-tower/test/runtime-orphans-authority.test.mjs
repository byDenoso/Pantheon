import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeOrphansHandler} from '../api/runtime-orphans.js';

function response(){return {headers:{},setHeader(key,value){this.headers[key]=value;},end(value){this.body=JSON.parse(value);}};}

test('canonical projection route delegates to the single Drive Tower reader',()=>{
  let driveReads=0;
  const handler=createRuntimeOrphansHandler({drive(){driveReads+=1;return 'drive';},activity(){return 'activity';}});
  assert.equal(handler({method:'GET',url:'/api/state'},response()),'drive');
  assert.equal(driveReads,1);
});

test('activity route remains on its dedicated read-only endpoint',()=>{
  let driveReads=0,activityReads=0;
  const handler=createRuntimeOrphansHandler({drive(){driveReads+=1;},activity(){activityReads+=1;return 'activity';}});
  assert.equal(handler({method:'GET',url:'/api/runtime-orphans?route=live-activity'},response()),'activity');
  assert.equal(activityReads,1);
  assert.equal(driveReads,0);
});
