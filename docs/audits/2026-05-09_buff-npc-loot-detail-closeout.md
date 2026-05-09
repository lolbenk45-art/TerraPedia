# Buff / NPC Detail Closeout

Date: 2026-05-09
Branch: `plan/buff-npc-loot-detail-closeout`

## Scope

- Fix Buff immune NPC placeholder cards by resolving alias-backed local NPC rows in `AdminBuffController`.
- Audit Mimic variant loot source readiness without fabricating relation/projection/local rows.

## Files Changed

- `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
- `back/src/test/java/com/terraria/skills/controller/AdminBuffControllerTest.java`
- `scripts/data/audit/audit-missing-mimic-variant-loot.mjs`
- `scripts/data/audit/audit-missing-mimic-variant-loot.test.mjs`
- `docs/audits/2026-05-09_buff-npc-loot-detail-closeout.md`
- `docs/todo/backlog.md`

## What Closed

- Buff detail now separates resolved NPC cards from unresolved raw samples.
- `immuneNpcSamples` now contains only displayable local NPC rows.
- Alias-backed samples such as `PirateSCurse` and `CorruptMimic` resolve to canonical local NPC rows.
- Ambiguous aliases such as `PhantasmDragon` now resolve to a deterministic representative local NPC row with ambiguity metadata on the resolved card.
- Duplicate exact `internalName` or `game_id` matches are treated as data-integrity blockers and moved to `unresolvedImmuneNpcSamples` instead of being silently overwritten.
- The previous contract where unresolved entries could leak into normal NPC cards was removed and covered by controller tests.

## What Did Not Close

- Mimic variant loot for `PresentMimic`, `BigMimicCorruption`, `BigMimicCrimson`, `BigMimicHallow`, and `BigMimicJungle` remains blocked.
- New audit evidence in `reports/audit/missing-mimic-variant-loot-2026-05-09.json` shows:
  - top-level `auditStatus=pass`
  - local/relation/projection structured loot remains zero
  - historical NPC loot import/restore evidence still buckets them as generic `Mimics`
  - no variant-specific local loot artifact was detected
  - all five targets are classified as `generic_bucket_only`, not `source_found`

Blocker reason:

- `generic_mimics_bucket_not_variant_materializable`

Report artifact handling:

- Path: `reports/audit/missing-mimic-variant-loot-2026-05-09.json`
- Git status: `untracked_or_ignored`
- SHA256: `FD0102568F28C23CADD6A95E119DF08323945D4B6E5FB1758314E225EF0F21B3`

## Validation

Commands run:

```powershell
cd back
mvn "-Dtest=AdminBuffControllerTest" test

cd ..
node --test scripts/data/audit/audit-missing-mimic-variant-loot.test.mjs
node scripts/data/audit/audit-missing-mimic-variant-loot.mjs --write-report=true --date-tag=2026-05-09
```

Observed result:

- `AdminBuffControllerTest`: pass
- `audit-missing-mimic-variant-loot.test.mjs`: pass
- real Mimic audit report generated successfully with `summary.blocked=5` and `summary.sourceFound=0`

## Remaining Risks

- `unresolvedImmuneNpcSamples` is still a backend contract addition; the current admin page ignores it safely because it only renders `immuneNpcSamples`, but any future UI that wants explicit audit visibility must opt in.
- NPC derived-loot identity mapping (`item_acquisition_sources.source_ref_id` vs runtime `game_id` queries) remains a broader chain risk and is now tracked in backlog for a dedicated fix.
- The real audit currently scans a broad set of NPC audit files and reports them in `artifactStatuses`; that is acceptable for closeout evidence, but a future refinement may narrow the human-facing report volume without weakening the classification rules.
