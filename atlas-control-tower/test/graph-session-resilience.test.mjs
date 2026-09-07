import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../lib/graph-session.mjs';

const deferred = () => {
 let resolve, reject;
 const promise = new Promise((res, rej) => {resolve = res; reject = rej});
 return {promise, resolve, reject};
};
const tick = () => new Promise(resolve => setImmediate(resolve));

test('graph becomes available before a slower summary settles', async () => {
 const graphRead = deferred(), summaryRead = deferred();
 const session = createSession({graph: () => graphRead.promise, state: () => summaryRead.promise});
 const events = [];
 session.on((event, payload) => events.push([event, payload]));

 const refresh = session.refresh();
 graphRead.resolve({focus:'system:NEXO', nodes:[{id:'system:NEXO'}], edges:[]});
 await tick();

 assert.equal(session.state.graph?.focus, 'system:NEXO');
 assert.equal(session.state.summary, null);
 assert.equal(events.some(([event]) => event === 'graph'), true);
 assert.equal(events.some(([event]) => event === 'summary'), false);

 summaryRead.resolve({total:5058});
 await refresh;
 assert.equal(session.state.summary.total, 5058);
 assert.equal(events.some(([event]) => event === 'summary'), true);
});

test('summary failure is local and preserves a successful graph', async () => {
 const session = createSession({
  graph: async () => ({focus:'system:NEXO', nodes:[{id:'system:NEXO'}], edges:[]}),
  state: async () => {throw new Error('summary unavailable')}
 });
 const events = [];
 session.on(event => events.push(event));

 const result = await session.refresh();
 assert.equal(result?.focus, 'system:NEXO');
 assert.equal(session.state.graph?.focus, 'system:NEXO');
 assert.equal(events.includes('graph'), true);
 assert.equal(events.includes('summary-error'), true);
 assert.equal(events.includes('graph-error'), false);
});

test('graph failure does not discard a successful summary', async () => {
 const session = createSession({
  graph: async () => {throw new Error('graph unavailable')},
  state: async () => ({total:5058})
 });
 const events = [];
 session.on(event => events.push(event));

 const result = await session.refresh();
 assert.equal(result, null);
 assert.equal(session.state.summary.total, 5058);
 assert.equal(events.includes('graph-error'), true);
 assert.equal(events.includes('summary'), true);
 assert.equal(events.includes('summary-error'), false);
});

test('an older refresh can never overwrite a newer graph or summary', async () => {
 const graphs = [deferred(), deferred()], summaries = [deferred(), deferred()];
 let graphCall = 0, stateCall = 0;
 const session = createSession({
  graph: () => graphs[graphCall++].promise,
  state: () => summaries[stateCall++].promise
 });

 const first = session.refresh();
 const second = session.refresh();
 graphs[1].resolve({focus:'new', nodes:[{id:'new'}], edges:[]});
 summaries[1].resolve({total:2});
 await second;

 graphs[0].resolve({focus:'old', nodes:[{id:'old'}], edges:[]});
 summaries[0].resolve({total:1});
 await first;

 assert.equal(session.state.graph.focus, 'new');
 assert.equal(session.state.summary.total, 2);
});
