import {readDriveTower} from './drive-source.mjs';

// Only the current signed-in visitor's official Sites connector context may
// read Tower. No copied provider token, credential fallback, or public source.
export function sourceConfigured(_env, binding) {return Boolean(binding?.invoke);}
export async function readPrivate(_env, fetcher = fetch, {binding,profile} = {}) {
  if (!sourceConfigured(_env, binding)) {
    const error = new Error('PRIVATE_SOURCE_NOT_CONFIGURED');
    error.connectorStatus = 'binding_unavailable';
    throw error;
  }
  return readDriveTower(binding, fetcher, {profile});
}
