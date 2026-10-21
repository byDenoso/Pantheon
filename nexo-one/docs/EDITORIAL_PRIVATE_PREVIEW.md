# Editorial studies: private preview before any Atlas publication

This pipeline provides a reversible, **private-only** editorial preview for a scientific
study that has recorded numerical evidence. It complements the existing P
Roadmap/Editorial Task and does **not** create another Writer, queue, Tower,
public-campaign schema, publication receipt, or submission mechanism.

## Authorities and integration

- **AGENTS** and the live scheduler govern the tasks and allowed operations.
- The canonical **Tower SHADOW** holds scientific/operational state; Writer
  handles canonical persistence and readback.
- P groups correlated tests into one study and records a candidate with
  author decision `PENDING`. P does not approve its own releases.
- Existing public architecture:
  `server/atlas/public-campaign-projection.mjs`,
  `scripts/build-public-campaigns.mjs`,
  `scripts/publish-public-campaigns.mjs`, and the trust policy described in
  `docs/PUBLIC_CAMPAIGNS_V1.md`.
- These public components are **not** called by the preview generator. A later
  publication must use their Writer-approved digest/receipt chain and the
  real web publisher. A proposal or HTML preview is not an approval.
- The actual Cloudflare-served nexoresearch.org artifact differs from the
  repository shell. Do not assume a repo PR updates the live domain.

## Private preview workflow

1. Resolve a canonical hypothesis/claim and relevant TEST/RUN/RESULT/REVIEW
   through the INDEX and Tower SHADOW. Link the existing 34-family editorial
   inventory. Do not equate six correlated cuts to six publications.
2. Verify source/reviewer numerical agreement to the frozen tolerance.
   Distinguish computational replication from independent observations.
3. Carry into the **private candidate JSON** a question, calibrated claim,
   provenance, limitations, novelty check and the author's undecided state.
   Never place private Tower/Drive pointers or confidential research in
   display copy. The generator strips non-allowlisted input fields.
4. Generate offline via:

   ```sh
   node nexo-one/scripts/editorial-private-preview.mjs \
     --input /path/to/private-candidate.json \
     --out /path/to/private-review-folder
   ```

   The generator writes `preview.html`, `projection.json` and
   `manifest.json` to the private folder and rereads their bytes.
   It rejects `public/`, `dist/`, `www/` and similar destinations.
   It performs no network requests, no site publication and no Writer writes.
5. Attach the private dossier and artifact IDs to a P candidate and persist
   the appropriate small pointer through the existing Writer, with readback.
   If no durable upload is available, label `LOCAL_ONLY/PENDING_WRITE`;
   do not claim it is in Drive.
6. Recheck novelty and author review. An approved publication requires a
   separate explicit author decision, the existing Writer source digest and
   approval receipt, a sanitized public snapshot, the actual site publisher,
   and a deployed-bundle verification. Review-pending findings remain private.

## Candidate contract

`NEXO_EDITORIAL_CANDIDATE_V1`:

```json
{
  "contract": "NEXO_EDITORIAL_CANDIDATE_V1",
  "visibility": "PRIVATE",
  "authorDecision": "PENDING",
  "level": "E1",
  "destination": "ATLAS_STUDY_CANDIDATE",
  "studyId": "NEXO-STUDY-IDENTITY",
  "familyKey": "CANONICAL-FAMILY-KEY",
  "baselineDeltaChi2": 5.071289,
  "materialThresholdPercent": 25,
  "tolerance": 0.02,
  "copy": {
    "title": "Human-readable title",
    "question": "Question being tested",
    "summary": "Bounded result",
    "method": "Data and numerical comparison",
    "interpretation": "What the result can sustain",
    "limitations": "What the result cannot establish",
    "nextStep": "Smallest remaining material action",
    "noveltyStatus": "NOVELTY_CHECK_PENDING"
  },
  "review": {
    "independentImplementation": true,
    "sameObservationalData": true,
    "method": "Description of a distinct numerical implementation"
  },
  "surveys": [
    {
      "id": "SURVEY-SDSS",
      "label": "SDSS",
      "remainingSupernovae": 1254,
      "primaryDeltaChi2": 3.890448,
      "reviewDeltaChi2": 3.888261
    }
  ],
  "literature": [
    {"title": "Public scientific reference", "url": "https://doi.org/10.1000/example"}
  ]
}
```

The schema above is illustrative, not an authorized public payload.
Source records may additionally contain internal evidence pointers, which
are *not copied* to the sanitized presentation. A source JSON with
`authorDecision: APPROVED` is rejected: approval never comes from the
candidate generator. Passing tests proves formatter behavior only.

## Pilot context

The October 21 pilot uses DESI DR2 BAO13 + Pantheon+ no SH0ES,
ΛCDM/CPL fits and six leave-one-survey-out variations. S1 originally
fit the six cuts; S4 reproduced them using Cholesky/SLSQP.
The result is an **E1 sensitivity study**, not a global-significance
detection, a Bayes factor, an H0 measurement, or six independent probes.
The private Drive dossier is the record of numerical sources and scientific
limits. Novelty against published DESI DR2 and supernova literature remains
under evaluation.

## Regression verification

```sh
node --test nexo-one/test/editorial-private-preview.test.mjs
```

Tests cover private-only rendering, source allowlisting, numerical
replication tolerance, refusal of forged author approval, basic XSS/HTML
escaping, output-path restrictions and reproducible readbacks.

## Publication boundary

`PRIVATE_PREVIEW_VERIFIED` is *not* `APPROVED`,
`PUBLIC_SNAPSHOT_READY`, `DEPLOYED`, or `PUBLISHED`.
None of these later states can be inferred from a successful preview test.
The existing public campaign projection is the only publication path.
