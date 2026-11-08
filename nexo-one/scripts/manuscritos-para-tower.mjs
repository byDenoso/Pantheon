// Turns MASTER_CATALOG/manuscritos.csv into tab-separated rows to paste into the Tower tab MANUSCRITOS
// (A1, header included). The Cockpit reads that tab; the data itself never enters this public repository.
// Usage: node scripts/manuscritos-para-tower.mjs <manuscritos.csv> > manuscritos.tsv
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {MANUSCRITOS_COLUMNS, parseCsv} from '../server/atlas/shadow-board.mjs';

export function manuscritosTsv(csvText) {
  const rows = parseCsv(csvText.replace(/^﻿/, '')).filter(row => row.some(cell => cell.trim() !== ''));
  const header = rows[0]?.map(cell => cell.trim().toLowerCase()) ?? [];
  if (MANUSCRITOS_COLUMNS.join(',') !== header.join(',')) throw new Error(`header must be ${MANUSCRITOS_COLUMNS.join(',')}`);
  const cell = value => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  return rows.map(row => MANUSCRITOS_COLUMNS.map((_, i) => cell(row[i])).join('\t')).join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) { console.error('usage: node scripts/manuscritos-para-tower.mjs <manuscritos.csv>'); process.exit(2); }
  try { process.stdout.write(manuscritosTsv(readFileSync(process.argv[2], 'utf8'))); }
  catch (error) { console.error(error.message); process.exit(1); }
}
