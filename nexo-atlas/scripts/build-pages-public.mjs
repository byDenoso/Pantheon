import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createWorker} from '../worker/index.mjs';

const output = new URL('../dist/client/', import.meta.url);
const snapshot = new URL('atlas-public.json', output);
const marker = new URL('.nojekyll', output);
const checkOnly = process.argv.includes('--check');

if (!checkOnly) {
  const response = await createWorker().fetch(new Request('https://nexoresearch.org/api/atlas-public'), {});
  if (response.status !== 200) throw new Error(`PUBLIC_SNAPSHOT_HTTP_${response.status}`);
  await mkdir(output, {recursive: true});
  await writeFile(snapshot, await response.text());
  await writeFile(marker, '');
}

const text = await readFile(snapshot, 'utf8');
const value = JSON.parse(text);
if (value?.contract !== 'ATLAS_PUBLIC_V1' || !Array.isArray(value.items) || !Array.isArray(value.links)) {
  throw new Error('PUBLIC_SNAPSHOT_CONTRACT');
}
if (value.tests !== undefined && (!Array.isArray(value.tests) || value.tests.length > 1000)) {
  throw new Error('PUBLIC_SNAPSHOT_TESTS');
}
if (/PRIVATE_BOARD_CANARY|NEXO-BRIDGE-CANARY|PRIVATE_SOURCE_DETAIL/i.test(text)) {
  throw new Error('PUBLIC_SNAPSHOT_PRIVATE_MARKER');
}
await readFile(marker);
console.log(JSON.stringify({status: 'PAGES_PUBLIC_READY', bytes: Buffer.byteLength(text), tests: value.tests?.length ?? 0, campaigns: value.campaigns?.length ?? 0}));
