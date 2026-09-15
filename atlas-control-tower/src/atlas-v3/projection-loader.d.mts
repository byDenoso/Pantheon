import type {AtlasV3Manifest,AtlasV3Snapshot} from './types';
export const V3_MANIFEST_RELATIVE:string;
export function validateAtlasV3Snapshot(manifest:AtlasV3Manifest,snapshot:AtlasV3Snapshot):AtlasV3Snapshot;
export function loadAtlasV3Snapshot(baseUrl?:string,fetcher?:typeof fetch):Promise<{manifest:AtlasV3Manifest;snapshot:AtlasV3Snapshot;manifestUrl:URL;snapshotUrl:URL}>;
