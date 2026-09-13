import {createHash} from 'node:crypto';

export const GITHUB_CANONICAL_CONTRACT='NEXO_CANONICAL_GITHUB_V1';
export const ATLAS_CONTRACT='NEXO_ATLAS_SSOT_V1';
const DEFAULT_REPO='byDenoso/Pantheon';
const DEFAULT_REF='main';
const DEFAULT_PATH='atlas-control-tower/data/nexo-drive-projection.json';
const text=value=>String(value??'').trim();
const arr=value=>Array.isArray(value)?value:[];
const digest=value=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const contentsUrl=(repo,ref,path)=>`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
