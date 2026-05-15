# Buff Full Evidence Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair all buff evidence data, not only `CursedInferno`, so every buff with Wiki page evidence can expose traceable source items, inflicting NPCs, and full immune NPC data through standardized data, DB, API, and UI.

**Architecture:** Treat `terraria.wiki.gg` API page evidence as the authoritative source for buff page-specific facts, then propagate parsed facts through standardized JSON, maint, relation, projection, local compatibility tables, backend DTOs, and public/admin UI. Keep source item ownership in `buff_source_items`, inflicting NPC ownership in `npc_buff_relations`, and full immune NPC evidence in relation/projection JSON until a dedicated immune relation table exists.

**Tech Stack:** Node.js ESM data scripts, `node:test`, MySQL/MariaDB on WSL `127.0.0.1:13306`, Spring Boot + MyBatis/JdbcTemplate, Vue 3/Nuxt public/admin UI, existing TerraPedia relation/projection scripts.

---

## Current Baseline

Read-only multi-agent audit on `2026-05-15` found:

- `data/standardized/buffs.standardized.json` has 388 records.
- Only 1 record has complete `sourceItems + inflictingNpcs + immuneNpcs + sourceEvidence`: `CursedInferno / 诅咒狱火 / id=39`.
- 387 records lack page-level `sourceEvidence`.
- 224 records have no `sourceItems`.
- 19 records have `immuneNpcCount > 0` but no full `immuneNpcs`.
- `inflictingNpcs` is non-empty only for `CursedInferno` in standardized JSON.
- Local DB has some old `npc_buff_relations`, but relation/projection only carries `CursedInferno`.
- `OnFire3 / Hellfire / 狱炎 / id=323` currently has `sourceItems=[]`, `inflictingNpcs=[]`, `immuneNpcCount=47`, no full `immuneNpcs`, and no `sourceEvidence`.
- Wiki API parser can parse `Hellfire` evidence as `sourceItems=16`, `immuneNpcCount=59`, proving this is a stale/incomplete data-chain problem, not just a UI issue.

High-priority gaps include `Poisoned`, `OnFire`, `Bleeding`, `Confused`, `BrokenArmor`, `Frostburn`, `Ichor`, `Venom`, `ShadowFlame`, `Daybreak`, `BetsysCurse`, `Oiled`, `OnFire3/Hellfire`, `Frostburn2`, `Shimmer`, and `Hemorrhage`.

## Scope

Included:

- Generalize buff page evidence refresh from one-target repair to all-buff batch refresh.
- Use Wiki API/page parse payloads, not browser automation.
- Preserve source page, section anchors, revision timestamp, parse status, and unresolved facts.
- Map source items and NPCs to local identities without silently dropping unresolved rows.
- Propagate evidence through standardized JSON, maint, relation, projection, local compatibility tables, backend API, and UI.
- Add full-data audit gates so one fixed sample cannot make the buff domain pass.
- Use WSL MySQL `127.0.0.1:13306`; do not use local Windows `3306`.

Out of scope:

- Production DB writes.
- Destructive DB reset.
- Replacing the whole crawler stack.
- Migrating MinIO as part of this plan.
- Inventing facts missing from Wiki/API evidence.
- Treating image repair as the main goal, except verifying item/NPC images still resolve from local DB/managed MinIO in buff detail cards.

## Closure Definition

The repair is complete only when:

- Batch evidence refresh can process all 388 buff records with cache, resume, dry-run, rate limit, and failure report.
- Every buff with parseable page evidence has `sourceEvidence` and correct fact groups in standardized JSON.
- Every buff with source items has matching `buff_source_items` rows after import/sync.
- Every buff with inflicting NPC evidence has matching `npc_buff_relations` rows after relation sync.
- Every buff with immune NPC evidence has full `immuneNpcs` in relation/projection evidence JSON, not just count/sample fallback.
- `/api/public/buffs/{id}` returns consistent full detail for fixed samples including `CursedInferno` and `OnFire3/Hellfire`.
- UI detail pages display source items, inflicting NPCs, and immune NPCs with local DB/managed image URLs when available.
- Audit report shows all remaining missing/unresolved cases with explicit reason categories.

## Multi-Agent Ownership

## Execution Serialization Rules

- Implementation agents may work in parallel only when their write scopes are disjoint.
- Wiki fetch/runtime crawl commands, DB import/sync commands, backend restart, and final API smoke must be run by the coordinator in sequence, not by parallel agents.
- No implementation agent may write `terria_v1_local`, `terria_v1_maint`, or `terria_v1_relation`; agents may add scripts/tests and run unit tests only.
- The only allowed data-write sequence is: dry-run report review, batch evidence file write, standardization, import to local, maint sync, relation sync, projection sync, backend restart, runtime smoke.
- If any step writes data or generated JSON used by later steps, later steps must wait for coordinator confirmation and fresh `git status --short`.
- If a parallel agent discovers a schema or contract gap that affects another agent's owned files, it must report the gap instead of editing outside its ownership.

### Agent A: Wiki Evidence Fetch and Parser

Write scope:

- `scripts/data/fetch/buff-immunity-page-parser.mjs`
- `scripts/data/fetch/buff-immunity-page-parser.test.mjs`
- `scripts/data/fetch/fetch-wiki-buffs.mjs`
- `scripts/data/fetch/fetch-wiki-buffs.test.mjs`
- `scripts/data/fetch/refresh-target-buff-page-evidence.mjs`
- `scripts/data/fetch/refresh-target-buff-page-evidence.test.mjs`
- New batch script if needed: `scripts/data/fetch/refresh-buff-page-evidence-batch.mjs`
- New reports under `reports/buffs/`

Boundaries:

- Do not write DB.
- Do not edit backend/UI.
- Do not run multiple Wiki API processes concurrently.
- Do not overwrite existing non-empty facts with empty parser output unless parse status proves the page has no corresponding section.

### Agent B: Identity Resolution and Standardization

Write scope:

- `scripts/data/transform/standardize-existing-data.mjs`
- `scripts/data/transform/standardize-existing-data.test.mjs`
- `scripts/data/import/import-buffs-to-db.mjs`
- `scripts/data/import/import-independent-entities-to-db.mjs`
- `scripts/data/import/buff-source-item-mapping.test.mjs`
- New resolver helper if needed under `scripts/data/lib/`

Boundaries:

- Do not call Wiki API.
- Do not change backend/UI.
- Do not guess ambiguous item/NPC identities; keep unresolved rows in evidence/report.

### Agent C: Maint, Relation, Projection, Local Sync

Write scope:

- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/maint/sync-landing-to-maint.test.mjs`
- `scripts/data/relation/buff-entity-processor.mjs`
- `scripts/data/relation/buff-entity-processor.test.mjs`
- `scripts/data/relation/secondary-relation-processor.mjs`
- `scripts/data/relation/secondary-relation-processor.test.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/relation/sync-maint-to-relation.test.mjs`
- `scripts/data/relation/projection-sync.mjs`
- `scripts/data/relation/projection-sync.test.mjs`
- `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- `scripts/data/relation/sync-projection-to-local-core-tables.test.mjs`
- Schema files only if tests prove an existing table cannot store required evidence.

Boundaries:

- Use existing `relation_buffs.immune_npcs_json` and `projection_buffs.immune_npcs_json` first.
- Do not add a new immune relation table unless the current JSON ownership cannot satisfy API/UI and audit requirements.
- Do not write local DB during implementation tests except explicitly documented local validation.

### Agent D: Backend API and UI Runtime

Write scope:

- `back/src/main/java/com/terraria/skills/controller/PublicBuffController.java`
- `back/src/main/java/com/terraria/skills/service/PublicBuffService.java`
- `back/src/main/java/com/terraria/skills/service/impl/PublicBuffServiceImpl.java`
- `back/src/main/java/com/terraria/skills/dto/PublicBuffListDTO.java`
- `back/src/main/java/com/terraria/skills/dto/PublicBuffDetailDTO.java`
- `front/src/api/index.ts`
- `front/src/types/index.ts`
- `front/src/views/BuffPublicView.vue`
- `data-query-app/pages/entities/[type].vue`
- Existing focused tests under `front/src/tests/`, `data-query-app/tests/`, and backend test packages.

Boundaries:

- Do not modify data scripts.
- Do not make UI read raw Wiki image URLs as the primary image source.
- Keep large immune lists collapsed/truncated or otherwise safe for runtime rendering.

### Agent E: Audit, Acceptance, and Merge Gate

Write scope:

- `scripts/data/audit/audit-buff-domain-coverage-baseline.mjs`
- `scripts/data/audit/audit-buff-domain-coverage-baseline.test.mjs`
- New read-only smoke/audit scripts under `scripts/data/audit/` if needed.
- Final report under `reports/buffs/`

Boundaries:

- Do not patch production code to make audits pass.
- Do not write DB.
- Report unresolved facts by category instead of suppressing them.

## Data Contract

Each buff record can carry:

```json
{
  "sourceItems": [
    {
      "itemId": 123,
      "internalName": "CursedArrow",
      "name": "Cursed Arrow",
      "nameZh": "诅咒箭",
      "pageTitle": "Cursed Arrow",
      "section": "来自玩家",
      "source": "buff-page-causes",
      "resolveStatus": "resolved"
    }
  ],
  "inflictingNpcs": [
    {
      "npcId": 214,
      "internalName": "Clinger",
      "name": "Clinger",
      "nameZh": "爬藤怪",
      "pageTitle": "Clinger",
      "section": "来自敌怪",
      "source": "buff-page-causes",
      "resolveStatus": "resolved"
    }
  ],
  "immuneNpcs": [
    {
      "npcId": 68,
      "internalName": "DungeonGuardian",
      "name": "Dungeon Guardian",
      "nameZh": "地牢守卫者",
      "pageTitle": "Dungeon Guardian",
      "section": "免疫的 NPC",
      "source": "buff-page-immunities",
      "resolveStatus": "resolved"
    }
  ],
  "sourceEvidence": {
    "provider": "terraria.wiki.gg",
    "pageTitle": "Hellfire",
    "canonicalPageTitle": "Hellfire",
    "revisionId": 123456,
    "revisionTimestamp": "2026-05-15T00:00:00Z",
    "sectionAnchors": ["原因", "来自玩家", "来自敌怪", "免疫的_NPC"],
    "parseStatus": "parsed",
    "unresolvedFacts": []
  }
}
```

Rules:

- Empty arrays are valid only when `sourceEvidence.parseStatus` explains `section_missing`, `no_rows`, or another terminal reason.
- Parser failures must use `parse_incomplete` or `fetch_failed` and must not erase existing valid facts.
- Duplicate Wiki rows should be deduped only by stable identity plus semantic qualifier. Do not blindly collapse entries like tower tiers or variants if they represent distinct sources.
- `sourceItems` map to `buff_source_items`.
- `inflictingNpcs` map to `npc_buff_relations` with relation type `inflicts`.
- `immuneNpcs` stay in full evidence JSON in relation/projection until a dedicated table is introduced.

## Execution Plan

### P0: Baseline Audit and Target Classification

- [ ] Run a read-only standardized JSON audit that counts total buffs, `sourceEvidence`, `sourceItems`, `inflictingNpcs`, full `immuneNpcs`, and count/sample-only cases.
- [ ] Run read-only DB checks on `127.0.0.1:13306` for `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation`.
- [ ] Produce `reports/buffs/buff-evidence-baseline.latest.json`.
- [ ] Classify each buff as `complete`, `missing_source_items`, `missing_inflicting_npcs`, `missing_full_immune_npcs`, `missing_source_evidence`, `parse_required`, or `manual_review_required`.
- [ ] Fixed smoke list must include `CursedInferno`, `OnFire`, `OnFire3/Hellfire`, `Poisoned`, `Bleeding`, `Confused`, `Frostburn`, `Frostburn2`, `Ichor`, `Venom`, `ShadowFlame`, `Shimmer`, and `Hemorrhage`.

### P1: Generalize Wiki API Evidence Refresh

- [ ] Add or extend a batch refresh command for all buffs with `--dry-run`, `--limit`, `--offset`, `--ids`, `--internal-names`, `--only-missing`, `--force`, `--cache-dir`, `--progress-path`, `--sample-limit`, and `--request-delay-ms`.
- [ ] Fetch via existing Wiki API helpers such as `fetchWikiPagePayload()` and `wiki-request-gate.mjs`, not browser page scraping.
- [ ] Use page title fallback order: `localized.en.page`, `localized.en.title`, `localized.zh.page`, `localized.zh.title`, `englishName`, `internalName`.
- [ ] Add cache keyed by canonical page title and revision so parser changes can rerun from local cache without hitting Wiki.
- [ ] Add resume/progress file so a failed 388-page run can continue.
- [ ] Keep one Wiki host request lane with conservative delay. Recommended first full run: batches of 25-50 pages, 5-7 seconds between parse requests.
- [ ] Emit report categories: `fetched`, `cache_hit`, `missing_page`, `redirected`, `parse_incomplete`, `rate_limited`, `fetch_failed`, `not_modified`, `patched`, `skipped_existing`.

### P2: Harden Parser and Identity Resolution

- [ ] Extend parser section recognition for English and Chinese headings: `Causes`, `原因`, `From player`, `来自玩家`, `From enemy`, `来自敌怪`, `From environment`, `来自环境`, `Immune NPCs`, `免疫的 NPC`.
- [ ] Parse source items, inflicting NPCs, immune NPCs, source section, page title, row notes, and semantic qualifiers.
- [ ] Resolve items by `itemId`, `internalName`, English page title, Chinese page title, then normalized display name.
- [ ] Resolve NPCs by `npcId/sourceId`, `internalName`, English page title, Chinese page title, then normalized display name.
- [ ] Mark unresolved rows as `unresolved`, ambiguous rows as `ambiguous`, and resolved alias rows as `alias_resolved`.
- [ ] Preserve unresolved facts in `sourceEvidence.unresolvedFacts[]`.
- [ ] Add parser tests for at least `CursedInferno`, `Hellfire/OnFire3`, a buff with no source section, and a buff with high immune NPC count.

### P3: Propagate Through Standardized, Maint, Relation, Projection, Local

- [ ] Ensure `standardize-existing-data.mjs` preserves `sourceItems`, `inflictingNpcs`, `immuneNpcs`, counts, samples, and `sourceEvidence`.
- [ ] Ensure import scripts populate `buff_source_items` for every resolved source item.
- [ ] Ensure `secondary-relation-processor.mjs` and relation sync populate `npc_buff_relations` for every resolved inflicting NPC.
- [ ] Ensure `buff-entity-processor.mjs` writes full `immuneNpcs` into `relation_buffs.immune_npcs_json`.
- [ ] Ensure `projection-sync.mjs` writes full `immuneNpcs` into `projection_buffs.immune_npcs_json`.
- [ ] Verify local runtime can still read full immune NPCs from `terria_v1_relation.projection_buffs.immune_npcs_json`.
- [ ] Only add DB schema if a required runtime field cannot be represented by existing `relation_buffs` or `projection_buffs`.

### P4: Backend API and UI Validation

- [ ] Confirm `/api/public/buffs/{id}` returns `sourceItems`, `inflictingNpcs`, `immuneNpcs`, counts, and `sourceEvidence`.
- [ ] Confirm backend resolves item/NPC image URLs from local DB/managed MinIO fields, not raw Wiki URLs.
- [ ] Ensure `front/src/views/BuffPublicView.vue` and `data-query-app/pages/entities/[type].vue` can display all three fact groups.
- [ ] Add collapsed/truncated rendering for large `immuneNpcs` arrays so high-count debuffs do not freeze or flood the UI.
- [ ] Ensure empty or unresolved groups render explicit empty/unresolved states instead of looking like a successful full parse.
- [ ] API smoke targets must include `/api/public/buffs/39` and `/api/public/buffs/323`.

### P5: Audit Gate, Data Run, Review, Commit, Merge

- [ ] Run batch refresh in dry-run mode and review `reports/buffs/buff-evidence-refresh.dry-run.latest.json`.
- [ ] Run batch refresh with writes only after dry-run report is acceptable.
- [ ] Run standardization/import/relation/projection sync in the documented order.
- [ ] Restart backend only after DB data is refreshed, then run runtime API smoke.
- [ ] Run focused tests:

```bash
node --test \
  scripts/data/fetch/buff-immunity-page-parser.test.mjs \
  scripts/data/fetch/fetch-wiki-buffs.test.mjs \
  scripts/data/fetch/refresh-target-buff-page-evidence.test.mjs \
  scripts/data/transform/standardize-existing-data.test.mjs \
  scripts/data/import/buff-source-item-mapping.test.mjs \
  scripts/data/relation/buff-entity-processor.test.mjs \
  scripts/data/relation/secondary-relation-processor.test.mjs \
  scripts/data/relation/projection-sync.test.mjs \
  scripts/data/relation/sync-maint-to-relation.test.mjs \
  scripts/data/relation/sync-projection-to-local-core-tables.test.mjs \
  scripts/data/audit/audit-buff-domain-coverage-baseline.test.mjs
```

- [ ] Run backend focused tests:

```bash
cd back && mvn -Dtest=PublicBuffControllerTest,PublicBuffServiceImplTest,AdminBuffControllerTest test
```

- [ ] Run frontend/data-query focused tests:

```bash
cd front && pnpm exec vitest run src/tests/api-index-public-query.spec.ts
node --test data-query-app/tests/buff-inflicting-npc-visibility.test.mjs
```

- [ ] Run project CI gate:

```bash
scripts/dev/quality-gate-ci.sh
```

- [ ] Commit only after `git status --short`, staged diff review, focused tests, API smoke, and audit report pass.
- [ ] Merge/push only after branch review confirms no unrelated generated or secret files are included.

## Acceptance Checks

Required data checks:

- `CursedInferno / id=39`: keeps known `sourceItems=7`, `inflictingNpcs=3`, full immune list, and `sourceEvidence`.
- `OnFire3 / Hellfire / id=323`: no longer has empty `sourceItems` with positive immune count; API returns parsed source items and full immune evidence or a documented unresolved reason.
- Every `immuneNpcCount > 0` buff has either full `immuneNpcs` or a `manual_review_required` report entry.
- `relation.npc_buff_relations` is no longer effectively one-buff-only after sync.
- `projection_buffs.immune_npcs_json` covers all buffs with full immune evidence.

Required API checks:

```bash
curl -sS 'http://127.0.0.1:18088/api/public/buffs/39'
curl -sS 'http://127.0.0.1:18088/api/public/buffs/323'
```

Expected:

- Both responses contain `sourceItems`, `inflictingNpcs`, `immuneNpcs`, and count fields.
- `sourceItems.length`, `inflictingNpcs.length`, and `immuneNpcs.length` match DB/projection counts or documented evidence semantics.
- Item/NPC image fields point to local/managed image URLs when local data has images.

## Risk Controls

- Full 388-page Wiki API refresh may take time or trigger rate limits. Use cache, rate gate, resume, and small batches.
- Wiki headings can drift. Parser must record `parse_incomplete` instead of overwriting data with empty arrays.
- Some source rows are environment, projectiles, sentries, traps, or variants, not simple items/NPCs. Keep these as unresolved or typed non-item facts instead of wrong mappings.
- Duplicate rows may be semantically distinct. Dedup must consider stable identity and qualifier.
- DB/API can pass with stale projection data if only local tables are refreshed. Always validate standardized, maint, relation, projection, and runtime API together.
- Image consistency is related but separate. This plan only requires buff detail cards to use existing local/managed image sources where identities resolve.
- Full global quality gate can expose unrelated blockers. The merge gate for this work is focused tests plus `scripts/dev/quality-gate-ci.sh`; document any unrelated full-gate failures separately.

## If Execution Finds a Gap

- Stop only if the gap makes the data unsafe to write, such as ambiguous destructive mapping or schema incompatibility.
- Otherwise patch this plan, rerun the affected plan audit gates, and continue.
- Never redefine success as “sample fixed” if all-buff coverage remains incomplete.
- Keep unresolved facts visible in reports so later manual review can close them.
