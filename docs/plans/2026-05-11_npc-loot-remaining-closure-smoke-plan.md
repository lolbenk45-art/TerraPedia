# NPC Loot Remaining Closure Smoke Plan

> For agentic workers: start every iteration by running the smoke command in Task 0. Use subagent-driven-development only for disjoint work. Do not use stale `post-relation-r2`, `closure-baseline`, or `post-local-r2` counts as current facts.

**Goal:** Drive NPC loot closure from the current `post-bound-zero-r1` domain/source state while preserving the runtime parity pass achieved in `post-icemimic-refresh-r1`.

**Architecture:** `npc-loot-closure-smoke-check.mjs` is the first-pass gate. The smoke check reads source coverage, domain, and runtime reports and tells the next repair slice. Runtime/API loot is not currently blocked; remaining work is domain/source classification.

## Current Authoritative State

Use these reports until a newer smoke iteration explicitly names replacements:

- Domain: `reports/audit/npc-domain-loot-chain-2026-05-11-post-bound-zero-r1.json`
- Source coverage: `reports/audit/npc-source-coverage-inventory-2026-05-11-post-bound-zero-r1.json`
- Runtime parity: `reports/audit/npc-loot-runtime-parity-2026-05-11-post-icemimic-refresh-r1.json`
- Smoke: `reports/audit/npc-loot-closure-smoke-check-2026-05-11-post-bound-zero-r1.json`

Current smoke status:

```text
auditStatus = blocked
evidenceHealth = sufficient
domainReleaseBlockingCount = 638
runtimeBlockingCount = 0
```

Runtime parity is pass:

```text
runtime auditStatus = pass
runtime byStatus.trusted_direct_loot = 228
runtime stageRows relation/projection/local/api = 780/780/780/780
```

Current smoke blockers:

| Blocker | Count | Next owner |
| --- | ---: | --- |
| `blockedSourceGap` | 357 | crawler/source coverage and contracts |
| `unclassifiedZero` | 170 | expected-zero review and source-present/no-loot triage |
| `blockedGenericBucket` | 72 | source-row taxonomy |
| `duplicateSourceIdentity` | 28 | Mimic/Ice Mimic duplicate source identity policy |
| `blockedAmbiguousVariant` | 7 | ordinary Mimic source-row taxonomy |
| `blockedMissingItemOrNpcIdentity` | 2 | item/NPC identity mapping |
| `duplicateOrPolluted` | 2 | domain duplicate rows: `Mimic`, `IceMimic` |

Coverage counts:

```text
source_page_present_with_loot = 228
source_page_present_no_loot = 170
source_page_missing = 105
group_page_present_variant_not_extracted = 252
no_source_required_expected_zero = 7
```

Already handled in the current branch:

- NPC forward loot row identity preservation.
- Empty API loader no longer fabricates `apiGap`.
- Shop-only maint rows no longer count as loot coverage.
- Reviewed non-NPC duplicate rows no longer block as `duplicate_source_identity`.
- Non-NPC source exclusion contract moved 1414 rows to `reviewedNonNpcExclusion`.
- Projection/local/API identity parity for `PresentMimic`.
- `DD2DarkMageT1` and `DD2OgreT2` relation gaps.
- Runtime `IceMimic` duplicate stable identities.
- Minimal bound/rescue expected-zero slice: 7 rows.

## Task 0: Smoke Gate

Run:

```powershell
node scripts/data/audit/npc-loot-closure-smoke-check.mjs --date-tag=2026-05-11-post-bound-zero-r1 --runtime-report=reports/audit/npc-loot-runtime-parity-2026-05-11-post-icemimic-refresh-r1.json --write-report=true
```

Expected now:

- Exit code `2` because domain blockers remain.
- `auditStatus = blocked`.
- `evidenceHealth = sufficient`.
- `domainReleaseBlockingCount = 638`.
- `runtimeBlockingCount = 0`.

If smoke cannot read a report, regenerate paired reports in this order with a new tag:

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-11-closure-next
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-11-closure-next
node scripts/data/audit/npc-loot-closure-smoke-check.mjs --date-tag=2026-05-11-closure-next --runtime-report=reports/audit/npc-loot-runtime-parity-2026-05-11-post-icemimic-refresh-r1.json --write-report=true
```

## Task 1: Expected-Zero Review

Current state:

- `expectedZeroLoot = 7`
- `unclassifiedZero = 170`
- the older `docs/audits/2026-05-11_npc-unclassified-zero-triage.md` is historical and was based on stale counts.

Rules:

- Add contract rows only for reviewed rows with source/evidence reference.
- Do not approve bosses, ordinary enemies, town/shop/service rows, or critters without specific reviewed evidence.
- Use one class per iteration. The bound/rescue class is already done.

## Task 2: Source Coverage Gaps

Current state:

- `source_page_missing = 105`
- `group_page_present_variant_not_extracted = 252`

Rules:

- Keep these categories separate.
- Start with one alias/group family and add a failing test before changing crawler or coverage classification.
- Do not hide missing pages behind expected-zero unless a contract row explicitly proves no source is required.

## Task 3: Source-Row Taxonomy And Identity

Current blockers:

- `blockedGenericBucket = 72`
- `blockedAmbiguousVariant = 7`
- `blockedMissingItemOrNpcIdentity = 2`
- `duplicateSourceIdentity = 28`
- `duplicateOrPolluted = 2`

Rules:

- Do not auto-materialize generic buckets.
- Treat `Mimic` and `IceMimic` domain duplicate rows as source evidence blockers, not runtime blockers.
- Preserve reviewed non-NPC exclusions as non-materializable.

## Task 4: Runtime Parity

Runtime parity is not a remaining blocker after `post-icemimic-refresh-r1`.

Only rerun runtime parity when a later data/relation change needs fresh evidence:

```powershell
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-11-closure-runtime-r1
```

## Final Gate

Required final values for full closure:

```text
npc-loot-closure-smoke-check.auditStatus = pass
npc-domain-loot-chain.auditStatus = pass
npc-loot-runtime-parity.auditStatus = pass
domain releaseBlockingCount = 0
runtime blockingCount = 0
```

Do not claim full closure until all values above are freshly verified.
