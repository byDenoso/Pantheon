import { useEffect, useMemo, useState } from 'react';
import type { SystemState } from '../contracts/system.ts';
import type { GalaxySnapshot } from '../contracts/galaxy.ts';
import { compileGalaxySnapshot } from '../viewmodels/galaxyCompiler.ts';
import {
  galaxySnapshotFreshness,
  loadGalaxySnapshot,
  type SnapshotFreshness,
} from './galaxySnapshot.ts';

export interface GalaxySnapshotState {
  snapshot: GalaxySnapshot;
  source: 'PUBLISHED' | 'DERIVED_FALLBACK';
  freshness: SnapshotFreshness;
}

export function selectCompatibleGalaxySnapshot(
  published: GalaxySnapshot | null,
  fallback: GalaxySnapshot,
  systemFingerprint: string,
): GalaxySnapshot {
  return published?.tower_revision === systemFingerprint ? published : fallback;
}

/**
 * Production truth comes from the sanctioned Tower projection compiled on the
 * server. The TypeScript compiler exists only as an in-browser availability
 * fallback over the already-authoritative SystemState.
 */
export function useGalaxySnapshot(state: SystemState): GalaxySnapshotState {
  const fallback = useMemo(() => compileGalaxySnapshot(state), [state]);
  const [published, setPublished] = useState<GalaxySnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPublished(null);
    loadGalaxySnapshot({ signal: controller.signal, fallback })
      .then(snapshot => {
        setPublished(selectCompatibleGalaxySnapshot(snapshot, fallback, state.bus.fingerprint));
      })
      .catch(() => setPublished(fallback));
    return () => controller.abort();
  }, [fallback, state.bus.fingerprint]);

  const snapshot = published ?? fallback;
  return {
    snapshot,
    source: published && published !== fallback ? 'PUBLISHED' : 'DERIVED_FALLBACK',
    freshness: galaxySnapshotFreshness(snapshot.generated_at),
  };
}
