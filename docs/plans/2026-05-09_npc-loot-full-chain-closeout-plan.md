# NPC Loot Full Chain Closeout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. Discovery, read-only DB checks, backend tests, frontend tests, and source-chain review may run in parallel by lane. Shared source extractors, relation processors, backend runtime fallback code, and DB-writing sync commands are serial. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close NPC loot correctness end to end by making the source chain, relation chain, projection/local chain, backend runtime fallback chain, and admin/public display chain agree on what is trusted, blocked, or missing.

**Architecture:** Treat NPC loot as a strict evidence pipeline, not a page rendering problem. The canonical path is `source artifact -> landing -> maint_item_sources -> item_source_facts/source_details -> item_npc_loot_relations -> projection_npcs -> npc_loot_entries -> API/UI`. Runtime fallback paths (`prototype`, `same_name`, `item_acquisition_sources`, and `lootItemsJson`) must be visible in audits and may not silently substitute for trusted structured loot.

**Tech Stack:** Node.js audit/fetch/relation scripts, MySQL `terria_v1_local` / `terria_v1_maint` / `terria_v1_relation`, Spring Boot admin/public NPC APIs, Nuxt admin UI, Vue public UI.

---

## Current Verified Facts

These facts were checked on 2026-05-09 after the previous Mimic-only closeout:

| Fact | Current value |
| --- | ---: |
| Active local NPCs | `762` |
| `npc_loot_entries` rows | `1042` |
| NPCs with structured `npc_loot_entries` | `239` |
| `item_acquisition_sources` NPC drop rows | `667` |
| Distinct derived NPC `source_ref_id` values | `205` |
| Distinct derived NPC `source_ref_name` rows with `source_ref_id IS NULL` | `0` |
| NPCs with zero structured loot but runtime derived fallback rows | `0` |

Mimic family current DB state:

| NPC | Structured loot | Derived fallback | Projection JSON |
| --- | ---: | ---: | ---: |
| `Mimic` | `6` | `0` | `6` |
| `IceMimic` | `9` | `9` | `9` |
| `WaterBoltMimic` | `1` | `1` | `1` |
| `PresentMimic` | `0` | `0` | `0` |
| `BigMimicCorruption` | `0` | `0` | `0` |
| `BigMimicCrimson` | `0` | `0` | `0` |
| `BigMimicHallow` | `0` | `0` | `0` |
| `BigMimicJungle` | `0` | `0` | `0` |

Important interpretation:

- The previous Mimic-only work was a safety fix, not full data closure.
- `PresentMimic` and biome Mimics are still missing trusted structured drops.
- User screenshot evidence shows the admin page can still display confusing or stale loot data; therefore DB-only validation is insufficient.
- The old `Mimic = six items` contract is not allowed to remain the final semantic truth without a fresh branch/version review.
- `npc-loot-correctness-gate.mjs` passing only proves the old gate's assumptions; it does not prove all NPC loot is correct.

---

## Runtime Display Chain

Admin NPC detail can show multiple loot sources:

```text
npc_loot_entries
  -> AdminNpcController.lootEntries
  -> admin detail "结构化掉落"

npc_loot_entries via npc_type or same-name fallback
  -> AdminNpcController.inheritedLootEntries
  -> admin detail "原型掉落"

item_acquisition_sources
  -> AdminNpcController.derivedLootEntries
  -> admin detail "原始来源掉落"

npcs.loot_items_json
  -> admin projection section
  -> "投影掉落物品"
```

Public NPC detail currently resolves the main loot list with this priority:

```text
direct npc_loot_entries
  -> prototype npc_loot_entries
  -> same-name npc_loot_entries
  -> item_acquisition_sources derived fallback
```

Problem:

- Public `NpcLootEntryDTO` does not expose provenance, so the page cannot tell users whether a row is direct, prototype, same-name, or derived.
- Admin `inheritedLootEntries` mixes `npc_type` prototype and same-name fallback, but the helper text currently describes only prototype behavior.
- `lootItemsJson` can appear as related/projection data and be mistaken for trusted structured drops.
- Existing gates do not fully cover these runtime display paths.

---

## Source Chain

Canonical source chain:

```text
source artifact
  -> wiki item page HTML/wikitext for item-sourced drop evidence
  -> wiki NPC page / group page HTML/wikitext for NPC-scoped drop evidence
  -> NPC multi-infobox + section-scoped drops parser
  -> item-relations bundle itemSources and npc-item-relations bundle records
  -> sync-landing-to-maint
  -> maint_item_sources
  -> sync-maint-to-relation / buildItemSourceRelations
  -> item_source_facts + item_source_details
  -> taxonomy classification
  -> item_npc_loot_relations
  -> projection_npcs.loot_items_json
  -> sync-relation-to-local-compat-tables
  -> npc_loot_entries
```

Traceability requirement:

- Every materialized trusted row must be reconciled by stable row identity, not by counts only.
- Required identity fields are `sourceRowKey`, `sourceUrl`, `sourceRefName`, `sourceRefType`, `itemInternalName`, `targetNpcInternalName`, `branchKey`, `chanceText`, and `quantityText`.
- Each stage must emit `accepted`, `blocked`, and `rejected` counts grouped by `sourceStatus` / `blockingReason`.
- Count parity is necessary but not sufficient; a same-count wrong NPC, wrong item, wrong branch, wrong chance, or wrong quantity is a blocker.

Known source-chain gaps:

- The extraction layer still tends to classify non-boss drop table entity cells as NPC sources before relation-layer taxonomy catches them.
- Historical reports show large blocked classes: non-NPC sources, generic buckets, true ambiguous rows, and missing sources.
- Generic buckets such as `Mimics`, `Mummies`, `Ghouls`, `Sand Sharks`, `Slimes`, `The Twins`, `Jellyfish`, and `Celestial Pillars` do not have safe automatic fan-out semantics.
- Mimic variants have crawler coverage evidence, but the materializable source rows are still not variant-specific.
- BigMimicCrimson is the representative known-bad case: local structured loot, projection loot JSON, relation loot rows, and derived fallback are all zero because current item-page source facts only expose generic `source_ref_name='Mimics'` rows and the NPC/page-scoped parser has not produced `sourceRefInternalName='BigMimicCrimson'` rows.
- The existing `build-npc-item-relations-bundle.mjs` can emit variant-specific rows when `wikiCrawler.loot` already exists on a standardized NPC record; the missing upstream step is extracting the correct `wikiCrawler.loot` rows from NPC group pages / multi-infobox pages such as `Mimics`.
- Old direct import scripts that write `npc_loot_entries` are not canonical and must not be used to close this plan.

Primary source strategy:

- Prefer NPC page or group-page section-scoped drop extraction for variant NPCs.
- Use item-page reverse source rows only when they already resolve to an exact NPC identity or when a reviewed mapping is required to explain a generic bucket.
- Reviewed mapping is a fallback or supplement, not the primary fix for Mimic variants when the NPC page contains variant-specific drop tables.
- If crawler coverage exists for a variant NPC but the chain still only exposes generic `Mimics` rows, the gate must block with `variant_npc_page_source_missing` or `npc_group_page_loot_not_extracted`.

---

## Non-Goals

- Do not hand-edit `npc_loot_entries`, `item_npc_loot_relations`, `projection_npcs`, or `npcs.loot_items_json`.
- Do not fix this by hiding UI sections or by reading wiki/crawler output directly in the UI.
- Do not fan out `Mimics` or any generic bucket without an item-scoped reviewed mapping manifest.
- Do not use `item_acquisition_sources` as trusted structured NPC loot unless it is classified and promoted through the relation chain.
- Do not run unbounded crawlers, DB `--apply`, import, backfill, or load commands before read-only audits and dry-run counts are reviewed.
- Do not claim all NPC drops are fixed unless API and page runtime evidence match the trusted chain.

---

## Multi-Agent Work Split

| Lane | Scope | Can run in parallel | Serial boundary |
| --- | --- | --- | --- |
| Agent A | Runtime fallback audit and backend API contract | Read-only API/DB checks, backend tests | Shared `AdminNpcController` / `PublicNpcServiceImpl` edits are serial |
| Agent B | Source classification and generic bucket taxonomy | Read-only report review, extractor tests | Shared `wiki-page-utils.mjs` / taxonomy edits are serial |
| Agent C | Mimic family NPC-page source extraction and contract rebuild | Wiki/source review, NPC crawler/fetch tests, contract manifest tests | No DB writes; NPC crawler/fetch edits are serial |
| Agent D | Full-chain audit/gate implementation | New audit tests, dry-run report shape | Quality gate changes are serial |
| Agent E | Admin/public UI provenance display | UI tests and labels | Must wait for backend provenance contract |
| Agent F | Data sync dry-run and closeout | Dry-run only until gates pass | `sync-maint-to-relation`, projection sync, local compat apply are serial |

Ownership rules:

- Only the lane listed in a phase's `Files` section may edit those files.
- Other agents may add read-only findings or review comments only.
- Agent D consumes Phase 1 runtime audit, Phase 3 Mimic contract, and Phase 4 reviewed mapping command contracts after their phase exit gates pass; it must not edit those files directly.
- If a cross-lane file edit becomes necessary, stop and reassign file ownership before editing.
- Inline snippets in this plan define contract intent only. Implementation must follow existing test style, exported helper names, and fixture conventions discovered in target files.

---

## Phase 0: Branch, Baseline, And No-Write Lock

**Owner lane:** Agent F owns branch/worktree state and audit docs. Other agents are read-only in this phase.

**Purpose:** Freeze the current state and prevent another partial fix from being mistaken for full closure.

**Files:**
- Create: `docs/audits/2026-05-09_npc-loot-full-chain-baseline.md`
- Read: `docs/audits/2026-05-09_npc-loot-gap-closure-closeout.md`
- Read: `docs/audits/2026-05-09_mimic-family-loot-closeout.md`
- Read: `docs/todo/backlog.md`

- [ ] Create implementation branch:

```powershell
git switch -c fix/npc-loot-full-chain-closeout
```

- [ ] Confirm worktree state:

```powershell
git status --short --branch
git branch -vv
git worktree list
```

Expected:
- Worktree has only intended plan/audit changes.
- No implementation starts on `main`.

- [ ] Create baseline doc with no-write lock.

The Phase 0 baseline doc may mark runtime audit fields as `pending_runtime_audit` if `scripts/data/audit/npc-loot-runtime-display-audit.mjs` does not exist yet. Do not create implementation code in Phase 0 just to satisfy the baseline.

- [ ] If the runtime display audit already exists, record current DB/API counts with it:

```powershell
node scripts/data/audit/npc-loot-runtime-display-audit.mjs --write-report=true --date-tag=2026-05-09-baseline
```

If the script does not exist yet, create it in Phase 1 and backfill the Phase 0 baseline before Phase 2 starts.

Required baseline fields:
- active NPC count
- structured `npc_loot_entries` count
- NPCs with structured loot
- derived `item_acquisition_sources` NPC drop count
- runtime-visible fallback count
- `lootItemsJson` non-empty count
- Mimic family direct/prototype/same-name/derived/projection counts
- running API sample status for the same targets

**Exit gate:**
- Baseline doc exists.
- No DB writes occurred.
- The baseline explicitly says previous Mimic work is safety-only, not full data closure.
- Runtime audit fields are either complete or explicitly marked `pending_runtime_audit` with a Phase 1 backfill checkpoint.

---

## Phase 1: Runtime Display Audit And Provenance Contract

**Owner lane:** Agent A owns the runtime audit, backend API provenance contract, and backend tests listed below.

**Purpose:** Make every page-visible NPC loot row explain where it came from.

**Files:**
- Create: `scripts/data/audit/npc-loot-runtime-display-audit.mjs`
- Create: `scripts/data/audit/npc-loot-runtime-display-audit.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/dto/NpcLootEntryDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplTest.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java`

- [ ] Add failing audit tests for the five runtime modes:

```js
test('runtime audit classifies direct, prototype, same-name, derived, and projection-only loot separately', () => {
  const report = buildNpcLootRuntimeDisplayReport({
    rows: [
      { npcInternalName: 'DirectNpc', directCount: 2, prototypeCount: 0, sameNameCount: 0, derivedCount: 0, projectionCount: 2 },
      { npcInternalName: 'PrototypeNpc', directCount: 0, prototypeCount: 3, sameNameCount: 0, derivedCount: 0, projectionCount: 0 },
      { npcInternalName: 'SameNameNpc', directCount: 0, prototypeCount: 0, sameNameCount: 1, derivedCount: 0, projectionCount: 0 },
      { npcInternalName: 'DerivedNpc', directCount: 0, prototypeCount: 0, sameNameCount: 0, derivedCount: 4, projectionCount: 0 },
      { npcInternalName: 'ProjectionOnlyNpc', directCount: 0, prototypeCount: 0, sameNameCount: 0, derivedCount: 0, projectionCount: 5 },
    ],
  });
  assert.equal(report.summary.runtimeVisibleNpcs, 5);
  assert.equal(report.summary.untrustedVisibleFallbackNpcs, 2);
  assert.equal(report.rows.find((row) => row.npcInternalName === 'DerivedNpc').runtimeMode, 'derived');
  assert.equal(report.rows.find((row) => row.npcInternalName === 'ProjectionOnlyNpc').runtimeMode, 'projection_only');
});
```

- [ ] Implement read-only runtime display audit.

The audit must query only with `SELECT`.

Required row fields:
- `npcId`
- `gameId`
- `internalName`
- `name`
- `directStructuredCount`
- `prototypeStructuredCount`
- `sameNameStructuredCount`
- `derivedBySourceIdCount`
- `derivedByNameCount`
- `projectionLootJsonCount`
- `runtimeMode`
- `isTrustedStructured`
- `isPageVisible`
- `blockingReason`

Runtime mode classification:

| Mode | Meaning | Trusted structured loot |
| --- | --- | --- |
| `direct` | `npc_loot_entries` for current `npc.id` | yes |
| `prototype` | inherited by `npc_type` from another NPC row | inherited-visible, not trusted direct |
| `same_name` | inherited by same display name | warning, not trusted |
| `derived` | `item_acquisition_sources` fallback | warning, not trusted |
| `projection_only` | `lootItemsJson` exists without structured row | warning |
| `missing` | no visible loot evidence | not blocked unless target is required |

- [ ] Add backend provenance field.

Add row-level provenance to runtime loot DTOs. Payload-level metadata is allowed only as a summary; every visible loot row must carry its own provenance.

```json
{
  "lootEntries": [
    {
      "itemInternalName": "DualHook",
      "lootSourceMode": "direct",
      "lootSourceNpcId": 85,
      "lootSourceLabel": "Mimic",
      "isTrustedStructured": true,
      "auditOnly": false
    }
  ],
  "fallbackLootEntries": [
    {
      "itemInternalName": "ExampleFallback",
      "lootSourceMode": "same_name",
      "lootSourceNpcId": 86,
      "lootSourceLabel": "Reference NPC",
      "isTrustedStructured": false,
      "auditOnly": true
    }
  ]
}
```

Required API contract:

- Public primary `loot` / `lootEntries` arrays may contain only rows where `lootSourceMode=direct`, `isTrustedStructured=true`, and `auditOnly=false`.
- Public fallback rows must be returned in a separate field such as `fallbackLootEntries` or `auditLootEntries`, with `lootSourceMode`, `lootSourceNpcId`, `lootSourceLabel`, `isTrustedStructured=false`, and `auditOnly=true`.
- Admin inherited rows must distinguish `lootInheritanceMode=prototype` from `lootInheritanceMode=same_name`; do not use one prototype-only label for both.
- `prototype` provenance makes inheritance visible, but it does not convert inherited rows into trusted direct data. Only target-specific materialized rows are trusted direct.

- [ ] Backend tests must cover:
- Direct rows return `lootSourceMode=direct`.
- Prototype rows return `lootSourceMode=prototype`.
- Same-name rows return `lootSourceMode=same_name`.
- Derived rows return `lootSourceMode=derived`.
- Missing rows return `lootSourceMode=missing`.
- Public primary loot array rejects or excludes any row where `lootSourceMode != direct` or `isTrustedStructured != true`.
- Admin tests assert `lootInheritanceMode=prototype` for `npc_type` fallback and `lootInheritanceMode=same_name` for display-name fallback.
- Public and admin APIs agree for a representative sample.

**Exit gate:**
- Runtime audit exists and is read-only.
- Backend exposes provenance.
- Existing runtime fallback behavior is visible, not silent.

---

## Phase 2: Source Classification Before Relation Sync

**Owner lane:** Agent B owns source extraction, taxonomy, relation processor classification, and the source taxonomy contract listed below.

**Purpose:** Stop non-NPC and generic bucket rows from entering the NPC lane as if they were candidate NPC drops.

**Files:**
- Modify: `scripts/data/lib/wiki-page-utils.mjs`
- Modify: `scripts/data/lib/wiki-page-utils.test.mjs`
- Modify: `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- Modify: `scripts/data/lib/npc-loot-source-taxonomy.test.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.test.mjs`
- Modify: `docs/contracts/npc-loot-source-taxonomy-contract.md`

- [ ] Add failing extractor tests for non-NPC drop sources.

Cases:
- `Gold Chest`
- `Azure Crate`
- `Treasure Bag`
- `Shaking tree`
- `Present`
- `Shadow Orb`
- `Herb Bag`

Expected:
- They are not emitted as trusted NPC source rows.
- If preserved, they carry `sourceRefType='non_npc_source'` or equivalent audit-only classification.

- [ ] Add failing extractor tests for generic buckets.

Cases:
- `Mimics`
- `Mummies`
- `Ghouls`
- `Sand Sharks`
- `Slimes`
- `The Twins`
- `Celestial Pillars`

Expected:
- They carry `sourceStatus='generic_bucket'`.
- They are not materializable without a reviewed mapping manifest.

- [ ] Keep relation-layer taxonomy as a second gate.

The extractor improvement is not allowed to remove downstream protection. Relation processor must still block:
- generic buckets without reviewed mapping
- non-NPC sources under `npc`
- true ambiguous rows
- Mimic variants without exact evidence

**Exit gate:**
- Source classification tests pass.
- Relation processor still blocks unsafe rows.
- No DB writes.

---

## Phase 3: Rebuild Mimic Family Contract With Branch Awareness

**Owner lane:** Agent C owns Mimic family NPC-page source extraction, the Mimic family contract, mapping manifest, and Mimic correctness gates listed below.

**Purpose:** Replace the old over-narrow Mimic contract with a version/branch-aware contract that distinguishes ordinary Mimic, special seed branches, Ice/WaterBolt Mimic, Present Mimic, and biome Mimics.

**Files:**
- Modify: `scripts/data/crawler/src/domains/npc-parser.mjs`
- Modify: `scripts/data/crawler/src/domains/npc-loot-parser.mjs`
- Modify: `scripts/data/crawler/src/domains/npc-domain.mjs`
- Modify: `scripts/data/crawler/tests/npc-parser.test.mjs`
- Modify: `scripts/data/crawler/tests/npc-domain.test.mjs`
- Modify: `scripts/data/fetch/build-npc-item-relations-bundle.mjs`
- Modify: `scripts/data/fetch/build-npc-item-relations-bundle.test.mjs`
- Modify: `docs/contracts/mimic-family-loot-contract.md`
- Modify: `scripts/data/audit/audit-mimic-family-loot-contract.mjs`
- Modify: `scripts/data/audit/audit-mimic-family-loot-contract.test.mjs`
- Modify: `scripts/data/audit/npc-loot-correctness-gate.mjs`
- Modify: `scripts/data/audit/npc-loot-correctness-gate.test.mjs`
- Create: `data/reviewed/npc-loot-mapping/mimic-family.mapping.json`

- [ ] Add failing NPC group-page parser tests for Mimics page.

The tests must use a fixture that represents `https://terraria.wiki.gg/wiki/Mimics` with multiple NPC sections or infobox scopes.

Required assertions:
- `Crimson Mimic` section emits loot rows scoped to `sourceRefInternalName='BigMimicCrimson'`.
- Required Crimson Mimic item rows include `Life Drain`, `Dart Pistol`, `Fetid Baghnakhs`, `Flesh Knuckles`, `Tendon Hook`, `Eater Of Life`, `Greater Healing Potion`, and `Greater Mana Potion` unless source review records a version-specific exclusion.
- `Corrupt Mimic`, `Hallowed Mimic`, `Jungle Mimic`, `Ice Mimic`, `Present Mimic`, and ordinary `Mimic` sections do not share each other's rows.
- Each emitted row preserves `sourceUrl`, page title, source section or infobox key, `sourceRowIndex`, `chanceText`, `quantityText`, and raw source evidence.

- [ ] Ensure standardized NPC bridge preserves NPC-scoped loot rows.

The standardized NPC payload must place section-scoped drop rows under each target NPC's `wikiCrawler.loot`, not only under the group page parent record.

Required assertions:
- `BigMimicCrimson.wikiCrawler.loot` is non-empty when the Mimics page fixture contains a Crimson Mimic drop section.
- `build-npc-item-relations-bundle.mjs` emits records with `npcInternalName='BigMimicCrimson'`, `relationType='loot'`, `sourceRefInternalName='BigMimicCrimson'`, and `sourceRefResolution='exact_internal_name'`.
- Generic `Mimics` rows are still not fanned out to variants.

- [ ] Mark old six-item `Mimic` contract as provisional until re-reviewed.

The contract must explicitly record:
- source URL(s)
- crawl/review date
- Terraria version/platform assumption
- branch key, such as `default`, `special_seed`, `ice`, `water_bolt`, `present`, `biome_corruption`, `biome_crimson`, `biome_hallow`, `biome_jungle`
- item-scoped mapping rows

- [ ] Add mapping manifest schema.

Minimum JSON shape:

```json
{
  "contractId": "mimic-family-loot",
  "reviewedAt": "2026-05-09",
  "sourceUrls": [],
  "branches": [
    {
      "branch": "biome_corruption",
      "targetNpcInternalName": "BigMimicCorruption",
      "sourceRefNames": ["Corrupt Mimic"],
      "items": [
        {
          "itemInternalName": "PutridScent",
          "chanceText": "20%",
          "quantityText": null,
          "sourceRowKey": "reviewed:mimic-family:biome_corruption:PutridScent"
        }
      ]
    }
  ]
}
```

- [ ] Add audit tests that fail if:
- A branch has no source URL.
- A mapping row lacks item internal name.
- `Mimics` blanket maps to every variant.
- Variant target rows materialize without branch-specific evidence.
- The old six-item ordinary Mimic set is used as the only family-wide truth.

- [ ] Decide materialization source.

Priority order:

1. Variant-specific NPC page or group-page parser rows with exact `sourceRefInternalName`.
2. Variant-specific crawler/source rows from another traceable NPC-scoped source.
3. Reviewed mapping manifest with item-scoped rows and source URLs, only when NPC-scoped source extraction cannot produce the row and the reason is recorded.

Allowed:
- variant-specific NPC page / group-page crawler rows
- variant-specific crawler/source rows from another traceable source
- reviewed mapping manifest with item-scoped rows and source URLs as a documented fallback

Conflict rule:

- If fresh crawler/source rows and reviewed mapping disagree on target NPC, item, branch, chance, or quantity, materialization is blocked with `evidence_conflict` until the mapping is re-reviewed.
- Reviewed mapping may supplement missing variant rows, but may not silently override fresh exact source rows.

Forbidden:
- blanket `Mimics -> every Mimic variant`
- claiming a Mimic variant is fixed only from generic item-page `source_ref_name='Mimics'` rows
- bypassing the NPC page / group-page extraction path when source pages contain variant-specific drop tables
- local DB hand edits
- projection JSON hand edits

**Exit gate:**
- Old contract is no longer presented as complete.
- Mimic variants are either materializable from NPC-scoped variant source rows, materializable from a reviewed fallback mapping with a recorded source-extraction reason, or explicitly blocked with `variant_npc_page_source_missing` / `npc_group_page_loot_not_extracted`.
- Correctness gate covers both missing and polluted variants.
- BigMimicCrimson cannot remain zero if the Mimics page fixture proves Crimson Mimic drops are parsable and item names resolve to local items.

---

## Phase 4: Generic Bucket Review Manifest

**Owner lane:** Agent C owns reviewed mapping schema/manifests. Agent D may only consume the exported audit CLI after this phase exits.

**Purpose:** Create a repeatable way to close other NPC families without ad hoc one-off fixes.

**Files:**
- Create: `data/reviewed/npc-loot-mapping/generic-bucket-mapping.schema.json`
- Create: `data/reviewed/npc-loot-mapping/README.md`
- Create: `scripts/data/audit/audit-npc-loot-reviewed-mappings.mjs`
- Create: `scripts/data/audit/audit-npc-loot-reviewed-mappings.test.mjs`

- [ ] Define reviewed mapping states:

| Status | Meaning | Can materialize |
| --- | --- | --- |
| `approved` | reviewed item-to-NPC mapping with source URL | yes |
| `blocked` | known unsafe bucket or branch | no |
| `needs_review` | evidence exists but no reviewed mapping | no |
| `retired` | obsolete mapping retained for history | no |

- [ ] Add manifest validation tests.

Must fail if:
- mapping has no `sourceUrls`
- mapping has no `reviewedAt`
- mapping maps one bucket to multiple targets without item-scoped rows
- mapping target NPC is missing from local NPC index
- mapping item is missing from local item index
- mapping branch lacks status
- a generic bucket sourceRefName is materialized by itself
- one sourceRefName expands to targets by wildcard, regex, family name, shared prefix, or missing branch key
- an approved row lacks item-target-branch scope and an exact evidence source row or reviewed source URL

- [ ] Add initial manifests only for reviewed buckets.

Initial manifests may start with Mimic family only unless source evidence is already reviewed. This does not make the plan Mimic-only: Phase 5 must audit every active NPC and every materializable NPC loot source class, then report coverage by status.

**Exit gate:**
- Generic bucket review mechanism exists.
- No generic bucket materializes without an approved manifest.
- Full-chain closeout cannot be claimed from Mimic-family samples alone.

---

## Phase 5: Full Chain Gate

**Owner lane:** Agent D owns the full-chain gate, quality-gate integration, and data-quality-index updates listed below.

**Purpose:** Replace narrow gate success with a real full-chain acceptance gate.

**Files:**
- Create: `scripts/data/audit/npc-loot-full-chain-gate.mjs`
- Create: `scripts/data/audit/npc-loot-full-chain-gate.test.mjs`
- Modify: `scripts/dev/quality-gate.ps1`
- Modify: `docs/audits/data-quality-index.md`

Preconditions:

- Phase 1 runtime audit CLI exists, has a stable command contract, and passes tests.
- Phase 3 Mimic correctness gate updates exist and pass tests.
- Phase 4 reviewed mapping audit CLI exists, has a stable command contract, and passes tests.
- Do not modify `scripts/dev/quality-gate.ps1` until `npc-loot-full-chain-gate.mjs --write-report=false` passes locally and runtime is measured.

- [ ] Gate must combine:
- `npc-loot-runtime-display-audit`
- `npc-loot-gap-closure-audit`
- `npc-loot-correctness-gate`
- `audit-npc-loot-reviewed-mappings`
- DB/API sample checks for required NPCs

- [ ] Gate must audit whole-domain coverage.

The gate must cover every active NPC and every materializable NPC loot source class, not only the Mimic family or hand-picked samples. It must report coverage counts by:
- `trusted_direct`
- `inherited_visible`
- `derived_audit_only`
- `projection_only`
- `blocked_generic_bucket`
- `blocked_non_npc`
- `blocked_ambiguous`
- `missing_source`

- [ ] Gate must reconcile row identity across the full chain.

The gate must join or reconcile stable identity fields across landing itemSources, `maint_item_sources`, `item_source_facts`, `item_source_details`, `item_npc_loot_relations`, `projection_npcs.loot_items_json`, and `npc_loot_entries`.

- [ ] Required blocking conditions:
- page-visible `derived` fallback for a required target without explicit `auditOnly` label
- page-visible `same_name` fallback without provenance
- projection-only loot shown as trusted structured loot
- public aggregate primary `loot` / `lootEntries` contains any row where `lootSourceMode != direct` or `isTrustedStructured != true`
- aggregate `moduleStatus.loot=ok` while only fallback/audit/projection rows are visible
- polluted Mimic variants
- generic bucket materialized without approved mapping
- non-NPC source materialized as NPC loot
- relation/projection/local count mismatch for trusted direct rows
- relation/projection/local identity mismatch for trusted direct rows
- API sample differs from DB trusted chain

- [ ] Required warning conditions:
- true ambiguous row remains blocked
- generic bucket remains blocked
- missing source remains blocked
- projection-only rows exist but are labelled as projection-only

- [ ] Add gate to quality gate only after it is stable.

If adding to `scripts/dev/quality-gate.ps1` makes the full gate too slow, add a separate explicit command and document when it is required:

```powershell
node scripts/data/audit/npc-loot-full-chain-gate.mjs --write-report=false
```

- [ ] Add pre-apply mode.

The full-chain gate must support a pre-apply mode that reads dry-run output files or explicit expected-delta input and must not require post-apply DB state. Apply is allowed only when pre-apply gate validates current DB state plus dry-run expected deltas.

**Exit gate:**
- Full chain gate fails on synthetic runtime fallback pollution.
- Full chain gate passes only when runtime-visible and trusted-chain evidence agree.

---

## Phase 6: Runtime UI Labels And Page Verification

**Owner lane:** Agent E owns admin/public UI provenance display and UI tests listed below.

**Purpose:** Make the admin/public UI honest about direct, inherited, derived, and projection-only loot.

**Files:**
- Modify: `data-query-app/pages/entities/[type].vue`
- Modify: `data-query-app/tests/npc-projection-json-visibility.test.mjs`
- Modify: `front/src/views/NpcDetailView.vue`
- Modify: `front/src/tests/npc-domain-contract.spec.ts`
- Modify or create public NPC shell tests after locating the current public NPC test pattern.

Implementation note:

- Do not copy any mojibake UI labels from older notes. Tests must assert stable keys or `data-testid` values, not translated display text.
- Required label keys are `trusted_structured_loot`, `prototype_inherited_loot`, `same_name_reference_loot`, `derived_audit_source`, and `projection_summary`.
- UI copy may be Chinese, but tests must not depend on fragile translated strings.

- [ ] Admin UI must label:
- `结构化掉落` for direct trusted rows
- `原型继承掉落` for `npc_type` fallback
- `同名参考掉落` for same-name fallback
- `原始来源校对` for `item_acquisition_sources`
- `投影摘要` for `lootItemsJson`

- [ ] Public UI must not mix:
- main trusted loot
- inherited/fallback loot
- projection related items

- [ ] Public UI must render separate sections.

The section titled `Loot`, `掉落`, or any equivalent trusted heading may render only rows where `isTrustedStructured=true` and `lootSourceMode=direct`.

Rows with `prototype`, `same_name`, `derived`, or `projection_only` must render under separate inherited/audit/projection sections and must not share the trusted loot count, card style, or heading.

- [ ] Add tests that fail if `lootItemsJson` rows are rendered as trusted direct loot.

- [ ] Add tests that fail if derived fallback rows are displayed without an audit-only label.

- [ ] Record page evidence.

For each required target, record:
- admin detail URL
- public detail URL
- API endpoint URL
- response fields `lootSourceMode`, `isTrustedStructured`, and `auditOnly`
- visible section headings
- trusted/fallback/projection row counts
- screenshot path or DOM assertion output proving fallback/projection rows are not under the trusted loot section

**Exit gate:**
- User-facing pages cannot hide provenance.
- Page evidence proves each visible row is classified as trusted, inherited, derived/audit-only, or projection-only.

---

## Phase 7: Dry-Run Sync And Controlled Apply

**Owner lane:** Agent F owns dry-run/apply orchestration and closeout audit docs. DB-writing commands remain serial and cannot be delegated to parallel workers.

**Purpose:** Only write data after gates and dry-runs prove the source chain is correct.

**Files:**
- Modify only if needed:
  - `scripts/data/maint/sync-landing-to-maint.mjs`
  - `scripts/data/relation/sync-maint-to-relation.mjs`
  - `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
  - `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Create: `docs/audits/2026-05-09_npc-loot-full-chain-dry-run.md`
- Create: `docs/audits/2026-05-09_npc-loot-full-chain-closeout.md`

- [ ] Run dry-runs only first:

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --scopes=item_sources
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --scopes=npc
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --domains=npcs
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false
```

- [ ] Record expected count deltas:
- landing itemSources
- `maint_item_sources`
- `item_source_facts`
- `item_source_details`
- `item_npc_loot_relations`
- `projection_npcs` with loot JSON
- `npc_loot_entries`
- `item_acquisition_sources`
- rejected/block-only rows by `sourceStatus` / `blockingReason`

- [ ] Record apply preconditions in dry-run doc.

Before any `--apply=true`, record:
- target database names and config source
- write-table whitelist for each command
- pre-apply row counts and checksums where practical
- expected insert/update/delete delta upper bounds per table
- backup or rollback plan
- the dry-run report path reviewed for each command
- explicit human approval

- [ ] Apply serially only if:
- full chain gate passes in dry-run mode
- mapping manifests validate
- runtime API samples are defined
- no active DB writer is running
- command write scope is within the documented whitelist

- [ ] Apply order:

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --scopes=item_sources
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --scopes=npc
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --domains=npcs
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true
```

- [ ] Post-apply verification:

```powershell
node scripts/data/audit/npc-loot-full-chain-gate.mjs --write-report=true --date-tag=2026-05-09-post-apply
node scripts/data/audit/npc-loot-runtime-display-audit.mjs --write-report=true --date-tag=2026-05-09-post-apply
```

**Exit gate:**
- Counts match expected deltas.
- Full chain gate passes.
- Required API/page samples match DB.

---

## Required API Samples

At minimum, verify these targets after implementation. These samples are mandatory smoke evidence, not a substitute for the whole-domain full-chain gate.

| Target | Required outcome |
| --- | --- |
| `Mimic` | contract-reviewed direct rows, no stale chest rows unless branch contract approves them |
| `IceMimic` | direct trusted rows remain present |
| `WaterBoltMimic` | direct trusted row remains present |
| `PresentMimic` | trusted rows from NPC-scoped source evidence, documented reviewed fallback mapping, or explicit `npc_group_page_loot_not_extracted` / `variant_npc_page_source_missing` status |
| `BigMimicCorruption` | trusted rows from NPC-scoped source evidence, documented reviewed fallback mapping, or explicit `npc_group_page_loot_not_extracted` / `variant_npc_page_source_missing` status |
| `BigMimicCrimson` | trusted Crimson Mimic rows from NPC-scoped source evidence; cannot pass as zero when Mimics page fixture proves parsable drops |
| `BigMimicHallow` | trusted rows from NPC-scoped source evidence, documented reviewed fallback mapping, or explicit `npc_group_page_loot_not_extracted` / `variant_npc_page_source_missing` status |
| `BigMimicJungle` | trusted rows from NPC-scoped source evidence, documented reviewed fallback mapping, or explicit `npc_group_page_loot_not_extracted` / `variant_npc_page_source_missing` status |
| `Blue Slime` | representative normal NPC with direct/derived parity |
| normal NPC with no direct rows but derived rows available | derived rows stay audit-only and outside trusted primary loot |
| same-name fallback representative | same-name fallback is labelled and outside trusted primary loot |
| boss or event enemy representative | direct trusted rows remain distinct from bag/event/container sources |
| biome variant representative | variant-specific rows do not collapse into a family bucket |
| critter or no-drop NPC representative | no fake loot appears |
| shop-only NPC representative | shop entries do not appear as NPC drops |
| `Pigron` | true ambiguous/generic handling remains blocked unless reviewed |
| `Ogre` | true ambiguous handling remains blocked unless reviewed |
| `Gold Chest` | never appears as NPC loot |
| `Azure Crate` | never appears as NPC loot |
| `Treasure Bag` | never appears as NPC loot |
| `Present` | never appears as NPC loot |
| `Shadow Orb` | never appears as NPC loot |
| `Herb Bag` | never appears as NPC loot |

For each sample, record public API, admin API, and rendered page classification.

---

## Hard Rules

1. No DB writes before read-only audits and dry-runs are reviewed.
2. No direct writes to `npc_loot_entries` as a closure mechanism.
3. No UI-only fix can count as data closure.
4. No generic bucket materializes without an approved mapping manifest.
5. No non-NPC source can enter `item_npc_loot_relations`.
6. No `same_name` fallback can be shown as prototype fallback.
7. No `derived` fallback can be shown as trusted structured loot.
8. No projection JSON can be treated as direct structured loot.
9. No old Mimic six-item gate can be used as the final family correctness proof without branch-aware contract review.
10. Running API/page behavior outranks historical reports.
11. Generated reports are evidence, not commit targets, unless explicitly requested.
12. Every closeout must record commands, counts, and API samples.

---

## Minimum Validation Set

Minimum validation is phase-scoped. Do not run final validation commands before the files they reference exist.

Phase 1:

```powershell
node --test scripts/data/audit/npc-loot-runtime-display-audit.test.mjs
cd back
mvn "-Dtest=AdminNpcControllerTest,PublicNpcServiceImplTest" test
```

Phase 2:

```powershell
node --test scripts/data/lib/wiki-page-utils.test.mjs scripts/data/lib/npc-loot-source-taxonomy.test.mjs scripts/data/relation/item-source-relation-processor.test.mjs
```

Phase 3:

```powershell
node --test scripts/data/audit/audit-mimic-family-loot-contract.test.mjs scripts/data/audit/npc-loot-correctness-gate.test.mjs
```

Phase 4:

```powershell
node --test scripts/data/audit/audit-npc-loot-reviewed-mappings.test.mjs
```

Phase 5 and final before merge:

```powershell
node --test scripts/data/audit/npc-loot-runtime-display-audit.test.mjs scripts/data/audit/npc-loot-full-chain-gate.test.mjs scripts/data/audit/audit-npc-loot-reviewed-mappings.test.mjs
node --test scripts/data/lib/wiki-page-utils.test.mjs scripts/data/lib/npc-loot-source-taxonomy.test.mjs scripts/data/relation/item-source-relation-processor.test.mjs
cd back
mvn "-Dtest=AdminNpcControllerTest,PublicNpcServiceImplTest,NpcControllerTest,PublicNpcAggregateControllerTest" test
cd ..\data-query-app
pnpm run test -- npc-projection-json-visibility
cd ..\front
pnpm run test -- npc-domain-contract
```

Run before data apply:

```powershell
node scripts/data/audit/npc-loot-full-chain-gate.mjs --write-report=false
node scripts/data/audit/npc-loot-runtime-display-audit.mjs --write-report=false
```

Run after data apply:

```powershell
node scripts/data/audit/npc-loot-full-chain-gate.mjs --write-report=true --date-tag=2026-05-09-post-apply
```

---

## Commit And Archive Boundaries

- No individual agent may commit partial implementation unless its phase exit gate and phase validation pass.
- Use focused phase commits: Phase 1 runtime contract, Phase 2 source classification, Phase 3-4 reviewed mapping contract, Phase 5 gate, Phase 6 UI labels, and Phase 7 data apply evidence.
- Commit source code, tests, contracts, reviewed mapping manifests, and required closeout docs.
- Do not commit generated report files except:
- `docs/audits/2026-05-09_npc-loot-full-chain-baseline.md`
- `docs/audits/2026-05-09_npc-loot-full-chain-dry-run.md`
- `docs/audits/2026-05-09_npc-loot-full-chain-closeout.md`
- Merge only after final full-chain gate, runtime display audit, backend tests, UI tests, and post-apply evidence all pass.
- Before every commit, run `git status --short` and `git diff --cached --stat`, then stage explicit files only.

---

## Closeout Criteria

The task is complete only when all are true:

- Full chain gate passes.
- Full-chain gate reports every active NPC and every materializable NPC loot source class by coverage status.
- Runtime display audit passes with no unlabelled trusted/fallback mismatch.
- Mimic family has branch-aware reviewed status for every target.
- Required API samples match DB trusted-chain evidence.
- Admin page labels direct/prototype/same-name/derived/projection rows distinctly.
- Public primary loot array and trusted loot section contain only `direct` / `isTrustedStructured=true` rows.
- Public page does not merge projection-only, inherited, same-name, or derived rows into trusted direct loot.
- Closeout document records before/after counts and remaining blocked categories.

If any generic or ambiguous NPC family remains unresolved, it must appear as an explicit blocked/warning category, not as a silent page defect.
