# Remaining Domain Isolated Acceptance Plan

> **For agentic workers:** Execute this plan batch-by-batch. Each batch has an independent authorization, isolated resources, evidence report, and cleanup readback.

**Goal:** Extend the proven Recipe T1 boundary to the remaining crawler domains without writing formal databases or enabling recurring automation.

**Architecture:** Treat each domain as a separate governed isolated acceptance operation. Every batch uses 2–5 offline local fixtures, a current-hash ADMIN packet, disposable local/maint/relation databases, a temporary provisioner account, and a dedicated empty Redis logical database. A batch may proceed to the next stage only after formal immutability, relation integrity, transaction probes, and independent cleanup all pass.

**Tech Stack:** Node.js ESM tests, existing canonical operation manifests, MySQL isolated acceptance provisioner, Redis V2 state, existing domain import/pipeline/relation scripts.

---

## Global Rules

- Formal `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation` are read-only during all batches.
- Use only local fixtures; set network access to `false` and fail closed on missing metadata.
- Generate a fresh current-hash manifest, request, owner input, packet, and one-time permit for every run. Never reuse Recipe T1 artifacts.
- Use a run-derived three-database name, temporary provisioner account, and an empty Redis DB distinct from prior runs.
- Run independent cleanup readback after the acceptance process exits; all disposable resources must be zero.
- Do not run full Items, V1 queue operations, scheduler daemon, crawler network fetches, formal apply, push, merge, or worktree cleanup under this plan.
- A failed or incomplete batch remains `active` or `blocked` in devlog and does not authorize the next batch.

## Batch Order

### Batch 0: Baseline and Contract Audit

Read the current spec, workflow, current devlog, and domain entrypoints. Record source-of-truth, target tables, relationship closure, existing focused tests, and current formal DB/Redis/process state. Confirm no active disposable resources remain from Recipe T1.

Validation:

```bash
git status --short
node --test scripts/data/automation/*acceptance*.test.mjs scripts/data/automation/*manifest*.test.mjs
bash ./scripts/dev/quality-gate.sh
```

Do not edit domain code in this batch. If baseline is not clean or runtime resources are non-zero, stop and repair the environment first.

### Batch 1: Boss + Boss Loot Joint T1

Create a bounded offline fixture containing 2–5 bosses, their loot rows, and all referenced item/NPC identities. Add a `boss-canonical-t1-acceptance` operation that routes the existing boss and boss-loot import stages plus relation/provider consolidation into the isolated local database.

Required tests before execution:

- operation catalog and manifest freeze the fixture, `scope=boss-canonical`, `networkAccess=false`, isolated identity, and `databaseWrites=false`;
- boss import supports an explicit offline image mode that forbids backend/MinIO requests and preserves fixture image values without creating managed objects;
- executor rejects formal database names and missing relationship closure;
- pipeline forwards `--allow-non-primary-db=true` and `--offline=true` to every write stage;
- import and relation counts match fixture counts with zero placeholder/unresolved rows;
- evidence publication occurs only after cleanup.

The offline image mode is a hard prerequisite because the current formal boss
importer uploads images through the backend during apply. Do not claim
`networkAccess=false` or create the Boss T1 manifest until a failing test proves
that the isolated path cannot call the uploader.

Run the focused Node suite, generate fresh ADMIN artifacts, execute one isolated run, then independently verify formal hashes, counts, transaction probes (`0/1/0`), and zero resources. Record the result in a child devlog entry and commit only the bounded batch.

### Batch 2: Projectile T1

Select 2–5 local projectile fixtures with closed item/NPC/source relations. Add or reuse a projectile isolated executor and manifest. Prove offline name resolution, relation integrity, projection/consolidation, formal immutability, transaction probes, and cleanup using the same gates as Batch 1.

If the local source cannot close projectile relations without network data, produce an evidence-blocker report and stop; do not fabricate rows or broaden the fixture.

### Batch 3: Buff T1

Select fixtures covering source items, inflicting NPCs, and immune NPC lists. Run parser/import/relation/projection checks offline. Verify full `immuneNpcs` payloads, not only counts, and assert API readback from the isolated projection. Keep unresolved typed non-item facts explicit and fail closed on accidental item/NPC coercion.

### Batch 4: Biome T1

Select fixtures covering structured item/NPC sources and biome wikitext evidence. Run biome import, collection relation, projection/consolidation, and isolated API readback. Verify source ownership types, inactive/deleted filtering, and no loss of structured source rows.

### Batch 5: Formal Recipe Apply Design Only

Do not execute apply. Produce a separate plan identifying the full 3,663-recipe input hash, affected tables, dry-run counts, rollback method, owner decision fields, maintenance window, and post-apply readback. Formal apply remains unauthorized until that plan is separately reviewed and approved.

### Batch 6: Scheduler Lease and Restart Recovery

Use a dedicated Redis namespace and synthetic test task. Verify lease acquisition, duplicate-start rejection, expiry, process restart recovery, terminal cleanup, and V1 queue non-participation. Do not start a real scheduler daemon or crawler and do not write domain databases.

## Per-Batch Closeout Checklist

- focused tests pass with a recorded count;
- current-hash manifest/request/packet/permit identities are recorded;
- fixture, input hash, output report, and exact run ID are recorded;
- formal database before/after hashes are identical;
- isolated import, relation, and consolidation counts are internally consistent;
- rollback/commit/restore probes equal `0/1/0`;
- independent database/account/Redis/process cleanup readback is all zero;
- devlog entry records residual risks and next batch;
- `git diff --check`, `git status --short`, and `git diff --cached --stat` pass before a focused commit.

## Stop Conditions

Stop the current batch and leave it `active` or `blocked` when any source contract is missing, offline resolution would require network access, a formal target is touched, evidence publication is incomplete, cleanup is non-zero, hashes drift, or a relationship remains unresolved. Repair the plan and re-audit before resuming.
