# Release contract

One Vercel project: `nexo-one`. The repository source of truth is `Pantheon/nexo-one`.

1. CI checks the exact source SHA, builds once, runs browser verification, stores `nexo-one-release-<SHA>` and its manifest.
2. A preview can verify UI and public reads. Private activation also requires an authenticated read and an unauthenticated non-disclosure check.
3. For a production candidate, build against production environment **with domain autoassignment skipped**; record deployment ID, source SHA and manifest. Vercel's ordinary preview-to-production option can rebuild against different env values, so it does not satisfy same-artifact promotion by itself.
4. Verify that staged production deployment's `/`, `/api/session`, `/api/health`, `/api/world`, source coverage, runtime errors and mobile flow. Private providers and the expected coverage must be confirmed; degraded credential placeholders do not pass V1 acceptance.
5. Promote **that deployment ID** only after its verification record is accepted. Re-read the production alias and prove it points to the same ID. Never substitute a rebuild.
6. On failed production readback, invoke rollback to the previously verified production deployment ID; verify alias, health, access boundaries and record the incident. A first deployment has no previously verified rollback target, so rollback remains unproven until a second verified release exists.

Required deployment secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and preview protection bypass token if HTTP verification requires it. Configure these in GitHub repository/environment secrets; never commit values. Project ID must equal `prj_rFoAEgGt4gFNr8DHEOzxY7keS16W`.

Current blockers to operational V1: private auth/provider credentials, canonical export discovery/validation, live Calendar/Recall integration, approved visual baseline, same-artifact promotion readback and actual rollback proof. CI success cannot clear those gates.
