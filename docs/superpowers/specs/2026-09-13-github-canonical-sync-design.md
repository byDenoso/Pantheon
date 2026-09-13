# GitHub Canonical Sync Design

## Decision
GitHub is the canonical operational authority for NEXO. Google Drive is a projection/mirror and must never override canonical GitHub state.

## Target flow
GitHub canonical state -> compiler -> validated projections -> NEXO One / Atlas API -> POST /sync -> semantic diff -> frontend refresh.

## Sync contract
`POST /sync` must read GitHub canonical state, validate the canonical contract and fingerprint, compile all projections, compute semantic changes, atomically publish the new valid snapshot, and return changed sections/projections. If refresh fails, preserve the last valid snapshot and return a degraded/stale result.

## Authority rules
- `authority: GITHUB`
- Drive metadata may be exposed as projection provenance only.
- No runtime route may label Drive as canonical authority.
- Static fallback remains allowed only when marked `STALE` or `DEGRADED`.
- The UI must never replace a valid graph with empty data after a failed refresh.

## Compatibility
Keep the existing Atlas/NEXO route surface and semantic-diff response shape. Change source authority and compiler wiring, not the frontend contract.

## Acceptance
A GitHub canonical change followed by one Sync produces an updated fingerprint and semantic diff in Atlas; unchanged state returns NO_CHANGE; failed source refresh preserves the last valid snapshot and reports degraded state.
