# NPC Domain Loot Closure R2 Baseline

Date: 2026-05-10
Branch: `fix/npc-domain-loot-closure-r2`
Plan: `docs/plans/2026-05-10_npc-domain-loot-closure-execution-plan.md`

## No-Write Statement

This baseline was generated with read-only audit/report commands only. No `--apply=true`, import, backfill, direct SQL mutation, stack restart, or runtime table hand edit was run.

Target databases for later controlled phases remain:

- `terria_v1_maint`
- `terria_v1_relation`
- `terria_v1_local`

Visible user examples such as Mimic variants, Present Mimic, Hornet variants, and other NPC detail pages are regression samples only. They are not the closure scope. The closure scope is all `762` active NPCs.

## Commands

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-r2-baseline
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-r2-baseline
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-r2-baseline
```

Exit codes:

- `npc-source-coverage-inventory`: `0`
- `npc-domain-loot-chain-audit`: `2`
- `npc-loot-runtime-parity-audit`: `1`

These are allowed Phase 0 baseline exit codes because the domain/runtime audits are expected to be blocked before closure work, and all reports were written.

## Report Paths

- `reports/audit/npc-source-coverage-inventory-2026-05-10-r2-baseline.json`
- `reports/audit/npc-domain-loot-chain-2026-05-10-r2-baseline.json`
- `reports/audit/npc-loot-runtime-parity-2026-05-10-r2-baseline.json`

Console captures:

- `reports/audit/npc-source-coverage-inventory-2026-05-10-r2-baseline.console.txt`
- `reports/audit/npc-domain-loot-chain-2026-05-10-r2-baseline.console.txt`
- `reports/audit/npc-loot-runtime-parity-2026-05-10-r2-baseline.console.txt`

## Source Coverage Summary

| Metric | Count |
| --- | ---: |
| `totalNpcs` | `762` |
| `source_page_present_with_loot` | `394` |
| `source_page_present_no_loot` | `158` |
| `source_page_missing` | `114` |
| `group_page_present_variant_not_extracted` | `96` |

## Domain Loot Chain Summary

| Metric | Count |
| --- | ---: |
| `activeNpcs` | `762` |
| `classifiedNpcs` | `762` |
| `trustedDirectLoot` | `0` |
| `trustedInheritedLoot` | `0` |
| `expectedZeroLoot` | `0` |
| `unclassifiedZero` | `319` |
| `blockedSourceGap` | `193` |
| `blockedGenericBucket` | `68` |
| `blockedAmbiguousVariant` | `7` |
| `blockedNonNpcSource` | `407` |
| `blockedNonNpcSourcePromoted` | `0` |
| `blockedMissingItemOrNpcIdentity` | `25` |
| `relationGap` | `6` |
| `projectionGap` | `0` |
| `localGap` | `0` |
| `apiGap` | `214` |
| `duplicateOrPolluted` | `30` |
| `runtimeFallbackOnly` | `0` |
| `projectionOnly` | `0` |
| `countParityOnly` | `0` |
| `unknown` | `0` |
| `releaseBlockingCount` | `2323` |

## Runtime Parity Summary

| Metric | Count |
| --- | ---: |
| `totalNpcs` | `397` |
| `blockingCount` | `397` |
| `duplicate_or_polluted` | `397` |
| `relation stage rows` | `736` |
| `projection stage rows` | `736` |
| `local stage rows` | `1082` |
| `api stage rows` | `1523` |

## Immediate Interpretation

- The R2 branch starts from a sufficient evidence baseline.
- The main remaining closure problem is not a single NPC family. It spans zero-loot classification, group-page/source coverage extraction, source-row taxonomy/materialization, and runtime/API fallback pollution.
- Runtime parity is currently dominated by API-visible duplicate or polluted rows. Phase 4 must stay on the critical path; otherwise relation/local data fixes cannot produce final closure.
