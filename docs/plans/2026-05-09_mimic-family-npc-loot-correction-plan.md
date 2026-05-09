# Mimic Family NPC Loot Correction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. Discovery and tests may run in parallel by lane; shared relation processors, landing sync, and DB-writing sync commands are serial. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the ordinary `Mimic` loot contract so it matches the official wiki and stop generic `Mimics` / collective NPC source buckets from being promoted into local/relation/projection tables. Variant Mimics stay blocked unless a reviewed mapping contract proves exact drops.

**Architecture:** Treat NPC loot as a strict chain: `wiki/crawler evidence -> item page source extraction -> maint_item_sources -> item_source_facts -> item_npc_loot_relations -> projection_npcs -> npc_loot_entries / local compat -> admin/public UI`. This plan adds a reviewed contract for the Mimic family at the source-validation boundary and a generic collective-bucket gate for other NPC families, then enforces both downstream with audit gates. No hand edits to runtime tables.

**Tech Stack:** Node.js audit/fetch/relation scripts, MySQL `terria_v1_maint` / `terria_v1_relation` / `terria_v1_local`, wiki crawler artifacts, Spring Boot admin/public NPC APIs.

---

## Current Findings

- Ordinary `Mimic` is wrong right now. Local / relation / projection each show 7 loot rows:
  - `BandofRegeneration`
  - `CloudinaBottle`
  - `Extractinator`
  - `FlareGun`
  - `HermesBoots`
  - `Mace`
  - `ShoeSpikes`
- The official wiki contract for ordinary `Mimic` is the 6-item set:
  - `DualHook`
  - `MagicDagger`
  - `PhilosophersStone`
  - `TitanGlove`
  - `StarCloak`
  - `CrossNecklace`
- Official source URL for the contract: `https://terraria.wiki.gg/wiki/Mimics`.
- The wiki page also contains seed-specific / variant sections. Those must be modeled as explicit branches and must not be merged into the default ordinary `Mimic` loot set.
- The six canonical ordinary `Mimic` rows may currently exist only as unresolved `source_ref_name='Mimics'` source rows. The fix must include a reviewed mapping from those six `Mimics` rows to ordinary `Mimic`; simply blocking the seven bad exact `Mimic` rows would produce a false zero-loot result.
- `PresentMimic`, `BigMimicCorruption`, `BigMimicCrimson`, `BigMimicHallow`, and `BigMimicJungle` are still zero in local / relation / projection.
- `maint_item_sources` already contains exact `Mimic` rows and unresolved generic `Mimics` rows. That means the source chain is already polluted before the final UI.
- `scripts/data/fetch/build-item-relations-bundle.mjs` extracts drop rows from item pages, `scripts/data/maint/sync-landing-to-maint.mjs` persists them into `maint_item_sources`, and `scripts/data/relation/item-source-relation-processor.mjs` resolves exact `Mimic` names into promoted loot relations. The bug is upstream contract enforcement, not a rendering issue.

## Non-Goals

- Do not hand-edit `item_npc_loot_relations`, `projection_npcs`, `npc_loot_entries`, or local compat rows.
- Do not fan out generic `Mimics` automatically.
- Do not treat the wiki crawler raw pages as automatically authoritative without a reviewed contract.
- Do not claim the variant Mimics are fixed unless they have exact reviewed rows or explicit blocked reasons.
- Do not limit the fix to Mimic if the same collective-bucket pattern is found for other NPC families. Mimic is the first required contract, but the gate must be reusable.
- Do not change unrelated image, recipe, projectile, or non-NPC domains in this plan.

## Multi-Agent Split

| Lane | Scope | Can run in parallel | Serial boundaries |
| --- | --- | --- | --- |
| Agent A | Read-only Mimic family audit and contract proof | DB queries, report review, wiki source verification | No writes |
| Agent B | Source extraction and landing normalization | `build-item-relations-bundle.mjs`, `sync-landing-to-maint.mjs` tests | Shared source-row contract must be stable |
| Agent C | Relation promotion guardrails | `item-source-relation-processor.mjs`, compat sync tests | Shared relation processor edits are serial |
| Agent D | Dry-run sync and acceptance verification | Dry-run commands, report review, admin/API checks | DB-writing syncs are serial |
| Agent E | General NPC collective-bucket taxonomy review | Read-only classification and tests | Shared classification helper edits are serial |

## Contract Boundary

This plan introduces a reviewed Mimic family contract:

- Ordinary `Mimic` may only promote the 6 canonical drops above.
- If a seed-specific branch exists in source evidence, it must be explicit and separate, not silently merged into the default `Mimic` set.
- Generic `Mimics` is not a safe authority for automatic fan-out.
- Variant Mimics are only promotable with exact reviewed mapping rows. If no reviewed mapping exists, they stay blocked and visible in audit output.

The blocked reason must be machine-readable, not a prose note.

This plan also introduces a reusable NPC loot taxonomy gate:

- Collective bucket names such as `Mimics`, `Pigrons`, `Mummies`, `Ghouls`, `Jellyfish`, `Sand Sharks`, `Slimes`, and `The Twins` must not be treated as exact NPC identities.
- A collective bucket may be materialized only through a checked-in reviewed mapping contract.
- If a bucket has no contract, it is `generic_bucket` and audit-only.
- If a bucket has multiple plausible NPC variants, it is `true_ambiguous` unless the contract resolves each item row.
- Non-NPC sources under `source_ref_type='npc'`, such as chests, crates, bags, trees, or presents, are `non_npc_source_misclassified` and must not become NPC loot.
- The ordinary `Mimic` six-item default mapping is the first allowed reviewed mapping from a collective bucket. It is explicit and item-scoped, not a blanket `Mimics -> Mimic` rule.

---

## Phase 0: Lock Baseline And Contract

**Files:**
- Create: `docs/audits/2026-05-09_mimic-family-loot-baseline.md`
- Create: `docs/contracts/mimic-family-loot-contract.md`
- Create: `docs/contracts/npc-loot-source-taxonomy-contract.md`
- Read: `docs/todo/backlog.md`
- Read: `docs/audits/2026-05-09_npc-loot-gap-closure-closeout.md`
- Read: `docs/audits/2026-05-09_buff-npc-loot-detail-closeout.md`

- [ ] Record the current DB state for the Mimic family.

Run:

```sql
SELECT n.internal_name,
       COUNT(DISTINCT l.id) AS localLoot,
       (SELECT COUNT(*)
        FROM terria_v1_relation.item_npc_loot_relations r
        WHERE r.deleted = 0
          AND r.status = 1
          AND r.npc_internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci) AS relationLoot,
       COALESCE(JSON_LENGTH(p.loot_items_json), 0) AS projectionLoot
FROM terria_v1_local.npcs n
LEFT JOIN terria_v1_local.npc_loot_entries l
  ON l.npc_id = n.id AND l.deleted = 0
LEFT JOIN terria_v1_relation.projection_npcs p
  ON p.internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
 AND p.deleted = 0
 AND p.status = 1
WHERE n.internal_name IN ('Mimic','IceMimic','WaterBoltMimic','PresentMimic','BigMimicCorruption','BigMimicCrimson','BigMimicHallow','BigMimicJungle')
GROUP BY n.internal_name, p.loot_items_json
ORDER BY n.internal_name;
```

Expected:
- `Mimic` = `7`
- `IceMimic` = `9`
- `WaterBoltMimic` = `1`
- `PresentMimic` / `BigMimicCorruption` / `BigMimicCrimson` / `BigMimicHallow` / `BigMimicJungle` = `0`

- [ ] Record the exact bad `Mimic` items currently promoted.

Expected current wrong list:
- `BandofRegeneration`
- `CloudinaBottle`
- `Extractinator`
- `FlareGun`
- `HermesBoots`
- `Mace`
- `ShoeSpikes`

- [ ] Write the reviewed contract file.

The contract must contain:
- default ordinary `Mimic` allowed item set
- wiki.gg source URL and retrieval date
- seed-specific branch rules
- exact mapping rows from `source_ref_name='Mimics'` to `targetNpcInternalName='Mimic'` for only `DualHook`, `MagicDagger`, `PhilosophersStone`, `TitanGlove`, `StarCloak`, and `CrossNecklace`
- explicit rejection rows for the seven current bad exact `Mimic` items
- explicit note that generic `Mimics` is not auto-promotable
- explicit note that variants stay blocked unless they have exact reviewed mapping rows
- explicit machine-readable mismatch status for any extra row

- [ ] Write the generic NPC loot source taxonomy contract.

The taxonomy contract must contain:
- collective bucket source status
- non-NPC source status
- `positive_id_fallback` representative-safe criteria
- explicit examples for `Mimics`, `Pigrons`, `Mummies`, `Ghouls`, `Jellyfish`, `Sand Sharks`, `Slimes`, and `The Twins`
- rule that unknown collective buckets default to blocked/audit-only, not promoted

**Exit gate:**
- Baseline doc exists.
- Contract file exists.
- Taxonomy contract exists.
- No code or DB writes yet.

---

## Phase 1: Read-Only Audit For Contract Mismatch

**Files:**
- Create: `scripts/data/audit/audit-mimic-family-loot-contract.mjs`
- Create: `scripts/data/audit/audit-mimic-family-loot-contract.test.mjs`
- Create: `scripts/data/audit/npc-loot-correctness-gate.mjs`
- Create: `scripts/data/audit/npc-loot-correctness-gate.test.mjs`
- Read: `scripts/data/audit/audit-missing-mimic-variant-loot.mjs`
- Read: `scripts/data/audit/npc-loot-gap-closure-audit.mjs`

- [ ] Add a failing test that ordinary `Mimic` rejects the 7 current wrong items.

The test must assert:
- `BandofRegeneration` is `blocked`
- `CloudinaBottle` is `blocked`
- `Extractinator` is `blocked`
- `FlareGun` is `blocked`
- `HermesBoots` is `blocked`
- `Mace` is `blocked`
- `ShoeSpikes` is `blocked`
- only the 6 canonical items are `accepted`

- [ ] Add a failing test that generic `Mimics` does not auto-expand into ordinary `Mimic`.

The test must assert:
- `source_ref_name = 'Mimics'` is audit-only unless a reviewed item-scoped mapping file exists
- generic rows do not become promoted `item_npc_loot_relations` by default
- the six reviewed `Mimics` rows promote to ordinary `Mimic` only when their item internal names exactly match the contract
- non-contract `Mimics` rows remain `generic_bucket` or `contract_mismatch`

- [ ] Add a failing test that variant Mimics stay blocked until exact reviewed rows exist.

The test must assert:
- `PresentMimic` / `BigMimicCorruption` / `BigMimicCrimson` / `BigMimicHallow` / `BigMimicJungle` are not silently fanned out
- the audit output names the missing evidence class clearly

- [ ] Implement the audit report shape.

Required fields:
- `auditStatus`
- `evidenceHealth`
- `familyStatus[]`
- `mismatchRows[]`
- `blockedVariants[]`
- `genericBucketRows[]`
- `summary.byStatus`

Required statuses:
- `accepted`
- `blocked`
- `needs_review`
- `generic_bucket`
- `contract_mismatch`
- `non_npc_source_misclassified`
- `true_ambiguous`

- [ ] Add general collective-bucket tests.

The tests must assert:
- `Pigrons` and `Pigron` variant sets do not auto-resolve to a single variant
- `Mummies`, `Ghouls`, `Jellyfish`, `Sand Sharks`, `Slimes`, and `The Twins` remain audit-only without reviewed contracts
- chests, crates, bags, trees, presents, hearts, and orbs under `source_ref_type='npc'` are blocked as non-NPC sources
- the audit SQL remains read-only

**Exit gate:**
- The audit fails when ordinary `Mimic` contains any non-contract drop.
- The audit fails when generic `Mimics` is treated as an authority.
- The audit does not falsely claim variant Mimics are fixed.
- The audit catches the same pattern for other collective NPC source names.

---

## Phase 2: Enforce The Contract In The Source Chain

**Files:**
- Modify: `scripts/data/lib/wiki-page-utils.mjs`
- Modify: `scripts/data/fetch/build-item-relations-bundle.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Create: `scripts/data/lib/npc-loot-source-taxonomy.mjs`

- [ ] Add a contract-aware guard in source extraction and relation promotion.

Required behavior:
- ordinary `Mimic` rows outside the reviewed item set must be marked `contract_mismatch`
- generic `Mimics` stays audit-only unless an explicit reviewed item-scoped mapping file exists
- the six canonical ordinary `Mimic` drops may be materialized from `source_ref_name='Mimics'` only through the reviewed mapping contract
- variant Mimics remain blocked when only generic bucket evidence exists
- other known collective buckets follow the taxonomy contract, not string-guess promotion
- exact traceability must stay intact in `rawJson`

- [ ] Preserve seed-specific or branch-specific evidence as explicit rows, not silent merges.

If a source row is seed-conditional, the plan must keep it as a separate contract branch. Do not collapse it into the default `Mimic` contract.

- [ ] Keep the source lineage visible through maint and relation tables.

The row still needs:
- `sourcePage`
- `sourceRefName`
- `sourceRefInternalName` when authoritative
- `sourceRefResolution`
- a machine-readable mismatch reason when blocked

- [ ] Update compat sync to accept only approved resolved statuses.

If a new resolved status is introduced for reviewed Mimic-family rows, update compat sync and tests together. Do not widen the accepted set blindly.

**Exit gate:**
- Ordinary `Mimic` no longer promotes the 7 wrong rows.
- The 6 canonical drops are the only default accepted ordinary `Mimic` loot rows.
- The 6 canonical drops are actually materialized; a `0`-loot ordinary `Mimic` is a failure, not a success.
- Variants are either explicitly mapped or explicitly blocked.
- Other known collective buckets cannot be accidentally promoted by exact-name or single-candidate shortcuts.

---

## Phase 3: Dry-Run Sync And Verification

**Files:**
- Read: `reports/audit/`
- Read: `reports/relation/`
- Read: `docs/audits/2026-05-09_npc-loot-gap-closure-dry-run.md`
- Read: `docs/audits/2026-05-09_npc-loot-gap-closure-closeout.md`

- [ ] Run the contract audit and all relevant unit tests.

Run:

```powershell
node --test scripts/data/audit/audit-mimic-family-loot-contract.test.mjs
node --test scripts/data/audit/npc-loot-correctness-gate.test.mjs
node --test scripts/data/relation/item-source-relation-processor.test.mjs
node --test scripts/data/maint/sync-landing-to-maint.test.mjs
node --test scripts/data/lib/wiki-page-utils.test.mjs
node --test scripts/data/fetch/build-npc-item-relations-bundle.test.mjs
node --test scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
```

Expected:
- tests pass
- contract mismatch cases fail before the implementation and pass after it

- [ ] Run dry-run lineage syncs.

Run:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local --domains=npcs
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/audit/npc-loot-correctness-gate.mjs --write-report=true --date-tag=2026-05-09 --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
```

Expected:
- ordinary `Mimic` ends at exactly the reviewed canonical loot set
- ordinary `Mimic` count is exactly `6`, not `0`
- the 7 wrong rows are gone or blocked before promotion
- variant Mimics are not fanned out from generic buckets
- no other known collective bucket is newly promoted without contract

**Exit gate:**
- Ordinary `Mimic` matches the reviewed contract in dry-run output.
- Ordinary `Mimic` dry-run output contains all six canonical items and no extras.
- No generic `Mimics` row is silently promoted.
- Variants are either reviewed or explicitly blocked.
- The correctness gate is `pass`. Non-target warnings may be documented separately, but they must not appear in the Mimic/taxonomy target checks.

---

## Phase 4: Serial Apply, Rollback Plan, And Runtime Verification

**Files:**
- Create: `docs/audits/2026-05-09_mimic-family-loot-closeout.md`
- Read: `reports/audit/`
- Read: `reports/relation/`

- [ ] Record pre-apply counts in the closeout doc.

Required counts:
- `maint_item_sources` rows for `Mimic` / `Mimics`
- `item_source_facts` rows for `Mimic` / `Mimics`
- `item_npc_loot_relations` rows for `Mimic`
- `projection_npcs.loot_items_json` length for `Mimic`
- `npc_loot_entries` rows for `Mimic`

- [ ] Run serial apply only after Phase 3 passes.

Run:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local --domains=npcs
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/audit/npc-loot-correctness-gate.mjs --write-report=true --date-tag=2026-05-09-post-apply --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
```

Expected:
- ordinary `Mimic` local / relation / projection count is `6`
- ordinary `Mimic` item set exactly equals the reviewed contract
- the 7 wrong rows are absent from promoted relation/local loot
- `Mimics` generic rows remain audit-only unless explicitly mapped

- [ ] Define rollback before touching runtime.

Rollback is not a manual table edit. If apply output is wrong:
- revert the code/contract change on the branch
- rerun the same three sync commands serially
- rerun the correctness gate
- record before/after counts in the closeout doc

- [ ] Restart and verify the admin/API view.

Check:
- `/api/admin/npcs?search=Mimic`
- `/api/admin/npcs?search=Corrupt%20Mimic`
- the UI must not show stale wrong drops

**Exit gate:**
- Ordinary `Mimic` matches the reviewed contract.
- No generic `Mimics` row is silently promoted.
- Variants are either reviewed or explicitly blocked.
- Runtime API and admin UI do not show the 7 wrong ordinary `Mimic` drops.
- Closeout doc includes evidence, report paths, and any remaining blocked variant scope.

---

## Final Acceptance Criteria

- Ordinary `Mimic` shows only the reviewed canonical drop set.
- The seven current wrong drops are no longer promoted.
- Generic `Mimics` is not used as an automatic fan-out authority.
- Variant Mimics are not silently fabricated.
- Other known collective NPC source buckets are blocked unless reviewed.
- The audit makes the remaining blocked gaps explicit and machine-readable.
- No runtime table was fixed by hand.
