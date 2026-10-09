# Public campaigns, version 1

The Writer is the only producer. The website reads `public-campaigns.json`; it never reads Tower. The package is prepared with no approved content or invented campaign mapping.

## Writer interface

Import `projectApprovedPublicCampaigns(records, approvals, {sourceRevision, generatedAt})` from `server/atlas/public-campaign-projection.mjs`. `records` contains canonical `campaigns`, `roadmaps`, and `tests`, normalized to `id`. The revision is `sha256:<64 hex>` and generation time is ISO 8601. Store the resulting `ATLAS_PUBLIC_CAMPAIGNS_V1` snapshot only through the existing Writer CAS/readback path.

Each canonical source must explicitly declare `visibility: PUBLIC`. A campaign or roadmap has `question_id`; a test has `campaign_id` or `roadmap_id` equal to its source campaign ID. The public ID is opaque and stable. IDs are bound explicitly; equal or similar text never establishes membership.

Each approval contains `kind: CAMPAIGN | TEST`, `sourceId`, `sourceDigest` (from `publicTestSourceDigest(source)`), `publicId`, `publication: {policy: NEXO_PUBLIC_CAMPAIGNS_V1, status: APPROVED, receiptId}`, and `presentation`. Campaign approvals also carry `questionId`; test approvals carry `campaignSourceId`. These are canonical policy approvals produced by the Writer after the relevant review, not API client flags.

Presentation text is bilingual `{pt-BR, en}`. Campaign presentation: `question`, optional `why`, `method`, `currentStage`, `nextStep`, `limitations` (list or null), `updatedAt`, and public `references`. Test presentation: `question`, optional `method`, `stage`, `updatedAt`, optional `result: {verdict, summary, limitations}`, and public `references`. Stages: PLANNED, RUNNING, AWAITING_REVIEW, REVIEWED, BLOCKED, PAUSED, UNKNOWN. Verdicts: SUPPORTS, NULL, FALSIFIES, INCONCLUSIVE. Missing descriptive fields stay null; missing record binding is not an empty dataset. Snapshot `coverage` and per-campaign `testsCoverage` are COMPLETE, PARTIAL, or UNAVAILABLE; no private totals are exposed. Missing approvals/bindings render incomplete coverage rather than an invented zero.

Results publish only through the existing canonical review chain: source `review_state: CONFIRMED | REFUTED` and `mechanical_contest_verdict: {contest_test_id, outcome, rule, at}`. The current rule is FROZEN_INDEPENDENT_ATTACK_V2 and requires `review_validation: {policy: SCIENTIFIC_INTEGRITY_V1, eligible: true}`. Legacy FROZEN_ATTACK_CRITERION_V1 receipts or `reviews[]: {referee, outcome, contest_test_id, at}` remain compatible only after fresh Writer verification. The referenced attack must point back through `contests_test_id`. The trusted Writer must compute `scientific_integrity.independence(parent, attack, root)` and include an approval `independence: {policy: NEXO_SCIENTIFIC_INDEPENDENCE_V1, eligible: true, parentDigest, attackId, attackDigest, reviewedAt}` only when eligible. The projector verifies both digests and the matching canonical review entry. This proof is never client-provided authorization. REFUTED cannot publish a SUPPORTS result.

Closure requires canonical `closure: {status: CLOSED, receipt_id, closed_at, reason, outcome}` and a matching presentation `closure: {receiptId, closedAt, reason, outcome, summary}`. Reasons SUCCESS, KILL, SATURATION, BUDGET, OTHER describe why work ended; they do not determine a scientific result. `outcome` is null unless an explicit scientific outcome was recorded. A DONE operational status cannot close a campaign.

References require explicit `public: true`, bilingual `label`, and an HTTPS `url`. Private families, credentials, local paths, raw records, Drive document URLs, and internal source references are excluded. The output allowlist contains only presentation fields and the source revision, generation time, and snapshot digest. Source IDs, receipts, source digests, and raw review objects remain server-side.

## Publication and reads

The private cross-runtime bridge is `python nexo-one/scripts/prepare_public_campaigns.py --tower <verified-private-Writer-readback> --tcc-root <TCC-checkout> --output <sanitized-snapshot>`. It verifies canonical registry byte commitments, adapts Python/JavaScript JSON number spelling without renewing stale approvals, and deletes private intermediates. PUBLIC_CAMPAIGNS_PENDING preserves the last verified snapshot when canonical bindings or approvals are unavailable. Only the sanitized output may enter the public derivative branch.

Run `node nexo-one/scripts/publish-public-campaigns.mjs --input <verified-writer-snapshot> --output-dir <dist>` after the public shell build. This revalidates the whole snapshot, atomically replaces the output, and verifies readback. Invalid input preserves the existing file. Include `public-campaigns.json` in the same deployment artifact as its UI. Static publication sealing allows only this validated snapshot in addition to the existing shell.

Static hosting reads the snapshot only after an API-not-deployed response. Vercel may set `NEXO_PUBLIC_CAMPAIGNS_FILE` to the packaged sanitized artifact; `/api/atlas-public` keeps the legacy contract and adds optional campaign fields. A configured missing or invalid snapshot returns unavailable. No Tower source or browser-provided file path is accepted.

## Release gate

The live `nexoresearch.org` Cloudflare-served bundle differs from this repository's public source. Its dates/search/pagination and additional method/ORCID pages must be reconciled with the actual publication owner before replacing that artifact. The current site is preserved while this code and an approved canonical campaign binding are staged and reviewed. No synthetic fixture is included in production.
