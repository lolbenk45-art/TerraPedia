# Item Source Local NPC Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to run
> this plan task-by-task. Keep all database work serial; no concurrent worker
> may write any owned table or devlog record.

**Goal:** Close the remaining Item source-evidence blocker by admitting only
strictly corroborated facts from audited local NPC snapshots into the complete
landing -> maint -> relation -> local Item-source chain.

**Architecture:** The existing Item candidate partition remains evidence of a
reverse Item-page claim, not a write source. A new selector compares that
claim with an independently audited local NPC snapshot by stable Item and NPC
identities plus source-type-specific payload fields. Only exact corroborations
become a new NPC-page source record. The new governed operation writes the
selected records atomically and inserts nothing outside its frozen attempt
root. No code may promote a same-name, family-page, or source-page-only match.

**Tech Stack:** Node.js ESM, `mysql2/promise`, current canonical authorization
framework, local MySQL schemas `terria_v1_local`, `terria_v1_maint`, and
`terria_v1_relation`.

---

## Boundaries

- Source of truth: paired local `normalized-light/npc/*.latest.json` and
  `audit/npc/*.latest.json` files accepted by `buildNpcCrawlerFactEvidence()`.
- Candidate input: the frozen `item-source-partition.json` quarantine rows.
- Allowed database targets, insert-only except for the exact local-source
  reconciliation described below and only for frozen selected keys:
  `local.source_dataset_landings`, `maint.maint_npc_crawler_facts`, relation
  `item_source_facts`, `item_source_details`, `item_npc_shop_relations`,
  `item_npc_loot_relations`, and `local.item_acquisition_sources`.
- `local.npc_loot_entries` is allowed only for selected `drop` identities and
  only where a matching canonical local row is absent.
- Out of scope: network access, the 25-row canonical NPC crawler, broad
  maint/relation/local synchronizers, direct SQL DML, updates/deletes outside
  the frozen local-source reconciliation,
  projections, candidate/reresolve apply, permit replay, cleanup, staging,
  commits, and changes to unselected snapshots.

## Exact Selector

The selector normalizes only whitespace and Unicode comparison form; it never
rewrites display text. A selected row requires all of:

1. candidate `sourceRefType=npc`, `sourceType in {shop,drop}`, exact positive
   Item ID, exact Item internal name resolved from current maint/local Item
   identity, and exact NPC source ID/internal name;
2. paired snapshot/audit hash validation, a `MATCHED` maint NPC identity, and
   a generated NPC fact with the same Item and NPC identities;
3. `shop`: exact normalized conditions. The legacy candidate partition has no
   price field, so it cannot attest price equality; the admitted price is taken
   only from the paired NPC snapshot. `drop`: exact normalized chance text,
   quantity text, and conditions, including `null` values;
4. no duplicated selector identity and no existing non-identical active target
   row.

The old candidate `sourcePage` is intentionally not compared: it is the Item
or family page that triggered investigation, while the admitted fact uses the
audited NPC page as its true provenance. All rows that fail any condition stay
in the quarantine report with a machine-readable reason.

### Frozen Local-Source Reconciliation

The first fresh read-only proposal exposed seven pre-existing local rows that
prevent an otherwise corroborated source admission. They are not new source
facts and must not be bypassed:

1. six Dryad Planter Box rows have the exact NPC, Item, source page, and
   condition payload but a null `source_revision_timestamp`; the operation may
   update only that missing timestamp from the paired audited Dryad snapshot;
2. the `MiningHelmet`/`UndeadMiner` identity has two active historical
   `12%`/`Mining armor` rows, while a soft-deleted `5%` NPC-source row exists.
   The operation may restore that exact archived row with the audited source
   page and revision, then soft-delete the two exact stale duplicate rows.

Every reconciliation row must carry a primary key, complete before image hash,
and exact after image in the proposal. The executor locks and rechecks that
image inside its single transaction. Any row-count, hash, source-payload, or
active-state drift aborts the full operation; it may not update a similarly
named row. These nine local-row updates are the sole update/delete exception
for this plan and require the new exact Owner authorization alongside the
insert rows.

## Task 1: Freeze selector behavior with red tests

**Files:**

- Create: `pipelines/relation/item-source-local-npc-admission.mjs`
- Create: `pipelines/relation/item-source-local-npc-admission.test.mjs`

- [ ] Write tests that construct candidate and snapshot facts in memory.
- [ ] Verify each test fails before implementation because the module is
  absent.
- [ ] Require exact Item ID/internal name and NPC ID/internal name.
- [ ] Require `shop` price+conditions equality and `drop`
  chance+quantity+conditions equality.
- [ ] Reject source-page-only, display-name-only, duplicate, audit-hash-drift,
  and pre-existing-nonidentical cases.
- [ ] Implement only the pure selector and canonical row builders needed to
  make the tests pass.

Expected command:

```bash
node --test pipelines/relation/item-source-local-npc-admission.test.mjs
```

## Task 2: Build a read-only proposal

**Files:**

- Create: `pipelines/relation/build-item-source-local-npc-admission-proposal.mjs`
- Modify: `pipelines/relation/item-source-local-npc-admission.mjs`
- Modify: `pipelines/relation/item-source-local-npc-admission.test.mjs`

- [ ] Read only the frozen partition, snapshot/audit pairs, and the three
  schemas through the standard local runtime configuration.
- [ ] Emit selected rows, retained quarantine rows, snapshot and audit hashes,
  per-table before fingerprints, and a canonical proposal `scopeHash`.
- [ ] Include the required landing/maint/relation/local insert rows in every
  selected record and reject candidate-count or row-hash drift.
- [ ] Verify an empty selected set produces a blocker report and cannot create
  an authorization input.
- [ ] Recompute the proposal independently from its frozen inputs and require
  byte-equivalent selected identities.

Expected command:

```bash
node pipelines/relation/build-item-source-local-npc-admission-proposal.mjs \
  --partition=<frozen-partition> --output=<run-root>/proposal.json
```

## Task 3: Add the one bounded operation and executor

**Files:**

- Modify: `pipelines/automation/canonical-operation-catalog.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`
- Modify: `pipelines/automation/build-canonical-cutover-authorization.mjs`
- Modify: `pipelines/automation/run-authorized-canonical-operation.mjs` only
  when the new result shape needs explicit validation.
- Modify: `pipelines/relation/item-source-local-npc-admission.mjs`
- Create: `pipelines/relation/apply-item-source-local-npc-admission.mjs`
- Modify: focused tests for each changed automation module.

- [ ] Register `canonical-item-source-local-npc-admission` with a dynamic,
  decision-derived attempt root
  `reports/authorization/canonical/canonical-item-source-local-npc-admission/<sha256(decision)>/`.
- [ ] Bind `input.json`, `proposal.json`, `execution-manifest.json`,
  `request.json`, `packet.json`, `permit.json`, and `result.json` to that one
  root. Proposal and its source freeze are immutable read-only inputs.
- [ ] In one transaction, lock and revalidate every frozen before fingerprint,
  apply the nine exact local-source reconciliation rows, insert missing exact
  rows in dependency order, reread all records, compare after hashes, and
  commit once. Any mismatch rolls back.
- [ ] The executor refuses missing packet/permit, a stale hash, an unexpected
  existing identity, an unlisted table, or an empty change set.

## Task 4: Fresh proposal, one authorization, and serial apply

- [ ] Generate a fresh proposal and independent rebuild after all code tests
  pass.
- [ ] Produce a bilingual exact authorization sheet: row counts by table,
  proposal SHA-256, scope SHA-256, selected source-page traces, retained
  quarantine counts, and expected readback hash.
- [ ] Obtain one new exact Owner approval for that proposal. The earlier seven
  operation approval cannot cover this new operation.
- [ ] Generate the decision-bound packet and permit, run exactly once, then
  retain result/readback evidence. On unknown transaction status, stop and
  reconcile result plus database fingerprints; never retry blindly.

## Task 5: Prove the closure and repair only owning-lane failures

- [ ] Read back landing, maint, relation facts/details, NPC shop/loot relation,
  local acquisition source, and applicable local loot entry for every selected
  identity.
- [ ] Verify each selected Item in public and Admin API payloads by Item ID and
  source identity, not display text.
- [ ] Regenerate the Item partition: selected rows must be accepted and all
  remaining rows must be explicit duplicate/quarantine/blocked classes.
- [ ] Run fresh core smoke, cross-DB, relation-health, source-chain audit,
  focused Node tests, Maven, Admin/Public checks, and the quality gate.
- [ ] Perform a plan-auditor re-review. The parent closes only when every
  independent blocker is zero; otherwise keep the exact remaining blocker in
  the devlog.

## Validation Order

1. Focused red/green Node tests for selector and operation contracts.
2. Read-only proposal + independent rebuild.
3. New exact approval, one governed transaction, independent layer readback.
4. Fresh smoke and data audits.
5. Maven, Admin, Public, and `bash ./platform/local/quality-gate.sh`.
