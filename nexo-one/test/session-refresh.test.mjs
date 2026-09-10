import test from 'node:test';
import assert from 'node:assert/strict';
import {emitSessionChange,onSessionChange} from '../src/contracts/session-events.ts';
import {preserveStateOnFailure} from '../src/data/adapters/source.ts';

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

test('401 limpa estado privado enquanto falha transitória preserva o último snapshot',()=>{
  assert.equal(preserveStateOnFailure('UNAUTHORIZED'),false);
  assert.equal(preserveStateOnFailure('ERROR'),true);
  assert.equal(preserveStateOnFailure('PARTIAL'),true);
});
