# Public test publication dates

The public projection exposes only the four reviewed scientific fields plus `published_at` and `updated_at` (ISO UTC or null). Dates describe publication on this Atlas, not experiment execution or a paper's publication date. The UI formats them in America/Sao_Paulo, in Portuguese or English.

`worker/public-publication.json` is an audited, reconstructible editorial projection keyed by the SHA-256 of the exact four-field bilingual content (field order question, answers, method, result; locale order pt-BR, en). Evidence points to saved source versions and successful publish deployments. The deployment status timestamp establishes the publication event; no Git commit timestamp is used as a publication date.

207 historical records have an unambiguous content lineage to version 9. Eight records had duplicate predecessors, so their first-publication date is null. All 215 have a verified latest-content publication in version 9 or 15. The UI says that the original date is unrecorded for those eight and still shows their verified update date.

For future editorial publications, retain the first proven publication date and add the successful publication event for changed content. Do not predate a successful publication, reset dates on unrelated deploys, use a test execution date, or infer identity from array position. If the history has not been reconciled, an unknown content hash yields null dates. The public endpoint never fetches private Tower data to fill gaps. Evidence refs and hashes stay server-side; only ISO dates enter the public response.
