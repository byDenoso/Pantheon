import {createHash} from 'node:crypto';

// Git object ID checked against the public artifact at the pinned revision in PR CI.
export const PUBLIC_SOURCE_GIT_BLOB = 'acf8c4b15910d0bea6fe5be20247d67edad3077d';
export function assertSourceIntegrity(bytes, expectedSha256, commitBytes = null) {
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const gitBlob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (sha256!==expectedSha256 || gitBlob!==PUBLIC_SOURCE_GIT_BLOB) throw new Error('Artefato público diverge do blob Git fixado.');
  if (commitBytes !== null && !bytes.equals(commitBytes)) throw new Error('Artefato público diverge dos bytes do commit declarado.');
  return commitBytes === null ? 'PINNED_BLOB_ONLY' : 'COMMIT_BLOB_VERIFIED';
}
