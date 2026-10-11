# Armor Closure Repair Order

> **For agentic workers:** implement only after the audit gates in this plan are reviewed. Keep each phase in a focused commit and re-run the stated checks before advancing.

**Goal:** close Armor source-to-landing-to-maint-to-relation-to-projection-to-API/UI and automatic retry acceptance for an explicitly frozen source/version and coverage denominator.

**Architecture:** repair the source parser and evidence binding first, then rebuild the canonical set/member baseline and resolve all item facts under one versioned coverage manifest. Publish typed item effects through an explicitly owned downstream executor; update API/UI consumers only after the persisted relation contract is fixed. Integrate the composite source fingerprint and recovery journal last, with scheduler acknowledgement gated on final readback.

**Tech Stack:** Node.js pipelines and Node test runner, MySQL read-only/transactional runners, Spring Boot JDBC services, Nuxt/Vue composables, local scheduler V2 artifacts.

---

## Closure definition

The work is closed only when all of the following are true for the frozen target version:

1. A source manifest enumerates every accepted Armor set variant, single-piece display item, item attribute fact, typed item effect, image fact, source revision and game-version applicability. Every accepted member has one stable item identity and one valid part role.
2. The parser output, raw source evidence, standardized rows, maint rows, relation rows and projection rows are independently rederived and hash-bound. No stale or old-version row is accepted silently.
3. Typed item effects have an owned publication executor and are visible in relation, projection, admin and public API responses with condition, operation, unit and lineage intact.
4. The public UI preserves conditions and computes add, multiply and conditional values according to the operation contract without duplicate set totals.
5. Automatic dispatch carries the composite source fingerprint, publishes the same owned chain, acknowledges only after final readback, and recovers interrupted PREPARED/commit/result states without blind retry or permit reuse.
6. Read-only DB inventory, authenticated admin/public API checks, browser checks and interruption/idempotency tests all pass. A unit-test total alone is not closure evidence.

## Phase 0 — freeze scope and add failing diagnostics

**Files:** `docs/audits/2026-09-30-armor-closure-gap-audit.md`,
`docs/audits/2026-09-30-armor-closure-gap-evidence.json`,
`pipelines/fetch/fetch-wiki-armorsetbonuses.test.mjs`,
`pipelines/fetch/armor-set-source-evidence.test.mjs`.

- [x] Add a fixture whose first Initialize statement is Shroomite and assert the parser returns all 64 records, including all three variants and five unique IDs.
- [x] Add a source-evidence test that changes `sets`, `setCount`, `uniqueItemIds` or `primaryPart` between raw rederivation and standardized output and assert rejection.
- [ ] Record the frozen revision tuple and the explicit 243-ID module denominator plus separately governed single-piece/module-external scope. Do not use the current 233-member count as the denominator.
- [ ] Run `node --test pipelines/fetch/fetch-wiki-armorsetbonuses.test.mjs pipelines/fetch/armor-set-source-evidence.test.mjs`; expected result is RED before implementation because the current parser and evidence helper accept the bad cases.

## Phase 1 — repair parser and source evidence

**Files:** `pipelines/fetch/fetch-wiki-armorsetbonuses.mjs`,
`pipelines/fetch/armor-set-source-evidence.mjs`, their tests, and the source manifest builder used by the fetch runner.

- [x] Make Initialize extraction tokenize the function body independently of the declaration so the first `Create`/`Add` statement cannot be swallowed.
- [x] Reparse raw module bytes inside `buildArmorSetSourceEvidence`, compare complete normalized records (ordered sets, IDs, counts, primary part, text key and benefit), and bind the raw content hash and revision to that exact result.
- [x] Remove the obsolete `蘑菇矿盔甲` placeholder; retain explicit placeholder reasoning only for genuinely non-module display sets.
- [x] Run the Phase 0 tests plus the fetch/source evidence suites. No database write was used in this phase.

## Phase 2 — rebuild canonical member and set baseline

**Files:** `pipelines/maint/armor-canonical-maint-candidate.mjs`,
`pipelines/relation/armor-canonical-relation-candidate.mjs`,
`pipelines/generate/armor-set-definition-source.mjs`, corresponding tests and a new coverage manifest fixture.

- [ ] First create revision-bound `source_evidence` landings for both module and image datasets. The current live rows are `legacy_compat` (module parse `ok` without a revision; images `partial` without a revision), and `buildArmorCanonicalMaintCandidate` must reject them before any diff is trusted. Retain `.a63-20260927-33`'s verified 315-file/419-row cache evidence for the 63 covered sets, but do not promote it as complete: its producer denominator is 63 and it omits `ArmorSetBonus.Shroomite`. A fresh revision-bound image source bundle must cover all 64 module keys and may reuse already verified bytes without repeating uploads.
- [ ] Before extraction, bind the image payload `totalArmorSets` denominator to the module set-key count. Reject producer-level denominator drift while preserving individual source-image removal as historical retention/removal review. Fixture coverage must include a module set added without matching image evidence and a matching multi-set image payload.
- [x] Re-derive all 64 source records and correct the 15 stored combinations with the source's nonzero head/body/legs IDs; preserve stable identities where the record key remains unchanged and retire only superseded rows. Attempt `20261004-05` committed 45 inserts/30 retirements; all 15 parent and projection snapshots now match source. Readback: `reports/runtime/armor-review-20261001/armor-tuple-repair-readback-20261004.json`.
- [ ] Add the five still-missing Shroomite item identities (`1546`-`1550`) only after a canonical maint owner and exact item lineage are established. The five formerly missing historical legs now exist; the remaining nine source tuples all belong to Shroomite.
- [ ] Reconcile remaining source-to-relation attribute omissions and full projection coverage. Mining IDs `88`, `410`, and `411` have since been repaired and API-read back; the whole 243-member attribute denominator remains unverified.
- [x] Apply and read back the Mining identity/owner decision from the 2026-10-01 audit. Canonical values are Helmet `88` defense `2`, Shirt `410` defense `1` with `+10%` mining speed, and Pants `411` / `MiningPants` / `legs` / defense `1`; the source-table Shirt value `2` remains historical evidence. Fresh API GETs returned one matching row each. See `docs/devlog/entries/2026-09-30-armor-closure-gap-audit.md`.
- [x] Add a report that lists every expected member, current member, current attribute, current effect and projection status. The report is `.local/tmp/armor-member-coverage-20261001-01.json`; it records the nonzero missing set and therefore does not clear the zero-missing acceptance gate.
- [x] Re-run the read-only tuple inventory with `maint_armor_sets.record_key` as
  the relation owner key. The frozen revision has 494 nonzero source tuples
  versus 470 active relation tuples: 440 matched, 54 missing, and 30 extra;
  Shroomite is absent and 17 historical zero-head/zero-leg groups require
  explicit review. Evidence: `.local/tmp/armor-source-relation-tuple-delta-20260930-01.json`.
- [x] Generate a separate no-write Mining attribute candidate using the
  independent identity correction contract. The candidate binds corrected
  `Mining Pants.png` to item 411 and reports duplicate item-88 owners, item-410
  defense drift, relation semantic drift, and missing item-411 lineage without
  producing change plans. Evidence:
  `.local/tmp/armor-mining-attribute-candidate-20261001-01.json`.
- [x] Produce a read-only canonical review for all 17 historical zero-head/
  zero-leg groups and the nine Shroomite missing tuples. It classifies only
  Wizard/MagicHat as source-declared zero-leg groups and leaves the other 15
  groups blocked for owner review. Evidence:
  `.local/tmp/armor-zero-slot-canonical-review-20261001-01.json`.
- [ ] Run candidate, locked-rederivation and projection tests with fixtures containing variants, retired rows, duplicate attributes and missing legs. Produce a read-only proposal before any apply packet.

**2026-10-04 historical tuple repair checkpoint:** the governed attempt
`20261004-05` is `COMMITTED` on server UUID
`b4ae6728-4f72-11f1-bcc9-00155d37eadf`. Independent read-only rederivation
maps the 494 positive source tuples at revision `964993` to 485 active relation
tuples: 485 match, nine Shroomite tuples are missing, and zero are extra. All
63 existing maint/relation owners and projections match; 63/63 public set detail
GETs return the source tuple composition. This closes only the 15 historical
misalignment groups. Shroomite owner creation, complete attribute/effect
coverage, typed-effect publication, images and automatic recovery remain open.

**Phase 2 image-source checkpoint (2026-09-30):** the fresh source-only bundle
now covers the corrected 64-set denominator and 431 image rows. Its cache
proposal reuses 315 verified historical file receipts and carries source bytes
only for the 12 new Shroomite files. The proposal is `armor-image-cache-proposal/v2`
and remains private/`AWAITING_OWNER`; this does not satisfy the revision-bound
landing or authorize an upload. Continue with the complete module/image landing
candidate only after the 243-member, Mining identity and typed-effect blockers
are resolved.

## Phase 3 — complete versioned item and set semantics

**Files:** `pipelines/relation/armor-shroomite-source-candidate.mjs`,
`pipelines/maint/armor-item-effect-maint-candidate.mjs`, attribute source adapters and their tests.

- [ ] Freeze compatible source revisions and game-version applicability for Iteminfo, ArmorSetBonuses, attribute page, Shroomite item pages and images.
- [ ] Resolve every qualified historical Shroomite cell with current authoritative evidence or leave it explicitly blocked; never coerce `>15%`/`>20%` to a number.
- [ ] Model headpiece effects as `multiply`, `1.12`, `multiplier`, with exact weapon/ammunition conditions. Model set-owned stealth once at the set owner and exclude equipped totals from effect rows.
- [ ] Resolve Mining Helmet/Pants identity and every non-Shroomite missing item fact under the same manifest. Require defense, slot, attribute and source lineage checks.
- [ ] Add negative tests for mixed revisions, missing conditions, old generic 15% rows, duplicate set effects and stale qualified cells. The candidate must remain blocked when any required fact is unresolved.

**2026-09-30 checkpoint:** the reviewed Shroomite candidate now freezes the
`1027106/1023241/964993` source tuple, requires exactly one set-owned stealth
definition, and rejects historical generic `15%` rows. Focused source/dispatch and combined
Armor regressions are green. This is a partial Phase 3 guard only; the full
same-version attribute/image manifest, Mining identity, duplicate set-effect
checks, and downstream set-effect owner are still required before this phase
can be marked complete. Evidence: `docs/audits/2026-09-30-armor-phase3-semantic-audit.md`.

## Phase 4 — publish typed effects through an owned downstream operation

**Files:** `pipelines/relation/sync-maint-to-relation.mjs`,
`pipelines/relation/armor-canonical-transaction-executor.mjs`,
`pipelines/relation/run-armor-set-projection-incremental.mjs`, a new typed-effect publication executor and tests, plus the registered operation manifest.

**2026-10-01 contract checkpoint:** `pipelines/relation/armor-typed-effect-publication.mjs`
and its `6/6` focused tests now define the relation typed-effect ownership boundary
and no-write candidate shape. The isolated
`pipelines/relation/armor-typed-effect-publication-db.mjs` executor now provides
locked rederivation, prepared/permit ordering, typed insert/update/retire,
generic preservation and post-commit readback tests (`2/2`). The operation is
now registered in the canonical catalog/manifest with a fail-closed runner and
manifest/proposal identity and execution-gate regression coverage (`4/4`), but it remains
fake-connection tested only; real permit/recovery integration and projection
readback remain open.
This checkpoint does not authorize an apply packet.

**Execution-order correction (2026-10-04):** the typed-effect owner decision is
an input to pre-apply authorization, so it may cover source completeness,
canonical ownership, semantic review and recovery ownership only. Requiring
typed rows to pass projection/API readback before the publication transaction
would make the write prerequisite depend on state that only exists after that
transaction. Keep formal operation authorization and permit consumption as
independent write gates; record relation, projection and API verification as
post-commit acceptance evidence. The executor must remain non-runnable while
any pre-apply owner/source gate is unresolved.

- [ ] Define ownership for typed maint rows, relation item effects, secondary relation/projection effects and retirement of superseded `armor_attribute_cell` rows. Keep general sync's fail-closed guard until the new executor is the only authorized path.
- [ ] Add locked rederivation from landing bytes and maint IDs, exact stable record keys, insert/readback/retirement sets, and a single transaction boundary for the downstream tables it owns.
- [ ] Extend projection candidate and independent validator to require complete coverage and typed lineage; preserve the `complete-item-and-set-coverage-unverified` blocker until Phase 2/3 reports clear it.
- [ ] Test fresh apply, exact replay, partial replay, stale source, owner mismatch, generated-ID drift, rollback and uncertain commit. Do not consume an old proposal or permit.

**2026-10-06 contract continuation:** source-effect ownership is now represented
by a no-write, classification-hash-bound decision contract, and typed recovery
ownership is bound to the exact reconciliation artifact with permit replay
disabled. A separate post-commit projection/API acceptance contract checks
condition, operation, values and lineage. The typed publication executor now
requires that contract's adapter before `BEGIN`, persists verified acceptance
after commit, and carries blocked acceptance through read-only reconciliation;
post-commit failures remain `COMMITTED_READBACK_REQUIRED` without rollback.
These contracts do not create an execution-ready proposal and remain
prerequisites for real owner evidence and full-chain runtime readback.

## Phase 5 — backend API contract

**Files:** `services/catalog-api/src/main/java/com/terraria/skills/controller/AdminArmorAttributeController.java`,
`AdminArmorSetController.java`, `PublicItemServiceImpl.java`,
`PublicItemEquipmentEffectDTO.java`, `PublicArmorSetAggregateService.java`, and focused Java tests.

- [ ] Replace hard-coded `source_kind = 'armor_attribute_cell'` filters with the governed accepted source-kind set and expose source kind/lineage where admin auditing needs it.
- [ ] Select, map and serialize `condition_text`, operation, unit, decimal bounds, variant label and raw text consistently for item effects. Keep set-owned effect mapping separate.
- [ ] Add controller/service tests proving `armor_item_page` rows appear in counts, item details and armor-set aggregate piece effects while stale generic rows are retired.
- [ ] Run focused Maven tests for all changed service/controllers, then use authenticated admin and public API readback against the real local database.

**2026-10-01 contract checkpoint:** public item equipment effects now select and
map typed bounds, operation, variant, condition and full maint/landing/source
lineage. Admin Armor attribute and set readers accept the governed source-kind
set `armor_attribute_cell` plus `armor_item_page` and expose the same lineage
fields. Focused service/controller tests are green. Real authenticated API
readback and projection evidence remain pending because the source/cache,
Shroomite owner, Mining identity and typed-publication gates are still blocked.

## Phase 6 — public UI semantics and runtime checks

**Files:** `apps/public-web/composables/useArmorSetBuilds.ts`,
`apps/public-web/utils/armorSetPresentation.ts`, `apps/public-web/pages/items/[id].vue`,
their existing armor check scripts and unit tests. Read
`docs/design/terrapedia-public-ui-design-system-v1.md` before visual work.

- [ ] Preserve condition text in summary lines, chips, tooltips and stable keys; do not let raw wiki text replace structured scoped values.
- [ ] Implement operation-aware aggregation: add values add, compatible multipliers compose, and differently conditioned values remain separate. Keep set effects out of piece totals.
- [ ] Add tests for ×1.12, ×1.20, compatible composition (1.344), incompatible conditions, additive crit/damage, and duplicate variant alternatives; assert no `2.32` result.
- [ ] Run public-web armor checks and a desktop/mobile browser check for 1546/1547/1548/411, including readable conditions, no request/console errors, no horizontal overflow and visible focus targets.

## Phase 7 — automatic dispatch and recovery

**Files:** `pipelines/automation/automatic-domain-operation-contract.mjs`,
`run-governed-l1-operation.mjs`, `run-base-domain-automatic-operation.mjs`,
the automatic artifact/reconciliation modules, operation tests and coordinator handoff.

- [ ] Replace the old Armor-only module dispatch with a composite source bundle containing page/module, Iteminfo, membership, attributes and image fingerprints plus validated probe identities.
- [ ] Route automatic execution through the Phase 4 publication plan and acknowledge only after DB, projection, API and artifact readbacks agree with the same fingerprint.
- [ ] Add recovery/resume/reconcile for killed-after-PREPARED, consumed-permit uncertainty, commit acknowledgement loss, result-write failure, complete replay, partial replay and conflicting readback. Recovery must reuse original evidence and never allocate a new permit for the same attempt.
- [ ] Keep scheduler/H8 activation coordinator-owned; hand off the exact operation ID, ownership keys, fingerprint schema, result paths and acceptance tests before shared scheduler edits.
- [ ] Run automatic artifact, operation, retry and idempotency tests; then perform one isolated runtime interruption rehearsal with scheduler disabled and no unrelated worktrees touched.

## Final acceptance and stop rule

- [ ] Generate a fresh read-only baseline and verify server UUID, scheduler/reconciler state, all expected members/effects/projections and no unresolved blocker.
- [ ] Execute focused backend/frontend/pipeline tests, authenticated admin/public API readback, and browser checks from the real local stack.
- [ ] Verify exact retry/replay behavior from fresh artifacts and inspect `git diff --check`, `git status --short`, staged scope and the Armor devlog.
- [ ] If any phase discovers a new source/version/ownership mismatch, stop the dependent phase, update the audit and this plan with the new denominator and test, then re-audit before writing production data.
