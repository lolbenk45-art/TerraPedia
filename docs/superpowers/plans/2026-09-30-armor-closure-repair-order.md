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

- [ ] First create revision-bound `source_evidence` landings for both module and image datasets. The current live rows are `legacy_compat` (module parse `ok` without a revision; images `partial` without a revision), and `buildArmorCanonicalMaintCandidate` must reject them before any diff is trusted. Reuse the completed `.a63-20260927-33` image-cache result; do not repeat uploads or relabel old rows in place.
- [ ] Re-derive all 64 source records and correct the 15 stored combinations with the source's nonzero head/body/legs IDs; preserve stable identities where the record key remains unchanged and retire only superseded rows.
- [ ] Insert the ten missing module members (five Shroomite pieces and five affected legs after deduplication) into the candidate model only after maint item identity, slot and active status checks pass.
- [ ] Reconcile the ten current relation-attribute omissions and the two MiningHelmet rows (item 88) as named source decisions. Reject duplicate active attribute owners until one revision-bound row is selected.
- [ ] Add a report that lists every expected member, current member, current attribute, current effect and projection status; a zero missing set is required for the frozen denominator.
- [ ] Run candidate, locked-rederivation and projection tests with fixtures containing variants, retired rows, duplicate attributes and missing legs. Produce a read-only proposal before any apply packet.

## Phase 3 — complete versioned item and set semantics

**Files:** `pipelines/relation/armor-shroomite-source-candidate.mjs`,
`pipelines/maint/armor-item-effect-maint-candidate.mjs`, attribute source adapters and their tests.

- [ ] Freeze compatible source revisions and game-version applicability for Iteminfo, ArmorSetBonuses, attribute page, Shroomite item pages and images.
- [ ] Resolve every qualified historical Shroomite cell with current authoritative evidence or leave it explicitly blocked; never coerce `>15%`/`>20%` to a number.
- [ ] Model headpiece effects as `multiply`, `1.12`, `multiplier`, with exact weapon/ammunition conditions. Model set-owned stealth once at the set owner and exclude equipped totals from effect rows.
- [ ] Resolve Mining Helmet/Pants identity and every non-Shroomite missing item fact under the same manifest. Require defense, slot, attribute and source lineage checks.
- [ ] Add negative tests for mixed revisions, missing conditions, old generic 15% rows, duplicate set effects and stale qualified cells. The candidate must remain blocked when any required fact is unresolved.

## Phase 4 — publish typed effects through an owned downstream operation

**Files:** `pipelines/relation/sync-maint-to-relation.mjs`,
`pipelines/relation/armor-canonical-transaction-executor.mjs`,
`pipelines/relation/run-armor-set-projection-incremental.mjs`, a new typed-effect publication executor and tests, plus the registered operation manifest.

- [ ] Define ownership for typed maint rows, relation item effects, secondary relation/projection effects and retirement of superseded `armor_attribute_cell` rows. Keep general sync's fail-closed guard until the new executor is the only authorized path.
- [ ] Add locked rederivation from landing bytes and maint IDs, exact stable record keys, insert/readback/retirement sets, and a single transaction boundary for the downstream tables it owns.
- [ ] Extend projection candidate and independent validator to require complete coverage and typed lineage; preserve the `complete-item-and-set-coverage-unverified` blocker until Phase 2/3 reports clear it.
- [ ] Test fresh apply, exact replay, partial replay, stale source, owner mismatch, generated-ID drift, rollback and uncertain commit. Do not consume an old proposal or permit.

## Phase 5 — backend API contract

**Files:** `services/catalog-api/src/main/java/com/terraria/skills/controller/AdminArmorAttributeController.java`,
`AdminArmorSetController.java`, `PublicItemServiceImpl.java`,
`PublicItemEquipmentEffectDTO.java`, `PublicArmorSetAggregateService.java`, and focused Java tests.

- [ ] Replace hard-coded `source_kind = 'armor_attribute_cell'` filters with the governed accepted source-kind set and expose source kind/lineage where admin auditing needs it.
- [ ] Select, map and serialize `condition_text`, operation, unit, decimal bounds, variant label and raw text consistently for item effects. Keep set-owned effect mapping separate.
- [ ] Add controller/service tests proving `armor_item_page` rows appear in counts, item details and armor-set aggregate piece effects while stale generic rows are retired.
- [ ] Run focused Maven tests for all changed service/controllers, then use authenticated admin and public API readback against the real local database.

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
