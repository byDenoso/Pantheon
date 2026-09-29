#!/usr/bin/env node
// Replay executor selection against a local Tower checkout (read-only).
//   node scripts/eligibility-replay.mjs <path-to>/TOWER_V06
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveRoleView } from '../lib/tower-role-view.mjs';

const root = process.argv[2];
if (!root) { console.error('usage: eligibility-replay.mjs <TOWER_V06 dir>'); process.exit(2); }
const json = async rel => JSON.parse(await readFile(join(root, rel), 'utf8'));
const activeWork = await json('indexes/active-work.json');
const capabilities = (await json('manifests/capabilities.json')).capabilities || {};
const rows = activeWork.work.filter(item => String(item.owner_role).toUpperCase() === 'EXECUTOR');
const entities = new Map(await Promise.all(rows.map(async item => [item.id, await json(`entities/work/${item.id}.json`).catch(() => null)])));
const refs = [...new Set([...entities.values()].map(e => e && (e.frozen_test_ref || e.source_test_ref)).filter(Boolean))];
const frozenTests = Object.fromEntries(await Promise.all(refs.map(async ref => [ref, await json(ref).catch(() => null)])));

const before = deriveRoleView({ role: 'EXECUTOR', activeWork, capabilities, control: { role_queue_limit: 1000 } });
const after = deriveRoleView({ role: 'EXECUTOR', activeWork, capabilities, entities, frozenTests, control: { role_queue_limit: 1000 } });
const indexReady = rows.filter(item => item.status === 'READY').length;
const reasons = {};
for (const row of [...after.blocked_input, ...after.stale_index]) for (const r of row.reasons) { const k = r.split(':')[0].replace(/^INDEX_.*/, 'STALE_INDEX'); reasons[k] = (reasons[k] || 0) + 1; }
console.log(JSON.stringify({
  executor_rows: rows.length, index_ready: indexReady,
  queue_index_only: before.queue.length, queue_hydrated: after.queue.length,
  selection_stats: after.selection_stats, reasons,
  queue_hydrated_ids: after.queue.map(item => item.id),
}, null, 1));
