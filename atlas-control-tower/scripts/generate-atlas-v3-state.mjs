import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAtlasProjectionV3 } from '../v3/project.mjs';
import { publishAtlasV3Snapshot } from '../v3/publish.mjs';

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    values[arg.slice(2)] = argv[i + 1];
    i += 1;
  }
  return values;
}

export async function generateAtlasV3State({ inputPath, outDir }) {
  if (!inputPath) throw new Error('ATLAS_V3_INPUT_REQUIRED');
  if (!outDir) throw new Error('ATLAS_V3_OUT_REQUIRED');
  const payload = JSON.parse(await readFile(inputPath, 'utf8'));
  const snapshot = buildAtlasProjectionV3(payload);
  return publishAtlasV3Snapshot(snapshot, outDir);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  generateAtlasV3State({ inputPath: args.input, outDir: args.out || 'public/data/v3' })
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => {
      process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
      process.exitCode = 1;
    });
}
