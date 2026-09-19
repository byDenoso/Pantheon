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

/**
 * Public builds prefer the versioned NEXO_ONE_GALAXY_V1 artifact. Development
 * and partial deployments remain usable by deriving the exact same contract
 * from the already-authoritative SystemState.
 */
export function useGalaxySnapshot(state: SystemState): GalaxySnapshotState {
  const fallback = useMemo(() => compileGalaxySnapshot(state), [state]);
  const [published, setPublished] = useState<GalaxySnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPublished(null);
    loadGalaxySnapshot({ signal: controller.signal, fallback })
      .then(snapshot => {
        // Never allow a stale artifact from another Tower projection to become
        // the visual authority for the current SystemState.
        setPublished(snapshot.tower_revision === state.bus.fingerprint ? snapshot : fallback);
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
