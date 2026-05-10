# NPC Domain Loot Closure Baseline

Date: 2026-05-10
Branch: `fix/npc-domain-loot-closure`

## Scope

This baseline covers the whole NPC loot domain. User-visible samples such as Crimson Mimic, Present Mimic, Hornet variants, Zombie variants, and boss examples are regression samples only; they are not the acceptance scope.

No DB-writing command was run for this baseline. The target databases for later phases remain:

- `terria_v1_maint`
- `terria_v1_relation`
- `terria_v1_local`

## Baseline Commands

`npc-domain-loot-chain-audit` depends on the same-tag source coverage report. Source coverage was generated first.

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-closure-baseline
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-closure-baseline
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-closure-baseline
```

## Reports

- `reports/audit/npc-source-coverage-inventory-2026-05-10-closure-baseline.json`
- `reports/audit/npc-domain-loot-chain-2026-05-10-closure-baseline.json`
- `reports/audit/npc-loot-runtime-parity-2026-05-10-closure-baseline.json`

## Source Coverage

- `auditStatus`: `pass`
- `evidenceHealth`: `sufficient`
- `totalNpcs`: `762`
- `source_page_present_with_loot`: `394`
- `source_page_present_no_loot`: `158`
- `source_page_missing`: `114`
- `group_page_present_variant_not_extracted`: `96`

## Domain Chain

- `auditStatus`: `blocked`
- `evidenceHealth`: `sufficient`
- `activeNpcs`: `762`
- `classifiedNpcs`: `762`
- `trustedDirectLoot`: `0`
- `trustedInheritedLoot`: `0`
- `expectedZeroLoot`: `0`
- `unclassifiedZero`: `319`
- `blockedSourceGap`: `193`
- `blockedGenericBucket`: `68`
- `blockedAmbiguousVariant`: `7`
- `blockedNonNpcSource`: `381`
- `blockedNonNpcSourcePromoted`: `0`
- `blockedMissingItemOrNpcIdentity`: `51`
- `relationGap`: `6`
- `projectionGap`: `0`
- `localGap`: `0`
- `apiGap`: `214`
- `duplicateOrPolluted`: `30`
- `runtimeFallbackOnly`: `0`
- `projectionOnly`: `0`
- `countParityOnly`: `0`
- `unknown`: `0`
- `releaseBlockingCount`: `2323`

## Runtime Parity

- `auditStatus`: `blocked`
- `evidenceHealth`: `sufficient`
- `totalNpcs`: `397`
- `blockingCount`: `265`
- `count_parity_only`: `79`
- `duplicate_or_polluted`: `186`
- `trusted_direct_loot`: `132`
- `stageRows.relation`: `736`
- `stageRows.projection`: `736`
- `stageRows.local`: `1082`
- `stageRows.api`: `1523`

## Phase 0 Verdict

Phase 0 evidence is now usable: all three baseline reports exist, source coverage is sufficient, and no DB writer ran.

The plan must not proceed to dry-run or apply yet. Remaining blockers are real domain blockers, not missing evidence: `unclassifiedZero`, `blockedSourceGap`, source-row blocker classes, `apiGap`, local/API pollution, and runtime row identity drift.
