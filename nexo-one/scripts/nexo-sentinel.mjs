#!/usr/bin/env node
// NEXO Sentinel: deterministic health check of the machine, no LLM involved.
//
// Reads only what is already public — the published projection on Pages and the
// commit history of byDenoso/TCC — because Actions logs on a public repository are
// public too. It never reads the private Vault and never writes anywhere.
//
// Exit code is the alert: 0 PASS/WARN, 1 FAIL. A failed scheduled workflow makes
// GitHub notify the owner, so a FAIL reaches Dener without anyone reading reports.

const PAGES = 'https://bydenoso.github.io/Pantheon';
const TCC = 'https://api.github.com/repos/byDenoso/TCC';
const HOUR = 3600e3;

/* Thresholds follow the legitimate cadence: Pages rebuilds every two hours plus
   on push, agents run hourly, the relay moves a request in seconds. */
export const LIMITS = {
  projection: {warn: 3*HOUR, fail: 8*HOUR},
  guardian:   {warn: 2*HOUR, fail: 6*HOUR},
  role:       {warn: 3*HOUR, fail: 8*HOUR},
  pending:    {warn: 1*HOUR, fail: 4*HOUR},
};
export const ROLES = ['executor','guardiao','pitia','learner','refutador'];

export function grade(ageMs, limit){
  if (!Number.isFinite(ageMs)) return 'FAIL';
  if (ageMs >= limit.fail) return 'FAIL';
  if (ageMs >= limit.warn) return 'WARN';
  return 'PASS';
}
export function worst(levels){
  return levels.includes('FAIL') ? 'FAIL' : levels.includes('WARN') ? 'WARN' : 'PASS';
}
export function hours(ms){ return Number.isFinite(ms) ? (ms/HOUR).toFixed(1)+' h' : 'nunca'; }

/* Which role wrote a commit, read from the message conventions the agents use. */
export function roleOf(message){
  const m = String(message).toLowerCase();
  if (/guardi[aã]o/.test(m)) return 'guardiao';
  if (/p[ií]tia/.test(m)) return 'pitia';
  if (/learner/.test(m)) return 'learner';
  if (/refutador/.test(m)) return 'refutador';
  if (/executor/.test(m)) return 'executor';
  return null;
}

async function json(url, fetchImpl){
  const headers = {Accept:'application/vnd.github+json'};
  if (process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com'))
    headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const r = await fetchImpl(url, {headers});
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}

export async function inspect(now = Date.now(), fetchImpl = fetch){
  const checks = [];
  const add = (name, level, detail) => checks.push({name, level, detail});

  // 1. published projection freshness
  let manifest = null, system = null;
  try {
    manifest = await json(PAGES + '/tower-projection/manifest.json', fetchImpl);
    const age = now - Date.parse(manifest.generated_at);
    add('Projeção publicada', grade(age, LIMITS.projection),
        'gerada há ' + hours(age) + ' · cursor ' + manifest.event_cursor);
  } catch (e) { add('Projeção publicada', 'FAIL', 'ilegível: ' + e.message); }

  // 2. guardian heartbeat inside the published system state
  try {
    system = await json(PAGES + '/system.json', fetchImpl);
    const g = system.guardian || {};
    const age = now - Date.parse(g.checked_at);
    const lvl = worst([grade(age, LIMITS.guardian), g.status === 'RED' ? 'FAIL' : 'PASS']);
    add('Guardião', lvl, 'verificou há ' + hours(age) + ' · ' + (g.status || '?')
        + (g.failing_areas && g.failing_areas.length ? ' · falha: ' + g.failing_areas.join(', ') : ''));
  } catch (e) { add('Guardião', 'FAIL', 'ilegível: ' + e.message); }

  // 3. each role's last sign of life, from the persistence branches
  const last = Object.fromEntries(ROLES.map(r => [r, NaN]));
  const staged = new Map();   // stable_id -> staged at
  const landed = new Set();
  for (const branch of ['nexo%2Fdispatch-runtime', 'nexo-inbox']){
    try {
      const commits = await json(TCC + '/commits?sha=' + branch + '&per_page=100', fetchImpl);
      for (const c of commits){
        const when = Date.parse(c.commit.author.date);
        const msg = c.commit.message.split('\n')[0];
        const role = roleOf(msg);
        if (role && !(last[role] >= when)) last[role] = when;
        const id = (msg.match(/([a-z]+-batch-[0-9a-f]{16})/) || [])[1];
        if (id && branch.startsWith('nexo%2F') && !staged.has(id)) staged.set(id, when);
        if (id && branch === 'nexo-inbox') landed.add(id);
      }
    } catch (e) { add('Histórico ' + decodeURIComponent(branch), 'WARN', 'ilegível: ' + e.message); }
  }
  for (const r of ROLES){
    const age = now - last[r];
    add('Papel · ' + r, grade(age, LIMITS.role), Number.isFinite(age) ? 'último sinal há ' + hours(age) : 'sem sinal nas últimas 100 escritas');
  }

  // 4. staged requests that never reached the inbox. Relay commit messages do not
  //    carry the batch id, so delivery is judged by the file existing, not the log.
  try {
    const dir = await json(TCC + '/contents/inbox?ref=nexo-inbox', fetchImpl);
    for (const f of Array.isArray(dir) ? dir : []){
      const id = (String(f.name).match(/([a-z]+-batch-[0-9a-f]{16})/) || [])[1];
      if (id) landed.add(id);
    }
  } catch (e) { add('Inbox canónico', 'WARN', 'ilegível: ' + e.message); }
  const stuck = [...staged].filter(([id]) => !landed.has(id));
  const oldest = stuck.length ? Math.max(...stuck.map(([, t]) => now - t)) : 0;
  add('Pedidos por entregar', stuck.length ? grade(oldest, LIMITS.pending) : 'PASS',
      stuck.length ? stuck.length + ' pedido(s), o mais antigo há ' + hours(oldest) : 'nenhum');

  return {level: worst(checks.map(c => c.level)), checks, at: new Date(now).toISOString()};
}

export function render(report){
  const icon = {PASS:'ok', WARN:'atenção', FAIL:'FALHA'};
  const lines = ['NEXO Sentinel — ' + report.level + ' · ' + report.at, ''];
  for (const c of report.checks) lines.push('[' + icon[c.level].padEnd(7) + '] ' + c.name.padEnd(24) + ' ' + c.detail);
  return lines.join('\n');
}

export function renderMarkdown(report){
  const head = {PASS:'Tudo em ordem.', WARN:'Há sinais a vigiar, nada partido.', FAIL:'Alguma coisa parou. Ver linhas FALHA.'};
  const rows = report.checks.map(c => '| ' + c.level + ' | ' + c.name + ' | ' + c.detail + ' |');
  return ['## NEXO Sentinel: ' + report.level, '', head[report.level], '',
          '| Estado | Verificação | Detalhe |', '|---|---|---|', ...rows, '', '_' + report.at + '_'].join('\n');
}

if (String(process.argv[1] || '').endsWith('nexo-sentinel.mjs')){
  const report = await inspect();
  console.log(render(report));
  if (process.env.GITHUB_STEP_SUMMARY){
    const {appendFile} = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(report) + '\n');
  }
  process.exitCode = report.level === 'FAIL' ? 1 : 0;
}
