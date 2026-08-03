# Current Devlog

Last updated: 2026-08-04 06:43 CST by Codex

Active branch: `design/crawler-auto-ingestion-readiness`

## Open Work

- Automated-ingestion closure execution is active.
  Owner: Codex; status: `active`; branch: `design/crawler-auto-ingestion-readiness`;
  worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`;
  child of `entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`;
  blocked-by: remaining item-image source coverage and missing coherent shimmer
  source evidence, then T2/source-flip and later L1/L2/scheduler checkpoints;
  NPC landing, seven owner phases, isolated T1, and both base-maint partitions
  are complete. Task 10's two non-green domain panels are the current
  dependency before any source-contract flip or L1 preview;
  contract handoff: `../superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`,
  `../superpowers/plans/2026-07-30-item-image-source-closure.md`, and
  `../superpowers/plans/2026-07-30-shimmer-generation-closure.md`; the NPC
  owner-phase runway remains completed historical context.
  T1 request-path checkpoint: `canonical-npc-t1-acceptance` now freezes a
  private config/server fingerprint, Redis DB, run ID, NPC data bundle, and
  code bundle. Before it consumes a one-time permit, the child revalidates the
  packet-bound config/data/manifest identity, reconstructs the matching owner
  completion, and performs only the future run's bounded read-only UUID check.
  Focused validation passes 57/57 and final read-only re-review has no Critical
  or Important findings. With explicit permission to read the main-worktree
  private config, a new ordinary `0600` config was created only in this
  worktree and bound to the fresh preflight server fingerprint. Its private
  `0600` execution manifest freezes Redis DB 14, run ID
  `npc-t1-20260730-01`, config/data/code bytes, and no formal DB writes. Private
  request `sha256:4c8c760c78e8feeaa93c3028d11b08bfd390eb39a0d99a986ad5c2183752d1f5`
  was explicitly confirmed and produced private authorized packet
  `sha256:2ac59552d8b9346c92623c072596063f71a2b6ff12ff721491f4d9b9f27aacd3`.
  Its current technical identity and Owner fields were independently verified.
  The explicitly authorized runner consumed the one-time decision and completed
  isolated run `npc-t1-20260730-01`; private evidence is `passed`, binds the
  required 13-table snapshot, proves rollback/commit/restore `0/1/0`, and has
  cleanup proof. Independent readback confirms zero isolated databases,
  temporary accounts, Redis DB 14 keys, and active transactions. No formal data
  write, crawler, shared-service action, or commit ran. Task 11 Step 5 is
  complete.
  Current coordinator update: the user-directed full gate passed its data
  workflow and automation stages, then correctly stopped at domain `43/1/1`
  (pass/warning/blocked). Item image readiness is the only blocker and shimmer
  is the only warning. Cross-DB quick is 10 pass; full is 8 pass / 2 warnings
  for one relation-loot row without local output plus 4,316 legacy acquisition
  rows. Relation health remains 21 pass / 6 info / 0 blocked / 1 warning for
  287 unresolved NPC audits.
  Item-image closure Tasks 1 and 2 are committed at `cce1aafe` and `dbf433fc`.
  The structural member extractor/parser suite passes 10/10 while retaining
  group-page image/sell/description quarantine; candidate/promotion contracts
  also pass 10/10. Fresh schema-v2 evidence finds
  3,135 raw-verified, 142 ambiguous, and 735 unresolved identities among the
  4,012 missing standardized sources. Read-only formal comparison classifies
  3,129 local agreements, 6 local conflicts, 787 existing-lineage rows, and
  3,225 local-only rows without ever promoting comparison data to source. The
  current promotion review binds report `sha256:e57e7e11...effb`, remains
  review-only at `2119 existing + 3135 promoted + 735 unresolved + 142
  ambiguous`, and writes no bundle. Task 3 now adds the bounded monitor-visible
  verifier, monitor action 24, and canonical operation 29, and its code is
  committed at `8f9be88d`. Its fresh focused
  gates pass `node --check` 8/8, Node 51/51, and Maven 11/11; the same Node suite
  also passes 51/51 against a detached checkout of that commit's content alone,
  proving the revision is self-consistent. The dedicated request gate permits at
  most one actual HTTP attempt per frozen identity. Private input/manifest/
  request artifacts are `0600`, freeze 877 identities at `8/877`, and rebuild
  byte-for-byte. Request `requestHash`
  `sha256:1b180787790b11b8f9f7440561f141290667e1b870c3fd67e2a0aa0ddf4eb164`
  was independently re-derived as fully current: all eight technical identity
  fields (`operationId`, `targetDatabases`, `serverFingerprint`,
  `schemaBundleSha256`, `dataBundleSha256`, `policySetHash`,
  `executionManifestHash`, `requiredTechnicalFields`) recompute to the request's
  own values from the preflight fingerprint and policy rows. The Owner then
  authorized that exact request hash, producing private `0600` packet
  `sha256:a66e97ea1133ecf7a5f88eba0748548a38a475f7a8a49d68e4ce774ab9169c45`
  at `2026-07-31T10:56:00Z` under decision identity
  `canonical-item-image-source-verification-20260731-01`, actor `admin`,
  expiring `2026-08-01T09:45:00Z`. The packet re-verifies against current
  repository state with zero missing Owner or technical fields and carries the
  `8/877` bounds over 877 identities.
  That packet was then dispatched through
  `run-authorized-canonical-operation.mjs`, consuming decision
  `canonical-item-image-source-verification-20260731-01` exactly once under
  dispatch permit
  `sha256:381ebba077618121091705dd469cf330def26bd70f47a9e6643839e72fb0d8ac`.
  **The operation terminated `failed` and did not close the item image
  blocker.** Its result
  `reports/audit/item-image-source-verification.latest.json` hashes to
  `sha256:e241b9e12c13fe58f204fbd916fa56936c98a0151d9e79ceca4e4fa9e45b3a4f`
  and records `877 total = 346 verified + 0 ambiguous + 0 unresolved + 531
  failed` at exactly 877 requests. Scope and bounds held: 877/877 report
  records, zero out-of-scope identities, request count exactly at the 877 cap,
  no overrun.
  All 531 failures carry error code `page_revision_mismatch`; **zero** carry
  `request_failed`. The root cause is not the network — an independent probe
  returned HTTP 200 for `AngelStatue` (pageId 12944) with live revision
  `2026-07-29T12:18:22Z` against the frozen `2026-04-20T13:16:42Z`. The frozen
  identity set takes its `sourceRevisionTimestamp` from a local raw cache built
  around 2026-04 while terraria.wiki.gg has kept being edited, and
  `buildVerificationRecord` fail-closes on revision drift before it ever
  inspects image evidence. Roughly 57% of the frozen set therefore cannot match
  without refreshing the raw cache first.
  Lane arithmetic after this run: `2119 existing + 3135 promoted + 346 newly
  verified = 5600` of 6131, leaving 531 unresolved, so the promotion bundle
  stays `null` and Task 8 Step 2 is **not** satisfied. The decision identity is
  consumed and cannot be reused; any retry needs a fresh request, fresh Owner
  authorization, and a new decision identity.
  Post-run readback is clean: no verifier or dispatch process, zero retained
  dispatch permits, and no `.tmp`/`.part` residue.
  A read-only characterization of the 531 (no new requests) shows they are not
  531 independent drifts. Every one of the 877 frozen identities is a
  `group_page` identity, and the 531 failures collapse onto just **48 distinct
  source pages**, with extreme concentration: `Banners (enemy)` 291,
  `Statues` 83, `Trophies` 33, `Music Boxes` 32 — four pages covering 439 of 531
  (83%), 22 pages covering 94%, and all 48 covering 100%. Frozen revisions for
  the failures cluster hard in `2026-04` (434) and `2026-05` (62), whereas the
  346 verified identities spread across `2022-03` through `2026-06` on pages
  that simply have not been edited lately. Prior classification also differs:
  the failures are 394 unresolved + 137 ambiguous, while the verified are 341
  unresolved + 5 ambiguous, so the ambiguous cases concentrate in the drifted
  large index pages.
  The practical consequence is that refreshing 48 wiki pages — not 531 — would
  re-bind every blocked identity. Whether the underlying images actually changed
  is still unknown, because failed records retain only `responseSha256` and no
  live imageinfo; answering that needs a bounded live check of those 48 pages.
  The drift contract was then repaired RED-to-GREEN at commit `be8a9272`:
  page scope is still enforced on `pageId` and fails closed as
  `page_identity_mismatch`, while revision drift no longer aborts and the
  record keeps `sourceRevisionTimestamp` (live), `frozenSourceRevisionTimestamp`,
  and `revisionDrifted`. Focused suite 53/53.
  Retry-02 consumed decision `...-20260731-02` under packet
  `sha256:092738f0...c11d63e7` but was killed by session interruption at
  488/877 with `failedCount 0` and **no report written**; the decision is burned
  for nothing. Its stale non-terminal `running` progress was explicitly
  fail-closed by hand, and no permit leaked (the child had already consumed it).
  Retry-03 then consumed `...-20260731-03` under packet
  `sha256:90ce69f9...dc0ee800`, run detached with `setsid` so a session
  interrupt could not kill it again, and **completed**: runner exit 0, child
  progress `completed 877/877`, result
  `sha256:f66b1afd72aa6b82d3a2ab61d580003610018c3cc96e264b788cbeb288d1b308`
  recording `877 = 868 verified + 9 ambiguous + 0 unresolved + 0 failed` at
  exactly 877 requests. All 868 resolved to `.png`, and **522 of them had
  drifted revisions** — precisely the population the old contract hard-failed
  (531 = 522 verified + 9 ambiguous). The earlier worry that statues and banners
  host real animated `.gif` files held for only 9 identities; the rest of the
  `.gif` candidates were phantoms.
  Rebuilding the promotion review then exposed a second defect: it reported
  `duplicate 877` because `buildItemImageSourcePromotionArtifacts` concatenated
  candidate and verification evidence for the same identity instead of letting
  verification supersede. Every existing fixture passed
  `verificationReportBytes: null`, so the merge path had zero coverage. Repaired
  RED-to-GREEN at commit `e11e2bc5`; promotion and candidate-audit suites 11/11
  with the within-report duplicate contract intact.
  Current lane state is `total 6131 = existing 2119 + promoted 4003 +
  unresolved 0 + ambiguous 9 + duplicate 0 + conflict 0`. The bundle is still
  `null` because `ambiguous` must be zero, so the 9 are the collected
  fail-closed remainder: `CopperCoin`, `SilverCoin`, `GoldCoin`,
  `PlatinumCoin`, `BlueJellyfish`, `GreenJellyfish`, `PinkJellyfish` all have a
  genuinely existing `.gif` plus `.png` pair; `Flairon` collides with a
  misspelled wiki duplicate `Flairoon.png`; `Shellphone` collides with the
  variant `Shellphone (Home).png`. Resolving them needs a promotion preference
  rule that does not exist yet, which is a product decision rather than a defect.
  Post-run readback is clean: no process, no leaked dispatch permit, no
  `.tmp`/`.part`, terminal progress, and three consumed item-image decisions in
  the 40-entry ledger.
  Tasks 4-7 of the item-image subplan remain entirely unimplemented, and the
  downstream operations `canonical-item-image-source-promotion` and
  `canonical-item-image-lineage-apply` are unregistered with missing
  entrypoints, so no downstream authorization can be pre-generated. Each
  downstream request binds its predecessor's real result bytes by design.
  Ledger defect observed while checking reuse (independent of this lane):
  `used-decisions.json` mixes 31 plain-string entries with 6 objects shaped
  `{decisionIdentity, dispatchPermitHash}`, while
  `authorizeCanonicalCutoverRequest` tests reuse via
  `new Set(used).has(decisionIdentity)`. Those 6 object-form identities are
  therefore invisible to the reuse guard and could be re-authorized. The
  item-image identity is absent in both forms, so this run is unaffected.
  Commit `8f9be88d` is deliberately wider than the plan's Task 3 `git add` list.
  The canonical operation modules cannot form a Task-3-only revision: the
  execution manifest now imports `canonicalServerFingerprint` and
  `NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION`, neither present at `dbf433fc`,
  and the shared operation-count contracts assert all five new operation IDs at
  once. The commit therefore also lands the already-implemented NPC T1
  acceptance, base-maint non-town/town apply, and item-relation lineage-repair
  registrations plus `npc-base-maint-apply.mjs`; `npc-base-maint-apply.test.mjs`
  stays untracked. Fourteen paths were staged by explicit name and the other 52
  modified tracked files were left out of the commit. No crawler, packet,
  database write, or shared-service action accompanied this commit.
  The private NPC report was atomically refreshed at 17:54 CST with mode `0600`:
  it hashes to `sha256:6d1596d388c5659945d35c27ec7dff8ccd27bc4e1f5eb6607f1869b6879ede45`,
  its native `T1_VERIFIED` contract passes 65/65, and admin/public GET parity
  for sample `-65` matches local snapshot `sha256:58545f6c...db37` through the
  shared backend at `18191`. The freshness audit marks the report fresh at age
  zero but keeps the acceptance panel blocked because it requires
  `T2_CUTOVER_VERIFIED`. Runtime readback is zero isolated databases, temporary
  accounts, external transactions, Redis DB 13/14 keys or reservations, task
  processes, progress `.tmp` files, and worktree listeners. Shared backend PID
  `561518` and Redis PID `551685` remain listening; no lifecycle action ran.
  Both base-maint operations completed at 723 non-town + 39 town rows and their
  completion hash is `sha256:4cafccbb...aa831`. The lineage database repair
  cleared its blockers. Retry-01's zero-byte result remains historical, while
  retry-02 consumed decision
  `canonical-npc-item-relation-lineage-repair-20260730-02` exactly once under
  packet `sha256:f429552a...5b662`. Its private 1,684-byte result hashes to
  `sha256:09930216...a7fc`, is `COMPLETED`, and records committed `329 + 329`
  relation rows with output `sha256:e6debec3...4f84`.
  The approved item-image review produced 702 candidates at report hash
  `sha256:a19aa346...f0b85`, changed neither standardized input, and leaves 3,310
  group pages quarantined. A read-only raw/database cross-check further proves
  all 6,131 standardized identities have local image rows, only 2,906 have
  maint/relation lineage, and just 613 of 3,225 local-only titles satisfy the
  exact parsed title, identity, page, and URL checks. Boss decision
  `canonical-boss-loot-import-20260730-01` also consumed packet
  `sha256:ae0bc6de...dc1f` exactly once; report `sha256:96c23c7a...449`
  processes the 33-boss/347-drop bundle with no unresolved boss or item.
  Both decision identities are in the used ledger and cannot be reused.
  Shimmer remains source-blocked because the only local raw is a
  non-byte-equivalent July refetch. Formal state is `biomes L1/ACTIVE`, zero
  runs/applies, no circuit, and zero L2/scheduler decisions. No additional
  source flip, L1/L2, scheduler, image sync, boss/shimmer import, commit, or
  push ran during this evidence refresh.
  Final continuation hygiene passes 47/47 changed/untracked MJS syntax checks,
  the 121/121 focused producer/readiness/authorization suite, `git diff
  --check`, and the targeted fact scan. Readback remains zero isolated
  databases, temporary accounts, active transactions, Redis DB 14 keys or
  reservation, task processes, progress `.tmp` files, and temporary worktree
  service listeners. Thirteen task-owned `/tmp` diagnostics were removed; the
  shared backend/Redis lifecycle and all other temporary files were untouched.
  The prior private `canonical-remaining-batch-01-20260730` proposal is fully
  consumed historical authorization context: both contained identities ran
  once and completed. It is not a current checkpoint and must never be reused.
  Current execution snapshot: authorized Batch 04 consumed its recipe and boss
  identities exactly once and both completed. Recipe applied the frozen 3,663
  input, backfilled 124 group ingredients and 239 station names, consolidated
  providers at 45 activated / 3,429 deactivated, and left formal totals at
  11,658 recipes / 19,601 ingredients / 15,195 stations. Boss strict import
  updated 33 groups, mapped 51 NPC members, and localized all 29 candidates
  (21 GIF / 8 PNG) with zero unresolved or failed images. The isolated worktree
  backend on `18192` exited, Redis DB 14 is empty, the database has zero active
  transactions, and the original `18191` backend remains on PID 654976.
  Batch 02 NPC outputs are valid and frozen as 25 normalized/audit pairs. NPC
  apply remains fail-closed at the exact landing-plus-seven authorization and
  execution chain. Image sync changed exactly
  1,788 item `imageUrl` fields. The latest read-only domain gate is 40 pass /
  4 warning / 1 blocked: recipe is warning rather than blocked, boss source is
  pass, and item image coverage remains the sole blocked panel. A focused
  RED-to-GREEN repair makes the image-sync producer recognize its own relative
  managed URL output and lets readiness count `uploaded + alreadyManaged` as
  completed candidates. The current real report remains correctly blocked:
  4,012 of 6,131 standardized items have no image source, and 331 legacy-endpoint
  candidates were not completed by the prior run. The local raw cache has all
  6,131 pages, but its parser safely quarantines 4,005 source-less group pages;
  695 have one exact filename match and 7 non-group pages have a safe image,
  which remain a separate source-mapping decision. No image sync retry, crawler,
  data write, or service action ran. Batch 04 and all
  earlier consumed identities cannot be reused.
  The first authorized group bootstrap identity
  `canonical-item-group-bootstrap-20260729-01` stopped before packet creation:
  commit `ac13f0e0` changed the shared manifest module after the frozen request,
  so current-code verification rejected its stale code hash. The identity is
  unused and no database write ran, but it remains bound to the superseded
  request and cannot authorize replacement bytes. The authorized current-byte
  retry `canonical-item-group-bootstrap-20260729-02` then consumed packet
  `sha256:dddef0127ccb1fe02e05f9045e06a2dec04af4fbd5a0db937bfa8ff6c7bb51f5`
  exactly once and completed. Readback proves 4 landing sources; maint
  `35/163/72/2`; relation `35/163/72`; local `34/161/70`; `PUBLISHED` state at
  snapshot `8d3fb0b1...fe819`; and zero active transactions. Authorized Task 13
  Step 4 then reached `T2_CUTOVER_VERIFIED`: all three consumer shadows pass,
  the exact production inventory has zero runtime JSON readers, fallback is
  disabled, and live API hash parity passes at 34 item groups / 33 recipe groups
  with `Any Iron Bar` recipe-tree coverage. The standard slot-13 stack on
  `18201/15187/13014` started and stopped cleanly; Redis DB 13 was restored to
  zero, no item-group admin write occurred, and original backend `18191` remains
  on PID 654976. Evidence hash is `sha256:0c642da1f5619432118c9e4ffcb9466df957fa960002b99038f7dbf6ba7995fa`.
  Batch 05 then published all three one-way compatibility exports under
  `ig_export_20260729_01`; fresh canonical group readiness passes with runtime
  hash `8d3fb0b1...fe819`, separate compatibility hash `54130fe0...00d`, and
  `sourceGroupAudit` fresh/non-blocking; readiness now also binds the three live
  export byte hashes so partial publication fails closed. The full gate still
  fail-closes after 304/304 data-workflow and 177/177 automation tests at the
  unchanged 40 pass / 4 warning / 1 blocked domain result, so no source contract
  was flipped. NPC
  frozen evidence is now `T1_PREPARED` as seven single-owner phases with 9 Buff,
  239 shop, and 175 loot facts; formal apply stays unavailable until the landing
  prerequisite and seven owner phases receive independent exact authorizations
  and produce committed results. Step 3B is now
  repaired to require one shared frozen input hash, strict upstream result
  dependencies, seven independent committed phase results, and an all-seven
  read-only completion aggregator. Its packet-consuming executor, exact table/
  partition MySQL adapter, manifests, requests, and readiness gate are now code
  complete. A formal read-only check found zero NPC
  base/crawler landings and zero maint crawler facts, so one separate
  `landing`-owned prerequisite is required before phase 1; completion must bind
  that result plus all seven phase results. Partial completion cannot unlock readiness.
  The first landing identity `canonical-npc-landing-apply-20260729-01` was
  consumed once, then the importer rejected missing governed `artifactRole`
  metadata before the first row write. The transaction rolled back, both NPC
  landing counts and maint facts remain zero, and the identity cannot be reused.
  The defect is repaired RED-to-GREEN by binding every selected descriptor to
  `source_evidence` metadata and the frozen input hash. The current retry request
  is technically complete at
  `sha256:6395b6031dc5bc4e8c0b08357a855163fe09ad93ec5e90aa367c0a4e5ce8ff19`;
  all seven downstream requests intentionally lack `dataBundleSha256` until
  their exact predecessor results exist. Fresh focused validation passes 98/98;
  the full gate passes 304/304 data-workflow and 177/177 automation tests before
  the expected 40 pass / 4 warning / 1 blocked / 0 written domain fail-close.
  No database write,
  crawler, formal apply, L1/L2, or scheduler action ran in Batch 05. The parent
  closure checklist is 69/86: Task 11 isolated T1 and Task 13 Steps 5-6 are
  complete. The dedicated NPC owner-runway subplan is now 19/19; Step 3B and the
  serial NPC owner execution are complete, while
  broader readiness gates remain open. The
  At that earlier checkpoint, independent biomes L1 policy-promotion request
  `sha256:df50664e72b2ff475c7e839c7e1129a7a77b8ed953353d6b98547f109431282a`
  was `AWAITING_OWNER`; its current-byte retry later completed policy v1 as
  `L1/ACTIVE`. Group bootstrap action/acceptance/shadow/readiness/
  runner validation passes 35/35 and policy-decision validation passes 27/27.
  Fresh group compatibility exports/readiness and the three source-contract
  flips remain later gates; Step 4 does not authorize them. L1 promotion remains
  a later independent checkpoint. At that earlier checkpoint boss-loot still
  lacked its frozen bundle;
  shimmer lacks the raw file and three of five importable data shards in this
  worktree, so neither lane was fabricated or dispatched.
  Retry preparation revalidation confirms formal NPC base landing 0, crawler
  landing 0, active maint fact 0, and active transaction 0. The shared backend
  at `18191` is currently not running (connection refused; no Java listener),
  so its health cannot be re-confirmed; it was not restarted from this isolated
  worktree.
  Authorized Wave 1 consumed
  `canonical-npc-landing-apply-20260729-02` once and committed the governed
  1-base/25-crawler NPC landing result
  `sha256:ec850fa40e2247091369c0211fbf8d32b277e60b63aa9e602761ee1f8e937b4d`.
  Fresh readback confirms the two landing partitions are current with governed
  source-evidence metadata, maint facts remain 0, and no transaction remains.
  The initial biomes policy decision was rejected before packet output because
  its old shared code-bundle hash drifted; identity
  `automation-biomes-l1-policy-promotion-20260729-01` is unused and cannot
  authorize replacement bytes. Wave 2 consumed its retry identity
  `automation-biomes-l1-policy-promotion-20260729-02` once and promoted the
  exact `biomes` v1 policy to `L1/ACTIVE` with result packet
  `sha256:c9104874389c553617ff24c7a7c5be9ac0d0fd2b9a19c7d0d1a7208a7b43ca5c`.
  The first NPC maint-phase identity
  `canonical-npc-facts-maint-apply-20260729-01` was consumed and rolled back
  before a row write when generic persistence attempted to insert contract
  metadata columns `scope` and `table_name`. Retry-02 then consumed
  `canonical-npc-facts-maint-apply-retry-02-20260729` under packet
  `sha256:9b6d29e8b95599557cd933d9cd2ce2226ecdef7da63e851c69fc55c1b13f7131`,
  but its transaction again rolled back before a row write because strict MySQL
  rejected ISO-8601 values for `DATETIME` fields. A RED-to-GREEN adapter
  regression now normalizes `source_revision_timestamp`, `fetched_at`, and
  `parsed_at` as UTC at the persistence boundary; 80 focused contracts pass.
  Retry-03 then consumed packet
  `sha256:324edc3c61b2fca5fe5f3fa4a7401aed3e107cfdde3a2231e3a1b073d2fbdc05`
  and committed 25 active canonical maint facts with 25 distinct frozen hashes;
  transaction-local readback and the post-run database both report zero active
  transactions and no ISO `DATETIME` literals. Its result binds the exact
  landing result and frozen input. The authorized phase-2 item-relations packet
  `sha256:e2e983cfcfd9c40ccea93a9532ec8f66e3dbe6bc0fc6645a19391b38594b9fad`
  then completed and bound both predecessors. Its four owned relation partitions
  contain 329 source facts, 329 details, 178 shop relations, and 2 loot
  relations; a separate read-only recomputation of the frozen input reproduced
  every record-key count, and no transaction remains. The authorized phase-3
  Buff-relation packet `sha256:de0f439d41d244b3d1df5b1a97f8df81aa2984e5231bd72e11f08cc619ebd349`
  then completed, binding all three predecessors and 1,270 Buff relation keys;
  a separate recomputation from the frozen maint facts matched every stored key
  and no transaction remains. The first phase-4 town/shop packet consumed
  `canonical-npc-town-shop-projection-apply-20260729-01`, then rolled back when
  its legacy non-town source count was compared to a whole-table local readback;
  no result exists and the local baseline remains 762 entries / 306 conditions.
  The repaired retry then consumed
  `canonical-npc-town-shop-projection-apply-retry-02-20260729` under packet
  `sha256:0da85ade4429aeab74acf247455bd16e913c64c5b5cb473d774c8e30c4ec9041`
  and rolled back with no result: 129 source conditions join to 257 projected
  duplicate shop entries, while the old adapter compared the source count to the
  written count. The repair preserves the legacy non-town generic sync, explicitly
  selects the town partition, derives actual post-write town counts in the same
  transaction, and has an independent verifier re-read that partition. Fresh
  authorization/owner-phase validation is 45/45 with no Critical, Important, or
  Minor review finding. Fresh
  preflight confirms the four committed predecessors share one frozen input, the
  server/policy fingerprints remain current, the baseline is 582 town entries /
  306 town conditions plus 180 non-town entries, and active transactions are 0.
  The authorized retry-03 then consumed packet
  `sha256:516d4ead90efaf6d176f6bf2a8709e8a60a43174f55581863d3f52dd01a50591`
  exactly once and committed phase 4. Its private result binds all four
  predecessors and records 936 town entries plus 257 conditions. Independent
  direct readback confirms 1,116 total entries = 936 town + 180 non-town,
  257 total/town conditions, and zero active transactions; the result is `0600`.
  Fresh authorization/owner-phase validation is 45/45. The authorized Phase 5
  packet `sha256:462e7175fa837350da211763ea11cfb9503081ccbc5aee9554c46fd854b918c6`
  consumed its identity once and committed 1,270 local Buff relations. Independent
  source and local counts both equal 1,270, and no transaction remains. The
  authorized Phase 6 packet `sha256:6f4b1077b00a96dbfb9d4d5f53857b2926777f28a152edd06723d4bb1ec3d661`
  consumed its identity once and committed 1,544 non-boss NPC loot entries.
  Independent source and local non-boss counts both equal 1,544; boss rows remained
  zero and no transaction remained. Authorized Phase 7 consumed
  `canonical-npc-boss-loot-projection-apply-20260729-01` once under private packet
  `sha256:8170c16a6460534cc53b63d4e01a558d3bc0bad2cda78f07ebf0f5286e3fb07a`.
  It committed only the boss `local.npc_loot_entries` partition with 0 rows, matching
  the 0-row source predicate and preserving the 1,544 non-boss rows. The private
  `canonical-npc-apply` completion binds landing plus all seven ordered phase-result
  bytes; independent byte reconstruction, ledger readback, and transaction checks pass.
  No crawler, source-contract, L1/L2, scheduler, or shared-backend action ran.
  The detailed task progression below is historical context; this snapshot is
  the current execution authority.
  Task 1 locked 13 initial pre-cutover group JSON production references; the
  current post-cutover inventory is 12 after registering the explicit readiness,
  T1 bootstrap, and authorization-manifest governance readers. Task 2
  defines the 4 maint / 3 relation / 4 local canonical group tables, certified
  source/admin partitions, and shared projection-state fence. Task 3 now parses
  the frozen bootstrap at 33 recipe groups / 27 redundant overrides / 2
  exclusions and emits four group-only landing descriptors. Task 4 now proves
  deterministic maint/relation/local projection: the real dry-run yields 35
  maint groups, 161 resolved members, one blocked group, and 34 runtime groups;
  the dependency suite passes 123/123 with one existing skip. The group
  bootstrap was unapplied at that checkpoint and is now formally published.
  Task 5 now proves the only two allowed shadow
  normalizations and an exact 35-row compatibility round trip; its dependency
  suite passes 55/55. Task 6 now cuts backend, recipe expansion, pipeline group
  readers, and the admin page to canonical repositories. Its fresh gates pass
  backend 34/34, Node 83/83, admin 8/8, and Nuxt typecheck. Task 7 expands the
  exact capability catalog from 19 to 21 with
  the disabled canonical group preview/apply pair, source-derived ownership,
  backend child-status progress, and fail-closed admin visibility; its combined
  Node suite passes 61/61 and backend tests pass 28/28. Task 8 now routes the
  fail-closed canonical item-group readiness v1 contract through offline
  freshness, manual refresh planning, backend overview, admin labeling, and the
  local gate; focused Node 45/45, backend 16/16, and admin 15/15 pass. Task 9
  now proves group CODE_READY and T1_VERIFIED: final Node coverage has 300 test
  positions with one existing skip, backend passes 78/78, admin passes 37/37
  plus typecheck, T0 passes 36 schema checks, and T1 freezes/verifies 128 tables
  before proving 35 maint groups, 34 runtime groups, exact compatibility round
  trip, rollback/commit/restore, and zero resource leaks. Task 10 now fail-closes
  empty-shell/dry-run producer evidence and repairs armor definitions to 132
  mapped plus 19 reviewed placeholders; the current read-only result is 39 pass /
  5 warning / 1 blocked. Task 11 now reaches fixture-only NPC `CODE_READY`: scoped
  T0 `npc_7a854dc3e2150815` proves 13 tables, paired evidence, one matched fact,
  non-empty Buff/shop/loot relation/local lanes, `0/1/0` transaction counts, and
  zero cleanup leaks. Task 12 produced the original `AWAITING_OWNER` request hashes;
  those hashes are superseded by the Task 15 V58 authorization-contract repair.
  The exact bootstrap packet has now been consumed once: formal governance holds
  one ACTIVE Owner (`admin`), one `biomes` L0/DISABLED policy, and one immutable
  policy version. Task 15 code-only gating requires two committed L1 applies, closed
  circuit state, exact current policy identity, and fresh promotion/scheduler
  decisions; V58 is now applied on formal local. A continuation audit expanded authorization
  from seven incomplete requests to 17 independent operations and found that
  packet verification was not consumed by a formal runner. That defect is now
  repaired with current-identity revalidation, durable one-time decision use,
  and no-shell dispatch; its fail-closed request-as-packet probe exited before
  dispatch. Recipe progress and NPC governed preview are now code-ready. Batch
  02 produced a valid 25-pair NPC frozen input; NPC apply remains closed on the
  ownership/executor boundary rather than crawler evidence. NPC isolated T1,
  four warnings plus one blocked image panel, exact Owner identity fields, T2,
  and two L1 applies remain distinct
  checkpoints.
  Task 12A now supplies governed schema, group, biomes L1, and policy/activation
  executors. Sixteen of 17 operations have manifests whose hashes recursively
  bind repository-local static imports; the 16 downstream requests were
  regenerated against policy-set hash
  `sha256:fddd9c42ad0f2c22c4d611f63fb06fbe2444e4aea97029d0c11396e66d0b0e3c`.
  All six Batch 01 decision identities are consumed. Projectile, recipe crawl,
  and NPC crawl completed; Batch 03 completed schema and Batch 04 completed the
  exact recipe and boss retries. The partial item image result remains blocked
  on source/upload coverage. The fresh post-bootstrap
  full gate passes data workflow 287/287 and automation contracts 177/177;
  the latest read-only domain rerun fail-closes at 40 pass / 4 warning / 1 blocked
  evidence checkpoint. Fresh Batch 04 focused validation passes Node 42/42 and
  backend upload contracts 10/10; earlier broader focused validation passes
  Node 88/88 and backend 227/227. The packet-consuming Node runner is the single
  formal write path; the unused backend apply bean remains fail-closed. Only
  `canonical-npc-apply` has no broad executor because its proposed write set crosses
  capability owners; it is now a read-only completion artifact binding the individually
  committed landing and seven owner-phase results. Its valid 25-target manifest and
  real crawler outputs are present, but this completion is not NPC T2 evidence. Local
  V56-V58 and maint/relation role schemas are applied; no group or NPC T2 apply has run.
  Post-run review also repaired the direct-executor bypass: during durable ledger
  consumption the wrapper binds a private random dispatch-permit hash to the decision,
  and the NPC executor atomically consumes and recomputes that permit before it can
  read input or connect to MySQL. Direct CLI reuse with only a packet or forged permit
  fails closed; all currently retained NPC owner inputs, packets, results, and completion
  artifacts are `0600`.
  Item image retry-04 (2026-08-01) closed the lane. `D-2026-08-01-01` supersedes
  `D-2026-07-31-01`: the latter's two disambiguation rules were recorded with
  inverted outcomes because they read `itemInternalName` where the deciding field
  is `itemName`. Item 2611 is named `Flairoon` and item 5358 is named
  `Shellphone (Home)`, while `Flairon.png` and `Shellphone.png` already belong to
  items 5526 and 5437; the literal rules would have given both items a sibling's
  sprite, and `item_images` has no unique key to reject it. The implemented rules
  are display-name precedence then format precedence, both fail-closed. The
  frozen-input builder also stopped demanding that the candidate classification
  equal the review status, which had blocked freezing a follow-up input for the
  three jellyfish that a completed round refined from unresolved to ambiguous.
  The Owner authorized request
  `sha256:3e4c6a91...1ec81f64` with decision
  `canonical-item-image-source-verification-20260801-01`, expiry
  `2026-08-02T00:00:00Z`, packet `sha256:1e94a381...f59c15ad`, over a 9-identity
  frozen input `sha256:df5eac15...72244c75` at bounds `8/9`. The round ran
  detached via `setsid`: exit 0, `9 = 9 verified + 0 ambiguous` at exactly 9
  requests, every outcome matching the readiness review's per-identity
  prediction. Lane state is now `total 6131 = existing 2119 + promoted 4012 +
  unresolved 0 + ambiguous 0 + duplicate 0 + conflict 0`, and the bundle
  published for the first time at generation `79159314...fd0d3f34`, payload
  `sha256:54b1e247...423f8a52`. Seven items carry a retained `.gif` secondary
  row; 2611 and 5358 carry a single source each. Tasks 4-7 and Task 8 Steps 3-6
  are unblocked. Ledger is 41 entries; the mixed-shape defect noted for retry-03
  is worse than recorded — it is 31 strings and 9 objects, not 6, and the three
  retry decisions of 2026-07-31 are among the invisible ones.
  Two operator failures of mine on this lane, both recorded rather than smoothed
  over. Regenerating the promotion review overwrote
  `item-image-source-promotion-review-2026-07-31.json`, because that output path
  is date-derived and I did not look at the target first; nothing pinned it by
  hash, the pinned `-2026-07-30` artifact re-verified intact, and only
  `producerCodeSha256` differed. Worse, the retry-04 round destroyed the
  retry-03 report: the verifier's frozen output path was a fixed
  `item-image-source-verification.latest.json` and I did not archive before
  running. A full-filesystem search found no copy. `D-2026-08-01-02` records the
  rebuild — all 868 verification-derived sources survived verbatim inside the
  promotion review, identified by `evidenceKind: mediawiki_exact_file` plus a
  per-record `verificationResponseSha256`, and
  `scripts/data/audit/rebuild-item-image-source-verification-report.mjs` replays
  exactly those rows, failing closed on a duplicate identity or a conflicting raw
  evidence hash. All 877 replayed and fresh sources then passed
  `verifyEvidenceSource` against real raw bytes before the bundle published. Two
  guards now make the clobber impossible: the frozen output path is round-tagged
  in both the refresh plan and the execution manifest, and the verifier refuses
  to start when its output already exists, checked before the dispatch permit is
  consumed and before any request. The 877-identity input of rounds 1-3 is
  retained at `canonical-item-image-source-verification.round-01-03.input.json`,
  moved rather than deleted, and re-hashes to its pinned `sha256:9ee3daf4...2bd5b`.
  Item image Task 4 is executed (2026-08-01). `promote-item-image-sources.mjs` is
  registered as governed operation 30 of 31 and applies the content-addressed
  bundle to `items.standardized.json` under packet
  `sha256:971b06f1...ca19b91c0`, decision
  `canonical-item-image-source-promotion-20260801-01`, over the `0600` frozen
  contract `sha256:e61f7e7d...91e4f7b0`. Run detached via `setsid`, exit 0.
  Result: `6131 = 2119 existing + 4012 promoted`, before
  `sha256:4e06da09...d6ef2520`, after `sha256:986fc39b...d1a5f1b3` matching the
  contract's bound `standardizedAfter`, identity set unchanged. All 6,131 records
  now carry an `imageFileTitle`. Independent readback against `HEAD` with the five
  image fields stripped shows byte-identical canonical JSON, 20,060 values filled
  from empty and zero pre-existing values overwritten; the `tooltip` churn in the
  textual diff is a trailing comma, because promoted records did not previously
  carry the image keys.
  A defect was caught before authorization rather than after: the apply gate
  compared the packet's `dataBundleSha256` against the promotion bundle's own
  hash, but a packet binds the operation's canonical data paths through
  `hashOrderedBundleBytes`, so no real packet could ever have matched. Repaired at
  `60567e0c`; the chain is now packet to contract bytes, contract to bundle hash,
  build to real bundle bytes.

- Crawler automated-ingestion readiness implementation remains active.
  Branch: `design/crawler-auto-ingestion-readiness`; worktree:
  `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`.
  Six Task 4-9 checkpoint commits delivered frozen evidence/policy/run persistence (V55 + 14 immutable tables),
  three-database apply protocol (mutation-generation, ownership-fence, staged/single-txn),
  19-operation capability manifest (all L0+DISABLED), admin workflow with T2 read-only
  boundary, T0/T1 acceptance runner, quality-gate automation contract step.
  Fresh no-database evidence: automation/admin Node 121/121, progress owners 25/25,
  Java automation/action 52/52, admin Nuxt typecheck, and git diff --check all pass.
  The progress and backend-owned disabled-reason code gates are closed; the real Spring
  profile defaults fail-closed to read-only. Authorized live T0/T1 acceptance now passes:
  three-schema rollback/commit/restore is `0/1/0`, T1 freezes and verifies 116 bounded
  ownership tables, and all isolated databases/accounts/Redis reservations clean to zero.
  Focused Node 181/181, Java 41/41, and Admin 14/14 plus typecheck pass. The branch is not
  merge-ready because the full gate stops on four B1 panels representing seven canonical
  migration exemptions expired on 2026-06-30; those data-governance blockers require a
  separate project/data owner repair before the full gate and any L1 checkpoint. The user
  approved the full landing -> maint -> relation -> local repair design and retained the
  four JSON paths as read-only compatibility outputs. A boundary review found and repaired
  NPC source, zero-check gate, feedback-loop, Owner authorization, formal-cutover,
  consumer-scope, T1-prefix, and export-lifecycle defects.
  The measured B1 review and user decisions are incorporated, and Step 0 is delivered. On
  2026-07-27 the interrupted formal-local V55 setup was repaired: all 18 empty manually created
  automation tables were removed, the branch backend let Flyway apply and register V55 with
  checksum `166205513`, and a second complete startup reported schema version 55 up to date.
  V55 now owns 18 empty tables and 18 immutable-fact triggers. The Owner/policy bootstrap module
  exists and is dry-run by default; its exact authorized formal bootstrap has now
  created the singleton Owner and the `biomes` L0/DISABLED policy. The approved B1 group chain is decomposed into independently
  verifiable phases. Phase 1A is complete through commits `f4221d6d`, `8402611c`, and
  `a11cd7b8`: it defines canonical landing identity/history, fail-closed importer rotation,
  and read-only audit/lineage consumers. The canonical group implementation now reaches
  CODE_READY/T1_VERIFIED through closure-plan Tasks 2-9; V56/V57/V58 are now
  registered on formal local while relation role completion remains pending. Task 10
  CODE_READY and filesystem-only work are complete; Task 11 fixture `CODE_READY`
  and Task 12 request generation are complete. The bootstrap and Batch 01
  packets were consumed; none of their decision identities can be reused.
  No production deployment, V1 deletion, new external sources, scheduler activation,
  or formal T2 apply was performed. L1/L2 promotion requires separate Owner authorization.
  See `entries/2026-07-23-crawler-auto-ingestion-readiness-design.md` and
  `../superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md`.

- Post-merge acceptance in progress on branch `dev/post-merge-acceptance`
  (from local `main` @ `518d9a0`, 31 commits ahead of origin, unpushed).
- Uncommitted work pending user acceptance: triage-board layout fixes,
  V1-engine warning banner, one-shot V2 cutover script. See
  `entries/2026-07-17-crawler-v2-per-env-activation-guard.md`.
- Admin P0 audit batch is complete (8/8, commits `e6cda9c`..`ad8e9bd`); see
  `entries/2026-07-17-admin-p0-security-batch.md` for verification evidence
  and the three explicit follow-ups (backend @Profile for test-state,
  ItemMapperPreferredImageSqlTest baseline reds, P1 dead-code sweep).

## Active Focus

- Front P2 WP-11.2..WP-14, its closed P1-tail/WP10 dependencies,
  post-acceptance repairs, and the approved Mist Workbench/Linen Paper button
  systems are locally integrated into `main`. Focused contracts, the full
  frontend gate, both preview copies, and the 16-case runtime matrix passed for
  button scope. The blocked data-audit compatibility commits remain excluded;
  no push or local worktree cleanup was performed.

- Admin/backend P1+P2 batch is closed and locally integrated into `main` at
  `b778e57f`. The task branch and worktree are intentionally preserved; no push
  or cleanup has been performed.

- V2 queue engine activated on this worktree
  (cutoverId `crawler-v2-20260717T034735Z`). buffs re-dispatched and resumed
  from checkpoint 147/388 after a V1-era stuck-domain incident.
- V1 code deletion is deferred until V2 survives several full crawl cycles;
  boundary audit recorded in the entry above.

## Current State

- Front P2 merged-result validation passes the full public frontend gate and
  the focused public armor/recipe backend suite (16/16). The source integration
  worktree remains available with two unstaged HTML acceptance auxiliaries.

- C2 commits `b825ecc`, `02ee0a7`, `635f5ba`, and `fd3689e` keep table overflow
  local, action buttons on one row, and article filters readable across widths.
  Focused contracts pass 11/11 and admin typecheck passes. Fresh browser geometry
  at 1280/1130/1024/900/800/761/760 confirms every toolbar control has computed
  and actual height 44px, stays inside its toolbar, and causes no document,
  command-bar, or toolbar overflow. Specification and quality re-review have no
  findings; temporary ports 3010/9223/18088 are closed.

- C3 commits `c20d7b2` and `dcf214c` repair all seven classification-audit tokens
  and add a transactional shared five-section pager. The final behavior suite
  passes 13/13 and admin typecheck passes; it executes aggregation, deferred
  commit, failed-target retry, contraction/zero-result clamp, and waiting-state
  preservation. Specification and quality re-review report no remaining findings.

- C4 commits `3a1d178` and `06d655b` migrate login/dashboard theme colors,
  delegate category controls to global styles, restore >=4.5:1 light/dark normal
  text contrast, and keep KPI gradients within their semantic domains. Focused
  contracts pass 21/21, admin typecheck passes, runtime geometry has no layout
  regression, and fresh specification/quality re-review has no blocking findings.

- C5 commit `630ddb5` exports the shared cookie key, reuses `resolveApiUrl`, makes
  audio match status token-exact, and maps items through a 24-field whitelist.
  Focused contracts pass 23/23 and admin typecheck passes. Quality review found
  two Important issues: recipe loading can race submission or a later edit, and
  the whitelist contract does not execute the actual `handleEdit` behavior.

- C5 repair commit `02df27b` adds template/function submission gates, generation
  identity, and executable deferred handler tests; focused contracts pass 25/25.
  Fresh quality re-review confirmed those two findings are resolved, then found
  the remaining failure-path ambiguity: `fetchItemRecipes` catches errors as `[]`,
  so the page can still unlock and later write an empty recipe set.

- C5 final repair `2e101c9` preserves the default array contract while exposing
  strict null-on-error only to the edit page. Failed loads remain write-blocked,
  legitimate empty recipes remain savable, stale requests cannot change current
  state, and production-body contracts pass 28/28. Final fresh specification and
  quality reviews report no findings.

- D1 initial commit `a801455` consolidates 35 local trim helpers with focused
  5/5 and seven compiling checkpoints. Specification review found two blockers:
  five original Unicode-blank helpers are not equivalent to `String.trim()`, and
  seven `firstNonBlank` bodies were textually changed by qualification.

- D1 repair `d2a8782` adds the narrowly-scoped Unicode-blank variant for exactly
  five owners and restores seven firstNonBlank bodies with static import. Focused
  tests pass 10/10, compilation passes, and fresh specification/quality review
  reports no findings.

- D2 commits `4ab211e7`, `7d6457fc`, and `c86ddcd1` remove all eight naive
  controller IP parsers, inject `ClientIpResolver`, and prove seven previously
  weak paths with exact fixed-IP propagation plus URI/unique-header request
  identity. Final specification and quality reviews report no findings; the
  coordinator reran 151 targeted backend tests and compilation successfully.

- D3 commit `c13ce117` replaces the category-null envelope with an exact global
  404 and lets six local catches surface through existing 400/500 handlers.
  MockMvc 404/400/500 coverage, final specification review, final quality review,
  and coordinator test/compile validation all pass.

- D4 commit `c7835ee7` preserves no-filter blank reviewStatus semantics, adds the
  parameterized mapper filter, and removes frontend count refreshes. Backend 62/62,
  admin contracts 33/33, typecheck, and final reviews all pass.

- Public category child navigation is closed at `4a744dc`: six parent routes
  expose 34 image-backed child categories with verified scope, count, and
  fail-closed behavior.
- V2 crawler operation workflow is integrated from `3234cc0` pending the local
  merge commit. It adds the backend-owned 19-operation catalog, truthful
  attempt plan/result evidence, lease renewal, exact controls, and compact ID
  presentation. Fresh branch gates passed admin 311/311 plus typecheck/build,
  crawler/workflow 61/61, and focused V2 backend 527 with zero failures/errors.
- The local merge initially regressed the main notification source by treating
  missing legacy `domain.state` as V2 idle. The fallback was removed; merged
  gates now pass admin 345/345 plus typecheck/build, focused V2 backend 538/538,
  and backend test compilation.

## Next Agent Should Start Here

- Front P2 and the light-theme button adaptation require no further merge
  action. Read `entries/2026-07-22-front-p2-local-integration.md` for the
  curated-history boundary and excluded data-audit work, and
  `entries/2026-07-22-light-theme-button-system.md` for button validation and
  residual-risk boundaries.

- Admin P1+P2 requires no further action. Read
  `entries/2026-07-18-admin-p1-p2-batch.md` only for historical context. The
  local task branch/worktree remain available for acceptance follow-up.

- Read `entries/2026-07-17-crawler-v2-per-env-activation-guard.md` before any
  crawler-monitor work. This environment routes V2; other worktrees still
  route V1 until they run `scripts/dev/crawler-v2-cutover.sh`.
- Do not run real crawler force/apply actions, Redis reset, or database writes
  without explicit operation-level authorization.
- For automated-ingestion closure, read
  `entries/2026-07-27-crawler-automated-ingestion-closure.md`; the complete
  result matrix is already fresh. Do not rerun the full chain until a source or
  authorization input changes. Start from the 702-row candidate-only image
  report, the 613/3,225 raw-backed local-only verification boundary, and the
  missing coherent shimmer generation. Boss import and lineage retry-02 are
  complete; keep both identities consumed and preserve retry-01's zero-byte
  result as historical evidence only. Keep unverified image rows fail-closed.
  Do not reuse consumed identities or execute a formal
  crawler/import/backfill/image-sync/apply, L1/L2 promotion, source flip, or
  scheduler activation without the exact operation-level packet required by
  the plan; do not mutate the shared stack.

- Shimmer Task 6 has cleared final independent security review. Its private
  input contract, proposal path, importer result path, runner outputs, and
  readiness evidence reject symbolic-link ancestors/endpoints; the runner keeps
  Shimmer's completed-apply result contract operation-specific and safely
  prepares missing output parents before dispatch. Task 7 is not implied by
  this code checkpoint. Do not create a generation, preview, request, packet,
  permit, import, or data write until its exact Owner confirmation is supplied.

## Current Risks

- Acceptance follow-up browser checks observed intermittent failed Nuxt
  prefetches for unvisited crawler-monitor modules. The login and article
  targets had zero console errors, zero target request failures, and zero
  non-auth/non-resolver writes; the prefetch noise is unrelated to this scope.

- D6 is committed at `513ab4db` with test repair `fda1484c`; final admin gates
  pass 400/400. Runtime screenshots pass at six 1280px routes with stable-state
  zero console/network errors and no page overflow. C4's focused CSS evaluator intentionally supports only the
  repository's current syntax subset and does not model future decorative
  background layering.

- Broad Maven/full quality-gate baseline failures are outside the V2 scope.
- 6/8 local worktrees still silently route V1 until cut over; the new banner
  only appears after they merge this change.
- V1 defects (fake exit 0 on recovered processes, reducer contradiction
  swallow) remain in code but are unreachable under V2 routing.
- Real force-crawl, formal apply, live Redis expiry races, and adversarial HTTP
  preview-path acceptance remain manual/runtime concerns.
- Public category totals and representative images depend on current local
  data; their route and fail-closed contracts remain the acceptance boundary.

## Recently Closed

- `docs/devlog/entries/2026-08-04-item-image-projection-apply-design.md`
  - branch: `design/crawler-auto-ingestion-readiness`
  - status: `closed`
  - result: approved scoped design for
    `canonical-item-image-projection-apply`; commit SHA pending in final response

- `docs/devlog/entries/2026-07-22-light-theme-button-system.md`
  - branch: `main` from `feat/front-p2-integration`
  - status: `closed`
  - commit: `466146c1`; two approved light button systems and byte-identical
    interactive previews complete

- `docs/devlog/entries/2026-07-22-front-p2-local-integration.md`
  - branch: `main` from `feat/front-p2-integration`
  - status: `closed`
  - commit: `8dedd321`; curated local integration complete

- `docs/devlog/entries/2026-07-18-admin-p1-p2-batch.md`
  - branch: `fix/admin-p1-p2-batch`
  - status: `closed`
  - commit: `b778e57f`; integrated into local `main`

- `docs/devlog/entries/2026-07-18-front-p1-tail-refactor.md`
  - branch: `refactor/front-p1-tail`
  - status: `closed`
  - integration commit: `8dedd321`

- `docs/devlog/entries/2026-07-17-admin-p0-security-batch.md`
  - branch: `dev/post-merge-acceptance`
  - status: `closed`
  - commits: `e6cda9c` `f750425` `4db4df8` `462e483` `7a0a82e` `f8f9b3a` `cc287de` `ad8e9bd`

- `docs/devlog/entries/2026-07-17-v2-main-merge-integration.md`
  - branch: `main`
  - status: `closed`
  - commit: `518d9a04`

- `docs/devlog/entries/2026-07-16-crawler-monitor-operation-semantics.md`
  - branch: `fix/crawler-queue-v2-runtime`
  - status: `closed`
  - commit: `3234cc0`

- `docs/devlog/entries/2026-07-14-crawler-monitor-registered-idle-domains.md`
  - branch: `fix/crawler-queue-v2-runtime`
  - status: `closed`
  - commit: `3234cc0`

- `docs/devlog/entries/2026-07-16-public-category-navigation.md`
  - branch: `codex/continue-dev-20260715`
  - status: `closed`
  - commit: `4a744dc`

- `docs/devlog/entries/2026-07-12-crawler-queue-v2-runtime.md`
  - branch: `fix/crawler-queue-v2-runtime`
  - status: `closed`
  - commit: `0bad80d`
