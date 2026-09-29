# Armor item-source execution contract

## Delivered boundary

`canonical-armor-item-effect-source` is registered with the entrypoint
`pipelines/maint/run-armor-item-effect-source.mjs`. The proposal embeds the
original page/module bytes, expected revisions and a live baseline. The runner
revalidates its private file hash and complete code/data authorization bundle,
server identity, Owner, policy set, database clock and writer fences.

| Ownership | Empty-baseline inserts |
| --- | --- |
| `local.source_dataset_landings.armor_item_effects_raw` | 1 |
| `maint.source_dataset_landings.armor_item_effects_raw` | 1 |
| `maint.maint_armor_attribute_rows.item_effect_sources` | 3 |

The SQL transaction uses REPEATABLE READ and locked proposal rederivation,
checks all targets are InnoDB and each insert fits the server packet limit,
persists PREPARED before consuming the one-use permit, and verifies generated
IDs against actual rows before and after commit. Maint rows reference the
maint landing ID. Exact and partial replay preserve existing IDs and insert
only missing rows. No update, deletion, relation/projection write or DDL exists
in this operation.

Failed inserts or precommit readbacks roll back. An uncertain commit is never
blindly rolled back or retried: terminal evidence records `COMMIT_UNKNOWN` or
`COMMITTED_READBACK_REQUIRED`, with reconciliation required. A permit failure
after consumption was attempted records unknown consumption, not permission
to reuse the decision. A pre-existing PREPARED/result path rejects the attempt.

The candidate remains non-executable by itself. Its executor-required marker
means execution must pass through this separate authorized runner; it is not
an authorization flag that the runner switches off.

## Runtime evidence

- Authenticated preflight succeeded in16,990ms at2026-09-29T16:10:02.550Z
  (September30 CST): disabled scheduler, changed-only,0 live attempts,0 sweep
  claims, healthy reconciler with0 overdue/failures. The previous short timeout
  did not establish an unhealthy service.
- Read-only database inspection confirmed all three target tables are InnoDB
  and `max_allowed_packet=67108864`. No DDL or service restart was needed.
- The first preparation exposed an unbounded landing payload scan: source-key
  alone chose a PRIMARY index scan over estimated10,082/6,194 local/maint rows.
  The agent cancelled only its own SELECT and rolled back/closed that session.
  Adding the exact provider predicate uses the existing
  `idx_source_dataset_landings_provider_source_key` index with estimated1 row
  on both databases. No index was added and no unrelated query was cancelled.
- Preparation succeeded at2026-09-29T16:32:57.759Z in1,681ms. Actual baseline
  counts are0 local landings,0 maint landings,0 maint rows; planned inserts are
  1/1/3. This is a read-only proposal, **not an executed transaction**.

Private local evidence:

- `.local/tmp/armor-preflight-20260930-01.json`
- `.local/tmp/armor-item-source-runtime-20260930-01.json`
- `.local/tmp/armor-item-source-query-plan-20260930-01.json`
- `.local/tmp/armor-item-source-preparation-20260930-01.json`
- `.local/tmp/armor-item-source-20260930-01.proposal.json`
- `.local/tmp/armor-item-source-archive-20260930-01.json`

The28,880,589-byte proposal was generated under the registered proposal path
for label `a64-20260930-source-01`, then archived unchanged in `.local/tmp/`.
No PREPARED/result artifact, packet or permit was generated. Its logical hash
is `sha256:b469266370627eda6ba8de6f6f069543d9b39dd232ffffb82dc4eb20f3505616`;
file hash is `sha256:c4de6a3758fea6f525a997db1e2309a9b512acf1372f064fb3f745e3411f8ec3`.
Prepare a fresh baseline/label for any future authorized execution; do not
treat this archived rehearsal as current write authority.

## Validation and review

450/450 Node tests passed across source/maint, transaction/runner,
registration, shared manifest/authorization/permit, legacy producer,
independent projection and secondary-projection suites. The shared catalog
now has126 operations,124 executable; both explicit count assertions were
updated. RED cases preceded transaction, registration, runner, preparation and
indexed-lookup implementation. Final log:
`.local/logs/armor-item-source-regression-final.log`.

Runner integration builds real authorization packets, private artifacts,
one-use permits and durable decision records in disposable test repositories;
only the SQL connection is simulated. It covers changed proposal bytes,
wrong labels/server identity, retained evidence, active writer fences,
rejected permits, uncertain commit and teardown failure. Core tests also
cover wrong engine/packet limit, collation aliases, generated-ID drift,
rollback failure, partial replay and postcommit readback drift.

Review used the current model serially, consistent with the coordinator's
review mode. The missing provider index predicate was a material runtime
finding, fixed with a RED test and live EXPLAIN/preparation evidence. No open
material finding remains in this bounded implementation. These tests do not
claim real MySQL write acceptance or full Armor ingestion.

## Next admission gates

1. Armor owner: implement explicit typed-source dispatch from maint into
   item-owned relation effects. Revalidate raw source/lineage rather than
   trusting sparse attribute rows. Preserve the generic converter's rejection
   until that dispatch is tested; never silently filter typed rows out.
2. Armor owner: complete compatible-version item/set coverage and the Mining
   identity repair. Reconcile the historical qualified Shroomite cells with
   current specialized multipliers; equipped totals must not become duplicate
   set effects. Update the independent projection validator for the resulting
   complete contract.
3. Armor/coordinator: integrate reviewed contracts, refresh runtime/baselines,
   then build fresh exact packets and execute serially. Source persistence,
   relation retirement/publication and projection publication have distinct
   evidence; no consumed decision may be replayed.
4. Armor owner: verify DB/admin/public API conditions and multipliers for
   1546/1547/1548 and Mining411, plus automatic ingestion, retry and idempotency.
   Scheduler/H8 activation remains coordinator-owned.

No additional user information is required for the next implementation step.
