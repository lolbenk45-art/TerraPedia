# Dual-Path Domain Ingestion Acceptance Review Plan

**Status: For review**
**Environment: WSL only, local `terria_v1_local`**
**Branch: `feat/supplementary-domains-readiness`**

## Goal

Validate both manual and automatic entry paths for the eight changed-only domains. Per-run Owner approval is removed for automatic database writes, but the current canonical scheduler activation remains the global gate: a missing, disabled, stale, identity-mismatched, or ineligible activation must fail closed before the first database mutation.

Manual and automatic paths must share the same source validation, frozen-input, owned-table, transaction, progress, audit, and acknowledgement contracts.

## Domain Matrix

| Domain | Local count | Test method | Real DB write |
| --- | ---: | --- | --- |
| Items | 6131 | Existing standardized data plus a real source probe; manual/automatic dry-run, gate, dispatch, and dedupe only | No |
| Projectiles | 1111 | Existing standardized data plus a real source probe; manual/automatic dry-run, gate, dispatch, and dedupe only | No |
| NPCs | 762 | Real bounded source, manual transaction, automatic transaction | Yes |
| Buffs | 388 | Real resumable crawl, manual transaction, automatic transaction | Yes |
| Armor Sets | 63 | Real single-module refresh, manual transaction, automatic transaction | Yes |
| Bosses | 33 | Real bounded crawl, manual transaction, automatic transaction | Yes |
| Audio | <=600 | Complete four-prefix catalog, real downloads, manual transaction, automatic transaction | Yes |
| Shimmer | Bounded | Real generation extraction, manual transaction, automatic transaction | Yes |

`boss_loot`, `npc_loot`, L2, production databases, Windows services, Redis reset, and unrelated repairs are out of scope.

NPC/Boss base-data refreshes do not implicitly refresh loot. `npc-loot-backfill`/`npc-loot-apply` and `boss-loot-backfill`/`boss-loot-apply` are separate actions and are not in `AUTO_DISPATCH_DOMAINS`. `run-boss-sync-pipeline.mjs` is a special hazard because it explicitly appends the Boss loot pipeline; this acceptance must not use that composite entry point and must split Boss fetch from Boss base-data import.

## Automation Gate

Automatic apply requires all of the following:

1. The canonical activation request, packet, and result are current and bind exactly to the eight domains.
2. V2 automation reports `enabled=true` and `mode=changed-only`.
3. Preflight reports every target domain eligible and no unexpected domain eligible.
4. The source probe succeeds with a changed fingerprint.
5. No live attempt or shared progress/output writer owns the domain.
6. The L1 source/preview succeeds, pre/post fingerprints match, and the frozen bundle is readable.
7. Bundle, policy, baseline, owned-table, and target-database identity checks pass.

Manual entry may run while the scheduler is disabled, but it still requires an explicit domain, `apply=true`, and the local-database guard.

## Manual/Automatic Acceptance Order

For every real-write domain, serialize this sequence:

1. Record the source fingerprint, Git state, active writers, pre-write owned-table counts, and mutation generations.
2. Run the real probe and source/preview, then freeze the bundle.
3. Run the manual real transaction and record commit result, counts, samples, and audit evidence.
4. Preserve the real source fingerprint and let the canonical scheduler trigger the automatic path; do not fabricate a hash.
5. The automatic path must really enter the activation gate, transaction, audit, terminal progress, and acknowledgement. If the manual pass already made the data current, an idempotent zero-change automatic transaction is valid.
6. A second changed-only check must create zero new attempts for the acknowledged fingerprint.

For Items and Projectiles, steps 3 and 5 are importer dry-runs only, and database counts must remain unchanged.

## Failure and Stop Rules

- Any source-probe, pre/post fingerprint, bundle, policy, database-identity, or owned-table failure stops the domain before apply and acknowledgement.
- Resumable crawler failure may retry at most three times; the domain pauses for human handling afterward.
- Partial or ambiguous database writes must not be retried automatically; rollback and a blocked result are required.
- Audio must fail before download and manifest output on file 601, incomplete pagination, or more than 100 pages for any prefix.
- No progress/output family may have concurrent writers; domains run serially.

## Alternatives

Chosen: activation-gated shared importer, where one activation authorization gates automatic writes and manual/automatic triggers share importer and transaction contracts.

Rejected: per-apply Owner approval, because it conflicts with this requirement; unconditional automatic apply, because it bypasses disabled or stale activation; fixture-only acceptance, because it cannot prove real source, transaction, and local-database behavior for the small domains.

## Review Exit Criteria

After review approval, the executable plan must cover removal of the supplementary per-run approval dependency, preservation of activation identity and fences, Items/Projectiles dry-runs, manual and automatic transactions for the six real domains, WSL-only database checks, per-domain rollback, and final regression validation.
