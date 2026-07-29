# NPC Owner-Phase Authorization Runway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining canonical NPC owner phases without widening an Owner decision beyond the exact frozen bytes, predecessor results, and single capability-owned write partition that it authorizes.

**Architecture:** The authoritative chain is the frozen 25-pair NPC input, followed by the landing result and seven serial owner-phase results. Each packet binds the current code manifest, server fingerprint, policy set, frozen input, and all required predecessor result bytes. The packet runner consumes one decision identity immediately before the only formal executor and atomically binds a private random dispatch-permit hash into the canonical durable ledger; the executor must consume and verify that permit before input or database access. Each executor commits or rolls back one transaction, then a separate read-only check confirms its owned partition.

**Tech Stack:** Node.js ESM, `mysql2/promise`, MySQL 8 on `127.0.0.1:13306`, private ignored authorization artifacts, and `docs/devlog/` project-control records.

---

## Authority And Non-Negotiable Boundary

- A user may state approval intent for the whole runway, but the current formal contract cannot convert that into a packet for a future phase: its `dataBundleSha256` includes the raw bytes of predecessor result files that do not exist until the preceding transaction commits.
- Therefore each formal database write still requires one exact, unexpired request hash and one unused decision identity. This is a fail-closed technical limitation, not an operator preference.
- Planning, request-generation, read-only preflight, test execution, and documentation updates do **not** authorize a database write.
- Do not run crawler, source-contract flip, biomes L1 apply, L2, scheduler activation, shared backend restart, or a broad relation/local sync while this runway is executing.
- If a phase fails before or during its transaction, retain earlier committed results, do not run its successor, consume no replacement identity implicitly, and generate a new request only after root-cause repair and focused validation.

## Current Chain Snapshot

| Phase | Operation | Owned target(s) | Required completed results | State on 2026-07-29 |
| --- | --- | --- | --- | --- |
| 0 | `canonical-npc-landing-apply` | `local.source_dataset_landings.{npcs_base,npc_crawler_facts}` | none | completed: 1 base / 25 crawler facts |
| 1 | `canonical-npc-facts-maint-apply` | `maint.maint_npc_crawler_facts.canonical` | landing | completed: 25 facts |
| 2 | `canonical-npc-item-relations-apply` | four `items` relation keys | landing, phase 1 | completed: 329 / 329 / 178 / 2 |
| 3 | `canonical-npc-buff-relations-apply` | `relation.npc_buff_relations.buffs` | landing, phases 1–2 | completed: 1,270 rows |
| 4 | `canonical-npc-town-shop-projection-apply` | `local.npc_shop_entries`, `local.npc_shop_conditions` | landing, phases 1–3 | completed: 936 town entries / 257 conditions; 180 non-town entries retained |
| 5 | `canonical-npc-buff-projection-apply` | `local.npc_buff_relations.buffs` | landing, phases 1–4 | completed: 1,270 local Buff relations |
| 6 | `canonical-npc-nonboss-loot-projection-apply` | `local.npc_loot_entries.non_boss` | landing, phases 1–5 | completed: 1,544 non-boss loot entries |
| 7 | `canonical-npc-boss-loot-projection-apply` | `local.npc_loot_entries.boss` | landing, phases 1–6 | completed: 0 boss rows, matching 0 frozen source rows; all-eight completion is valid |

Phase 7 was authorized and consumed exactly once:

```text
operation: canonical-npc-boss-loot-projection-apply
request: sha256:461ee397194cd65b2677d44b2d72bb87d0d3f2c2e34a37e2699348005e7da028
packet: sha256:8170c16a6460534cc53b63d4e01a558d3bc0bad2cda78f07ebf0f5286e3fb07a
decision identity: canonical-npc-boss-loot-projection-apply-20260729-01 (consumed once)
```

## Task 1: Phase 3 — Buff Relation Partition

**Files:**
- Read: `reports/authorization/canonical/canonical-npc-buff-relations-apply.request.json`
- Create (private, ignored): `reports/authorization/canonical/canonical-npc-buff-relations-apply.owner-input.json`
- Create (private, ignored): `reports/authorization/canonical/canonical-npc-buff-relations-apply.packet.json`
- Create only after the database transaction commits (private, ignored): `reports/authorization/canonical/canonical-npc-buff-relations-apply.result.json`
- Update after validation: `docs/devlog/current.md`, `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`, `docs/project-management/current-status.md`, `docs/project-management/risk-register.md`

- [x] **Step 1: Perform fresh read-only preflight**

  Verify the exact request is `AWAITING_OWNER`, unexpired, technically complete, and its decision identity is absent from `used-decisions.json`. Verify server UUID, policy-set row, frozen input hash, landing/phase-1/phase-2 result bytes, target relation baseline, and `information_schema.innodb_trx = 0`.

  Expected: all predecessor results are `COMPLETED`, no active transaction is present, and no phase-3 result file exists.

- [x] **Step 2: Build the private packet from the exact user decision**

  Create an `admin` owner input with reason limited to `relation.npc_buff_relations.buffs`, mode `authorize`, request hash `sha256:812547e81c84256770a58fa5ec909269797f3f6269504bec6bffd72a59b132ba`, and decision identity `canonical-npc-buff-relations-apply-20260729-01`. Require `0600` for owner input and packet.

  Expected: `authorizationStatus=AUTHORIZED`; the packet declares exactly one owned key and exactly three predecessor operation IDs.

- [x] **Step 3: Run the packet-consuming formal executor once**

  Run `scripts/data/automation/run-authorized-canonical-operation.mjs` with the packet, current server fingerprint, current policy rows, and durable decision ledger. Do not call `npc-owner-phase-apply.mjs` directly.

  Expected: either a private `COMPLETED` result with `transactionCommitted=true`, or a non-zero failure with no success result; in the latter case stop this runway at phase 3.

- [x] **Step 4: Verify the committed Buff relation partition**

  Recompute the phase-3 rows from the same 25 frozen maint facts and compare their record-key count to `relation.npc_buff_relations`; confirm the result row count, predecessor hashes, ledger consumption, and zero active transactions. Run the focused authorization/owner-phase contract suite.

  Expected: result and direct readback agree; the focused suite reports no failures.

- [x] **Step 5: Generate only the phase-4 request**

  Regenerate `canonical-npc-town-shop-projection-apply.execution-manifest.json` and its request from current bytes and the new phase-3 result. Record the exact request hash and expiry in devlog/project-management records. Do not authorize or execute phase 4 without a new exact user decision.

## Task 2: Phase 4 — Town Shop Local Projection

**Files:**
- Read/create: `reports/authorization/canonical/canonical-npc-town-shop-projection-apply.{request,owner-input,packet,result}.json`
- Update: the same four project-control records from Task 1.

- [x] **Step 1: Preflight the landing plus phases 1–3 result chain and local shop-table baseline**

  Expected: each required predecessor is `COMPLETED`, has the same frozen input hash, request/manifest/fingerprint/policy hashes remain current, and no active transaction exists.

- [x] **Step 2: First exact Owner identity and packet-runner attempt closed this phase without a commit**

  The owner reason must limit the write to `local.npc_shop_entries` and `local.npc_shop_conditions`; it must not permit Buff projection or loot projection.

  Result: packet `sha256:dd00d1e591394c41f3cc7eb98259240bb34631e76310080576ce63f89dbbe97a`
  consumed `canonical-npc-town-shop-projection-apply-20260729-01`, then rolled back
  on the transaction-local row-count check. There is no result artifact, the two
  local tables remain at their preflight totals, and no successor may run.

- [x] **Repair: bind this canonical phase to the town partition and read back that same partition**

  The generic compatibility sync must retain its non-town default because it
  protects legacy town-NPC detail maintenance. The canonical phase now passes
  `npcShopScope: 'town'` and reads exactly the town NPC rows from both owned
  tables. The first retry consumed its identity but rolled back with no result:
  129 conditional source rows join to 257 duplicate shop-entry rows, so a source
  estimate is not a valid condition write count. The current adapter obtains the
  actual post-write town counts in its transaction and the verifier independently
  re-reads them. The duplicate-entry regression is RED-to-GREEN; fresh
  authorization/owner-phase validation is 45/45, with a live 936-town-entry /
  257-town-condition estimate, `git diff --check`,
  and independent review are clean. Both consumed packets and identities cannot
  be retried.

- [x] **Step 2R: Accept the retry identity, build a `0600` packet, and run only the packet runner**

  The owner reason must limit the write to `local.npc_shop_entries` and
  `local.npc_shop_conditions`; it must not permit Buff projection or loot
  projection. The retry is allowed only against the new request hash above.

  Result: authorized packet `sha256:516d4ead90efaf6d176f6bf2a8709e8a60a43174f55581863d3f52dd01a50591`
  consumed `canonical-npc-town-shop-projection-apply-retry-03-20260729` exactly
  once, dispatched only the formal runner, and committed the town partition.

- [x] **Step 3: Re-read both shop tables and publish the phase-4 result, then generate only phase 5's request**

  Result: private `COMPLETED` result is `0600`, binds all four predecessors, and
  reports 936 town entries / 257 conditions. Independent readback confirms 1,116
  total entries = 936 town + 180 non-town, 257 total/town conditions, one ledger
  consumption, and zero active transactions. The new Phase 5 request is
  `sha256:e9169a67193a9256c204d97ef85fa6fb121605c2cd0d3ebf4568863481aad8b6`
  and remains `AWAITING_OWNER`; no Phase 5 packet or result exists.

## Task 3: Phase 5 — Buff Local Projection

**Files:**
- Read/create: `reports/authorization/canonical/canonical-npc-buff-projection-apply.{request,owner-input,packet,result}.json`
- Update: the same four project-control records from Task 1.

- [x] **Step 1: Preflight the landing plus phases 1–4 chain and `local.npc_buff_relations` baseline**

  Result: all five committed predecessors bind the same frozen input, current
  server/policy fingerprints match, the local baseline is 112 rows, and active
  transactions are zero.

- [x] **Step 2: Accept one new exact Owner identity, build a private packet, and execute only the Buff local projection**

  The packet's ownership key must be exactly `local.npc_buff_relations.buffs`.

  Result: `canonical-npc-buff-projection-apply-20260729-01` was consumed once
  under `0600` packet `sha256:462e7175fa837350da211763ea11cfb9503081ccbc5aee9554c46fd854b918c6`;
  the single owned local Buff partition committed.

- [x] **Step 3: Re-read the local Buff projection and generate only phase 6's request**

  Result: result, source projection, and local partition each contain 1,270
  rows; ledger consumption is exact, transactions are zero, and Phase 6 request
  `sha256:7596c7781f2b57846f55b36492c3f223c867dc77c1c5e28fcf14aede67a8a98d`
  is `AWAITING_OWNER` with no packet/result/write.

## Task 4: Phase 6 — Non-Boss Loot Local Projection

**Files:**
- Read/create: `reports/authorization/canonical/canonical-npc-nonboss-loot-projection-apply.{request,owner-input,packet,result}.json`
- Update: the same four project-control records from Task 1.

- [x] **Step 1: Preflight the landing plus phases 1–5 chain and the non-boss `local.npc_loot_entries` partition**

  Result: all six committed predecessors bind the frozen input, current
  server/policy fingerprints match, the non-boss baseline is 1,542 rows, and
  active transactions are zero.

- [x] **Step 2: Accept one new exact Owner identity and execute only the non-boss packet**

  Result: `canonical-npc-nonboss-loot-projection-apply-20260729-01` was consumed
  once under `0600` packet `sha256:6f4b1077b00a96dbfb9d4d5f53857b2926777f28a152edd06723d4bb1ec3d661`;
  the non-boss partition committed.

- [x] **Step 3: Verify the non-boss partition and generate only phase 7's request**

  Result: result, source projection, and local non-boss partition each contain
  1,544 rows; boss rows are zero, ledger consumption is exact, and transactions
  are zero. Phase 7 request
  `sha256:461ee397194cd65b2677d44b2d72bb87d0d3f2c2e34a37e2699348005e7da028`
  is `AWAITING_OWNER` with no packet/result/write.

## Task 5: Phase 7 — Boss Loot Local Projection And Completion Aggregator

**Files:**
- Read/create: `reports/authorization/canonical/canonical-npc-boss-loot-projection-apply.{request,owner-input,packet,result}.json`
- Create only after the phase-7 database transaction commits: `reports/authorization/canonical/canonical-npc-apply.completion.json`
- Update: the same four project-control records from Task 1.


- [x] **Step 1: Preflight the landing plus phases 1–6 chain and the boss `local.npc_loot_entries` partition**

  Result: landing plus six phase results (seven predecessors) are completed, ordered,
  and bound to one frozen input. The request, server/policy fingerprints, and preflight
  artifacts matched; source/local boss baselines and active transactions were 0.

- [x] **Step 2: Accept one new exact Owner identity and execute only the boss packet**

  Result: the `0600` packet consumed the exact identity once through
  `run-authorized-canonical-operation.mjs`; the formal executor committed only the
  boss partition and atomically emitted the all-eight completion artifact.

- [x] **Step 3: Verify completion without widening the cutover**

  Result: independent source/local boss counts both equal 0, non-boss remains 1,544,
  the ledger has one Phase 7 use, and active transactions are 0. Byte reconstruction
  validates completion binding for landing plus exactly seven ordered phase results.
  No source contract was flipped, no L1/L2 or scheduler action ran, and no T2 claim is made.

## Validation Matrix

For every phase, run the narrowest evidence that proves the mutation and its boundary:

```bash
node --test scripts/data/npc-canonical/npc-owner-phase-contract.test.mjs \
  scripts/data/npc-canonical/npc-apply-ownership-preparation.test.mjs \
  scripts/data/automation/authorized-operation-context.test.mjs \
  scripts/data/automation/run-authorized-canonical-operation.test.mjs \
  scripts/data/automation/build-canonical-cutover-authorization.test.mjs
git diff --check
```

Additionally run phase-specific MySQL readback against the owned record keys or partition predicate, check `information_schema.innodb_trx`, inspect `used-decisions.json`, and verify the private result is `0600`. A failed packet, expired request, input/hash drift, missing predecessor, mismatched readback, or non-zero transaction count is a fail-close stop for the current phase.

## Out Of Scope And Follow-On Authorization Queue

- The NPC completion artifact is not a source-contract flip, an NPC T2 readiness pass, a full quality-gate pass, or permission for a crawler/L1/L2/scheduler action.
- The next independent non-NPC checkpoint remains `automation-biomes-first-l1`, which requires a separately frozen preview bundle before any exact request can exist.
- Other blocked lanes (item image source/upload coverage, boss-loot source bundle, Shimmer raw/importable shards) remain evidence blockers; this plan does not fabricate inputs or authorize their writes.

## Plan Audit

**Verdict:** Completed for the serial NPC owner phases under the existing authorization contract.

**Critical/important defects:** None. The principal constraint remained intentional: later phases could not be signed early because their required predecessor result bytes did not yet exist.

**Smoke test:** For each phase, verify the result's committed row counts against a fresh direct readback of exactly its owned rows or partition and confirm zero active transactions.

**Final validation:** `canonical-npc-apply.completion.json` byte-reconstructs from one landing result and seven ordered phase results for the same frozen input; all broader readiness and automation gates remain closed.

**Residual risk:** A newly discovered data or schema defect may invalidate the next request's code/data hash. Repair and revalidate that defect before requesting a replacement decision; do not reuse the prior identity.
