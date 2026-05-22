# Equipment Effect Attributes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured equipment effect attributes so armor sets and equipment can expose filterable stats such as defense, movement speed, critical chance, damage bonuses, minion capacity, ammo conservation, and special flags.

**Architecture:** Keep existing base item stats (`damage`, `defense`, `knockback`, `use_time`) as-is. Add a normalized relation/projection table for derived effect attributes, first sourced from `projection_armor_sets.benefit_zh`, then extend the same table to item tooltip/page effects after the item text chain is complete. Public APIs return both raw benefit text and structured effect rows without throwing away unparsed source lines.

**Tech Stack:** MySQL, Node.js ESM data scripts under `scripts/data/relation`, Spring Boot DTO/service/controller tests, Nuxt public frontend.

---

## Current Facts

- `terria_v1_relation.projection_items` already has base numeric fields: `damage`, `defense`, `knockback`, `use_time`.
- `terria_v1_relation.projection_armor_sets` has `benefit_zh`, `benefit_en`, and `benefit_expression`; all 88 active armor sets currently have `benefit_zh`.
- `projection_items.tooltip_zh` is currently empty for active projection rows, so single-item effect extraction is not reliable yet.
- Public armor set list DTO currently does not expose `benefit_zh` or structured effects.
- Public item detail DTO exposes base stats but not structured equipment effects.

## Scope

In scope for phase 1:

- Parse armor set `benefit_zh` into structured effect rows.
- Preserve every source line, including unparsed lines.
- Add queryable relation/projection effect tables.
- Expose structured effects in public armor set API.
- Replace the static `front-nuxt/pages/armor-sets/index.vue` content with API-driven armor set cards and effect chips.

In scope for phase 2:

- Fill item tooltip/page effect source coverage.
- Use the same effect parser/table for item-level equipment effects.
- Expose item-level structured effects on public item detail.

Out of scope:

- Rewriting crawler logic.
- Guessing hidden Terraria engine effects not present in source text.
- Treating parsed values as complete combat simulation data.

## Data Model

Add relation/projection tables instead of adding many columns to `items` or `armor_sets`. This avoids a brittle schema such as `move_speed`, `melee_crit`, `ranged_crit`, etc.

Target table shape:

```sql
CREATE TABLE IF NOT EXISTS `terria_v1_relation`.`relation_equipment_effect_attributes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `record_key` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `owner_kind` VARCHAR(32) NOT NULL,
  `owner_record_key` CHAR(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `owner_id` BIGINT DEFAULT NULL,
  `owner_key` VARCHAR(255) DEFAULT NULL,
  `source_kind` VARCHAR(64) NOT NULL,
  `source_locale` VARCHAR(16) NOT NULL DEFAULT 'zh',
  `source_line_index` INT DEFAULT NULL,
  `source_line` TEXT,
  `apply_scope` VARCHAR(64) DEFAULT NULL,
  `variant_label` VARCHAR(255) DEFAULT NULL,
  `item_internal_name` VARCHAR(255) DEFAULT NULL,
  `slot_type` VARCHAR(64) DEFAULT NULL,
  `stat_key` VARCHAR(64) NOT NULL,
  `stat_label_zh` VARCHAR(255) DEFAULT NULL,
  `class_scope` VARCHAR(64) DEFAULT NULL,
  `operation` VARCHAR(32) DEFAULT NULL,
  `value_decimal` DECIMAL(12,4) DEFAULT NULL,
  `value_max_decimal` DECIMAL(12,4) DEFAULT NULL,
  `unit` VARCHAR(32) DEFAULT NULL,
  `condition_text` VARCHAR(500) DEFAULT NULL,
  `raw_text` TEXT,
  `parse_status` VARCHAR(64) NOT NULL,
  `confidence` DECIMAL(5,4) DEFAULT NULL,
  `source_provider` VARCHAR(128) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_relation_equipment_effect_record_key` (`record_key`),
  KEY `idx_relation_equipment_effect_owner` (`owner_kind`, `owner_id`),
  KEY `idx_relation_equipment_effect_stat` (`stat_key`, `class_scope`, `parse_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Projection table mirrors consumer fields and uses compact stable projection IDs:

```sql
CREATE TABLE IF NOT EXISTS `terria_v1_relation`.`projection_equipment_effect_attributes` (
  `id` BIGINT NOT NULL,
  `relation_record_key` CHAR(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `owner_kind` VARCHAR(32) NOT NULL,
  `owner_id` BIGINT DEFAULT NULL,
  `owner_key` VARCHAR(255) DEFAULT NULL,
  `source_kind` VARCHAR(64) NOT NULL,
  `source_line` TEXT,
  `apply_scope` VARCHAR(64) DEFAULT NULL,
  `variant_label` VARCHAR(255) DEFAULT NULL,
  `item_internal_name` VARCHAR(255) DEFAULT NULL,
  `slot_type` VARCHAR(64) DEFAULT NULL,
  `stat_key` VARCHAR(64) NOT NULL,
  `stat_label_zh` VARCHAR(255) DEFAULT NULL,
  `class_scope` VARCHAR(64) DEFAULT NULL,
  `operation` VARCHAR(32) DEFAULT NULL,
  `value_decimal` DECIMAL(12,4) DEFAULT NULL,
  `value_max_decimal` DECIMAL(12,4) DEFAULT NULL,
  `unit` VARCHAR(32) DEFAULT NULL,
  `condition_text` VARCHAR(500) DEFAULT NULL,
  `raw_text` TEXT,
  `parse_status` VARCHAR(64) NOT NULL,
  `confidence` DECIMAL(5,4) DEFAULT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT NULL,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_projection_equipment_effect_owner` (`owner_kind`, `owner_id`),
  KEY `idx_projection_equipment_effect_stat` (`stat_key`, `class_scope`, `parse_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Canonical stat keys for phase 1:

```text
defense
damage_bonus
crit_chance
move_speed
melee_speed
whip_speed
whip_range
summon_damage
minion_capacity
mana_max
mana_cost
ammo_conservation
mining_speed
fishing_power
acceleration
max_move_speed_multiplier
damage_flat
knockback
dash_enabled
immunity
special_effect
```

## Task 1: Parser Tests

**Files:**
- Create: `scripts/data/relation/equipment-effect-parser.mjs`
- Create: `scripts/data/relation/equipment-effect-parser.test.mjs`

- [ ] Write parser tests for known Chinese armor set lines.

Run:

```bash
node --test scripts/data/relation/equipment-effect-parser.test.mjs
```

Expected initial result: FAIL because `parseEquipmentEffectLines` does not exist.

Minimum fixtures:

```js
[
  ['+9% 暴击率', { statKey: 'crit_chance', valueDecimal: 9, unit: 'percent', classScope: 'all' }],
  ['套装奖励：+20% 移动速度', { statKey: 'move_speed', valueDecimal: 20, unit: 'percent', applyScope: 'set_bonus' }],
  ['+7% 近战暴击率', { statKey: 'crit_chance', valueDecimal: 7, unit: 'percent', classScope: 'melee' }],
  ['+1 仆从容量', { statKey: 'minion_capacity', valueDecimal: 1, unit: 'count' }],
  ['−16% 魔力花费', { statKey: 'mana_cost', valueDecimal: -16, unit: 'percent' }],
  ['20% 的几率不消耗弹药', { statKey: 'ammo_conservation', valueDecimal: 20, unit: 'percent' }],
  ['最大移动速度 ×1.15', { statKey: 'max_move_speed_multiplier', valueDecimal: 1.15, unit: 'multiplier' }],
  ['套装奖励：允许猛冲', { statKey: 'dash_enabled', operation: 'set_flag', unit: 'boolean' }]
]
```

- [ ] Implement `parseEquipmentEffectLines({ owner, text, sourceKind })`.

Rules:

- Split by newline.
- Keep every non-empty line as one or more output rows.
- Normalize `−` to `-`.
- Detect `套装奖励：` as `apply_scope = set_bonus`.
- Detect `套装效果：` as `apply_scope = visual_or_special`.
- Detect `钴头盔：...` style prefixes as `variant_label`.
- If a line contains multiple comma-separated effects, emit one row per effect while keeping the original `raw_text`.
- Unknown lines emit one row with `stat_key = special_effect`, `parse_status = unparsed`, and `confidence = 0.3000`.
- Parsed numeric/flag rows use `parse_status = parsed`.

- [ ] Run parser tests again.

Expected result: PASS.

## Task 2: Relation And Projection Schema

**Files:**
- Modify: `scripts/data/relation/relation-schema.mjs`
- Modify: `scripts/data/relation/projection-schema.mjs`
- Modify: `scripts/data/relation/relation-schema.test.mjs`
- Modify: `scripts/data/relation/projection-schema.test.mjs`

- [ ] Add `relation_equipment_effect_attributes` to relation table names and schema statements.
- [ ] Add `projection_equipment_effect_attributes` to projection table names and schema statements.
- [ ] Add tests asserting both tables include owner/stat indexes and `record_key` uniqueness.

Run:

```bash
node --test scripts/data/relation/relation-schema.test.mjs scripts/data/relation/projection-schema.test.mjs
```

Expected result: PASS.

## Task 3: Relation Sync Integration

**Files:**
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`

- [ ] Import `parseEquipmentEffectLines` in `sync-maint-to-relation.mjs`.
- [ ] Build relation effect rows from `relationArmorSets`.
- [ ] Use deterministic record keys:

```text
equipment-effect|armor_set|<armor_set_record_key>|benefit_zh|<line_index>|<effect_index>|<stat_key>|<variant_label_or_all>
```

- [ ] Add rows to sync results as `relationEquipmentEffectAttributes`.
- [ ] Upsert relation rows before projection rows.
- [ ] Add projection payload input `relationEquipmentEffectAttributes`.
- [ ] Build compact projection IDs from sorted active relation rows, starting at `1`.
- [ ] Add projection rows to sync results as `projectionEquipmentEffectAttributes`.
- [ ] Delete/reinsert or upsert the projection table during apply, matching existing projection table behavior.

Run:

```bash
node --test scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/projection-sync.test.mjs
```

Expected result: PASS.

## Task 4: Dry Run And Apply Data

**Files:**
- No code changes if Tasks 1-3 are complete.

- [ ] Run dry-run sync and inspect counts.

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --scopes=armor --relation-database=terria_v1_relation
```

Expected:

- No DB writes.
- Console/report shows non-zero `relationEquipmentEffectAttributes`.
- `unparsed` rows are reported but do not block.

- [ ] Apply after dry-run looks sane.

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --apply --create-database --scopes=armor --relation-database=terria_v1_relation
```

- [ ] Verify smoke samples.

Run:

```bash
MYSQL_PWD=root mysql -h 127.0.0.1 -P 13306 -u root -t terria_v1_relation -e "
SELECT owner_kind, owner_id, owner_key, stat_key, class_scope, value_decimal, unit, apply_scope, variant_label, parse_status, raw_text
FROM projection_equipment_effect_attributes
WHERE owner_kind='armor_set'
  AND stat_key IN ('move_speed','crit_chance','damage_bonus','minion_capacity','ammo_conservation')
ORDER BY owner_id, id
LIMIT 40;
"
```

Expected:

- 忍者盔甲 has `crit_chance = 9%` and `move_speed = 20%`.
- 熔岩盔甲 has melee damage/crit/speed rows.
- 钴/山铜/精金/钛金 rows include variant labels for head-specific effects.

## Task 5: Backend API

**Files:**
- Create: `back/src/main/java/com/terraria/skills/dto/EquipmentEffectAttributeDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/PublicArmorSetListDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicArmorSetServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicArmorSetControllerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/PublicArmorSetServiceImplTest.java`

- [ ] Add DTO fields:

```java
private String statKey;
private String statLabelZh;
private String classScope;
private String operation;
private BigDecimal valueDecimal;
private BigDecimal valueMaxDecimal;
private String unit;
private String applyScope;
private String variantLabel;
private String itemInternalName;
private String slotType;
private String conditionText;
private String rawText;
private String parseStatus;
```

- [ ] Add to `PublicArmorSetListDTO`:

```java
private String benefitZh;
private String benefitEn;
private List<EquipmentEffectAttributeDTO> effects = new ArrayList<>();
```

- [ ] Update `PublicArmorSetServiceImpl` list SQL to select `benefit_zh` and `benefit_en`.
- [ ] Batch query `projection_equipment_effect_attributes` for the page's armor set IDs.
- [ ] Group effects by `owner_id`.
- [ ] Keep `unparsed` rows in the response so UI can still show raw text.
- [ ] Update tests to assert `benefitZh` and a parsed `move_speed` effect are returned.

Run:

```bash
cd back
mvn -Dtest=PublicArmorSetControllerTest,PublicArmorSetServiceImplTest test
```

Expected result: PASS.

## Task 6: Frontend Armor Set Page

**Files:**
- Modify: `front-nuxt/types/public-api.ts`
- Create: `front-nuxt/composables/usePublicArmorSets.ts`
- Modify: `front-nuxt/pages/armor-sets/index.vue`

- [ ] Add `EquipmentEffectAttribute` and `PublicArmorSetListItem` types.
- [ ] Add composable calling `/public/armor-sets?page=1&limit=100`.
- [ ] Replace static armor cards with API rows.
- [ ] Display image fallback arrays from API.
- [ ] Render effect chips for parsed rows using labels:

```text
damage_bonus -> 伤害
crit_chance -> 暴击
move_speed -> 移速
melee_speed -> 近战速度
summon_damage -> 召唤伤害
minion_capacity -> 仆从
ammo_conservation -> 弹药节省
special_effect -> 特效
```

- [ ] Preserve raw `benefitZh` in a compact text block per card.
- [ ] Add search filter for name/effect text on the client if API search is not enough.

Run:

```bash
cd front-nuxt
pnpm run test
```

Expected result: PASS, or if no test script exists, run the existing Nuxt type/build check documented in `package.json`.

## Task 7: Item-Level Phase 2

**Files:**
- Modify: `scripts/data/maint/item-field-coverage-audit.mjs`
- Modify: `scripts/data/maint/sync-local-item-tooltip-zh-to-maint.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `back/src/main/java/com/terraria/skills/dto/PublicItemDetailDTO.java`
- Modify: `back/src/main/resources/mapper/ItemMapper.xml`
- Modify: `front-nuxt/pages/items/[id].vue`

- [ ] Audit item tooltip coverage before writing:

```bash
node scripts/data/maint/item-field-coverage-audit.mjs --database=terria_v1_local --output=reports/relation/item-effect-source-coverage-2026-05-22.json
```

- [ ] If tooltip coverage remains near zero, refresh/sync item text overrides first; do not infer item special effects from empty text.
- [ ] Parse item-level `tooltip_zh` and `description_zh` into the same relation/projection effect tables with `owner_kind = item`.
- [ ] Expose item effects on public item detail only, not on the public list payload.
- [ ] Add item detail frontend effect panel below base stat rows.

Acceptance:

- Item base stats still come from `projection_items`.
- Item special effects appear only when source text exists.
- No UI claims complete item effects when source coverage is incomplete.

## Task 8: Final Validation

Run focused checks:

```bash
node --test scripts/data/relation/equipment-effect-parser.test.mjs scripts/data/relation/relation-schema.test.mjs scripts/data/relation/projection-schema.test.mjs scripts/data/relation/projection-sync.test.mjs
cd back && mvn -Dtest=PublicArmorSetControllerTest,PublicArmorSetServiceImplTest test
```

Run DB smoke:

```bash
MYSQL_PWD=root mysql -h 127.0.0.1 -P 13306 -u root -t terria_v1_relation -e "
SELECT stat_key, parse_status, COUNT(*) AS rows
FROM projection_equipment_effect_attributes
GROUP BY stat_key, parse_status
ORDER BY rows DESC, stat_key;
"
```

Run runtime smoke after stack restart:

```bash
bash ./scripts/dev/start-local-stack.sh
curl -s 'http://localhost:8080/public/armor-sets?page=1&limit=5' | jq '.data[0] | {id,nameZh,benefitZh,effects}'
```

Expected:

- API returns `effects`.
- Armor set page renders live rows.
- Known sample rows match the SQL smoke checks.

## Commit Scope

Recommended commits:

1. `feat(data): parse equipment effect attributes`
2. `feat(api): expose armor set effect attributes`
3. `feat(front): render live armor set effects`
4. `feat(data): add item equipment effect phase two` only after item text coverage is proven.
