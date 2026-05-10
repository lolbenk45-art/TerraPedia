# NPC Domain Loot Data Chain Governance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. This plan is domain-governance work, not a Mimic-family patch. Discovery and read-only audits may run in parallel; shared source parsers, relation processors, projection/local sync, DB writes, and stack restarts are serial. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the NPC domain loot data chain as a whole so every active NPC has an explicit, traceable, machine-audited loot status: trusted structured loot, expected zero loot, blocked source gap, or blocked data pollution.

**Architecture:** Treat NPC loot as a domain evidence pipeline: `wiki/crawler source -> standardized NPC records -> landing -> maint_item_sources -> item_source_facts/source_details -> item_npc_loot_relations -> projection_npcs -> npc_loot_entries -> API/UI`. The acceptance gate must evaluate the whole NPC domain by stable row identity and per-NPC classification, not by one NPC family or by row counts alone.

**Tech Stack:** Node.js crawler/audit/relation scripts, MySQL `terria_v1_maint` / `terria_v1_relation` / `terria_v1_local`, Spring Boot admin/public NPC APIs, Nuxt admin UI, public frontend.

---

## Problem Statement

The previous work fixed real defects in the NPC loot chain, but its evidence and acceptance were still dominated by the Mimic family. That is not enough for domain closure.

Current known facts from read-only checks:

- `npc_loot_entries` was recently rewritten for `220` NPCs and `736` rows, so the write was not only Mimics.
- The current local table has about `244` NPCs with structured loot.
- There are still about `518` non-town local NPCs with zero structured loot.
- Many zero-loot NPCs may be legitimate: town/bound NPCs, critters, body/tail segments, projectiles, event helpers, or NPCs whose drops are inherited from a representative.
- Some zero-loot NPCs may be defects: unparsed NPC pages, unresolved variant pages, generic bucket sources, relation gaps, projection gaps, or local sync gaps.
- Existing `npc-loot-correctness-gate` is not a whole-domain proof. It is useful, but it cannot be the final gate for NPC domain readiness.

Therefore the next task must not ask "is Mimic fixed?" It must ask:

- For every active NPC, is its loot status classified?
- For every materializable source row, did it reach relation, projection, local, and API?
- For every blocked row, is the blocking reason explicit and stable?
- For every zero-loot NPC, is zero expected, inherited, source-missing, or a bug?
- For every UI-visible loot row, can the API expose whether it is direct, inherited, derived, projection-only, or blocked?

---

## Hard Boundaries

- Do not hand-edit `npc_loot_entries`, `item_npc_loot_relations`, `projection_npcs`, or `npcs.loot_items_json`.
- Do not use Mimic, Present Mimic, or any other family as the final acceptance scope.
- Do not pass the plan because a sample NPC looks correct.
- Do not hide incorrect data in UI instead of fixing the source chain.
- Do not let UI read crawler/wiki output directly as runtime truth.
- Do not auto-fan-out generic buckets such as `Mimics`, `Slimes`, `Mummies`, `Ghouls`, `Jellyfish`, `Pigrons`, `Sand Sharks`, `The Twins`, or `Celestial Pillars`.
- Do not treat `item_acquisition_sources` fallback as trusted structured loot unless it is classified and promoted through the relation chain.
- Do not run DB-writing commands until read-only baseline, dry-run diff, and rollback target are recorded.
- Do not claim full NPC domain closure while any active NPC has `unknown`, `unclassified_zero`, `projection_only`, `runtime_fallback_only`, or `count_parity_only` status.

---

## Domain Acceptance Model

Every active NPC must end in exactly one NPC status:

| NPC status | Meaning | Allowed at final gate |
| --- | --- | --- |
| `trusted_direct_loot` | Exact source rows materialized through relation, projection, local, and API. | Yes |
| `trusted_inherited_loot` | NPC intentionally inherits from a representative/prototype with audited mapping. | Yes |
| `expected_zero_loot` | NPC has no drops by design, and evidence/category proves that. | Yes |
| `unclassified_zero` | NPC has zero local loot and no accepted explanation yet. | No |
| `blocked_source_gap` | Source page/artifact is missing or not parseable. | No |
| `relation_gap` | Source is materializable but relation row is missing. | No |
| `projection_gap` | Relation exists but projection JSON is missing/stale/wrong. | No |
| `local_gap` | Projection/relation exists but `npc_loot_entries` is missing/stale/wrong. | No |
| `api_gap` | Local DB is correct but admin/public API or UI exposes wrong rows. | No |
| `duplicate_or_polluted` | NPC has duplicate rows, wrong item, wrong chance, wrong condition, or rows not backed by trusted source identity. | No |
| `runtime_fallback_only` | NPC is visible only through prototype, same-name, derived, or projection fallback and lacks trusted structured rows. | No |
| `projection_only` | NPC has projection JSON exposed without matching trusted local/API provenance. | No |
| `count_parity_only` | Counts match between stages but stable row identity does not match. | No |
| `unknown` | Audit cannot classify the NPC. | No |

Source rows must be classified separately. Source-row statuses must not be counted as successful NPC terminal states:

| Source-row status | Meaning | Final handling |
| --- | --- | --- |
| `accepted_materializable` | Exact, traceable NPC/item row may materialize. | May write through relation/projection/local. |
| `blocked_generic_bucket` | Generic source bucket cannot be safely mapped. | Blocks materialization and release unless each row has reviewed mapping. |
| `blocked_ambiguous_variant` | Multiple plausible NPC variants exist. | Blocks materialization and release unless reviewed mapping resolves the row. |
| `blocked_non_npc_source` | Chest/crate/tree/bag/present/etc. was parsed under NPC source type. | Must be excluded from NPC loot materialization and counted in source pollution summary. |
| `blocked_missing_item_or_npc_identity` | Item or NPC identity is missing after parsing. | Blocks materialization. |
| `duplicate_source_identity` | Duplicate source rows share stable identity. | Must dedupe or block with evidence. |

NPC status precedence must be deterministic. If multiple conditions match one NPC, classify in this order:

1. `duplicate_or_polluted`
2. `api_gap`
3. `local_gap`
4. `projection_gap`
5. `relation_gap`
6. `runtime_fallback_only`
7. `projection_only`
8. `count_parity_only`
9. `blocked_source_gap`
10. `trusted_direct_loot`
11. `trusted_inherited_loot`
12. `expected_zero_loot`
13. `unclassified_zero`
14. `unknown`

Contract-backed classifications short-circuit only source-gap and fallback-only classification. They do not short-circuit pollution, duplicate, projection, local, API, or row-identity checks. An NPC listed in `npc-domain-expected-zero-contract.md` must be classified as `expected_zero_loot`, not `blocked_source_gap`, even when no source page exists. An NPC listed in `npc-domain-loot-inheritance-contract.md` must be classified as `trusted_inherited_loot`, not `runtime_fallback_only`, as long as its source NPC has trusted structured loot and the inherited rows still pass projection/local/API parity checks. These contract-backed statuses are allowed only when backed by checked-in contract rows. They cannot be inferred from display name, current zero count, or ad hoc agent judgment.

Final gate requirements:

- `unknown = 0`
- `unclassified_zero = 0`
- `relation_gap = 0`
- `projection_gap = 0`
- `local_gap = 0`
- `api_gap = 0`
- `duplicate_or_polluted = 0`
- `runtime_fallback_only = 0`
- `projection_only = 0`
- `count_parity_only = 0`
- `blocked_generic_bucket = 0` for materializable NPC loot rows
- `blocked_ambiguous_variant = 0` for materializable NPC loot rows
- `blocked_missing_item_or_npc_identity = 0` for materializable NPC loot rows
- `blocked_non_npc_source_promoted = 0`
- `blocked_source_gap = 0`

Release waivers may allow a product release with documented exceptions, but a waived `blocked_source_gap` is still not NPC domain closure. Do not mark this plan complete while release waivers exist.

---

## Multi-Agent Work Split

| Lane | Scope | Can run in parallel | Serial boundary |
| --- | --- | --- | --- |
| Agent A | Whole-domain baseline and zero-loot classification audit | Read-only DB/report/API checks | No writes |
| Agent B | Source artifact and crawler coverage inventory | Read-only crawler artifacts and parser tests | Crawler/parser edits are serial |
| Agent C | Relation taxonomy and materialization guardrails | Unit tests and helper design | `item-source-relation-processor.mjs` edits are serial |
| Agent D | Projection/local/API parity audit | Read-only SQL/API checks and audit tests | Projection/local sync writes are serial |
| Agent E | Runtime API/UI provenance contract | Backend/frontend tests | Shared DTO/controller/service edits are serial |
| Agent F | Dry-run, DB apply, rollback, and closeout evidence | Dry-run report review | Any `--apply`, import, load, backfill, or stack restart is serial |

Coordination rules:

- Parallel agents may inspect the same DB in read-only mode.
- Only one agent may edit a shared script at a time.
- Only one agent may run a DB-writing command at a time.
- If two lanes need the same file, stop and reassign ownership before editing.
- No lane may define success using only Mimic-family samples.

---

## Phase 0: Branch, Baseline, And No-Write Lock

**Purpose:** Freeze the current state and prove the task starts as a whole NPC domain audit.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-chain-baseline.md`
- Create: `docs/contracts/npc-domain-expected-zero-contract.md`
- Create: `docs/contracts/npc-domain-loot-inheritance-contract.md`
- Read: `docs/plans/2026-05-09_npc-loot-full-chain-closeout-plan.md`
- Read: `docs/plans/2026-05-09_npc-loot-gap-closure-plan.md`
- Read: `docs/contracts/npc-loot-source-taxonomy-contract.md`
- Read: `docs/todo/backlog.md`

- [ ] Create an implementation branch:

```powershell
git switch -c fix/npc-domain-loot-data-chain
```

Expected:

- The branch is not `main`.
- Worktree is clean except intended plan/audit files.

- [ ] Record the current branch and worktree:

```powershell
git status --short --branch
git branch -vv
git worktree list
```

Expected:

- No unrelated uncommitted files.
- No existing task is writing NPC relation/projection/local tables.

- [ ] Record current local NPC and loot counts with read-only SQL:

```sql
SELECT COUNT(*) AS active_npcs
FROM terria_v1_local.npcs
WHERE deleted = 0;

SELECT COUNT(*) AS loot_rows,
       COUNT(DISTINCT npc_id) AS npcs_with_loot
FROM terria_v1_local.npc_loot_entries
WHERE deleted = 0;

SELECT COUNT(*) AS zero_non_town_npcs
FROM (
  SELECT n.id
  FROM terria_v1_local.npcs n
  LEFT JOIN terria_v1_local.npc_loot_entries e
    ON e.npc_id = n.id AND e.deleted = 0
  WHERE n.deleted = 0
    AND COALESCE(n.is_town_npc, 0) = 0
  GROUP BY n.id
  HAVING COUNT(e.id) = 0
) t;
```

- [ ] Record relation/projection/local parity counts:

```sql
SELECT COUNT(*) AS relation_loot_rows,
       COUNT(DISTINCT npc_internal_name) AS relation_npcs
FROM terria_v1_relation.item_npc_loot_relations
WHERE deleted = 0 AND status = 1;

SELECT COUNT(*) AS projection_npcs_with_loot
FROM terria_v1_relation.projection_npcs
WHERE deleted = 0
  AND status = 1
  AND JSON_LENGTH(loot_items_json) > 0;
```

- [ ] Write the baseline doc.

The baseline must include:

- active NPC count
- structured local loot row count
- NPCs with structured local loot
- zero-loot non-town NPC count
- relation row count
- projection row count
- current known Mimic-family state as a sample only
- explicit statement: "Mimic is not the acceptance scope"
- no-write confirmation

- [ ] Create the expected-zero contract.

`docs/contracts/npc-domain-expected-zero-contract.md` must define:

- contract version and review date
- allowed reasons: `town_npc_no_loot`, `bound_or_rescue_state`, `critter_no_loot`, `body_or_segment_inherits`, `event_helper_no_loot`, `projectile_or_effect_not_killable`
- required evidence fields: `npcInternalName`, `npcType`, `reason`, `evidenceSource`, `reviewedBy`, `reviewedAt`
- explicit rule that zero current DB rows are not evidence

- [ ] Create the inheritance contract.

`docs/contracts/npc-domain-loot-inheritance-contract.md` must define:

- contract version and review date
- representative mappings as rows: `targetNpcInternalName`, `sourceNpcInternalName`, `inheritanceKind`, `evidenceSource`, `reviewedBy`, `reviewedAt`
- allowed `inheritanceKind` values: `segment_family`, `prototype_variant`, `same_name_variant`
- explicit rule that same display name alone is not enough to inherit loot

**Exit gate:**

- Baseline document exists.
- Expected-zero contract exists.
- Inheritance contract exists.
- No DB-writing command ran.
- The baseline includes all-NPC counts, not only selected NPCs.

---

## Phase 1: Whole-Domain Classification Audit

**Purpose:** Create a read-only audit that classifies every active NPC and every NPC loot source gap.

**Files:**

- Create: `scripts/data/audit/npc-domain-loot-chain-audit.mjs`
- Create: `scripts/data/audit/npc-domain-loot-chain-audit.test.mjs`
- Read: `scripts/data/audit/npc-loot-gap-closure-audit.mjs`
- Read: `scripts/data/audit/npc-loot-correctness-gate.mjs`
- Read: `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- Read: `docs/contracts/npc-domain-expected-zero-contract.md`
- Read: `docs/contracts/npc-domain-loot-inheritance-contract.md`

- [ ] Add a failing fixture test for active NPC classification completeness.

Test case:

```js
test('classifies every active NPC exactly once', () => {
  const report = buildNpcDomainLootChainReport({
    npcs: [
      { internalName: 'DirectNpc', isTownNpc: false },
      { internalName: 'ZeroNpc', isTownNpc: false },
      { internalName: 'GapNpc', isTownNpc: false },
    ],
    localLootRows: [{ npcInternalName: 'DirectNpc', itemInternalName: 'ItemA' }],
    expectedZeroRules: [{ npcInternalName: 'ZeroNpc', reason: 'town_or_non_loot_entity' }],
    sourceGaps: [{ npcInternalName: 'GapNpc', reason: 'source_page_missing' }],
  });
  assert.equal(report.summary.activeNpcs, 3);
  assert.equal(report.summary.classifiedNpcs, 3);
  assert.equal(report.summary.unknown, 0);
});
```

Expected before implementation:

- FAIL because `buildNpcDomainLootChainReport` does not exist.

- [ ] Implement classification statuses.

Required NPC statuses:

- `trusted_direct_loot`
- `trusted_inherited_loot`
- `expected_zero_loot`
- `unclassified_zero`
- `blocked_source_gap`
- `relation_gap`
- `projection_gap`
- `local_gap`
- `api_gap`
- `duplicate_or_polluted`
- `runtime_fallback_only`
- `projection_only`
- `count_parity_only`
- `unknown`

Required source-row statuses:

- `accepted_materializable`
- `blocked_generic_bucket`
- `blocked_ambiguous_variant`
- `blocked_non_npc_source`
- `blocked_missing_item_or_npc_identity`
- `duplicate_source_identity`

- [ ] Add zero-loot classification tests.

Fixtures must include:

- town NPC or bound NPC classified as `expected_zero_loot`
- critter or harmless entity classified as `expected_zero_loot` only when the source/category proves no drops
- body/tail/segment NPC classified as `trusted_inherited_loot` only with audited representative mapping
- hostile enemy with source evidence but no local rows classified as `local_gap` or `relation_gap`
- hostile enemy with no usable source classified as `blocked_source_gap`, not silently ignored
- a zero-loot NPC without a row in `npc-domain-expected-zero-contract.md` classified as `unclassified_zero`
- an inherited NPC without a row in `npc-domain-loot-inheritance-contract.md` classified as `runtime_fallback_only`

- [ ] Add source-row classification tests.

Fixtures must include:

- generic bucket source row
- true ambiguous variant source row
- non-NPC source row such as chest/crate/tree/bag/present
- exact NPC source row
- duplicate exact rows for the same NPC/item/chance/condition

- [ ] Add report output shape.

Required report fields:

- `auditName`
- `generatedAt`
- `auditStatus`
- `evidenceHealth`
- `summary`
- `npcStatuses[]`
- `sourceRows[]`
- `chainGaps[]`
- `duplicates[]`
- `blockedRows[]`
- `releaseBlockers[]`
- `options`

Required summary fields:

- `activeNpcs`
- `classifiedNpcs`
- `trustedDirectLoot`
- `trustedInheritedLoot`
- `expectedZeroLoot`
- `unclassifiedZero`
- `blockedSourceGap`
- `blockedGenericBucket`
- `blockedAmbiguousVariant`
- `blockedNonNpcSource`
- `blockedNonNpcSourcePromoted`
- `blockedMissingItemOrNpcIdentity`
- `relationGap`
- `projectionGap`
- `localGap`
- `apiGap`
- `duplicateOrPolluted`
- `runtimeFallbackOnly`
- `projectionOnly`
- `countParityOnly`
- `unknown`
- `releaseBlockingCount`

Every `npcStatuses[]` row must include:

- `npcInternalName`
- `npcName`
- `npcType`
- `npcStatus`
- `statusReason`
- `sourceCoverageStatus`
- `contractRef`
- `relationLootCount`
- `projectionLootCount`
- `localLootCount`
- `apiLootCount`
- `rowIdentityHash`

- [ ] Run the audit in read-only mode:

```powershell
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-baseline
```

Expected:

- A report is written under `reports/audit/`.
- The first real report may be `blocked`; that is expected.
- The report must not write DB records.

**Exit gate:**

- Every active NPC appears in `npcStatuses[]`.
- Unknown/unclassified NPCs are visible, not hidden.
- Mimic-family rows appear only as part of the whole domain.
- The audit blocks on unknown, unclassified zero, relation gaps, projection gaps, local gaps, API gaps, duplicates, and polluted rows.
- `trusted_inherited_loot` rows without inheritance contract references are blocked.
- `expected_zero_loot` rows without expected-zero contract references are blocked.

---

## Phase 2: Source Coverage Inventory

**Purpose:** Prove whether each NPC has a usable source artifact before changing parser or relation code.

**Files:**

- Create: `scripts/data/audit/npc-source-coverage-inventory.mjs`
- Create: `scripts/data/audit/npc-source-coverage-inventory.test.mjs`
- Read: `data/wiki-crawler/report/npc/coverage-audit.latest.json`
- Read: `data/wiki-crawler/report/npc/coverage-targets.latest.json`
- Read: `data/standardized/npcs.standardized.json`
- Read: `data/generated/npc-standardized-map.json`
- Read: `scripts/data/crawler/src/domains/npc-parser.mjs`
- Read: `scripts/data/fetch/build-npc-item-relations-bundle.mjs`

- [ ] Add tests for source coverage categories.

Required categories:

- `source_page_present_with_loot`
- `source_page_present_no_loot`
- `source_page_present_parse_failed`
- `source_page_missing`
- `group_page_present_variant_not_extracted`
- `item_page_reverse_source_only`
- `no_source_required_expected_zero`

- [ ] Build the inventory report.

Each NPC row must include:

- `npcInternalName`
- `npcName`
- `npcType`
- `sourcePage`
- `sourceUrl`
- `crawlerCoverageStatus`
- `standardizedLootCount`
- `maintSourceCount`
- `relationLootCount`
- `projectionLootCount`
- `localLootCount`
- `sourceCoverageStatus`
- `nextAction`

- [ ] Run read-only inventory:

```powershell
node scripts/data/audit/npc-source-coverage-inventory.mjs --write-report=true --date-tag=2026-05-10-baseline
```

Expected:

- Report contains all active NPCs.
- It does not run crawler.
- It does not write DB records.

**Exit gate:**

- The plan knows whether gaps are source missing, parse missing, relation missing, projection missing, local missing, or expected zero.
- No parser fix starts before this report exists.

---

## Phase 3: General NPC Source Parsing Fixes

**Purpose:** Fix source extraction for the NPC domain patterns found in Phase 2, not for one family name.

**Files:**

- Modify: `scripts/data/crawler/src/domains/npc-parser.mjs`
- Modify: `scripts/data/crawler/tests/npc-parser.test.mjs`
- Modify: `scripts/data/fetch/build-npc-item-relations-bundle.mjs`
- Modify: `scripts/data/fetch/build-npc-item-relations-bundle.test.mjs`

- [ ] Add failing parser fixtures for general patterns.

Fixtures must cover at least:

- single NPC page with regular drops table
- NPC page with infobox loot rows
- group page with multiple NPC infoboxes
- group page with section-scoped drops
- variant page where source infobox identifies the target NPC
- page with no drops where zero is expected
- page with non-NPC source rows that must not become NPC loot

- [ ] Implement parser behavior by pattern, not by NPC name.

Rules:

- Prefer exact `sourceRefInternalName` from the NPC page or source infobox when available.
- Preserve `sourcePage`, `sourceUrl`, `sourceRevisionTimestamp`, `sourceSection`, `sourceRowKey`, `chanceText`, `quantityText`, and `conditionText`.
- Emit rows with `parseStatus='parsed'` only when item identity and NPC identity are both traceable.
- Emit `parseStatus='blocked'` with a reason when the row is ambiguous.
- Do not add family-specific allowlists as parser logic.

- [ ] Run parser tests:

```powershell
node --test scripts/data/crawler/tests/npc-parser.test.mjs
```

Expected:

- All parser tests pass.
- No DB writes occur.

**Exit gate:**

- Parser can handle all source patterns identified by Phase 2.
- Parser does not contain Mimic-only success logic.

---

## Phase 4: Relation Taxonomy And Materialization Guardrails

**Purpose:** Ensure only traceable and safe NPC loot rows materialize.

**Files:**

- Modify: `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- Modify: `scripts/data/lib/npc-loot-source-taxonomy.test.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.test.mjs`
- Read: `docs/contracts/npc-loot-source-taxonomy-contract.md`

- [ ] Add tests for domain-wide taxonomy.

Required cases:

- exact NPC source row is accepted
- representative segment family is accepted only with explicit representative mapping
- generic bucket is blocked unless a reviewed item-scoped mapping exists
- ambiguous variants are blocked
- non-NPC source under `source_ref_type='npc'` is excluded from NPC loot materialization
- duplicate rows are deduped only when source identity proves they are the same row
- same item from same NPC with different condition/chance remains separate

- [ ] Implement taxonomy output.

Every row must receive:

- `status`
- `reason`
- `targetNpcInternalName`
- `sourceRefResolution`
- `materializable`
- `requiresReviewedMapping`
- `trace`

- [ ] Run relation tests:

```powershell
node --test scripts/data/lib/npc-loot-source-taxonomy.test.mjs scripts/data/relation/item-source-relation-processor.test.mjs
```

Expected:

- Tests pass.
- No DB writes occur.

**Exit gate:**

- Relation materialization rules are domain-wide.
- Generic bucket and variant ambiguity are blocked for every NPC family, not only Mimics.

---

## Phase 5: Projection, Local, API, And UI Provenance Contract

**Purpose:** Make runtime loot provenance explicit so fallback/projection rows cannot masquerade as trusted structured drops.

**Files:**

- Create: `scripts/data/audit/npc-loot-runtime-parity-audit.mjs`
- Create: `scripts/data/audit/npc-loot-runtime-parity-audit.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/dto/NpcLootEntryDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java`
- Modify: `front/src/types/npcDomain.ts`
- Modify: `front/src/views/NpcDetailView.vue`
- Modify: `front/src/tests/npc-detail-entry.spec.ts`
- Modify: `data-query-app/pages/entities/[type].vue`
- Modify: `data-query-app/tests/npc-projection-json-visibility.test.mjs`

- [ ] Add backend provenance tests.

Required cases:

- direct local loot row returns `lootSourceMode='direct'` and `trustedStructured=true`
- prototype fallback row returns `lootSourceMode='prototype'` and `trustedStructured=false`
- same-name fallback row returns `lootSourceMode='same_name'` and `trustedStructured=false`
- derived fallback row returns `lootSourceMode='derived'` and `trustedStructured=false`
- admin detail payload exposes provenance for `lootEntries`, `inheritedLootEntries`, and `derivedLootEntries`

- [ ] Add backend provenance fields.

`NpcLootEntryDTO` must expose:

- `lootSourceMode`: one of `direct`, `prototype`, `same_name`, `derived`, `projection_only`
- `trustedStructured`: boolean
- `sourceNpcId`: populated for inherited rows when available
- `sourceNpcInternalName`: populated for inherited rows when available
- `sourceRowKey`: populated for relation-backed rows when available

- [ ] Update backend loaders.

Rules:

- `loadStructuredLootByNpcId` returns `lootSourceMode='direct'` and `trustedStructured=true`.
- `loadPrototypeStructuredLoot` returns `lootSourceMode='prototype'` and `trustedStructured=false` unless a representative inheritance mapping is audited.
- `loadSameNameStructuredLoot` returns `lootSourceMode='same_name'` and `trustedStructured=false`.
- `loadDerivedLoot` returns `lootSourceMode='derived'` and `trustedStructured=false`.
- Projection-only rows must never be returned as direct structured loot.

- [ ] Update admin/public UI display.

Rules:

- Direct trusted rows display as normal loot.
- Prototype, same-name, derived, and projection-only rows must show a visible provenance label.
- The UI must not merge fallback rows into the same visual status as trusted structured loot.
 
- [ ] Run backend and UI provenance tests:

```powershell
Push-Location back
mvn "-Dtest=PublicNpcServiceImplImageTest,AdminNpcControllerTest" test
Pop-Location
Push-Location front
pnpm test -- npc-detail-entry.spec.ts
Pop-Location
Push-Location data-query-app
pnpm test -- npc-projection-json-visibility.test.mjs
Pop-Location
```

Expected:

- Tests pass.
- No DB writes occur.

**Exit gate:**

- API exposes provenance for every loot row.
- UI display can no longer be accepted based only on DB counts.
- Fallback rows remain visible, but they are not labeled as trusted structured loot.

---

## Phase 6: Projection, Local, And API Parity Audit

**Purpose:** Prove data that is trusted by relation is what users actually see.

**Files:**

- Modify: `scripts/data/audit/npc-loot-runtime-parity-audit.mjs`
- Modify: `scripts/data/audit/npc-loot-runtime-parity-audit.test.mjs`

- [ ] Add parity tests.

Required cases:

- relation row exists but projection missing -> `projection_gap`
- projection exists but local missing -> `local_gap`
- local exists but API missing -> `api_gap`
- API returns fallback-only data without provenance -> `runtime_fallback_only`
- API returns projection-only data as trusted direct loot -> `projection_only`
- duplicate local rows -> `duplicate_or_polluted`
- relation/projection/local counts match but row identities differ -> `count_parity_only`

- [ ] Run parity audit:

```powershell
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-baseline
```

Expected:

- Report writes under `reports/audit/`.
- No DB writes occur.

**Exit gate:**

- Runtime/API gaps are visible before any data apply.
- Count parity without row identity parity is blocking.

---

## Phase 7: Dry-Run Data Refresh Plan

**Purpose:** Prepare the write sequence without mutating DB until all read-only gates are understood.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-chain-dry-run.md`
- Read: `scripts/data/maint/sync-landing-to-maint.mjs`
- Read: `scripts/data/relation/sync-maint-to-relation.mjs`
- Read: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Read: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`

- [ ] Record exact dry-run commands.

Use these candidate commands from repo root. They must be verified in the dry-run doc before any apply:

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --scopes=item_sources --output=reports/maint-sync-npc-domain-loot-2026-05-10-dry-run.json
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --scopes=npc --relation-database=terria_v1_relation --maint-database=terria_v1_maint --local-database=terria_v1_local
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --date-tag=2026-05-10-dry-run
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --domains=npcs --date-tag=2026-05-10-dry-run
```

If any command does not actually support dry-run or writes despite `--apply=false`, stop and add a failing unit test for that script before proceeding.

- [ ] Record pre-write checkpoints.

Required checkpoint queries:

- local NPC count
- local loot row count
- relation loot row count
- projection loot count
- duplicate row count
- zero-loot classification summary
- release blocker summary

- [ ] Run dry-runs only.

Expected:

- Dry-run reports show proposed inserts/updates/deletes.
- Dry-run reports identify per-stage row deltas.
- No DB writes occur.

- [ ] Review dry-run results.

Block if:

- large unexplained deletion
- any `unknown` NPC increases
- any materializable row is dropped without blocked reason
- any source row becomes UI-visible without relation provenance
- duplicate rows increase
- only Mimic-family rows changed while the report still has domain-wide blockers

**Exit gate:**

- Dry-run deltas are understood.
- Rollback target is recorded.
- DB apply order is defined.
- Each apply command has a matching dry-run command with the same scope.

---

## Phase 8: Serial Apply And Verification

**Purpose:** Apply only after audits and dry-runs prove the chain is safe.

**Files:**

- Create: `docs/audits/2026-05-10_npc-domain-loot-chain-closeout.md`
- Generate: `reports/audit/npc-domain-loot-chain-2026-05-10-post-apply.json`
- Generate: `reports/audit/npc-loot-runtime-parity-2026-05-10-post-apply.json`
- Generate: DB checkpoint files under `reports/db-checkpoints/`

- [ ] Stop if worktree is dirty with unrelated files:

```powershell
git status --short --branch
```

Expected:

- Only intended NPC domain files are dirty.

- [ ] Take pre-apply DB checkpoints.

Required checkpoint:

- relation loot rows
- projection NPC loot JSON rows
- local `npc_loot_entries`
- sample API outputs for at least 20 NPCs selected by audit categories, not by family

- [ ] Run DB-writing commands serially.

Rules:

- One command at a time.
- Record command, start time, end time, row deltas, and output report.
- Do not run parallel writes.
- Stop immediately if row deltas do not match dry-run expectations.

- [ ] Run post-apply audits:

```powershell
node scripts/data/audit/npc-domain-loot-chain-audit.mjs --write-report=true --date-tag=2026-05-10-post-apply
node scripts/data/audit/npc-loot-runtime-parity-audit.mjs --write-report=true --date-tag=2026-05-10-post-apply
```

Expected:

- Both reports pass final gate requirements, or closeout explicitly states blockers and does not claim closure.

- [ ] Restart and verify stack only after DB writes finish:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\verify-local-stack.ps1
```

Expected:

- Stack verification passes.

**Exit gate:**

- Full NPC domain audit passes.
- Runtime parity audit passes.
- Admin/public API samples match DB.
- Closeout doc records command evidence.

---

## Phase 9: Final Quality Gate And Commit

**Purpose:** Ensure the implementation is reviewable and not mixed with unrelated work.

**Files:**

- Modify/create only files listed in the previous phases.
- Do not include unrelated UI/image/buff/projectile work.

- [ ] Run targeted tests:

```powershell
node --test scripts/data/audit/npc-domain-loot-chain-audit.test.mjs scripts/data/audit/npc-source-coverage-inventory.test.mjs scripts/data/audit/npc-loot-runtime-parity-audit.test.mjs
node --test scripts/data/crawler/tests/npc-parser.test.mjs
node --test scripts/data/lib/npc-loot-source-taxonomy.test.mjs scripts/data/relation/item-source-relation-processor.test.mjs
node --test scripts/data/fetch/build-npc-item-relations-bundle.test.mjs
Push-Location back
mvn "-Dtest=PublicNpcServiceImplImageTest,AdminNpcControllerTest" test
Pop-Location
Push-Location front
pnpm test -- npc-detail-entry.spec.ts
Pop-Location
Push-Location data-query-app
pnpm test -- npc-projection-json-visibility.test.mjs
Pop-Location
```

Expected:

- All targeted tests pass.

- [ ] Run project quality gate:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\quality-gate.ps1
```

Expected:

- Pass, or any failure is documented and directly unrelated. Do not merge with unexplained failures.

- [ ] Review git scope:

```powershell
git status --short
git diff --stat
git diff --cached --stat
```

Expected:

- Only NPC domain data-chain files, reports, and closeout docs are included.

- [ ] Commit with focused message:

```powershell
git add docs/plans/2026-05-10_npc-domain-loot-data-chain-governance-plan.md
git add docs/audits/2026-05-10_npc-domain-loot-chain-baseline.md
git add docs/audits/2026-05-10_npc-domain-loot-chain-dry-run.md
git add docs/audits/2026-05-10_npc-domain-loot-chain-closeout.md
git add docs/contracts/npc-domain-expected-zero-contract.md
git add docs/contracts/npc-domain-loot-inheritance-contract.md
git add scripts/data/audit/npc-domain-loot-chain-audit.mjs
git add scripts/data/audit/npc-domain-loot-chain-audit.test.mjs
git add scripts/data/audit/npc-source-coverage-inventory.mjs
git add scripts/data/audit/npc-source-coverage-inventory.test.mjs
git add scripts/data/audit/npc-loot-runtime-parity-audit.mjs
git add scripts/data/audit/npc-loot-runtime-parity-audit.test.mjs
git add scripts/data/crawler/src/domains/npc-parser.mjs
git add scripts/data/crawler/tests/npc-parser.test.mjs
git add scripts/data/fetch/build-npc-item-relations-bundle.mjs
git add scripts/data/fetch/build-npc-item-relations-bundle.test.mjs
git add scripts/data/lib/npc-loot-source-taxonomy.mjs
git add scripts/data/lib/npc-loot-source-taxonomy.test.mjs
git add scripts/data/relation/item-source-relation-processor.mjs
git add scripts/data/relation/item-source-relation-processor.test.mjs
git add back/src/main/java/com/terraria/skills/dto/NpcLootEntryDTO.java
git add back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java
git add back/src/main/java/com/terraria/skills/controller/AdminNpcController.java
git add back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java
git add back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java
git add front/src/types/npcDomain.ts
git add front/src/views/NpcDetailView.vue
git add front/src/tests/npc-detail-entry.spec.ts
git add "data-query-app/pages/entities/[type].vue"
git add data-query-app/tests/npc-projection-json-visibility.test.mjs
git commit -m "fix: close NPC domain loot data chain"
```

Expected:

- Commit includes only reviewed NPC domain scope.

---

## Self-Review

- This plan does not use Mimic-family correctness as the final acceptance scope.
- The final gate is whole-domain and requires every active NPC to be classified.
- Zero-loot NPCs are not automatically failures, but they must be explained.
- Generic buckets are not auto-promoted.
- Relation/projection/local/API are all validated by row identity, not by counts only.
- DB writes are blocked until baseline and dry-run evidence exist.
- Multi-agent parallelism is limited to read-only or disjoint files; shared scripts and DB writes are serial.
- Remaining blockers must be reported as blockers, not hidden as pass conditions.
