# NPC Domain Loot Closure R2 Post-Code Audit

Date: 2026-05-10

Branch: `fix/npc-domain-loot-closure-r2-execution`

## Purpose

Rebaseline NPC loot closure after restarting the local stack on the R2 code commits:

- `7bc7377 fix: keep fallback NPC loot out of public aggregate`
- `670fe9c fix: preserve scoped NPC variant loot evidence`
- `2303e4c docs: plan NPC loot closure r2 continuation`

No DB apply/import/backfill command was run in this phase.

## Commands

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\verify-local-stack.ps1
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-r2-post-code
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-r2-post-code
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-r2-post-code
```

Generated reports:

- `reports/audit/npc-source-coverage-inventory-2026-05-10-r2-post-code.json`
- `reports/audit/npc-domain-loot-chain-2026-05-10-r2-post-code.json`
- `reports/audit/npc-loot-runtime-parity-2026-05-10-r2-post-code.json`

## Baseline Comparison

| Field | R2 baseline | R2 post-code | Interpretation |
| --- | ---: | ---: | --- |
| Domain `activeNpcs` | 762 | 762 | Scope unchanged. |
| Domain `releaseBlockingCount` | 2323 | 2323 | Data-chain blockers unchanged by API-only fix. |
| Domain `unclassifiedZero` | 319 | 319 | Needs contract or materialization triage. |
| Domain `blockedSourceGap` | 193 | 193 | Coverage evidence still stale or incomplete. |
| Domain `relationGap` | 6 | 6 | Needs dry-run/materialization proof. |
| Domain `apiGap` | 214 | 214 | Domain audit still sees local/API mismatch. |
| Domain `duplicateOrPolluted` | 30 | 30 | Domain-level stale/provenance rows remain. |
| Runtime `blockingCount` | 397 | 112 | Public fallback pollution dropped after restart. |
| Runtime `duplicate_or_polluted` | 397 | 33 | API fallback rows mostly removed. |
| Runtime `count_parity_only` | 0 | 79 | Remaining mismatch is mostly identity normalization. |
| Runtime `trusted_direct_loot` | 0 | 132 | API now exposes trusted direct rows. |

Source coverage post-code summary:

| Source coverage status | Count |
| --- | ---: |
| `source_page_present_with_loot` | 394 |
| `source_page_present_no_loot` | 158 |
| `source_page_missing` | 114 |
| `group_page_present_variant_not_extracted` | 96 |

## Parallel Review Findings

Runtime parity:

- `blockingCount` dropped from 397 to 112 because API rows now carry `runtimeMode=direct` and untrusted fallback rows disappeared.
- `count_parity_only=79` is dominated by stable identity drift where projection has `conditionText="Normal mode row"` but relation/local/API normalize that condition to blank/null.
- `duplicate_or_polluted=33` splits into duplicate stable identities and local-visible rows without relation provenance.

Zero-loot classification:

- `unclassifiedZero=319`.
- `147` rows are `source_page_present_no_loot` with `maintSourceCount=0`; these are expected-zero candidates only after review.
- `172` rows are `source_page_present_with_loot` with `maintSourceCount>0`; these are materialization/traceability defects, not expected-zero candidates.
- Current contract files have no real rows, so no row can be closed by contract yet.

Source coverage:

- `source_page_missing=114` includes direct-title misses, critter/gold/gem variants, group/subentity title misses, Mimic-family direct variants, bound/friendly review cases, boss parts, blank standardized records, and one DD2 test oddity.
- `group_page_present_variant_not_extracted=96` is dominated by segmented/multipart enemies, Old One's Army tier variants, critter/environment shared pages, seasonal variants, and boss parts.
- The inventory still reads old `data/wiki-crawler/report/npc/coverage-*.latest.json` evidence and can report stale gaps even when newer bridge/stage-count evidence proves exact NPC loot exists.

Source-row blockers:

- `duplicate_source_identity=1054`.
- `blocked_non_npc_source=407`.
- `blocked_generic_bucket=68`.
- `blocked_missing_item_or_npc_identity=25`.
- `blocked_ambiguous_variant=7`.
- Top non-NPC/pseudo sources include chests, crates, presents, treasure bags, shaking/tree sources, and bonus labels. These need reviewed exclusion classification and must never materialize into NPC loot.

## Decision

Phase 0 passes its purpose: R2 runtime/API code is loaded and the public fallback pollution fix has measurable effect.

The task is not closed. Next safe work is still pre-apply:

1. Fix runtime parity identity normalization for non-semantic `Normal mode row` drift.
2. Fix source coverage inventory so exact trusted stage evidence is not overridden by stale crawler coverage artifacts.
3. Improve zero-loot/materialization report traceability before adding large expected-zero or inheritance contracts.
4. Review non-NPC source exclusions with tests so exclusions are non-blocking but never materializable.

No Phase 6 DB apply is allowed from this document.

## Follow-Up Fix Evidence

After the Phase 0 review, two pre-apply audit fixes were made and verified.

Runtime parity normalization:

- Fix: treat `conditionText="Normal mode row"` as the implicit default condition for stable row identity.
- Report: `reports/audit/npc-loot-runtime-parity-2026-05-10-r2-runtime-normalized.json`

| Runtime field | Post-code | Normalized |
| --- | ---: | ---: |
| `blockingCount` | 112 | 33 |
| `trusted_direct_loot` | 132 | 211 |
| `count_parity_only` | 79 | 0 |
| `duplicate_or_polluted` | 33 | 33 |

Source coverage exact evidence:

- Fix: exact standardized/relation/projection/local/current-NPC maint evidence can override stale missing crawler coverage; maint rows for another NPC cannot.
- Report: `reports/audit/npc-source-coverage-inventory-2026-05-10-r2-coverage-exact-evidence.json`

| Source coverage status | Post-code | Exact evidence |
| --- | ---: | ---: |
| `source_page_present_with_loot` | 394 | 422 |
| `source_page_present_no_loot` | 158 | 147 |
| `source_page_missing` | 114 | 102 |
| `group_page_present_variant_not_extracted` | 96 | 91 |

Validation:

```powershell
node --test scripts/data/audit/npc-loot-runtime-parity-audit.test.mjs scripts/data/audit/npc-source-coverage-inventory.test.mjs
git diff --check
```

Result: `20/20` Node tests passed; `git diff --check` returned no errors.

Remaining blockers are still real:

- Runtime parity has `duplicate_or_polluted=33`, mostly duplicate local rows or local-visible rows without relation provenance.
- Source coverage still has `source_page_missing=102` and `group_page_present_variant_not_extracted=91`.
- Domain chain still requires zero-loot contract/materialization triage, non-NPC source exclusions, and dry-run evidence before any apply.
