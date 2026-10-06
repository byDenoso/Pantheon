import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const servedRoots = ['public', 'dist'].map(name => path.join(projectRoot, name));

// A historical `publicProjection` bit certifies neither consent nor an allowlist.
// Private compilers may still write outside web-served directories for tests and
// authenticated backend processing; served output remains forbidden by default.
export function assertPrivateProjectionOutput(outDir) {
  if (!outDir) throw new Error('PRIVATE_PROJECTION_OUTPUT_REQUIRED');
  let existing = path.resolve(outDir);
  const missing = [];
  while (true) {
    try {
      existing = realpathSync(existing);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      missing.unshift(path.basename(existing));
      existing = parent;
    }
  }
  const output = path.join(existing, ...missing);
  if (servedRoots.some(root => output === root || output.startsWith(`${root}${path.sep}`))) {
    throw new Error('PUBLIC_DATA_PUBLICATION_DISABLED: no reviewed public content allowlist');
  }
}
