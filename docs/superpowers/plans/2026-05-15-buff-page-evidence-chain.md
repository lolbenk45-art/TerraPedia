# Buff Page Evidence Chain Repair Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore TerraPedia buff data parity with Wiki page evidence so buff records can expose source items, inflicting NPCs, and immune NPCs with traceable provenance instead of count-only or sample-only fallbacks.

**Architecture:** Treat `terraria.wiki.gg` page evidence as the source of truth for buff page-specific facts, then propagate those facts through raw fetch, standardization, maint, relation, projection, backend DTOs, and public/admin UI. Reuse `npc_buff_relations` for inflicting NPCs and `buff_source_items` for source items, but add a real immune-NPC chain instead of relying on `immuneNpcSampleJson` as a surrogate for full coverage.

**Tech Stack:** Node.js ESM data scripts, `node:test`, MySQL/MariaDB via `mysql2`, Spring Boot + MyBatis/JdbcTemplate, Vue 3/Nuxt admin/public UI, existing TerraPedia relation and projection scripts.

---

## Scope

- Included: buff page evidence extraction from Wiki API, buff raw/standardized/maint/relation/projection chain, local compatibility fields only where the public/detail runtime path cannot read an existing relation table, backend buff DTO/service/controller contract, public buff list/detail UI, admin detail compatibility checks, and read-only validation reports.
- Included: parity checks for `诅咒狱火 / Cursed Inferno` as the acceptance sample.
- Not included: crawler-wide NPC/item refactors, unrelated item/boss/projectile domains, destructive DB resets, or pushing new production data before dry-run validation passes.
- Not included: inventing facts not present in Wiki API or existing relation evidence.

## Current Baseline

Verified from read-only inspection on `2026-05-15`.

- `fetch-wiki-buffs.mjs` currently expands `Template:GetBuffInfo`, then derives:
  - source items from `module__iteminfo__data.latest.json` via `buffType`
  - immune NPC counts/samples from `module__npcinfo__data.parsed.latest.json`
  - rendered page immunities via `parseBuffPageImmunityFacts`
- `buff-immunity-page-parser.mjs` currently only recognizes the English heading `Immune_NPCs` / `Immune NPCs`.
- `fetch-wiki-buffs.mjs` does not model `from player`, `from enemy`, or full immune NPC relation payloads as first-class fields.
- `maint_buffs` only stores `source_item_count`, `combat_value` for immune count, `source_items_json`, and `immune_npc_sample_json`.
- `relation_buffs` mirrors `sourceItemsJson` and `immuneNpcSampleJson`, but does not carry full immune NPC or inflicting NPC relations.
- `PublicBuffListDTO` and `PublicBuffServiceImpl` expose only list fields and counts.
- `PublicBuffController` already exists at `/public/buffs`, but currently exposes only the public list endpoint.
- `BuffPublicView.vue` shows only list summary/counts, not source/immune/inflicting detail.
- Admin buff detail already knows how to resolve `linkedSourceItems` and `inflictingNpcSamples`, so the missing piece is the buff data chain and public contract, not a lack of UI capability.

## Success Criteria

- `Cursed Inferno` resolves from Wiki API as:
  - 7 player-source facts
  - 3 enemy-source facts
  - full immune NPC list, not only a sample/count surrogate
- Buff standardized output preserves evidence metadata and distinct fact groups for source items, inflicting NPCs, and immune NPCs.
- Maint/relation/projection/local payloads keep those groups traceable without duplicating ownership across unrelated tables.
- Public buff APIs can expose a detail payload with full source and relation facts.
- Public detail view shows the new facts without breaking current list behavior; admin detail is only changed if an existing admin detail contract cannot consume the new relation/projection data.
- Validation reports can prove the original Wiki sample matches the local chain.

## Agent Ownership

### Agent A: Wiki API Evidence and Parser

Write scope:

- `scripts/data/fetch/fetch-wiki-buffs.mjs`
- `scripts/data/fetch/buff-immunity-page-parser.mjs`
- `scripts/data/fetch/buff-immunity-page-parser.test.mjs`
- `scripts/data/fetch/fetch-wiki-buffs.test.mjs`
- `scripts/data/fetch/fixtures/zh-cursed-inferno.buff-page.html`
- `scripts/data/fetch/fixtures/zh-cursed-inferno.buff-page.wikitext`
- related read-only report generation under `reports/fetch/`

Do not edit:

- backend Java files
- front-end Vue files
- relation/projection schema outside buff fetch evidence fields

### Agent B: Data Model, Maint, Relation, Projection

Write scope:

- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/maint/maint-schema.mjs`
- `scripts/data/relation/buff-entity-processor.mjs`
- `scripts/data/relation/relation-schema.mjs`
- `scripts/data/relation/projection-schema.mjs`
- `scripts/data/relation/projection-sync.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- `back/src/main/resources/db/migration/V43__add_buff_evidence_fields.sql` or the next available Flyway version if another migration lands first
- related `node:test` files for buff relation/projection coverage

Do not edit:

- Wiki fetch/parser internals except through the agreed buff payload contract
- backend controllers or UI presentation

### Agent C: Backend and UI Contract

Write scope:

- `back/src/main/java/com/terraria/skills/controller/PublicBuffController.java`
- `back/src/main/java/com/terraria/skills/service/impl/PublicBuffServiceImpl.java`
- `back/src/main/java/com/terraria/skills/service/PublicBuffService.java`
- `back/src/main/java/com/terraria/skills/dto/PublicBuffListDTO.java`
- any new buff detail DTO/service/controller files needed for a public detail endpoint
- `front/src/views/BuffPublicView.vue`
- `front/src/api/index.ts`
- `front/src/types/index.ts`
- `data-query-app/pages/entities/[type].vue`
- focused backend/frontend tests for buff detail and list behavior

Do not edit:

- data import scripts owned by Agent B
- Wiki parser logic owned by Agent A
- `AdminBuffController.java` unless a failing admin compatibility test proves the public data-chain change broke admin detail behavior

### Agent D: Validation and Audit

Write scope:

- `scripts/data/audit/audit-buff-domain-coverage-baseline.mjs`
- related buff coverage tests
- any new read-only report or smoke-check script needed to prove parity

Do not edit:

- apply scripts
- DB reset or destructive migration files

## Data Contracts

### Buff Evidence Payload

The buff raw/standardized payload must carry these logical groups:

- `sourceItems`: items that cause the buff from player actions
- `inflictingNpcs`: NPCs that apply the buff
- `immuneNpcs`: NPCs immune to the buff
- `sourceEvidence`: source page, section anchor, revision timestamp, and provider metadata

### Acceptable Ownership Rules

- `sourceItems` should remain mapped to `buff_source_items`.
- `inflictingNpcs` should remain mapped through `npc_buff_relations` with relation type `inflicts`.
- `immuneNpcs` should not be reduced to count-only sample data in the canonical chain; until a dedicated immune relation table exists, canonical full immune facts live in buff evidence JSON fields with provenance.
- Do not create a second competing source of truth for the same relation if an existing relation table already owns it.
- Public detail runtime reads `sourceItems` from `buff_source_items`, `inflictingNpcs` from `npc_buff_relations`, and `immuneNpcs` from full buff immune evidence JSON. Projection JSON summaries are denormalized read models only, not alternate ownership.

### Identity Resolution Rules

- Page-derived item facts must resolve by stable keys in this order: source item id from module evidence, internal name, English page title, Chinese page title, normalized display name.
- Page-derived NPC facts must resolve by stable keys in this order: source NPC id from crawler/module evidence, internal name, English page title, Chinese page title, normalized display name.
- Unresolved or ambiguous page-derived facts must be kept in `sourceEvidence.unresolvedFacts[]` and audit reports. They must not be silently dropped or guessed into the wrong local item/NPC row.
- `CursedInferno` acceptance requires resolved local identities for at least the known current-version source items and inflicting NPCs, and explicit unresolved records for any legacy-only or version-mismatched rows.

## Tasks

### Task 1: Lock the Wiki Evidence Shape

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-buffs.mjs`
- Modify: `scripts/data/fetch/buff-immunity-page-parser.mjs`
- Test: `scripts/data/fetch/buff-immunity-page-parser.test.mjs`
- Test: `scripts/data/fetch/fetch-wiki-buffs.test.mjs`
- Create: `scripts/data/fetch/fixtures/zh-cursed-inferno.buff-page.html`
- Create: `scripts/data/fetch/fixtures/zh-cursed-inferno.buff-page.wikitext`

- [ ] **Step 1: Add failing coverage for `诅咒狱火` and the zh page anchors**

```js
test('parseBuffPageEvidence captures Causes and Immune NPCs for zh Cursed Inferno', async () => {
  const zhCursedInfernoFixtureHtml = fs.readFileSync(new URL('./fixtures/zh-cursed-inferno.buff-page.html', import.meta.url), 'utf8');
  const zhCursedInfernoFixtureWikitext = fs.readFileSync(new URL('./fixtures/zh-cursed-inferno.buff-page.wikitext', import.meta.url), 'utf8');
  const evidence = parseBuffPageEvidence({
    pageTitle: '诅咒狱火',
    sections: [
      { index: '1', line: '原因', anchor: '原因' },
      { index: '2', line: '来自玩家', anchor: '来自玩家' },
      { index: '3', line: '来自敌怪', anchor: '来自敌怪' },
      { index: '4', line: '免疫的 NPC', anchor: '免疫的_NPC' }
    ],
    html: zhCursedInfernoFixtureHtml,
    wikitext: zhCursedInfernoFixtureWikitext
  });

  assert.equal(evidence.sourceItems.length, 7);
  assert.equal(evidence.inflictingNpcs.length, 3);
  assert.ok(evidence.immuneNpcs.length >= 25);
  assert.deepEqual(evidence.sourceItems.slice(0, 2).map((row) => row.name), ['诅咒箭', '诅咒弹']);
  assert.deepEqual(evidence.inflictingNpcs.map((row) => row.name), ['爬藤怪', '腐恶食尸鬼', '魔焰眼']);
})
```

- [ ] **Step 2: Run the focused parser test and confirm the current heading-only parser fails**

Run: `node --test scripts/data/fetch/buff-immunity-page-parser.test.mjs`
Expected: failure on zh section handling or missing inflicting/source facts.

- [ ] **Step 3: Implement a page-evidence parser that reads API-rendered sections**

```js
export function parseBuffPageEvidence({ pageTitle, html, wikitext, sections }) {
  const sectionIndex = buildSectionIndex({ html, wikitext, sections });
  const sourceItems = parseBuffCauseTable(sectionIndex.get('来自玩家') ?? sectionIndex.get('From player'), {
    sourceKind: 'player',
    sourceSection: sectionIndex.has('来自玩家') ? '来自玩家' : 'From player'
  });
  const inflictingNpcs = parseBuffCauseTable(sectionIndex.get('来自敌怪') ?? sectionIndex.get('From enemy'), {
    sourceKind: 'enemy',
    sourceSection: sectionIndex.has('来自敌怪') ? '来自敌怪' : 'From enemy'
  });
  const immuneNpcs = parseBuffImmuneNpcList(sectionIndex.get('免疫的 NPC') ?? sectionIndex.get('Immune NPCs'));

  return {
    pageTitle,
    sourceItems,
    inflictingNpcs,
    immuneNpcs,
    sourceEvidence: {
      provider: 'terraria.wiki.gg',
      pageTitle,
      sectionAnchors: sections.map((section) => section.anchor).filter(Boolean)
    }
  }
}
```

- [ ] **Step 4: Re-run the parser and fetch tests**

Run:

```bash
node --test scripts/data/fetch/buff-immunity-page-parser.test.mjs scripts/data/fetch/fetch-wiki-buffs.test.mjs
```

Expected: `Cursed Inferno` fixtures prove the new shape and keep zh/en heading variations stable.

### Task 2: Propagate Buff Evidence Through Maint and Relation

**Files:**
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/maint-schema.mjs`
- Modify: `scripts/data/relation/buff-entity-processor.mjs`
- Modify: `scripts/data/relation/relation-schema.mjs`
- Modify: `scripts/data/relation/projection-schema.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- Create: `back/src/main/resources/db/migration/V43__add_buff_evidence_fields.sql` only if local `buffs` needs compatibility JSON fields for full immune evidence or source provenance
- Test: `scripts/data/relation/*.test.mjs` covering buff payload shape

- [ ] **Step 1: Add failing relation/projection tests for full buff facts**

```js
test('relation_buffs preserves sourceItems, inflictingNpcs, and immuneNpcs payloads', () => {
  const [row] = buildBuffEntityRelations({
    maintBuffs: [{
      source_id: 39,
      internal_name: 'CursedInferno',
      english_name: 'Cursed Inferno',
      name_zh: '诅咒狱火',
      raw_json: JSON.stringify({
        sourceItems: [{ name: 'Cursed Arrow', pageTitle: 'Cursed Arrow' }],
        inflictingNpcs: [{ name: 'Clinger', pageTitle: 'Clinger' }],
        immuneNpcs: [{ name: 'Dungeon Guardian', pageTitle: 'Dungeon Guardian' }]
      })
    }]
  }).relationBuffs;

  assert.match(row.sourceItemsJson, /Cursed Arrow/);
  assert.match(row.inflictingNpcsJson, /Clinger/);
  assert.match(row.immuneNpcsJson, /Dungeon Guardian/);
})
```

- [ ] **Step 2: Run relation tests and confirm the current schema is insufficient**

Run: `node --test scripts/data/relation/*.test.mjs`
Expected: failure or missing-field assertions for full buff evidence.

- [ ] **Step 3: Extend the buff relation payload, projection schema, and only the required local compatibility schema without duplicating relation ownership**

```sql
ALTER TABLE `buffs`
  ADD COLUMN `source_evidence_json` LONGTEXT NULL AFTER `immune_npc_sample_json`,
  ADD COLUMN `immune_npcs_json` LONGTEXT NULL AFTER `source_evidence_json`;
```

```js
// keep buff_source_items for source items
// keep npc_buff_relations for inflicting NPCs
// relation_buffs and projection_buffs schema changes belong in relation-schema.mjs and projection-schema.mjs
// keep immune NPC payloads as first-class JSON, not sample-only fallback
// do not add local buffs.inflicting_npcs_json unless the public detail endpoint cannot safely query npc_buff_relations
```

- [ ] **Step 4: Re-run relation and projection tests**

Run: `node --test scripts/data/relation/*.test.mjs`

Expected: projection/local sync can carry the full buff evidence fields end to end.

- [ ] **Step 5: Add identity-resolution tests for page-derived source items and NPCs**

```js
test('page-derived CursedInferno facts resolve to local item and npc identities or unresolved audit rows', () => {
  const resolved = resolveBuffPageEvidenceIdentities({
    evidence: {
      sourceItems: [{ pageTitle: 'Cursed Arrow', name: 'Cursed Arrow' }],
      inflictingNpcs: [{ pageTitle: 'Clinger', name: 'Clinger' }],
      immuneNpcs: [{ pageTitle: 'Dungeon Guardian', name: 'Dungeon Guardian' }]
    },
    itemRows: [{ id: 1001, source_id: 545, internal_name: 'CursedArrow', name: 'Cursed Arrow' }],
    npcRows: [
      { id: 2001, source_id: 101, internal_name: 'Clinger', name: 'Clinger' },
      { id: 2002, source_id: 68, internal_name: 'DungeonGuardian', name: 'Dungeon Guardian' }
    ]
  });

  assert.equal(resolved.sourceItems[0].itemId, 1001);
  assert.equal(resolved.inflictingNpcs[0].npcId, 2001);
  assert.equal(resolved.immuneNpcs[0].npcId, 2002);
  assert.equal(resolved.unresolvedFacts.length, 0);
})
```

### Task 3: Expose Buff Detail in Backend and UI

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/controller/PublicBuffController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicBuffServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/service/PublicBuffService.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/PublicBuffListDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/PublicBuffDetailDTO.java`
- Modify: `front/src/views/BuffPublicView.vue`
- Modify: `front/src/api/index.ts`
- Modify: `front/src/types/index.ts`
- Modify: `data-query-app/pages/entities/[type].vue`
- Test: backend controller/service tests and front-end buff visibility tests
- Optional only after a failing compatibility check: `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`

- [ ] **Step 1: Add failing backend/UI tests for missing buff detail fields**

```java
mockMvc.perform(get("/public/buffs/{id}", 39))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.sourceItems[0].name").value("Cursed Arrow"))
    .andExpect(jsonPath("$.data.inflictingNpcs[0].name").value("Clinger"))
    .andExpect(jsonPath("$.data.immuneNpcs[0].name").value("Dungeon Guardian"));
```

- [ ] **Step 2: Run focused backend/frontend tests and confirm current DTOs are too narrow**

Run:

```bash
(cd back && mvn -Dtest=AdminBuffControllerTest,PublicBuffControllerTest,PublicBuffServiceImplTest test)
(cd front && pnpm run test)
```

- [ ] **Step 3: Add a dedicated public buff detail contract and wire the public consumer to structured data**

```ts
interface PublicBuffDetail {
  id: number
  sourceId?: number | null
  internalName?: string | null
  name?: string | null
  nameZh?: string | null
  sourceItems: Array<{ name?: string | null; pageTitle?: string | null; durationText?: string | null; chanceText?: string | null }>
  inflictingNpcs: Array<{ name?: string | null; nameZh?: string | null; pageTitle?: string | null; durationText?: string | null; chanceText?: string | null }>
  immuneNpcs: Array<{ name?: string | null; nameZh?: string | null; pageTitle?: string | null; internalName?: string | null }>
}
```

- [ ] **Step 4: Re-run the targeted backend and UI tests**

Run the same commands again and confirm the list page remains count-only while the detail view gains the new facts.

- [ ] **Step 5: Run an admin compatibility check before touching admin code**

Run:

```bash
(cd back && mvn -Dtest=AdminBuffControllerTest test)
```

Expected: existing admin buff detail tests still pass. Only edit `AdminBuffController.java` if this check fails because of the new buff evidence fields.

### Task 3.5: Artifact Generation, Dry-Run Data Sync, and DB Compatibility

**Files:**
- Output: `reports/fetch/fetch-template__getbuffinfo-*.json`
- Output: `reports/relation/relation-audit-*.json`
- Output: `reports/data/buff-domain-coverage-baseline-*.json`

- [ ] **Step 1: Generate local fetch artifacts, then run maint/relation dry-runs**

Run:

```bash
node scripts/data/fetch/fetch-wiki-buffs.mjs --langs=en,zh
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=buffs
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --scopes=buff
```

Expected: the fetch run writes only local raw/report artifacts, then the maint/relation commands remain read-only. Generated reports show `CursedInferno` now has source items, inflicting NPCs, and full immune NPC facts before any DB write.

- [ ] **Step 2: SELECT-only DB compatibility check**

Run SELECT-only checks against `terria_v1_local.buffs`, `buff_source_items`, and `npc_buff_relations`.

Expected: local tables have the columns and relation rows needed by the backend detail endpoint, or the plan blocks on the migration/sync step before UI work is marked complete.

### Task 4: Audit and Acceptance

**Files:**
- Modify: `scripts/data/audit/audit-buff-domain-coverage-baseline.mjs`
- Test: `scripts/data/audit/audit-buff-domain-coverage-baseline.test.mjs`
- Output: `reports/data/buff-domain-coverage-baseline-*.json`

- [ ] **Step 1: Add a red/green audit for `CursedInferno` coverage**

```js
test('audit flags CursedInferno when immune or inflicting coverage is incomplete', () => {
  const report = buildBuffDomainCoverageBaseline({
    buffs: [{ internalName: 'CursedInferno', sourceItemCount: 0, immuneNpcCount: 0, immuneNpcSample: [] }]
  });
  assert.equal(report.sourceCoverageWarnings[0].internalName, 'CursedInferno');
  assert.equal(report.immuneCoverageWarnings[0].internalName, 'CursedInferno');
  assert.equal(report.inflictingCoverageWarnings[0].internalName, 'CursedInferno');
})
```

- [ ] **Step 2: Extend the audit to report missing source items as well as missing immune and inflicting coverage**

```js
function classifySourceCoverageIssue(buff) {
  return Number(buff?.sourceItemCount ?? 0) <= 0 ? 'missingSourceItems' : null
}
```

- [ ] **Step 3: Run the audit against current read-only data**

Run: `node --test scripts/data/audit/audit-buff-domain-coverage-baseline.test.mjs`

- [ ] **Step 4: Verify the plan closes the original complaint**

Run the wiki API sample comparison, the audit, and the focused backend/UI tests.

Expected: the exact `诅咒狱火` complaint can be retested without guessing whether missing data is a fetch, schema, DTO, or UI issue.

## Self-Review

### Spec coverage

- Goal lock: covered.
- Source-chain lock: covered from Wiki API to UI.
- Boundary lock: covered with explicit in/out scopes and non-goals.
- Evidence lock: covered with `Cursed Inferno` parser, relation, backend, and UI checks.
- Execution continuity: covered by failing-test-first tasks and audit repair loops.
- Multi-agent safety: covered with disjoint write scopes.
- Commit readiness: covered by narrow commit scope and test checkpoints.

### Placeholder scan

- No `TBD`, no undefined types, and no hand-wavy "write tests for above" steps remain.
- The only acceptable abbreviation is the explicit use of existing domain names and file paths.

### Type consistency

- `sourceItems`, `inflictingNpcs`, and `immuneNpcs` are used consistently as the canonical buff evidence groups.
- The plan keeps `immuneNpcSampleJson` only as a compatibility field, not as the canonical full source.
- The public list DTO remains list-oriented; the public detail DTO carries full relation data.

## Residual Risk

- Risk: zh/en Wiki page bodies and section anchors may drift, so the parser should be anchored on API sections and rendered content rather than one literal heading string.
- Risk: some immune NPC facts may be sourced from templates or hidden module data, so the plan needs a provenance field to avoid silently mixing extracted and fallback evidence.
- Risk: full buff detail may require a new public endpoint and cache expectations, so the final validation must include the runtime route, not only service tests.
