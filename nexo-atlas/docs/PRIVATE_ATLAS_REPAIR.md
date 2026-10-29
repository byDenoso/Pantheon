# Private Atlas navigation and canonical agent mural

## Scope

The current workspace remains the only private application. The retired cockpit is no longer imported by Host or exposed by workspace links. Old bookmarks migrate to the corresponding current workspace view; arbitrary old hashes fall back to the current web. The frame, owner/PIN authorization, source read and knowledge-session lifecycle are unchanged.

The new `#/teia/mural` view reads the already-present canonical `read_model.evolution.board.posts`. It does not depend on the unrelated completeness requirements for `evolution`. A matching source revision is required. Missing, empty and partially malformed boards have distinct UI states. Every valid source post is retained, including resolved/expired posts, duplicate source occurrences and private posts; pagination is a display limit only. The board includes role/status/text filters, linked reply context, current-private test links and exact source locators. Source text is escaped. Status is labelled as of the source snapshot; a reply is not treated as resolution or scientific evidence.

No new backend endpoint, grant, data store, Tower write, source snapshot or public payload is introduced.

## Domain evidence and display behavior

Exact bilingual/case aliases remain unchanged. BODYBUILDING and OLYMPUS remain different canonical IDs.

The frozen source inspected for this repair contained an empty Bodybuilding catalog stub introduced only by an interdomain relation's source/target-domain references. It contained no canonical entities or tests. The Olympus routing contract explicitly identifies `02_DOMAINS/Bodybuilding/` as its `domain_surface`. Olympus contains the real records.

The catalog now records a **navigation-only redirect** when all conditions hold:

1. The entry has no canonical members.
2. Its only evidence is interdomain source/target-domain references.
3. It is not independently declared as a contract owner or child domain.
4. Exactly one contract owner claims its exact `02_DOMAINS/<name>/` surface.
5. That owner already exists in the catalog.

The empty entry remains in the raw private catalog with zero counts and traced source evidence. Navigation omits its duplicate card, resolves its bookmark/filter to the owner, and shows the recorded surface plus original identifiers/path/revision in private technical details. A nonempty Bodybuilding domain, competing owner, conflicting declaration, absent contract or stale revision prevents the redirect. No scientific relation, hierarchy or membership is inferred.

Role-scoped knowledge/retrieval does not adopt this private-owner navigation alias and retains its protected-domain exclusions.

## Verification

- `npm test`: 251 tests passed at the repair baseline, including owner/PIN/session expiry and revocation, public bundle isolation, protected aliases and canonical board delivery.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `npm run build`: passed; private assets remain guarded and the public output remains only assets/index.
- `node test/private-agent-board.render.mjs`: PT/EN SSR checks passed for canonical posts under partial evolution, escaped source text, source revision/locators, private internal references, replies, filters and stale-source failure.
- `node scripts/verify-private-atlas-repair.mjs <authorized-source-path>`: local read-only replay. The inspected frozen 2026-10-06 13:53:20Z source yielded all 300/300 exact canonical board texts, no invalid posts, no source mutation, a single Olympus navigation entry with 14 tests, and no independent Bodybuilding navigation card. Its raw Bodybuilding catalog remains at zero members.
- Full frozen-source runtime parity with v25 passed after excluding the intentionally enriched domain catalog. All scientific identities, graph edges, canonical counts and source records are unchanged.
- Frozen source raw SHA-256: `98c692f7b82b7c5f5e5fc6164804832acf79ff87ff6888334cb85cb7f23e6c05`.
- Frozen canonical revision: `sha256:6c989b7bcafe7decb296ecdb984e7e696db26aaf7ed606000ccbbc7af659e5e3`.

`test/private-atlas-repair.browser.mjs` contains local synthetic browser regressions for 360/768/1280px, navigation, filters, private test links, Back, old-bookmark migration, aliases and logout teardown. Chromium could not launch in the current executor because local socket creation remained restricted after an approved escalation. These browser assertions have **not run** and visual quality is not established by SSR. No hosted authenticated browser reads, PIN entry, grants, workspace permission changes or publication were attempted.
