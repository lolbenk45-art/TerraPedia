# NPC Domain Loot Closure Read-Only Agent Findings

Date: 2026-05-10
Branch: `fix/npc-domain-loot-closure`

## Agent A: Unclassified Zero

`unclassifiedZero = 319` splits into:

- `172` source-present materialization defects.
- `147` expected-zero candidates.

The agent found no safely provable inheritance contract rows from current reports alone. Contract promotion needs reviewed evidence, not display-name or zero-count inference.

## Agent B: Source Coverage

Source coverage status counts:

- `source_page_present_with_loot = 394`
- `source_page_present_no_loot = 158`
- `source_page_missing = 114`
- `group_page_present_variant_not_extracted = 96`

Important pattern groups:

- `source_page_missing`: mostly true coverage or identity gaps; some rows also show legacy downstream pollution.
- `group_page_present_variant_not_extracted`: segmented chains, multi-part bosses, DD2 tiered variants, and same-display-name variants.
- `source_page_present_no_loot`: mostly town/friendly/ambient expected-zero candidates, plus some local-only legacy boss rows.
- `source_page_present_with_loot`: includes a large maint-only cluster that has not materialized into relation/projection/local.

Required tests before closure:

- coverage bucket and sub-bucket tests
- parser fixtures for segmented chains, numbered variants, tiered variants, same-display-name variants, and no-loot pages
- bridge tests proving no same-display-name fan-out
- relation/materialization tests for maint-only and mixed-mismatch groups

## Agent D: Runtime Parity

`npc-loot-runtime-parity` blockers:

- `count_parity_only = 79`
- `duplicate_or_polluted = 186`

Likely code/data split:

- Projection condition identity drift: projection may emit `"Normal mode row"` while relation/local/API identity uses blank condition.
- Backend fallback exposure: API can expose prototype, same-name, or derived fallback rows without canonical relation/projection/local provenance.
- Local compatibility rows include stale or duplicate rows that require canonical sync apply after code gates pass.
- One `IceMimic` case points to upstream duplicate materialization, not only local resync.

## Execution Boundary

These findings support continued code and test work, but they do not authorize Phase 5 dry-run or Phase 6 apply. Dry-run/apply remains blocked until read-only classification, parser/source-row/materialization gaps, and code-only runtime blockers are resolved or explicitly classified with exact writer commands and expected table deltas.
