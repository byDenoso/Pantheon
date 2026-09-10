import test from 'node:test';
import assert from 'node:assert/strict';
import {emitSessionChange,onSessionChange} from '../src/contracts/session-events.ts';

test('mudança de sessão publica um único sinal reutilizável pelo SystemState',()=>{
  const target=new EventTarget();
  let count=0;
  const off=onSessionChange(target,()=>{count++;});
  emitSessionChange(target,true);
  emitSessionChange(target,false);
  assert.equal(count,2);
  off();
  emitSessionChange(target,true);
  assert.equal(count,2);
});
