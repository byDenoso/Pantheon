import { lstat, readdir, readFile, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// There is currently no approved public research or operational content. A
// projection's provenance, old `public` name, or environment flag is not consent.
export const APPROVED_PUBLIC_DATA = Object.freeze([]);

// These research-family identifiers are private even when hardcoded into an
// otherwise ordinary UI bundle. Splitting that bundle is a separate UI task.
export const PRIVATE_BUNDLE_MARKERS = /peer[-. ]detection/i;

export function assertPublicDataPublicationAllowed() {
  throw new Error('PUBLIC_DATA_PUBLICATION_DISABLED: no reviewed public content allowlist');
}

export function isPublicShellFile(file) {
  return ['index.html', 'atlas3d/index.html', 'mcp/index.html', '.nojekyll',
    'google-drive-connect.html', 'google-drive-connect.js', 'google-drive-connect.css'].includes(file)
    || /^assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp|gif|ico)$/.test(file)
    || file === 'vendor/g6.min.js';
}

async function outputRoot(outDir) {
  const root = resolve(outDir);
  if (basename(root) !== 'dist') throw new Error('STATIC_PUBLICATION_REQUIRES_DIST_OUTPUT');
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('INVALID_STATIC_OUTPUT_DIRECTORY');
  return root;
}

async function walk(root, visit, prefix = '') {
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) await visit(relative, false);
    else if (entry.isDirectory()) await walk(root, visit, relative);
    else await visit(relative, entry.isFile() && isPublicShellFile(relative));
  }
}

export async function assertStaticPublication(outDir) {
  const root = await outputRoot(outDir);
  const forbidden = [];
  await walk(root, async (file, allowed) => {
    if (!allowed) forbidden.push(file);
    else if (/\.(?:js|html)$/i.test(file) && PRIVATE_BUNDLE_MARKERS.test(await readFile(join(root, file), 'utf8'))) {
      forbidden.push(`${file} (PRIVATE_RESEARCH_MARKER)`);
    }
  });
  if (forbidden.length) throw new Error(`UNAPPROVED_STATIC_PUBLICATION: ${forbidden.sort().join(', ')}`);
  return { publicDataCount: APPROVED_PUBLIC_DATA.length };
}

// Clean only disposable build output. Never edit the private input or historical
// source files. This also drops previously hydrated snapshots and unknown files.
export async function sealStaticPublication(outDir) {
  const root = await outputRoot(outDir);
  const removed = [];
  await walk(root, async (file, allowed) => {
    if (!allowed) {
      await rm(join(root, file), { force: true });
      removed.push(file);
    }
  });
  await assertStaticPublication(root);
  return { publicDataCount: APPROVED_PUBLIC_DATA.length, removed: removed.sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const checkOnly = process.argv.includes('--check');
  const result = await (checkOnly ? assertStaticPublication : sealStaticPublication)(resolve('dist'));
  console.log(JSON.stringify({ status: 'PUBLIC_SHELL_ONLY', ...result }));
}
