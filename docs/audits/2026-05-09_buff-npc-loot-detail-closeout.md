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
- `docs/audits/2026-05-09_buff-npc-loot-detail-baseline.md`
- `docs/todo/backlog.md`

## What Closed

- Buff detail now separates resolved NPC cards from unresolved raw samples.
- `immuneNpcSamples` now contains only displayable local NPC rows.
- Alias-backed samples such as `PirateSCurse` and `CorruptMimic` resolve to canonical local NPC rows.
- Ambiguous aliases such as `PhantasmDragon` are isolated under `unresolvedImmuneNpcSamples` with audit metadata instead of rendering fake cards.
- The previous contract where unresolved entries could leak into normal NPC cards was removed and covered by controller tests.

## What Did Not Close

- Mimic variant loot for `PresentMimic`, `BigMimicCorruption`, `BigMimicCrimson`, `BigMimicHallow`, and `BigMimicJungle` remains blocked.
- New audit evidence in `reports/audit/missing-mimic-variant-loot-2026-05-09.json` shows:
  - crawler coverage pages exist for all five targets
  - local/relation/projection structured loot remains zero
  - historical NPC loot import/restore evidence still buckets them as generic `Mimics`
  - no variant-specific local source artifact is currently available for safe materialization

Blocker reason:

- `generic_mimics_bucket_not_variant_materializable`

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
- real Mimic audit report generated successfully

## Remaining Risks

- `unresolvedImmuneNpcSamples` is a backend contract addition; the current admin page ignores it safely because it only renders `immuneNpcSamples`, but any future UI that wants explicit audit visibility must opt in.
- NPC derived-loot identity mapping (`item_acquisition_sources.source_ref_id` vs runtime `game_id` queries) remains a broader chain risk and is now tracked in backlog for a dedicated fix.
