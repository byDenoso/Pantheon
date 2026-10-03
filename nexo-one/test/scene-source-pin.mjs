import { execFileSync } from 'node:child_process';

export function verifySceneSourcePin(directory, declaredSha, label = 'candidate') {
  if (!/^[a-f0-9]{40}$/.test(declaredSha ?? '')) throw new Error('SCENE_SOURCE_PIN_INVALID:' + label);
  const actualSha = execFileSync('git', ['-C', directory, 'rev-parse', '--verify', 'HEAD^{commit}'], { encoding: 'utf8' }).trim();
  if (actualSha !== declaredSha) throw new Error('SCENE_SOURCE_PIN_MISMATCH:' + label);
  try {
    execFileSync('git', ['-C', directory, 'diff', '--quiet', 'HEAD', '--'], { stdio: 'pipe' });
  } catch {
    throw new Error('SCENE_SOURCE_DIRTY:' + label);
  }
  return { declaredSha, actualSha, cleanTrackedSources: true };
}
