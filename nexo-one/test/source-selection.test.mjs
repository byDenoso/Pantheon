import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceKindForHost} from '../src/data/adapters/select.ts';

test('produção usa fonte remota e localhost preserva fixtures de teste',()=>{
  assert.equal(sourceKindForHost('nexo-one-two.vercel.app'),'remote');
  assert.equal(sourceKindForHost('nexo-preview.vercel.app'),'remote');
  assert.equal(sourceKindForHost('127.0.0.1'),'fixture');
  assert.equal(sourceKindForHost('localhost'),'fixture');
});
