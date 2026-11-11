# Buff Relation No-Loss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Buff `inflicts` and `immune` relationships revision-bound and direction-safe so Wiki changes never silently erase relationships, while complete source evidence is exposed through the canonical relation and public API chain.

**Architecture:** Keep Buff-page immunity evidence, NPC-page infliction evidence, and NPCinfo `buffImmune` evidence as separate source contracts. Compose only identity-bound positive facts; never infer an empty list from a missing section. A fact group replaces existing data only when its source is complete and verified; otherwise the prior relation is preserved with an explicit stale/unverified disposition. The existing landing → maint → relation → projection → API chain remains the only publication path.

**Tech Stack:** Node.js ESM, Node test runner, existing Wiki revision-bound fetch helpers, existing NPC parser, Buff relation normalizer and candidate gates, Spring public Buff/NPC DTOs.

**Execution boundary:** This plan may edit source contracts, tests, audits, and devlog. It must not execute landing, maint, relation, projection, packet, permit, scheduler, or database writes until the final source and full-chain gates pass. The current dirty worktree must not be reset, cleaned, stashed, or discarded; no commit or push is part of this execution.

---

### Task 1: Lock the NPC-page infliction contract with the Wall of Flesh fixture

**Files:**
- Create: `pipelines/fetch/buff-npc-page-evidence.mjs`
- Create: `pipelines/fetch/buff-npc-page-evidence.test.mjs`
- Modify: `docs/audits/2026-09-30-buff-npc-page-direction-fixture.md`

- [x] **Step 1: Write the failing tests**

  Add tests for a pure `extractBuffNpcPageInflictionEvidence` function. The
  tests must prove that a revision-bound `Wall of Flesh` payload containing
  `auto=113` and `debuff=Horrified` produces one positive `inflicts` fact with
  `npcSourceId=113`, `buffInternalName=Horrified`, the duration text, page title,
  revision ID and revision timestamp. Add failure cases for missing revision
  identity, wrong page title, wrong NPC auto ID, wrong Buff identity, duplicate
  Buff infliction fields, and an `Immune to` HTML cell being treated as an
  infliction.

- [x] **Step 2: Run the focused test and verify RED**

  Run:

  ```bash
  node --test pipelines/fetch/buff-npc-page-evidence.test.mjs
  ```

  Expected: failure because the new module and function do not exist.

- [x] **Step 3: Implement the minimal source contract**

  Implement `extractBuffNpcPageInflictionEvidence({ pagePayload, npcSourceId, npcInternalName, buffScope })` by:

  1. Requiring an exact page title, positive page ID, positive revision ID and
     parseable revision timestamp.
  2. Calling `extractNpcInfobox` and `extractNpcSourceInfoboxes` from
     `pipelines/crawler/src/domains/npc-parser.mjs`.
  3. Requiring a source infobox whose `autoId` equals `npcSourceId` and whose
     image/name scope identifies the requested NPC.
  4. Matching each extracted `buffInfliction.buffName` against exactly one
     supplied Buff identity.
  5. Emitting only NPC-owned `inflicts` facts with source revision provenance.
  6. Emitting no immunity facts and marking the result
     `completeness: 'positive-infliction-facts-only'`.

  Do not parse or copy the NPC `Immune to` HTML cell in this module.

- [x] **Step 4: Run the focused test and verify GREEN**

  Run the same Node test command and require all tests to pass.

- [x] **Step 5: Run syntax and whitespace checks**

  Run:

  ```bash
  node --check pipelines/fetch/buff-npc-page-evidence.mjs
  git diff --check
  ```

### Task 2: Add an explicit complete-scope Npcinfo contract

**Files:**
- Modify: `pipelines/fetch/buff-npcinfo-evidence.mjs`
- Modify: `pipelines/fetch/buff-npcinfo-evidence.test.mjs`
- Modify: `docs/audits/2026-09-30-buff-npcinfo-evidence.md`

- [x] **Step 1: Write the failing tests**

  Add tests for `verifyBuffNpcinfoCompleteCapture`. A complete fixture must
  include `manifest.scopeCompleteness='all-npc-rows'`,
  `manifest.fieldSemantics='buffImmune-exhaustive'`, and `manifest.npcCount`
  equal to the count of numeric NPC rows in the module. The function must
  return `completeness: 'complete-exhaustive-npc-scope'` and a reverse
  `assertionsByBuffId` map. The explicit field-semantics declaration is
  required before an absent Buff ID can support a complete empty immunity
  result. Add failures for missing completeness or semantics declarations, NPC
  count drift, duplicate NPC internal identities, malformed `buffImmune`
  values, and an assertion outside the selected Buff scope. Keep the existing
  positive-only verifier behavior unchanged.

- [x] **Step 2: Run the focused test and verify RED**

  Run:

  ```bash
  node --test pipelines/fetch/buff-npcinfo-evidence.test.mjs
  ```

  Expected: failure because the complete-scope verifier is not defined.

- [x] **Step 3: Implement the minimal complete-scope verifier**

  Reuse the existing revision/hash/scope validation. Parse all numeric NPC
  rows, require an exact `manifest.npcCount`, require the explicit completeness
  declaration, reject duplicate numeric IDs or internal names, and build
  deterministic arrays sorted by `npcId` and `buffId`. Reject any row carrying
  `buffImmuneAll` or `buffImmuneAllNotWhips` until a separately captured and
  reviewed semantic expansion proves the selected Buff scope (including
  whip-debuff classification). Return the original positive assertions, the
  reverse map and the explicit completeness marker only for a scope with no
  unresolved all-buff flags. Do not classify the retained `.15` or `.20`
  captures as complete; their safe result remains positive-only.

  Execution correction: the initial implementation accepted a self-declared
  `buffImmune-exhaustive` manifest even when the raw module carried all-buff
  flags. The verifier now rejects those rows until semantic expansion evidence
  exists; the RED/GREEN regression is `does not call specific buffImmune rows
  exhaustive while all-buff flags remain unexpanded`.

- [x] **Step 4: Run the focused test and syntax check**

  Run:

  ```bash
  node --test pipelines/fetch/buff-npcinfo-evidence.test.mjs
  node --check pipelines/fetch/buff-npcinfo-evidence.mjs
  git diff --check
  ```

### Task 3: Compose direction-specific source evidence without widening canonical admission

**Files:**
- Modify: `pipelines/fetch/buff-immunity-source-composition.mjs`
- Modify: `pipelines/fetch/buff-immunity-source-composition.test.mjs`
- Modify: `pipelines/relation/buff-source-applicability.mjs`
- Modify: `pipelines/relation/buff-source-applicability.test.mjs`

- [x] **Step 1: Add RED tests for separated source groups**

  Add a test that composes the Wall of Flesh NPC-page positive fact with a
  complete Npcinfo reverse source while retaining separate fields:

  ```js
  {
    inflictingNpcPositiveEvidence: { status: 'positive-infliction-facts-only', facts: [...] },
    immuneNpcPositiveEvidence: { status: 'complete-npc-scope', assertions: [...] }
  }
  ```

  Assert that the composer never creates `immuneNpcs` from `Inflicts`, never
  creates `inflictingNpcs` from `buffImmune`, and records count/identity drift.
  Add a test that incomplete alternate evidence remains diagnostic and does
  not make `buildBuffPartialFactPlan` executable.

- [x] **Step 2: Run the focused tests and verify RED**

  Run:

  ```bash
  node --test pipelines/fetch/buff-immunity-source-composition.test.mjs pipelines/relation/buff-source-applicability.test.mjs
  ```

- [x] **Step 3: Implement the separated composition and gate**

  Add explicit validation for NPC-page infliction facts and complete
  exhaustive Npcinfo evidence. Attach them under separate provenance keys.
  Extend the partial plan only to describe complete replacement candidates;
  preserve its
  `executable=false` and `partial-fact-contract-review-required` blocker until
  the full chain is reviewed. Missing or positive-only evidence must remain
  unknown and must preserve the baseline group.

- [x] **Step 4: Run focused and existing Buff relation tests**

  Run:

  ```bash
  node --test pipelines/fetch/buff-immunity-source-composition.test.mjs pipelines/relation/buff-source-applicability.test.mjs pipelines/relation/sync-buffs-to-relation.test.mjs pipelines/relation/buff-canonical-full-chain.test.mjs
  ```

### Task 4: Replay the complete source chain offline and repair the audit/devlog

**Files:**
- Create: `.local/tmp/replay-buff-directional-source-20260930.mjs`
- Create: `.local/tmp/buff-directional-source-replay-20260930.json`
- Modify: `docs/audits/2026-09-30-buff-page-evidence-diagnosis.md`
- Modify: `docs/audits/2026-09-30-buff-npcinfo-evidence.md`
- Modify: `docs/devlog/entries/2026-09-29-automation-domain-buff.md`

- [x] **Step 1: Build a hash-bound offline replay**

  Revalidate the existing raw Wall of Flesh page, the frozen 400-Buff input,
  and the retained Npcinfo raw/module hashes before composing evidence. The
  replay must report directional fact counts, duplicate identities, count
  drift, complete/positive-only/unknown status, and normalizer admission. It
  must not write standardized data, Redis control state, candidate packets, or
  any database.

- [x] **Step 2: Run the replay and record the actual result**

  Run:

  ```bash
  node .local/tmp/replay-buff-directional-source-20260930.mjs
  ```

  Expected current result: Wall of Flesh infliction evidence is available;
  Npcinfo remains positive-only unless a newly verified complete-scope artifact
  exists; canonical immunity admission remains blocked if completeness is not
  proven. Do not convert that result into a zero-length immunity list.

  The earlier replay after the all-buff flag gate is
  `.local/tmp/buff-directional-source-replay-20260930-v5.json`. The expanded
  semantic replay is recorded separately below and does not authorize writes.

- [x] **Step 3: Run the Buff regression and documentation checks**

  Run:

  ```bash
  node --test pipelines/fetch/buff-immunity-page-parser.test.mjs pipelines/fetch/buff-immunity-source-composition.test.mjs pipelines/fetch/buff-npcinfo-evidence.test.mjs pipelines/fetch/buff-npc-page-evidence.test.mjs pipelines/relation/buff-source-applicability.test.mjs pipelines/relation/sync-buffs-to-relation.test.mjs pipelines/relation/buff-canonical-full-chain.test.mjs
  git diff --check
  ```

  The final Buff fetch/landing/import/relation regression is **314/314**; syntax and
  whitespace checks pass. Record counts and remaining blockers in the Buff
  devlog entry.

### Task 5: Runtime readiness decision and guarded execution

**Files:**
- Inspect only: `pipelines/relation/buff-canonical-full-chain.mjs`,
  `pipelines/relation/run-buff-canonical-ingestion.mjs`, runtime preflight and
  authorization artifacts
- Modify only if all source and full-chain gates pass: the governed Buff
  execution manifest and the relevant devlog/audit records

- [x] **Step 1: Re-run authenticated read-only preflight**

  Confirm scheduler disabled, live attempts/claims `0/0`, healthy reconciler,
  unchanged H8/epoch/server, and zero active Buff writers. If any check fails,
  stop at this task and record the blocker.

- [x] **Step 2: Re-derive candidate and full-chain envelope**

  Require exact source hashes, landing identity, baseline identity, separated
  directional facts, complete immunity evidence, locked rederivation and
  execution manifest equality. Any unknown or partial source must keep the
  envelope non-executable.

  Read-only result: the earlier `.local/tmp/buff-expanded-npcinfo-replay-20260930-v12.json`
  remains historical at 398/400 matched, 2 unknown, and 33/400 normalizer
  admission. The later Iteminfo semantic replay reaches 400/400 normalizer
  admission, but the candidate remains non-executable because twelve new Buffs
  have no baseline and 360 inflicting-NPC groups still require preserved
  baseline facts.

- [ ] **Step 3: Execute only if every gate passes** *(blocked: 12 new Buffs have no baseline and 360 inflicting-NPC groups require preserved baseline facts; no executable candidate or full-chain envelope exists)*

  Run the registered landing → maint → relation → projection executor with its
  packet/permit and recovery journal. Never call raw SQL, manual sweep,
  scheduler activation, or direct database mutation outside the governed
  executor.

- [x] **Step 4: Verify runtime readback** *(read-only; Task 5 Step 3 remains source-blocked)*

  Read back relation/projection/API results for Buff ID `37`, NPC ID `113`, at
  least one complete immunity Buff, and one incomplete-source Buff. Verify
  relation direction, counts, source revision, stale/unverified status, and
  public/admin API parity. The read-only result is recorded in
  `.local/tmp/buff-runtime-readback-20261001.json` and the active Buff audit:
  `Wall of Flesh (113) -> Horrified (37)` is present in revision-bound source
  evidence but absent from current relation/local/projection/API rows; the
  source gate remains blocked, so runtime writes stay untouched.

### Task 12: Governed additive relation repair for verified positive inflictions

The full-chain candidate remains intentionally blocked because it carries
partial fact dispositions. A separate additive-only operation may publish a
revision-bound positive `inflicts` fact when an active Buff baseline exists and
the operation can preserve every existing fact group. This lane must not turn
unknown scope into an empty list or widen ownership to landing/maint/local
compatibility tables.

- [x] **Step 1: Add RED tests for the additive proposal and transaction contract**

  Require stable Buff/NPC identity, revision/page/raw-hash provenance, active
  reverse-row coverage, exact before/after hashes, idempotent deduplication,
  and a target set limited to relation Buff rows, NPC-Buff reverse rows, and
  projection Buff rows. Reject immunity/source-item changes, new Buff IDs,
  unknown/empty infliction claims, identity collisions, and missing evidence.

- [x] **Step 2: Implement the minimal additive proposal builder and executor**

  Add a registered `canonical-buff-additive-relation-apply` operation with a
  fresh proposal, packet/permit, fence, journal, locked readback, and after-set
  verification. The executor may update only the verified relation/projection
  infliction JSON and insert missing `inflicts` reverse rows. It must remain
  non-destructive and idempotent.

- [x] **Step 3: Run RED/GREEN, syntax, and catalog-manifest checks**

  Run the focused additive tests, the existing Buff regression, `node --check`
  on every touched module, `git diff --check`, and the canonical operation
  catalog/manifest tests. A read-only proposal artifact is allowed for the
  review boundary; do not create a packet or permit, and do not consume one.

- [x] **Step 4: Build a read-only Wall of Flesh proposal**

  Reuse `.local/tmp/buff-npc-infliction-verified-20261003-v7.json` and the
  active relation/projection baseline to produce a new additive proposal. The
  bounded artifact contains 114 verified positive facts across 30 existing Buff
  baselines; verify that `113 -> 37` is present, the existing lists are
  preserved, and no unknown facts or new Buff IDs are admitted. Keep canonical
  ingestion and all runtime writes blocked until a separately authorized
  execution review passes.

### Task 12 execution evidence — 2026-10-03

- [x] Re-ran the focused additive proposal and syntax checks after fixing the
  legacy baseline identity rule. Existing infliction JSON that has a stable
  `internalName` but no numeric NPC ID is compatible with a revision-bound fact;
  two explicit, different numeric IDs with the same name still fail closed.
  Focused additive tests pass `9/9`.
- [x] Prepared the read-only proposal
  `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261003-wall-of-flesh.proposal.json`.
  Its proposal SHA-256 is
  `sha256:bf72e9aade7057e273a3ff0f4c02b6df317898324d3ae59408aa9cdb042124fd`,
  source artifact SHA-256 is
  `sha256:813ce0fb049bf5c1cbbd5d412c1c7e951cb87ae211588278ac4c9af3c1ebadd3`,
  and scope SHA-256 is
  `sha256:3d12213ea8ea332d8768d77fb899f323e016c1580dab68ee2544d8b1c644af81`.
  It contains 114 facts across 30 pre-existing Buff IDs, 19 relation updates,
  20 missing reverse `inflicts` inserts, and 30 projection updates. Buff IDs
  `389–400` are absent. Wall of Flesh `113 -> 37` is present with exactly one
  reverse-row insert; no immune/source-item or other forbidden column changes
  are proposed.
- [x] Ran the focused Buff relation/full-chain/recovery/manifest regression:
  `210/210` tests passed (`9 + 22 + 94 + 9 + 2 + 74`), and `git diff --check`
  passed. This was a proposal-only read; no packet, permit, scheduler,
  landing, maint, relation, projection, Redis-control, standardized-data, or
  database write was executed.

### Task 15: Authorize only the verified additive relation lane

The additive proposal is intentionally read-only evidence. Its `executable`,
`applyAllowed`, and `databaseWrites` flags must remain `false`; execution is
allowed only through a separate canonical authorization context whose manifest
declares the exact additive operation, database-write ownership, and the three
relation tables. This task does not reopen full-chain ingestion, variant
unknowns, missing Buff baselines, landing, maint, or local compatibility.

- [x] **Step 1: Add RED tests for the apply-only authorization context**

  Require the runner contract to reject a missing or read-only execution
  manifest, operation/path/ownership drift, proposal hash drift, and any
  target outside `relation_buffs`, `npc_buff_relations`, and
  `projection_buffs`. Accept the unchanged read-only proposal only when the
  canonical packet context is authorized and the manifest is the registered
  database-write operation.

- [x] **Step 2: Implement the fail-closed authorization assertion**

  Add a pure apply-context assertion and call it after the authorized data
  bundle and proposal hash are loaded, before a MySQL connection or transaction
  is opened. Keep permit consumption, loopback fingerprint verification, fence
  locking, journal transitions, locked before-set, and after-set checks in the
  existing governed transaction path.

- [x] **Step 3: Prepare fresh authorization artifacts**

  Generate a new result-labelled execution manifest and authorization request
  for the current proposal. Do not reuse the prior read-only decision or create
  a packet/permit without a distinct owner decision bound to the new proposal
  hash and scope hash. The fresh read-only preparation uses result label
  `20261003-task15-authorization-v3`; its request data bundle contains exactly
  one private proposal entry. The additive data-bundle resolver was repaired
  after a RED/GREEN regression found it was returning an empty bundle. The
  expired request was superseded by the current v5 request below.

- [ ] **Step 4: Execute only after the owner decision and runtime gates pass**

  If a fresh authorized packet and single-use permit are present, run the
  additive executor once. It may touch only the five declared relation fields
  across the three relation tables; it must not run landing, maint, full-chain,
  scheduler, crawler, Redis-control, or local compatibility writes. **Blocked
  on 2026-10-03:** no owner packet/permit is present and the runtime has zero
  active write fences; no transaction was attempted.

- [ ] **Step 5: Verify the exact no-loss symptom and retain blockers**

  Read back `Wall of Flesh (113) -> Horrified (37)` in forward relation JSON,
  reverse `npc_buff_relations.relation_type=inflicts`, projection JSON, and
  admin/public API responses. Record before/after hashes, journal status, and
  any unchanged unknown variant or missing-baseline groups. Re-run the focused
  and broad Buff regressions plus `git diff --check`.

#### Task 15 continuation — 2026-10-04

- [x] Re-run the additive proposal in read-only mode and rebuild the exact
  execution manifest. The proposal remains 114 revision-bound facts and 69
  changed rows with SHA-256
  `sha256:bf72e9aade7057e273a3ff0f4c02b6df317898324d3ae59408aa9cdb042124fd`.
- [x] Capture current policy rows and server fingerprint read-only. The global
  policy set changed because `shimmer` is now v3/ACTIVE; the v5 request binds
  policy hash
  `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`
  and exactly one private proposal data-bundle entry.
- [x] Confirm fail-closed behavior by invoking the v5 apply command without a
  packet. It exits before opening MySQL with
  `TERRAPEDIA_AUTHORIZED_PACKET_PATH is required`.
- [ ] Execute only after a distinct owner packet, single-use dispatch permit,
  and active runtime fence are present. Request
  `20261004-task15-authorization-v5` remains `AWAITING_OWNER`; no packet,
  permit, fence acquisition, or database write exists.
- [x] Re-run authorization, manifest, additive proposal, and runner checks:
  `126/126` pass; the broader Buff/NPC/parser/landing/import/relation/auth
  suite passes `494/494` with the dependency-missing backfill test excluded;
  Node syntax checks pass, and `git diff --check` passes.

### Task 13: Preserve NPC variant-specific immunity identities

NPC variants can share a display name while having different immunity rows. The
source and normalization contract must therefore retain stable numeric NPC ID
and `internalName` throughout the Npcinfo evidence path. This is a regression
and audit task only; it does not authorize a runtime refresh.

- [x] Add a regression with same-display-name variants whose `buffImmune` sets
  differ. The verifier retains both stable identities and does not merge by
  display name.
- [x] Audit the revision-bound Npcinfo rows for representative Slime variants:
  `LavaSlime (59)`, `JungleSlime (-10)`, `SpikedJungleSlime (204)`, `Slimer
  (121)`, and `Slimer2 (-2)`. Record the source revision/hash and observed
  immunity differences in `docs/audits/2026-10-03-buff-npc-variant-immunity.md`.
- [x] Keep `lavaImmune` separate from Buff immunity, preserve all-buff semantic
  expansion gates, and leave canonical relation/projection writes blocked.

The focused Npcinfo suite passes `9/9`. The evidence confirms variant-safe
identity handling, but runtime relation/projection tables remain unchanged
until the broader canonical source gate is reopened.

### Task 6: Capture and review the all-buff semantic expansion before any complete immunity claim

**Files:**
- Create: a monitor-visible, revision-bound semantic capture for
  `Module:Npcinfo/doc` and `Module:Npcinfo/datagen`, plus an exact Buff-scope
  whip-debuff classification artifact
- Modify: the Npcinfo verifier/composer tests and the source audit only after
  the semantic artifact is independently hash-bound

- [x] **Step 1: Add RED tests for semantic-source and flag expansion binding**

  Require the verifier to reject a self-declared `buffImmune-exhaustive`
  manifest when the raw rows contain either all-buff flag. Add fixtures for
  `buffImmuneAll=true`, `buffImmuneAllNotWhips=true`, missing semantic source
  hashes, and a whip-classification scope drift.

- [x] **Step 2: Capture the semantic source pages through the registered monitor path**

  Use a tested action/progress path and a fresh authenticated preflight. Bind
  page IDs, revision IDs, timestamps and raw hashes for the documentation and
  datagen source that define the flag semantics. Do not use a caller-provided
  boolean or manifest string as semantic proof. The refreshed five-page
  capture is `.local/tmp/b1-a63-20260930-26/`; file and Redis DB14 terminal
  readback are `5/5`, and the classifier is bound to the captured `Whips`
  revision.

- [x] **Step 3: Expand only identity-bound flags**

  Emit specific `buffImmune` assertions directly; expand `buffImmuneAll` to
  every selected Buff; expand `buffImmuneAllNotWhips` only when every selected
  Buff has an independently verified whip-debuff classification. If either
  source or classification is incomplete, keep the group positive-only/unknown
  and preserve the baseline.

  Completed in `.local/tmp/b1-a63-20260930-26/`: the revision-bound `Whips`
  source identifies current relevant whip debuffs as Buff IDs `310` and `362`.
  The verifier binds those IDs to the five-page semantic capture and expands
  11 `buffImmuneAll` plus 26 `buffImmuneAllNotWhips` rows across the selected
  400-Buff scope. Complete alternate immunity facts enter the normalizer only
  with this semantic contract; page evidence remains preferred.

- [x] **Step 4: Re-run the directional replay and full-chain fence**

  Require the actual normalizer, candidate, and full-chain envelope to consume
  the expanded source. Any unknown, count drift, or direction mismatch keeps
  canonical ingestion blocked. No landing, maint, relation, projection,
  packet, permit, scheduler, or database write is allowed before this gate.

  The expanded replay `.local/tmp/buff-expanded-npcinfo-replay-20260930-v12.json`
  is read-only and hash-bound. Its 398 matched / 2 unknown result and 33/400
  admission are historical. The later Iteminfo semantic and target-mismatch
  normalizer gates are recorded in Task 8; no candidate or executable
  full-chain envelope was produced and canonical ingestion remains blocked.

### Task 7: Bind positive directional facts while preserving expected-missing groups

The expanded replay shows that a complete immunity alternate does not by itself
make a record executable: 367 records still carry `sourceItems.status=section_missing`.
The revision-bound Iteminfo capture is positive-only (165 Buffs with assertions;
202 Buffs without a safe alternate), and the only independently captured
NPC-owned infliction source is Wall of Flesh (two positive facts for Buffs 37/38).
Do not infer empty source-item or inflicting-NPC arrays from those gaps.

- [x] Add a RED/GREEN regression proving that parser-produced
  `section_missing`/`no_rows` markers are expected preservation state for the
  non-executable partial plan, while target mismatches and parser errors still
  fail closed unless a complete independent alternate covers the same
  `immuneNpcs` group. The mismatched page rows are never consumed.
- [x] Thread the revision-bound NPC-page positive infliction evidence into
  `buildBuffRecords` and the separate source-evidence composition. The facts
  must remain `inflicts`, bind the NPC page revision, and never populate
  `immuneNpcs`.
- [x] Run a read-only partial-contract replay over the 400 records using the
  current expanded Npcinfo, Iteminfo, and Wall of Flesh artifacts. Report
  replacement groups, preserved groups, positive infliction additions, and
  exact baseline requirements. Do not create a packet or executable candidate.
- [x] Keep the full-chain partial-fact fence and canonical ingestion blocked
  until an independently reviewed baseline-bound execution contract exists.

Replay result: `.local/tmp/buff-partial-contract-replay-20261001-v4.json`,
SHA-256 `sha256:cbbdf602bbe6d881af26e291933b9e96f6aefafbe9bb85a9aeebe20156788251`.
The replay built 388 partial plans, preserved 359 `sourceItems` groups and 360
`inflictingNpcs` groups against the active relation baseline, and replaced 388
`immuneNpcs` groups from the complete expanded Npcinfo alternate. Twelve Buffs
had no active baseline row. `DryadsWard` and `StardustMinion` use only the
independent immunity alternate; their mismatched page rows are not consumed.
Wall of Flesh contributed two revision-bound positive `inflicts` facts for Buff
IDs 37 and 38. No packet, candidate envelope, standardized-data, Redis-control,
or database write was created.

Baseline-binding review correction: v2 used `raw_json` fallback for the two
secondary baseline groups. The corrected read-only replay
`.local/tmp/buff-partial-contract-replay-20261001-v3.json` directly selects
`source_items_json` and `inflicting_npcs_json` from the active relation table;
its SHA-256 is
`sha256:d89c5409685fe248fb0e9a5ae0cf845ef97776f3cbabe6851ae1dd5ac57c378d`.
The counts are unchanged, and a direct 388-row comparison found zero drift
between those relation columns and the corresponding `raw_json` facts.

The subsequent v4 replay consumed the reviewed target-mismatch exception and
reports `400 parsed / 0 unknown` applicability, while its normalizer admission
remained `33/400` before the complete Iteminfo semantic source was integrated.

The diagnostic v6 replay
`.local/tmp/buff-partial-contract-replay-20261001-v6.json` (SHA-256
`sha256:75657fe6ae5f7623714612bb4fb9f26e6a3939428ba7107b3c4eba5669a72dfd`)
  groups all 367 normalizer failures: 365 records fail on `sourceItems`, and two
  fail on `immuneNpcs,sourceItems`. This confirms source-item evidence is the
  historical strict-normalizer bottleneck; it did not authorize an empty source
  item list.

No landing, maint, relation, projection, packet, permit, scheduler, Redis
control, standardized-data, or database write is allowed in this task.

### Task 8: Bind exhaustive Iteminfo source-item semantics

The v6 diagnostic showed that strict admission was blocked primarily by
`sourceItems`. A positive `buffType` row proves one item relation, but an
absent row is meaningful only after the Iteminfo data module is independently
bound to its documentation and generator semantics.

- [x] Add RED/GREEN tests for an `iteminfo-semantics` monitor-visible capture
  of `Module:Iteminfo/data`, `Module:Iteminfo/doc`, and
  `Module:Iteminfo/datagen`. Require page IDs, revision IDs, timestamps, raw
  hashes, exact selected Buff scope, and fail-closed semantic marker checks.
- [x] Add `verifyBuffIteminfoSemanticCapture` and thread its complete-scope
  result through `buildBuffRecords`. A complete module scope may replace a
  missing source-item group, including a verified empty group; positive-only
  captures retain the old incomplete behavior and relation fallback.
- [x] Run the bounded 400-Buff capture through
  `buff-page-immunity-refresh`, preserving canonical progress and terminal
  evidence. No direct fetch or database writer is allowed.
- [x] Re-run the read-only partial-contract replay with the actual verifier,
  expanded Npcinfo, and Wall of Flesh evidence. Record replacement and
  preservation counts plus remaining blockers before considering any full-chain
  operation.

Capture and replay evidence:

- `.local/tmp/buff-iteminfo-semantic-capture-20261001-v2/`, terminal progress
  `.local/tmp/buff-iteminfo-semantic-capture-20261001-v2-progress.json`;
  Iteminfo data revision `1023241`, doc revision `966449`, datagen revision
  `1023234`.
- The semantic verifier reports 249 positive item→Buff assertions across 167
  Buffs and 233 verified empty Buff groups. It rejects drift in the generated
  data declaration, the `buffType`/Buff ID documentation, or the datagen
  `convertToJsonData` mapping.
- Replay `.local/tmp/buff-partial-contract-replay-20261001-v9.json` has SHA-256
  `sha256:2328ce558139529454492f97df7db327de227c549b0e59ecb74e94d834e8e204`.
  It builds 388 baseline-bound plans, replaces all 388 `sourceItems` and
  `immuneNpcs` groups, preserves 360 `inflictingNpcs` groups, and admits
  `400/400` records to the strict normalizer. A narrow normalizer regression
  now allows the complete independent immunity alternate to replace a
  target-mismatched page group; it does not manufacture inflicting facts.
  Twelve new Buff IDs `389–400` still have no historical baseline and cannot
  receive invented empty facts.
- No landing, maint, relation, projection, packet, permit, scheduler,
  Redis-control, standardized-data, or database write was performed. Canonical
  ingestion remains blocked.

### Task 9: Preserve NPC-page infliction identity across Wiki variants

- [x] Add RED/GREEN parser regressions for debuff probability/duration suffixes
  such as `Darkness / 25%` and `Electrified / 5`, while retaining the raw field
  as evidence.
- [x] Ignore pipes and assignments inside HTML comments when parsing infobox
  fields; this keeps the Wall of Flesh summary `auto=113` bound to the correct
  NPC instead of a commented example.
- [x] Merge all infliction rows rendered under one stable NPC auto ID and keep
  per-fact page/revision provenance. Stable ID/internal-name identity wins over
  display-name deduplication, including negative IDs and same-name variants.
- [x] Mark shared-page variants with no own debuff row as unresolved scope gaps;
  never certify them as empty infliction groups. Explicit no-page exclusions
  remain separate from these gaps.
- [x] Run the v6 revision-bound NPC capture verifier and a read-only replay with
  the verified `factsByBuffId` map. The verifier covers 511 targets, 443 unique
  raw pages, 753 page-backed NPC records, and 9 explicit exclusions; it emits
  112 positive facts and 70 unresolved shared-page variant gaps.
- [x] Confirm full replay retention and no-loss behavior. Replay
  `.local/tmp/buff-partial-contract-replay-20261001-v13.json` has SHA-256
  `sha256:10c7df07c4e5738726180afd917c33699044d50e81e32d9f8df9108b4024aaef`:
  `112/112` NPC-page facts are retained, strict normalizer admission is
  `400/400`, 388 baseline-bound plans build, 28 inflicting groups can be
  replaced, 360 remain baseline-preserved, and IDs `389–400` still have no
  historical baseline.
- [x] Keep the capture as positive evidence only. Its completeness is
  `complete-exhaustive-npc-page-scope-with-exclusions-and-unresolved-variants`,
  so it cannot authorize exhaustive inflicting-NPC replacement or an executable
  full-chain envelope. No crawler, landing, maint, relation, projection,
  packet, permit, scheduler, Redis-control, standardized-data, or database
  write was performed.

### Task 9 continuation verification — 2026-10-01

The parser/source-composition review correction was re-run against the retained
revision-bound v6 capture without a network request. The verifier now emits a
`source.factSources` list for every composed Buff record so facts from multiple
NPC pages retain their own page ID, revision ID, and revision timestamp. The
builder also requires the forward and `factsByBuffId` reverse identity sets to
match exactly; a missing or extra reverse fact fails closed.

- Verifier artifact `.local/tmp/buff-npc-infliction-verified-20261001-v3.json`
  has SHA-256
  `sha256:a470cecc383ef56301ceda3643e68a814c8d034b6ec35f2caaf11d23957e2ccd`.
  It covers 511 target pages, 443 unique raw pages, 753 page-backed NPC rows,
  9 explicit exclusions, 112 positive `inflicts` facts, and 70 unresolved
  shared-page variant gaps.
- Replay artifact `.local/tmp/buff-partial-contract-replay-20261001-v14.json`
  has SHA-256
  `sha256:3f718ccb24e28ff7335925f3222e44894a0cbf1fe69040508d5f6991c88e7280`.
  It retains `112/112` verified facts, admits `400/400` records to the strict
  normalizer, builds 388 baseline-bound plans, replaces 28 inflicting groups,
  preserves 360 inflicting groups from the active baseline, and reports zero
  plan errors. Buff IDs `389–400` still have no historical baseline.
- The complete Buff focused suite passes `263/263`; all touched modules pass
  `node --check`. No landing, maint, relation, projection, packet, permit,
  scheduler, Redis-control, standardized-data, or database write occurred.
- A read-only scope-gap classifier groups the 70 unresolved variants into 25
  raw pages (7 redirected/shared-page groups and 18 same-page variant groups).
  Every group has another inflicting infobox but no variant-owned debuff field;
  the classifier artifact is
  `.local/tmp/buff-npc-infliction-scope-gap-classification-20261001-v1.json`
  with SHA-256
  `sha256:e7c46726eb70a0344a898ae606b9363992879e59900a8c6f41e34ec40e0183e2`.
  This does not authorize a new replacement capture or canonical write.
- A bounded read-only MediaWiki API discovery covered the 70 gaps with two
  requests and 100 unique titles. It found 13 redirects and only two exact
  internal-name page hits (`Golem`, `Slimer`); no independent variant
  infliction source was available. Artifact:
  `.local/tmp/buff-npc-variant-page-discovery-20261001-v2.json`, SHA-256
  `sha256:01dd761f3d6e64e6fd0e0cf8b75fbaf1344534420c5c1dee26fcf2b631eb0640`.
  API reachability alone does not reopen the replacement gate.

### New-ID insert-only evidence continuation — 2026-10-01

- [x] Run a fresh authenticated read-only preflight before a bounded source
  capture. Artifact `.local/tmp/buff-new-id-preflight-20261001T110117Z-v2.json`
  has SHA-256
  `sha256:6a7be9cadbcbc70add143330ba2ff4be3954b27ce7f975330cd8d070123a7173`;
  scheduler is disabled, live attempts/claims are `0/0`, reconciler is
  healthy, and no Buff writer is active.
- [x] Capture the seven missing page targets for Buff IDs `389–394` and `396`
  through the monitor-visible `buff-page-immunity-refresh` path. Capture
  `.local/tmp/buff-new-id-page-capture-20261001-v1/` is completed with 7
  targets across 6 raw revision-bound pages; its manifest SHA-256 is
  `sha256:59c4d724837cd899738a4a81d28d68a5c8cf9a221acac776fa1a91936132f336`.
- [x] Rebuild the 12-ID insert-only diagnostic with the actual Iteminfo and
  expanded Npcinfo contracts plus all retained page captures. Diagnostic
  `.local/tmp/buff-new-id-insert-contract-diagnostic-20261001-v2.json` has
  SHA-256
  `sha256:65d6f8082591afff76b66322de05433d3ec855fcb7a17c4fc58a5f2106229a72`.
  All 12 source-item groups are complete and the normalizer accepts all 12;
  five immunity groups come from page evidence and seven from the complete
  Npcinfo alternate. Every one of the 12 `inflictingNpcs` groups remains
  `section_missing`, so no empty infliction group is certified and no
  insert-only executable envelope can be created.
- [x] Keep new-ID publication blocked. The capture is source evidence only;
  no landing, maint, relation, projection, candidate, packet, permit,
  scheduler, Redis-control, standardized-data, or database write occurred.

### New-ID NPC scope audit continuation — 2026-10-01

- [x] Replay the retained 511-page NPC capture against selected Buff IDs
  `389–400` and record positive-hit and unresolved-scope counts.
- [x] Record the result as `empty-unproven` when no selected positive fact is
  found but shared-page variants remain unresolved. The artifact
  `.local/tmp/buff-new-id-infliction-scope-audit-20261001-v1.json` has SHA-256
  `sha256:bf6c7288b9b0605d199dae8539ab4972f7147d34f281fb94734d2cd61c006452`;
  it covers 511 target pages, 443 unique raw pages, 753 page-backed NPC rows,
  9 exclusions, and 70 unresolved gaps, with zero selected positive facts.
- [x] Keep insert-only publication blocked. A complete negative scope contract
  or variant-owned evidence is still required before an empty inflicting-NPC
  group can be inserted for IDs `389–400`.

### Positive infliction additive continuation — 2026-10-02

- [x] Add RED/GREEN regressions for a partial plan that preserves the active
  `inflictingNpcs` baseline, appends revision-bound positive NPC-page facts,
  deduplicates an already-present identity, and remains `executable=false`.
- [x] Thread the additive contract through partial normalization, baseline
  application, landing binding, secondary relation validation, and projection
  propagation. Complete replacement groups remain replacement-only; additive
  facts are used only when the source group is expected-preservation state.
- [x] Run a fresh read-only replay using the retained Iteminfo, expanded
  Npcinfo, and NPC-page captures. Replay
  `.local/tmp/buff-partial-contract-replay-20261002-v17.json` has SHA-256
  `sha256:20e8c4f9265618dae65a4df8adf1b63ab87fd5345a67a80138e94d996c861da0`.
  It reports `400/400` strict normalizer admission, 388 baseline-bound plans,
  zero plan errors, 360 preserved inflicting groups, six additive groups with
  six positive facts, and `112/112` verified NPC facts retained. Buff `37`
  contains the additive identity `WallofFlesh (113) -> Horrified (37)` with
  page `Wall of Flesh` revision `1032375`.
- [x] Run the Buff/NPC/capture/relation regression: `363/363` passed;
  touched modules pass `node --check` and `git diff --check` passes.

The additive contract is still diagnostic and non-executable. The 70
shared-page variant gaps, 360 baseline-preserved groups, and missing baselines
for Buff IDs `389–400` continue to block the full landing → maint → relation →
projection chain. No landing, maint, relation, projection, packet, permit,
scheduler, Redis-control, standardized-data, or database write was performed.

### Task 10: Review repair — stable identity, reverse coverage, and raw provenance — 2026-10-02

- [x] Add RED/GREEN regressions for conflicting additive identities. A partial
  merge now fails closed when one stable NPC ID is paired with different
  internal names, or one internal name is paired with different stable IDs;
  exact identities still deduplicate.
- [x] Require every partial `inflictingNpcs` additive fact to have exactly one
  active (`status=1`, `deleted=0`) `npc_buff_relations` candidate row with the
  same Buff/NPC identity and `inflicts` direction. Missing or ambiguous reverse
  coverage fails before candidate delta construction.
- [x] Bind complete NPC-page facts to verifier-emitted source descriptors. The
  capture verifier now emits one `factSources` descriptor per resolved page and
  raw SHA-256, every fact carries `sourceRawSha256`, and forward/reverse maps
  reject page, revision, timestamp, or raw-hash drift. Partial wrapper and
  declared `factSources` identities also fail closed when malformed or absent.
- [x] Re-run the verifier against the retained capture without network access:
  `.local/tmp/buff-npc-infliction-verified-20261002-v4.json`, SHA-256
  `sha256:f8a8b9e7f721b9b976c8c335bd9cbc654a7ea25b65b91bb325b3fe7d96a61923`.
  It contains 112 positive facts, 70 unresolved gaps, 9 exclusions, and raw
  hash descriptors for all resolved capture pages.
- [x] Run the full read-only Buff/NPC/parser/relation regression: `367/367`
  passed. All modified `.mjs` files pass `node --check`; `git diff --check`
  passes.
- [x] Re-run the retained source replay without network or writes:
  `.local/tmp/buff-partial-contract-replay-20261002-v19.json`, SHA-256
  `sha256:042af9250675b17073bd5a77c7373370dcd93edd16b8be01bec9ba9d5f17debb`.
  It reports `400/400` normalizer admission, 388 baseline-bound plans, zero
  plan errors, 360 preserved inflicting groups, six additive groups with six
  facts, and `112/112` retained NPC facts.

The complete NPC-page capture still has exclusions and unresolved shared-page
variants, so it remains positive evidence rather than an exhaustive replacement
source. Canonical ingestion remains blocked; no landing, maint, relation,
projection, packet, permit, scheduler, Redis-control, standardized-data, or
database write was performed.

### Task 11: Bind unkeyed top-level NPC infoboxes without widening variant scope — 2026-10-03

- [x] Add RED/GREEN coverage for a page whose primary NPC infobox has no
  `auto` parameter while a later hidden infobox repeats the primary ID. The
  resolver now binds the unkeyed row only when it is the single unkeyed
  infobox and its normalized name matches the requested page/entity; ambiguous
  unkeyed blocks still fail closed.
- [x] Apply the same identity resolver in single-page extraction and complete
  capture verification. This preserves page, revision, and raw-hash binding;
  it does not copy a debuff from one stable NPC ID to another.
- [x] Replay the retained revision-bound capture without network or database
  writes. Verifier artifact
  `.local/tmp/buff-npc-infliction-verified-20261003-v7.json` has SHA-256
  `sha256:813ce0fb049bf5c1cbbd5d412c1c7e951cb87ae211588278ac4c9af3c1ebadd3`;
  it emits 114 positive facts and 68 unresolved shared-page gaps. The new
  facts are `Golem (245) -> On Fire! (24)` and `MoonLordHead (396) -> Moon Bite
  (145)` from their unkeyed named top-level infoboxes.
- [x] Re-run the offline partial contract replay. Artifact
  `.local/tmp/buff-partial-contract-replay-20261003-v20.json` has SHA-256
  `sha256:bb515aca5c2cabb07d453f7a876942855d2128ab874e62081cccba78d4a7698f`;
  it retains 114/114 facts, builds 388 baseline-bound plans, preserves 360
  inflicting groups, and keeps six additive groups/six additive facts. The
  Golem and Moon Lord facts already exist in the active baseline and therefore
  are deduplicated rather than counted as new writes.
- [x] Query the MediaWiki Cargo schema read-only. Artifact
  `.local/tmp/buff-wiki-api-schema-discovery-20261003-v1.json` has SHA-256
  `sha256:29cbddad67e589fa44d5a8f98ce98edffb7f9d569839a48719289e82f1e625dc`.
  The API exposes an `NPCs` table with identity/stat/immunity fields but no
  `debuff` or `inflicts` field; the requested `NPC infobox` Cargo table does
  not exist. The API is therefore source access, not a complete relation
  authority for shared variants.
- [x] Reclassify the remaining scope gaps against the new verifier output.
  `.local/tmp/buff-npc-infliction-scope-gap-classification-20261003-v2.json`
  has SHA-256
  `sha256:0c5cb51838426d626e9312ee352fb571c21983212a43ab5cf2b3108cb104d9b5`;
  it records 68 gaps across 25 raw pages (7 redirected/shared and 18 same-page
  groups), with positive owners on every group. No group is promoted to an
  empty or replacement infliction set.

The remaining 68 shared-page gaps are still unresolved because their own
variant infoboxes have no debuff field and no independent API/Cargo relation
source. IDs `389–400` remain without historical baselines and with
`inflictingNpcs=empty-unproven`. Canonical landing → maint → relation →
projection ingestion remains blocked; no runtime or database write occurred.

### Task 11 continuation verification — corrected Insource discovery — 2026-10-03

- [x] Query each of the 68 unresolved stable NPC IDs with the bounded MediaWiki
  search expression `insource:"npc infobox" insource:"auto=<id>"` instead of
  relying on exact internal-name page titles.
- [x] Fetch the search candidates' current revision identities and parse their
  NPC infoboxes. Count a fact only when the `debuff` row's `sourceInfobox.autoId`
  equals the requested stable NPC ID.
- [x] Record the read-only result in
  `.local/tmp/buff-npc-variant-insource-discovery-20261003-v1.json` (SHA-256
  `sha256:229dc8c6c639d2f13765d45ab7b348d3dcc3ce8472ea29703c529bc9cf7cdfd7`)
  and audit `docs/audits/2026-10-03-buff-npc-variant-insource-discovery.md`.

The result is `68/68` IDs with search hits and revision-bound matching
infoboxes, across 28 unique shared or language pages, but `0/68` variant-owned
infliction facts. This confirms API source/revision reachability while leaving
the scope gaps `unknown`; it does not authorize an empty group, replacement,
insert-only candidate, or canonical write. Temporary runtime sessions were
stopped before discovery and no landing, maint, relation, projection, packet,
permit, scheduler, Redis-control, standardized-data, or database write occurred.

### Task 11 continuation verification — structured-source probe — 2026-10-03

- [x] Freeze revision-bound summaries for `NPC_ID`, `NPCs`,
  `Module:Npcinfo/data`, `Module:Npcinfo/datagen`, and `Template:NPC infobox`.
- [x] Record the probe in
  `.local/tmp/buff-npc-structured-source-probe-20261003-v1.json` (SHA-256
  `sha256:81f4ea9e514ccbaaf6839d2fcc8d3fde189ffbc7185e9ee64cb6fa9dac8e04e9`).

The probe confirms that `NPC_ID` is a redirect, `NPCs` has no stable
NPC-to-debuff relation, Npcinfo data/datagen are immunity-only, and the NPC
infobox template is absent from the API. Together with the Cargo schema result,
this closes the cheap structured-source branch without certifying empty
inflicting-NPC groups. The 68 scope gaps and missing `389–400` baselines still
block canonical ingestion.

### Task 14: Close the shared-page variant scope contract — 2026-10-03

- [x] Add a pure, read-only scope contract that assigns every unresolved stable
  NPC ID exactly one of `variant-owned-positive`,
  `variant-owned-complete-empty`, or `unknown`.
- [x] Require positive facts to bind the requested stable NPC ID,
  `internalName`, page title/ID, revision ID/timestamp, and raw SHA-256. Facts
  owned by another infobox identity are retained only as diagnostic owner IDs;
  they cannot be copied to the requested variant.
- [x] Allow `variant-owned-complete-empty` only when an independently supplied
  exhaustive revision-bound source has zero facts. Missing or shared-page scope
  remains `unknown` and preserves the active baseline.
- [x] Revalidate the retained partial replay and the 389–400 missing-baseline
  fence before emitting the contract. No executable candidate or runtime write
  may be produced.
- [x] Generate the bounded contract artifact and audit:
  `.local/tmp/buff-npc-variant-scope-contract-20261003-v1.json` and
  `docs/audits/2026-10-03-buff-npc-variant-scope-contract.md`.

Task 14 result: all 68 groups are `unknown`, with `68/68` baseline preservation;
no variant-owned positive or complete-empty group is currently proven. The replay
retains `114/114` facts, preserves 360 inflicting groups, leaves Buff IDs
`389–400` without baselines, and remains `executable=false` and
`databaseWrites=false`. Canonical landing → maint → relation → projection
ingestion remains blocked. The focused Task 14 and existing Buff/NPC/parser/
relation/full-chain/manifest regression passes `311/311`; touched modules pass
`node --check` and `git diff --check`.

### Task 16: Close the Item maint dependency readiness contract — 2026-10-06

Resume source: Codex session `01a10936-edff-70c0-b375-7cfcacc3d19a`.
Continue the existing Buff branch and retain all prior dirty paths. Scope is
the pure Item dependency classifier, focused tests, one reproducible local
read-only replay, audit, and this entry's handoff state. It does not change
shared sync/catalog code or authorize Item/Buff publication.

- [x] Confirm branch/HEAD and MySQL identity match the recorded handoff.
- [x] Confirm three missing-readiness assertions fail before implementation.
- [x] Implement exact Iteminfo source-ID/name joins against complete maint
  snapshots; keep local auto-increment IDs as evidence only. Missing source,
  duplicates, name/ID conflict, inactive rows, and unknown state fail closed.
- [x] Replay the frozen Iteminfo capture against a fresh READ ONLY transaction,
  deriving six missing Item previews through the existing maint extractor.
  Bind raw/manifest hashes and preserve existing canonical identities.
- [x] Run focused Item/Buff lineage and maint regressions, syntax checks,
  runtime readback, and `git diff --check`. Record the concrete owner/full-chain
  dependencies; do not generate an executable packet or enable the scheduler.

Task 16 result: classifier tests `11/11`; related tests `99 pass / 1 existing
skip / 0 fail`. Artifact `.local/tmp/buff-item-maint-readiness-20261006-v3.json`
is blocked and non-executable with six source-derived maint previews, six
exact active maint dependencies, and one spelling drift at `1340`. All insert
identities remain null. Durable audit:
`docs/audits/2026-10-06-buff-item-maint-readiness.md`. Next is the separately
bounded Item-owned landing/maint executor, then the unchanged NPC immunity
and Buff zero-baseline/full-chain gates.

### Task 17: Implement the six-Item landing/maint insert core — 2026-10-06

Scope: game IDs `6148/6149/6155/6161/6164/6173` only. Use a fresh
`canonical.buff-item-dependency.<runId>` landing namespace; preserve the
existing `wiki.module.iteminfo` landing and all existing maint rows. This
core is not a registered command or permission to publish.

- [x] Write failing source/scope, receipt, locked-rederivation, after-set,
  rollback, and uncertain-commit tests before implementation.
- [x] Bind the verified Iteminfo semantic capture and derive a six-row Lua
  payload with the original generation/version metadata. Reject source-ID,
  name, baseline, or namespace conflicts before any writes.
- [x] Implement the transactional insert core using fixed columns, a real
  landing receipt, six distinct maint receipts, source rederivation under
  lock, mandatory prepared/terminal evidence, and exact readback.
- [x] Replay the proposal with fresh SELECT-only snapshots and API preflight;
  run focused regressions, syntax checks, and `git diff --check`.
- [x] Record the concrete registration/packet/permit dependencies and retain
  the independent `1340`, NPC immunity, and Buff full-chain gates.

### Task 18: Register the six-Item canonical runner — 2026-10-06

The Item insert proposal is concrete. User scope confirmation is pending for
real publication; implementation and tests continue under AUTH-03. The
registration itself must not create a packet, acquire a fence, or write DB.

- [x] Add RED tests for catalog/manifest source/proposal/fence binding,
  ordinary-file capture reads, runtime Owner/server/policy/fence checks,
  immutable journal publication, and independent after-commit readback.
- [x] Register a dedicated runner and code/data bundle for Task 17; forbid
  generic Item sync, local Item updates, scheduler writes, DDL, and H8 drift.
- [x] Use mandatory immutable journal phase files and readback before fence
  release. Before the business transaction, commit both exact fence tokens
  with the maximum MySQL DATETIME deadline in a separate locked transaction,
  with immutable prepared/committed hold evidence. Unknown COMMIT/ROLLBACK,
  process loss, or failed independent readback retains both holds until
  explicit reconciliation; it must not replay SQL. Test elapsed ordinary TTL,
  competing acquisition, hold failure, and readback-before-release ordering.
- [x] Reproduce packet expiry during lock waits and before COMMIT, then
  recheck authorizedAt/expiresAt before preparation, permit, and COMMIT.
- [x] Run the focused governance/runner regressions and update current spec,
  audits, and devlog. The runner may exist while real publication is blocked.
- [x] After scope confirmation only: fresh preflight, source/baseline
  rederivation, fresh request/packet/permit/fences, serial dispatch and exact
  post-commit readback. If any gate fails, record evidence and repair that gate.

### Task 19: Governed retirement of exact duplicate legacy NPC inflicts — 2026-10-07

Goal: prepare an owner-reviewable, source-bound request to retire only the five
extra active `npc_buff_relations.inflicts` rows found in Task 30. Keep the
source-order canonical row regardless of ID, and preserve every unrelated
Buff/NPC relation. This task
The preparation phase ended at `AWAITING_OWNER`; the approved execution and
independent readback are recorded in the audit addendum and Buff devlog below.

The keeper is the relation row whose `record_key` is derived from the first
matching identity in the current `maint_buffs.raw_json.inflictingNpcs` source
order, using the relation generator's existing `npc_buff_relation` key
contract. The current observed keepers are IDs `904`, `444`, `471`, `773`, and
`575`; the corresponding proposed retirements are `1219`, `393`, `627`, `232`,
and `457`. IDs are evidence, not the selection rule. The proposal binds the
five active maint source rows and their raw JSON snapshot; the executor must
lock and compare that source snapshot and the full active relation baseline
before consuming the permit. It must then rederive each pair and require
exactly two active rows with identical business and lineage fields except
`id` and `record_key`, with exactly one row matching the derived keeper key.
It may only soft-retire those five rows by changing `status=1/deleted=0` to
`status=0/deleted=1`. It must not delete records, insert relations, change
relation/projection JSON, alter immune facts, or touch any other row.

- [x] Add a failing-first pure proposal/validation contract for the exact five
  duplicate pairs, source facts and raw-page hashes, active-row baseline,
  maint source snapshot, source-derived keeper keys, and expected after-set.
- [x] Implement a separate registered `canonical-buff-npc-infliction-dedup`
  operation with exact proposal/code binding, target-scoped runtime fence,
  locked maint/source rederivation, immutable transaction journal, fixed-column
  soft retire, and independent readback. Reuse existing governance helpers
  without widening the additive or NPC immune operations.
- [x] Verify catalog/manifest registration and focused transaction/recovery
  tests (17/17 focused; 421/421 Buff fetch/relation/automation regressions);
  keep the item and immune tables outside operation ownership.
- [x] Capture current source and affected-row evidence in a verified
  read-only MySQL transaction, prepare the exact proposal and
  `AWAITING_OWNER` request, and record both hashes in
  `docs/audits/2026-10-07-buff-npc-infliction-dedup.md` and the Buff devlog.
- [x] Execute only after the approved scope, fresh server/policy/source/relation
  preflight, fresh packet/permit, exact runtime fence, and independent readback
  gates pass. Retry-03 completed the five-row soft retirement; two earlier
  dispatch attempts failed closed or rolled back without business mutation.

### Final validation and closeout

- [x] Run `git status --short` and preserve all pre-existing dirty paths.
- [x] Run `git diff --check` and every focused/broad test listed above.
- [x] Confirm no landing, maint, projection, scheduler, or Redis-control write
  occurred; the only Task 19 relation write was the approved five-row soft
  retirement after every execution gate passed.
- [x] Update the existing Buff devlog with observed, recorded and unknown facts.
- [x] Do not commit or push in this execution; leave the branch handoff-ready.
