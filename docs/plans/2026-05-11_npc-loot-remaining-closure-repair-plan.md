# NPC Loot Remaining Closure Repair Plan

> For agentic workers: use subagent-driven-development for disjoint work. Follow the batch order below. Start each batch with the smallest smoke test, then edit, then rerun the same smoke.

**Goal:** Close the remaining NPC loot domain/source blockers without re-discovering stale `post-relation-r2` facts.

**Architecture:** The current runtime/API loot path is no longer the blocker. Use the current smoke report as the blocker index, keep `npc_drop` separated from boss/bag/item sources, and resolve the remaining domain/source classes in small reviewed slices. Do not write DB data until a dry-run report names exact rows and rollback scope.

**Current authoritative reports:**

- Source coverage: `reports/audit/npc-source-coverage-inventory-2026-05-11-post-bound-zero-r1.json`
- Domain: `reports/audit/npc-domain-loot-chain-2026-05-11-post-bound-zero-r1.json`
- Runtime parity: `reports/audit/npc-loot-runtime-parity-2026-05-11-post-icemimic-refresh-r1.json`
- Smoke: `reports/audit/npc-loot-closure-smoke-check-2026-05-11-post-bound-zero-r1.json`

## Current Status

Runtime parity is pass:

- `auditStatus = pass`
- `blockingCount = 0`
- `trusted_direct_loot = 228`
- relation/projection/local/API rows: `780/780/780/780`

Domain closure is still blocked:

- `releaseBlockingCount = 638`
- `unclassifiedZero = 170`
- `blockedSourceGap = 357`
- `blockedGenericBucket = 72`
- `blockedAmbiguousVariant = 7`
- `blockedMissingItemOrNpcIdentity = 2`
- `duplicateSourceIdentity = 28`
- `duplicateOrPolluted = 2`

No active runtime blockers remain:

- `relationGap = 0`
- `projectionGap = 0`
- `localGap = 0`
- `apiGap = 0`
- `countParityOnly = 0`
- runtime `duplicate_or_polluted = 0`

Coverage counts:

- `source_page_present_with_loot = 228`
- `source_page_present_no_loot = 170`
- `source_page_missing = 105`
- `group_page_present_variant_not_extracted = 252`
- `no_source_required_expected_zero = 7`

Resolved in this branch:

- Runtime/API now scopes public NPC drops to `drop_source_kind IS NULL OR drop_source_kind = 'npc_drop'`.
- Runtime parity audit excludes boss/bag/item source rows from NPC drop evidence.
- DD2 `DD2DarkMageT1` and `DD2OgreT2` relation gaps are closed.
- `IceMimic` runtime duplicate stable identities are closed; runtime parity is now passing.
- A minimal bound/rescue expected-zero slice approved 7 contract rows.

## Active Batch Order

### Batch 1: Remaining expected-zero review

Files:

- `docs/contracts/npc-domain-expected-zero-contract.md`
- `docs/audits/2026-05-11_npc-unclassified-zero-triage.md`
- `scripts/data/audit/npc-domain-loot-chain-audit.test.mjs`

Rules:

- Approve only reviewed rows with `evidenceSource`.
- Do not bulk-approve rows just because current DB counts are zero.
- Do not include bosses, ordinary enemies, town/shop/service rows, or critters unless a reviewed source proves no direct loot.
- Continue with one conservative class at a time after the bound/rescue slice.

Smoke:

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-11-closure-next
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-11-closure-next
node scripts/data/audit/npc-loot-closure-smoke-check.mjs --date-tag=2026-05-11-closure-next --runtime-report=reports/audit/npc-loot-runtime-parity-2026-05-11-post-icemimic-refresh-r1.json --write-report=true
```

### Batch 2: Source coverage extraction gaps

Files:

- `scripts/data/audit/npc-source-coverage-inventory.mjs`
- crawler extraction files under `scripts/data/crawler/src/**`
- tests under `scripts/data/audit/` and `scripts/data/crawler/tests/`

Rules:

- Keep `source_page_missing = 105` separate from `group_page_present_variant_not_extracted = 252`.
- Start with one alias/group page family at a time.
- Add one failing test per extraction/classification pattern before changing code.

### Batch 3: Source-row taxonomy and identity

Files:

- `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- `scripts/data/relation/item-source-relation-processor.mjs`
- `docs/contracts/npc-loot-source-taxonomy-contract.md`
- `docs/contracts/npc-domain-non-npc-source-exclusion-contract.md`

Rules:

- Keep generic buckets blocking unless a reviewed mapping exists.
- Do not auto-materialize `Can Of Worms`, `Celestial Pillars`, `Ghouls`, `Jellyfish`, `Mimics`, `Mummies`, `Sand Sharks`, `Slimes`, `The Twins`, or other collective buckets.
- Handle missing identity separately from generic bucket and ambiguous variant cases.
- Current missing identity rows remain `Enchanted Sword (NPC)` and `Mechdusa`.

### Batch 4: Mimic duplicate source identity policy

Files:

- `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- `scripts/data/relation/item-source-relation-processor.mjs`
- `docs/contracts/npc-loot-source-taxonomy-contract.md`

Rules:

- Runtime duplicate rows are already fixed; do not reopen runtime parity unless data changes.
- Domain `duplicateSourceIdentity=28` and `duplicateOrPolluted=2` are source evidence policy blockers.
- Preserve wrong ordinary Mimic exact rows as blocking unless reviewed mappings prove otherwise.

### Batch 5: Runtime regeneration only if data changes

Runtime parity is currently passing. Rerun relation/local/runtime only after a later batch changes relation materialization or local compatibility data.

## Hard Boundaries

- No `--apply=true` without a recorded dry-run report and rollback target.
- No direct edits to generated runtime reports or DB tables.
- Do not collapse `source_page_missing` into `group_page_present_variant_not_extracted`.
- Do not auto-promote generic buckets.
- Do not treat runtime stale rows as source truth.
- Regenerate source coverage before domain audit for the same `dateTag`.
