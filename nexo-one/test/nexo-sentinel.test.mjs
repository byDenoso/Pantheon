import test from 'node:test';
import assert from 'node:assert/strict';
import { grade, worst, roleOf, inspect, render, renderMarkdown, LIMITS } from '../scripts/nexo-sentinel.mjs';

const H = 3600e3;
const NOW = Date.parse('2026-09-27T21:00:00Z');
const iso = ago => new Date(NOW - ago).toISOString();

test('grade follows the legitimate cadence, and a missing timestamp is a failure', () => {
  assert.equal(grade(1*H, LIMITS.guardian), 'PASS');
  assert.equal(grade(3*H, LIMITS.guardian), 'WARN');
  assert.equal(grade(7*H, LIMITS.guardian), 'FAIL');
  assert.equal(grade(NaN, LIMITS.guardian), 'FAIL', 'a heartbeat that never happened is not healthy');
  assert.equal(worst(['PASS','WARN','PASS']), 'WARN');
  assert.equal(worst(['PASS','FAIL','WARN']), 'FAIL');
});

test('roles are read from the commit conventions the agents already use', () => {
  assert.equal(roleOf('NEXO scheduled fallback guardiao-batch-15710782ed60897b'), 'guardiao');
  assert.equal(roleOf('Pítia pitia-batch-392ca9d8c0a7749a'), 'pitia');
  assert.equal(roleOf('persist learner batch'), 'learner');
  assert.equal(roleOf('scheduled refutador-batch-89c89650cd994cef'), 'refutador');
  assert.equal(roleOf('stage executor-batch-3bcec1cfd545cd00'), 'executor');
  assert.equal(roleOf('NEXO scheduled persistence relay'), null);
});

function world({guardianAgo = 1*H, projectionAgo = 0.5*H, learnerAgo = 1*H, landed = true} = {}){
  const routes = {
    '/tower-projection/manifest.json': {generated_at: iso(projectionAgo), event_cursor: 'c-1'},
    '/system.json': {guardian: {checked_at: iso(guardianAgo), status: 'YELLOW', failing_areas: ['inbox']}},
  };
  const dispatch = [
    {commit:{author:{date:iso(0.5*H)}, message:'stage executor-batch-aaaaaaaaaaaaaaaa'}},
    {commit:{author:{date:iso(0.8*H)}, message:'scheduled guardiao-batch-bbbbbbbbbbbbbbbb'}},
    {commit:{author:{date:iso(0.9*H)}, message:'Pítia pitia-batch-cccccccccccccccc'}},
    {commit:{author:{date:iso(learnerAgo)}, message:'persist learner batch'}},
    {commit:{author:{date:iso(1.2*H)}, message:'scheduled refutador-batch-dddddddddddddddd'}},
  ];
  const inbox = landed
    ? ['aaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbb','cccccccccccccccc','dddddddddddddddd']
        .map((x,i) => ({name:'scheduled-'+['executor','guardiao','pitia','refutador'][i]+'-batch-'+x+'.json'}))
    : [];
  return async url => {
    const ok = body => ({ok:true, status:200, json:async () => body});
    for (const [path, body] of Object.entries(routes)) if (url.endsWith(path)) return ok(body);
    if (url.includes('/commits?sha=nexo%2Fdispatch-runtime')) return ok(dispatch);
    if (url.includes('/commits?sha=nexo-inbox')) return ok([]);
    if (url.includes('/contents/inbox')) return ok(inbox);
    return {ok:false, status:404, json:async () => ({})};
  };
}

test('a healthy machine passes', async () => {
  const r = await inspect(NOW, world());
  assert.equal(r.level, 'PASS', render(r));
});

test('a guardian heartbeat that stopped reaching the projection fails even if the agent runs', async () => {
  const r = await inspect(NOW, world({guardianAgo: 30*H}));
  assert.equal(r.level, 'FAIL');
  const g = r.checks.find(c => c.name === 'Guardião');
  assert.equal(g.level, 'FAIL');
  const role = r.checks.find(c => c.name === 'Papel · guardiao');
  assert.equal(role.level, 'PASS', 'the agent itself is alive; the fault is the heartbeat, not the agent');
});

test('a silent role is reported by name', async () => {
  const r = await inspect(NOW, world({learnerAgo: 10*H}));
  assert.equal(r.checks.find(c => c.name === 'Papel · learner').level, 'FAIL');
});

test('delivery is judged by the file existing in the inbox, not by relay commit messages', async () => {
  const ok = await inspect(NOW, world());
  assert.equal(ok.checks.find(c => c.name === 'Pedidos por entregar').detail, 'nenhum');
  const stuck = await inspect(NOW, world({landed:false}));
  assert.match(stuck.checks.find(c => c.name === 'Pedidos por entregar').detail, /^4 pedido/);
});

test('an unreachable source fails loudly instead of passing silently', async () => {
  const r = await inspect(NOW, async () => ({ok:false, status:503, json:async () => ({})}));
  assert.equal(r.level, 'FAIL');
});

test('the summary leads with meaning, then the table', async () => {
  const md = renderMarkdown(await inspect(NOW, world({guardianAgo: 30*H})));
  assert.match(md, /^## NEXO Sentinel: FAIL\n\nAlguma coisa parou/);
  assert.match(md, /\| FAIL \| Guardião \|/);
});
