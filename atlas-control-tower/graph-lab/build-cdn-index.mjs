#!/usr/bin/env node
// Emits the index.html used by the standalone Atlas deploy (nexo-atlas-graph-lab).
//
// That project serves a single HTML file and pulls every module and stylesheet from
// jsDelivr, pinned to one commit of this repository. Only the entry points need
// rewriting: app.mjs resolves its own imports (graph/, data/, vendor/, the snapshots)
// relative to its module URL, so they follow the same pin automatically.
//
//   node graph-lab/build-cdn-index.mjs <commit-sha> [> deploy/index.html]
//
// Run it after pushing, with the sha that is actually on the default branch, and
// publish the output as the deploy's index.html. Never pin to a branch name: the
// deploy must keep serving the exact commit it was verified against.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO='byDenoso/Pantheon';
const DIR='atlas-control-tower/graph-lab';
const ENTRY_POINTS=['styles.css','nexo-live.css','obsidian-observatory.css','graph/volume-rendering.mjs','app.mjs'];

const here=path.dirname(fileURLToPath(import.meta.url));
const commit=process.argv[2];

if(!/^[0-9a-f]{40}$/.test(String(commit||''))){
 console.error('usage: node build-cdn-index.mjs <full 40-character commit sha>');
 process.exit(1);
}

const cdn=file=>`https://cdn.jsdelivr.net/gh/${REPO}@${commit}/${DIR}/${file}`;
const pinEntrypoint=(html,file)=>{
 const url=cdn(file);
 const next=html
  .replaceAll(`"./${file}"`,`"${url}"`)
  .replaceAll(`'./${file}'`,`'${url}'`);
 if(next===html){
  console.error(`index.html no longer references ./${file}; update ENTRY_POINTS.`);
  process.exit(1);
 }
 return next;
};

let html=fs.readFileSync(path.join(here,'index.html'),'utf8');
for(const file of ENTRY_POINTS)html=pinEntrypoint(html,file);

const leftovers=html.match(/["']\.\/[^"']+["']/g)||[];
if(leftovers.length){
 console.error('index.html still has unpinned relative references:',leftovers.join(', '));
 process.exit(1);
}

process.stdout.write(html);