import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function assertShellOnly(outDir) {
  const root = resolve(outDir);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('INVALID_STATIC_OUTPUT_DIRECTORY');
  const rejected = [];
  async function walk(prefix = '') {
    for (const file of await readdir(join(root, prefix), { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${file.name}` : file.name;
      if (file.isDirectory()) await walk(relative);
      else if (!file.isFile() || (!['index.html', 'atlas-v3/index.html'].includes(relative)
        && !/^assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp|gif|ico)$/.test(relative))) {
        rejected.push(relative);
      } else if (/\.(?:js|html)$/i.test(relative) && /OLYMPUS|Olympus|\bPEER\b|TOWER_V06|peer[-. ]detection/.test(await readFile(join(root, relative), 'utf8'))) {
        rejected.push(`${relative} (PRIVATE_RESEARCH_MARKER)`);
      }
    }
  }
  await walk();
  if (rejected.length) throw new Error(`UNAPPROVED_STATIC_PUBLICATION: ${rejected.sort().join(', ')}`);
  return { publicDataCount: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify({ status: 'PUBLIC_SHELL_ONLY', ...await assertShellOnly(resolve('dist')) }));
}
