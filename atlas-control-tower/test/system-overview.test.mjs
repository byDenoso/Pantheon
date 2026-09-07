import test from 'node:test';
import assert from 'node:assert/strict';
import {isFastRootQuery, systemRootGraph} from '../lib/system-overview.mjs';

test('only an unfiltered depth-1 children read qualifies for the fast root', () => {
 assert.equal(isFastRootQuery({focus:'system:NEXO', mode:'children', depth:'1'}), true);
 assert.equal(isFastRootQuery({}), true);
 for (const query of [
  {focus:'system:NEXO', depth:'2'},
  {focus:'system:NEXO', mode:'search'},
  {focus:'system:SCIENCE', depth:'1'},
  {focus:'system:NEXO', status:'blocked'},
  {focus:'system:NEXO', type:'TEST'},
  {focus:'system:NEXO', domain:'D1'},
  {focus:'system:NEXO', authority:'SCIENCE_CANONICAL'},
  {focus:'system:NEXO', query:'lrd'},
  {focus:'system:NEXO', since:'2026-09-07'}
 ]) assert.equal(isFastRootQuery(query), false, JSON.stringify(query));
});

test('fast root contains exactly the declared NEXO systems', () => {
 const graph = systemRootGraph();
 assert.equal(graph.focus, 'system:NEXO');
 assert.equal(graph.nodes.length, 6);
 assert.equal(graph.edges.length, 5);
 assert.deepEqual(new Set(graph.nodes.map(n => n.id)), new Set([
  'system:NEXO','system:SCIENCE','system:ENGINEERING','system:OLYMPUS','system:AUTOMATION','system:LEARNING'
 ]));
 assert.equal(graph.edges.every(e => e.source === 'system:NEXO' && e.type === 'CONTAINS'), true);
 assert.equal(graph.source, 'v1');
 assert.equal(graph.freshness, 'LIVE');
 assert.equal(graph.authority, undefined);
});
