# Equivalent Armor Attribute Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the non-Hallowed equivalent armor data gap so interchangeable or identical-stat armor variants inherit item-owned armor attribute rows consistently through relation projection, public item APIs, and armor set detail summaries.

**Architecture:** Move equivalent armor attribute rules out of the ad hoc Hallowed-only array in `sync-maint-to-relation.mjs` into a small data module with explicit evidence labels. The sync step derives missing `relation_armor_attribute_rows` from resolved maint items, then the existing projection path emits `projection_item_armor_attributes` and item-owned `projection_equipment_effect_attributes`. A focused audit script verifies every configured equivalent item has matching defense and effect rows after local apply.

**Tech Stack:** Node.js ESM scripts, `node:test`, MySQL `terria_v1_maint` -> `terria_v1_relation`, existing public API `/api/public/items/{id}/equipment-effects`, front-nuxt contract checks.

---

## Current Evidence

- Existing commit `eb2c2f8 fix: align equivalent armor attribute values` fixed only this group in code:
  - `HallowedMask` / `AncientHallowedMask`
  - `HallowedHelmet` / `AncientHallowedHelmet`
  - `HallowedHeadgear` / `AncientHallowedHeadgear`
  - `HallowedHood` / `AncientHallowedHood`
  - `HallowedPlateMail` / `AncientHallowedPlateMail`
  - `HallowedGreaves` / `AncientHallowedGreaves`
- Local DB evidence after that commit:
  - Hallowed/Ancient Hallowed item effects match.
  - Other equivalent candidates still have `effect_rows = 0`: `AncientShadow*`, `AncientCobalt*`, `PinkEskimo*`, `AncientNecroHelmet`, `AncientIronHelmet`, `AncientGoldHelmet`.
- Wiki armor set source evidence in `data/generated/wiki-armor-sets.latest.json` explicitly contains interchangeable pairs:
  - `Jungle armor` <-> `Ancient Cobalt armor`
  - `Shadow armor` <-> `Ancient Shadow armor`
  - `Hallowed armor` <-> `Ancient Hallowed armor`
- Generated definition map evidence in `data/generated/armor-set-definition-map.json` groups:
  - Snow + Pink Snow under `ArmorSetBonus.Snow`
  - Angler + Captain under `ArmorSetBonus.Angler`
  - Jungle + Ancient Cobalt under `ArmorSetBonus.Jungle`
  - Necro + Ancient Necro under `ArmorSetBonus.Bone`
  - Shadow + Ancient Shadow under `ArmorSetBonus.ShadowScale`

## Scope

In scope:
- Add a reusable equivalent armor attribute rule module.
- Expand coverage for configured equivalent armor variants where source evidence says stats are identical or shared for armor attribute purposes.
- Add tests for derivation, defense source priority, no-duplication, and full configured family coverage.
- Add an audit script that fails when configured equivalent targets are missing relation/projection rows after sync.
- Apply the refreshed data only to local `127.0.0.1:13306` after dry-run and verification.
- Verify public item APIs and armor set detail contracts.

Out of scope:
- No crawler execution.
- No frontend filtering as a data fix.
- No production or remote DB writes.
- No automatic inference for every item with a similar name unless backed by an explicit rule.
- No `git add .`; stage explicit files only.

## Files

- Create: `scripts/data/relation/equivalent-armor-attribute-rules.mjs`
  - Owns explicit equivalent armor item groups and helper functions.
- Create: `scripts/data/relation/equivalent-armor-attribute-rules.test.mjs`
  - Tests rule shape, known group coverage, and duplicate/id consistency.
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
  - Imports the rule helper and removes the local Hallowed-only array.
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
  - Adds full-family derivation tests and keeps the existing Hallowed regression tests.
- Create: `scripts/data/audit/audit-equivalent-armor-attributes.mjs`
  - Reads local relation/projection DB and reports missing or mismatched equivalent attribute rows.
- Create: `scripts/data/audit/audit-equivalent-armor-attributes.test.mjs`
  - Tests the audit detector without connecting to MySQL.
- Optional after implementation: update `docs/superpowers/plans/2026-06-01-equivalent-armor-attribute-inheritance.md` with execution notes only if execution reveals a changed boundary.

## Equivalent Groups To Configure

Use explicit groups keyed by item internal names:

```js
export const EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS = [
  {
    id: 'hallowed_ancient_hallowed',
    evidence: 'wiki_interchangeable_identical_stats',
    groups: [
      ['HallowedMask', 'AncientHallowedMask'],
      ['HallowedHelmet', 'AncientHallowedHelmet'],
      ['HallowedHeadgear', 'AncientHallowedHeadgear'],
      ['HallowedHood', 'AncientHallowedHood'],
      ['HallowedPlateMail', 'AncientHallowedPlateMail'],
      ['HallowedGreaves', 'AncientHallowedGreaves']
    ]
  },
  {
    id: 'shadow_ancient_shadow',
    evidence: 'wiki_interchangeable_same_set_bonus',
    groups: [
      ['ShadowHelmet', 'AncientShadowHelmet'],
      ['ShadowScalemail', 'AncientShadowScalemail'],
      ['ShadowGreaves', 'AncientShadowGreaves']
    ]
  },
  {
    id: 'jungle_ancient_cobalt',
    evidence: 'wiki_interchangeable_same_set_bonus',
    groups: [
      ['JungleHat', 'AncientCobaltHelmet'],
      ['JungleShirt', 'AncientCobaltBreastplate'],
      ['JunglePants', 'AncientCobaltLeggings']
    ]
  },
  {
    id: 'snow_pink_snow',
    evidence: 'shared_armor_set_definition',
    groups: [
      ['EskimoHood', 'PinkEskimoHood'],
      ['EskimoCoat', 'PinkEskimoCoat'],
      ['EskimoPants', 'PinkEskimoPants']
    ]
  },
  {
    id: 'necro_ancient_necro',
    evidence: 'shared_armor_set_definition',
    groups: [
      ['NecroHelmet', 'AncientNecroHelmet']
    ]
  },
  {
    id: 'angler_captain',
    evidence: 'shared_armor_set_definition',
    groups: [
      ['AnglerHat', 'UpgradedFishingHead'],
      ['AnglerVest', 'UpgradedFishingBody'],
      ['AnglerPants', 'UpgradedFishingLegs']
    ]
  }
];
```

Do not include `AncientIronHelmet` and `AncientGoldHelmet` in the first pass unless execution finds direct source evidence for item-owned armor attributes. Those helmets are set alternatives but current local `projection_equipment_effect_attributes` has no source item effect rows for `IronGreaves` or `GoldGreaves`, so blindly deriving would create empty output. The audit should report them as `no_source_effect_rows`, not as fixed.

## Task 1: Extract Equivalent Rule Module

**Files:**
- Create: `scripts/data/relation/equivalent-armor-attribute-rules.mjs`
- Create: `scripts/data/relation/equivalent-armor-attribute-rules.test.mjs`

- [ ] **Step 1: Write failing rule tests**

Create `scripts/data/relation/equivalent-armor-attribute-rules.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS,
  buildEquivalentArmorAttributeLookup,
  flattenEquivalentArmorAttributePairs
} from './equivalent-armor-attribute-rules.mjs';

test('equivalent armor attribute rules include known interchangeable families', () => {
  const groupIds = EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS.map((group) => group.id);

  assert.deepEqual(groupIds, [
    'hallowed_ancient_hallowed',
    'shadow_ancient_shadow',
    'jungle_ancient_cobalt',
    'snow_pink_snow',
    'necro_ancient_necro',
    'angler_captain'
  ]);
});

test('flattenEquivalentArmorAttributePairs exposes bidirectional item pairs with evidence', () => {
  const pairs = flattenEquivalentArmorAttributePairs();
  const pairKey = (pair) => `${pair.sourceInternalName}->${pair.targetInternalName}`;
  const keys = new Set(pairs.map(pairKey));

  assert.ok(keys.has('ShadowHelmet->AncientShadowHelmet'));
  assert.ok(keys.has('AncientShadowHelmet->ShadowHelmet'));
  assert.ok(keys.has('JungleHat->AncientCobaltHelmet'));
  assert.ok(keys.has('EskimoHood->PinkEskimoHood'));
  assert.ok(keys.has('NecroHelmet->AncientNecroHelmet'));
  assert.ok(keys.has('AnglerHat->UpgradedFishingHead'));
  assert.ok(pairs.every((pair) => pair.groupId && pair.evidence));
});

test('buildEquivalentArmorAttributeLookup returns resolved maint item equivalents only', () => {
  const maintItems = [
    { source_id: 100, internal_name: 'ShadowHelmet', name_zh: '暗影头盔' },
    { source_id: 956, internal_name: 'AncientShadowHelmet', name_zh: '远古暗影头盔' },
    { source_id: 228, internal_name: 'JungleHat', name_zh: '丛林帽' }
  ];

  const lookup = buildEquivalentArmorAttributeLookup(maintItems);

  assert.deepEqual(lookup.get('ShadowHelmet').map((item) => item.internal_name), ['AncientShadowHelmet']);
  assert.deepEqual(lookup.get('AncientShadowHelmet').map((item) => item.internal_name), ['ShadowHelmet']);
  assert.equal(lookup.has('JungleHat'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/data/relation/equivalent-armor-attribute-rules.test.mjs
```

Expected: FAIL with module not found or missing exports.

- [ ] **Step 3: Implement the rule module**

Create `scripts/data/relation/equivalent-armor-attribute-rules.mjs`:

```js
export const EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS = [
  {
    id: 'hallowed_ancient_hallowed',
    evidence: 'wiki_interchangeable_identical_stats',
    groups: [
      ['HallowedMask', 'AncientHallowedMask'],
      ['HallowedHelmet', 'AncientHallowedHelmet'],
      ['HallowedHeadgear', 'AncientHallowedHeadgear'],
      ['HallowedHood', 'AncientHallowedHood'],
      ['HallowedPlateMail', 'AncientHallowedPlateMail'],
      ['HallowedGreaves', 'AncientHallowedGreaves']
    ]
  },
  {
    id: 'shadow_ancient_shadow',
    evidence: 'wiki_interchangeable_same_set_bonus',
    groups: [
      ['ShadowHelmet', 'AncientShadowHelmet'],
      ['ShadowScalemail', 'AncientShadowScalemail'],
      ['ShadowGreaves', 'AncientShadowGreaves']
    ]
  },
  {
    id: 'jungle_ancient_cobalt',
    evidence: 'wiki_interchangeable_same_set_bonus',
    groups: [
      ['JungleHat', 'AncientCobaltHelmet'],
      ['JungleShirt', 'AncientCobaltBreastplate'],
      ['JunglePants', 'AncientCobaltLeggings']
    ]
  },
  {
    id: 'snow_pink_snow',
    evidence: 'shared_armor_set_definition',
    groups: [
      ['EskimoHood', 'PinkEskimoHood'],
      ['EskimoCoat', 'PinkEskimoCoat'],
      ['EskimoPants', 'PinkEskimoPants']
    ]
  },
  {
    id: 'necro_ancient_necro',
    evidence: 'shared_armor_set_definition',
    groups: [
      ['NecroHelmet', 'AncientNecroHelmet']
    ]
  },
  {
    id: 'angler_captain',
    evidence: 'shared_armor_set_definition',
    groups: [
      ['AnglerHat', 'UpgradedFishingHead'],
      ['AnglerVest', 'UpgradedFishingBody'],
      ['AnglerPants', 'UpgradedFishingLegs']
    ]
  }
];

export function flattenEquivalentArmorAttributePairs(groups = EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS) {
  const pairs = [];
  for (const group of groups) {
    for (const itemGroup of group.groups) {
      for (const sourceInternalName of itemGroup) {
        for (const targetInternalName of itemGroup) {
          if (sourceInternalName === targetInternalName) continue;
          pairs.push({
            groupId: group.id,
            evidence: group.evidence,
            sourceInternalName,
            targetInternalName
          });
        }
      }
    }
  }
  return pairs;
}

export function buildEquivalentArmorAttributeLookup(maintItems = [], groups = EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS) {
  const byInternalName = new Map();
  for (const item of maintItems) {
    if (item.internal_name) {
      byInternalName.set(String(item.internal_name), item);
    }
  }

  const lookup = new Map();
  for (const pair of flattenEquivalentArmorAttributePairs(groups)) {
    const source = byInternalName.get(pair.sourceInternalName);
    const target = byInternalName.get(pair.targetInternalName);
    if (!source || !target) continue;

    const entries = lookup.get(pair.sourceInternalName) ?? [];
    entries.push({
      ...target,
      equivalentArmorAttributeGroupId: pair.groupId,
      equivalentArmorAttributeEvidence: pair.evidence,
      equivalentArmorAttributeSourceInternalName: pair.sourceInternalName
    });
    lookup.set(pair.sourceInternalName, entries);
  }
  return lookup;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test scripts/data/relation/equivalent-armor-attribute-rules.test.mjs
```

Expected: PASS.

## Task 2: Wire Rules Into Relation Sync

**Files:**
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`

- [ ] **Step 1: Add failing full-family derivation test**

Append this test near the existing armor attribute sync tests in `scripts/data/relation/sync-maint-to-relation.test.mjs`:

```js
test('runSync derives configured equivalent armor attribute rows for non-hallowed families', async () => {
  const maintItems = [
    { source_id: 100, internal_name: 'ShadowHelmet', english_name: 'Shadow Helmet', name_zh: '暗影头盔', defense_value: 6, raw_json: '{}', record_key: 'item-shadow-helmet' },
    { source_id: 956, internal_name: 'AncientShadowHelmet', english_name: 'Ancient Shadow Helmet', name_zh: '远古暗影头盔', defense_value: 6, raw_json: '{}', record_key: 'item-ancient-shadow-helmet' },
    { source_id: 228, internal_name: 'JungleHat', english_name: 'Jungle Hat', name_zh: '丛林帽', defense_value: 5, raw_json: '{}', record_key: 'item-jungle-hat' },
    { source_id: 960, internal_name: 'AncientCobaltHelmet', english_name: 'Ancient Cobalt Helmet', name_zh: '远古钴头盔', defense_value: 5, raw_json: '{}', record_key: 'item-ancient-cobalt-helmet' },
    { source_id: 803, internal_name: 'EskimoHood', english_name: 'Snow Hood', name_zh: '防雪兜帽', defense_value: 3, raw_json: '{}', record_key: 'item-snow-hood' },
    { source_id: 978, internal_name: 'PinkEskimoHood', english_name: 'Pink Snow Hood', name_zh: '粉色防雪兜帽', defense_value: 3, raw_json: '{}', record_key: 'item-pink-snow-hood' },
    { source_id: 151, internal_name: 'NecroHelmet', english_name: 'Necro Helmet', name_zh: '死灵头盔', defense_value: 6, raw_json: '{}', record_key: 'item-necro-helmet' },
    { source_id: 959, internal_name: 'AncientNecroHelmet', english_name: 'Ancient Necro Helmet', name_zh: '远古死灵头盔', defense_value: 6, raw_json: '{}', record_key: 'item-ancient-necro-helmet' },
    { source_id: 2367, internal_name: 'AnglerHat', english_name: 'Angler Hat', name_zh: '渔夫帽', defense_value: 1, raw_json: '{}', record_key: 'item-angler-hat' },
    { source_id: 5591, internal_name: 'UpgradedFishingHead', english_name: 'Captain Hat', name_zh: '船长帽', defense_value: 10, raw_json: '{}', record_key: 'item-captain-hat' }
  ];
  const sourceRows = [
    ['armor-shadow-helmet', '暗影头盔', 'ShadowHelmet', 6, { meleeCritChance: '5%' }],
    ['armor-jungle-hat', '丛林帽', 'JungleHat', 5, { magicDamage: '6%' }],
    ['armor-snow-hood', '防雪兜帽', 'EskimoHood', 3, { otherBonus: 'immune to frozen' }],
    ['armor-necro-helmet', '死灵头盔', 'NecroHelmet', 6, { rangedDamage: '5%' }],
    ['armor-angler-hat', '渔夫帽', 'AnglerHat', 1, { otherBonus: '+5 fishing power' }]
  ];

  const result = await runSync(
    {
      apply: false,
      createDatabase: false,
      maintDatabase: 'terria_v1_maint',
      localDatabase: null,
      relationDatabase: 'terria_v1_relation',
      scopes: ['armor_attributes']
    },
    {
      queryMaint: async (sql) => {
        if (sql.includes('maint_items')) return maintItems;
        if (sql.includes('maint_armor_attribute_rows')) {
          return sourceRows.map(([recordKey, nameZh, internalName, defenseValue, rawCells], index) => ({
            id: index + 1,
            record_key: recordKey,
            section_code: 'pre-hardmode',
            slot_group: 'head',
            item_page_title: nameZh,
            item_href: `/zh/wiki/${encodeURIComponent(nameZh)}`,
            item_name_zh: nameZh,
            defense_value: defenseValue,
            raw_cells_json: JSON.stringify(rawCells),
            source_provider: 'terraria.wiki.gg',
            source_page: '盔甲属性表',
            source_revision_timestamp: '2026-06-01T00:00:00Z',
            landing_source_id: 51,
            landing_source_key: 'wiki.page.armor_attributes',
            landing_content_hash: String(index + 1).repeat(64).slice(0, 64),
            raw_json: JSON.stringify({ internalName })
          }));
        }
        return [];
      },
      writeReports: async () => ({
        auditJsonPath: 'reports/relation/relation-audit-2026-06-01.json',
        auditMdPath: 'reports/relation/relation-audit-2026-06-01.md',
        conflictsPath: 'reports/relation/relation-conflicts-2026-06-01.json',
        unresolvedPath: 'reports/relation/relation-unresolved-2026-06-01.json'
      }),
      loadInheritanceRules: () => [],
      loadReviewedNonNpcSourceExclusions: () => [],
      loadReviewedSourceOnlyItemExclusions: () => []
    }
  );

  const derived = result.results.relationArmorAttributeRows
    .filter((row) => row.reason === 'derived_from_equivalent_armor_attribute_item')
    .map((row) => [row.itemInternalName, row.defenseValue])
    .sort();

  assert.deepEqual(derived, [
    ['AncientCobaltHelmet', 5],
    ['AncientNecroHelmet', 6],
    ['AncientShadowHelmet', 6],
    ['PinkEskimoHood', 3],
    ['UpgradedFishingHead', 10]
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected: FAIL because non-Hallowed derived rows are missing.

- [ ] **Step 3: Import rule helper and remove local array**

In `scripts/data/relation/sync-maint-to-relation.mjs`, add:

```js
import { buildEquivalentArmorAttributeLookup } from './equivalent-armor-attribute-rules.mjs';
```

Delete the local `equivalentArmorAttributeItemGroups` constant and the local `buildEquivalentArmorAttributeLookup` function.

Update the `rawJson` generated inside `deriveEquivalentArmorAttributeRows`:

```js
rawJson: JSON.stringify({
  derivedFromRecordKey: row.recordKey,
  derivedFromItemInternalName: row.itemInternalName,
  equivalentItemInternalName: item.internal_name,
  equivalentArmorAttributeGroupId: item.equivalentArmorAttributeGroupId ?? null,
  evidence: item.equivalentArmorAttributeEvidence ?? 'explicit_equivalent_armor_attribute_rule'
})
```

- [ ] **Step 4: Run tests to verify sync passes**

Run:

```bash
node --test scripts/data/relation/equivalent-armor-attribute-rules.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected: PASS.

## Task 3: Add Equivalent Armor Attribute Audit

**Files:**
- Create: `scripts/data/audit/audit-equivalent-armor-attributes.mjs`
- Create: `scripts/data/audit/audit-equivalent-armor-attributes.test.mjs`

- [ ] **Step 1: Write failing audit tests**

Create `scripts/data/audit/audit-equivalent-armor-attributes.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { auditEquivalentArmorAttributeRows } from './audit-equivalent-armor-attributes.mjs';

test('auditEquivalentArmorAttributeRows flags missing target rows and effect mismatches', () => {
  const result = auditEquivalentArmorAttributeRows({
    pairs: [
      { groupId: 'shadow_ancient_shadow', sourceInternalName: 'ShadowHelmet', targetInternalName: 'AncientShadowHelmet' }
    ],
    items: [
      { sourceId: 100, internalName: 'ShadowHelmet', defense: 6 },
      { sourceId: 956, internalName: 'AncientShadowHelmet', defense: 6 }
    ],
    armorRows: [
      { itemId: 100, itemInternalName: 'ShadowHelmet', defenseValue: 6 }
    ],
    effectRows: [
      { ownerId: 100, itemInternalName: 'ShadowHelmet', statKey: 'crit_chance', classScope: 'all', valueDecimal: 5, unit: 'percent' }
    ]
  });

  assert.deepEqual(result.issues.map((issue) => issue.reason), [
    'missing_target_armor_attribute_row',
    'missing_target_effect_rows'
  ]);
});

test('auditEquivalentArmorAttributeRows accepts matching equivalent rows', () => {
  const result = auditEquivalentArmorAttributeRows({
    pairs: [
      { groupId: 'shadow_ancient_shadow', sourceInternalName: 'ShadowHelmet', targetInternalName: 'AncientShadowHelmet' }
    ],
    items: [
      { sourceId: 100, internalName: 'ShadowHelmet', defense: 6 },
      { sourceId: 956, internalName: 'AncientShadowHelmet', defense: 6 }
    ],
    armorRows: [
      { itemId: 100, itemInternalName: 'ShadowHelmet', defenseValue: 6 },
      { itemId: 956, itemInternalName: 'AncientShadowHelmet', defenseValue: 6 }
    ],
    effectRows: [
      { ownerId: 100, itemInternalName: 'ShadowHelmet', statKey: 'crit_chance', classScope: 'all', valueDecimal: 5, unit: 'percent' },
      { ownerId: 956, itemInternalName: 'AncientShadowHelmet', statKey: 'crit_chance', classScope: 'all', valueDecimal: 5, unit: 'percent' }
    ]
  });

  assert.deepEqual(result.issues, []);
  assert.equal(result.summary.checkedPairs, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/data/audit/audit-equivalent-armor-attributes.test.mjs
```

Expected: FAIL because the audit module is missing.

- [ ] **Step 3: Implement audit helper and CLI**

Create `scripts/data/audit/audit-equivalent-armor-attributes.mjs` with:

```js
#!/usr/bin/env node

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { flattenEquivalentArmorAttributePairs } from '../relation/equivalent-armor-attribute-rules.mjs';

const repoRoot = getProjectRoot();
const moduleRequire = createRequire(import.meta.url);

function effectSignature(row) {
  return [
    row.statKey,
    row.classScope ?? '',
    Number(row.valueDecimal ?? 0),
    row.unit ?? ''
  ].join('|');
}

function groupBy(rows, keyFn) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    result.set(key, [...(result.get(key) ?? []), row]);
  }
  return result;
}

export function auditEquivalentArmorAttributeRows({ pairs, items, armorRows, effectRows }) {
  const itemByInternalName = new Map(items.map((item) => [item.internalName, item]));
  const armorByInternalName = new Map(armorRows.map((row) => [row.itemInternalName, row]));
  const effectsByOwnerId = groupBy(effectRows, (row) => Number(row.ownerId));
  const issues = [];

  for (const pair of pairs) {
    const sourceItem = itemByInternalName.get(pair.sourceInternalName);
    const targetItem = itemByInternalName.get(pair.targetInternalName);
    if (!sourceItem || !targetItem) continue;

    const sourceArmor = armorByInternalName.get(pair.sourceInternalName);
    const targetArmor = armorByInternalName.get(pair.targetInternalName);
    const sourceEffects = effectsByOwnerId.get(Number(sourceItem.sourceId)) ?? [];
    const targetEffects = effectsByOwnerId.get(Number(targetItem.sourceId)) ?? [];

    if (sourceArmor && !targetArmor) {
      issues.push({ groupId: pair.groupId, source: pair.sourceInternalName, target: pair.targetInternalName, reason: 'missing_target_armor_attribute_row' });
    }
    if (sourceArmor && targetArmor && Number(sourceArmor.defenseValue) !== Number(targetArmor.defenseValue)) {
      issues.push({ groupId: pair.groupId, source: pair.sourceInternalName, target: pair.targetInternalName, reason: 'defense_value_mismatch', sourceDefense: sourceArmor.defenseValue, targetDefense: targetArmor.defenseValue });
    }
    if (sourceEffects.length && !targetEffects.length) {
      issues.push({ groupId: pair.groupId, source: pair.sourceInternalName, target: pair.targetInternalName, reason: 'missing_target_effect_rows' });
      continue;
    }
    const sourceSignatures = sourceEffects.map(effectSignature).sort();
    const targetSignatures = targetEffects.map(effectSignature).sort();
    if (sourceSignatures.length && JSON.stringify(sourceSignatures) !== JSON.stringify(targetSignatures)) {
      issues.push({ groupId: pair.groupId, source: pair.sourceInternalName, target: pair.targetInternalName, reason: 'effect_signature_mismatch', sourceSignatures, targetSignatures });
    }
  }

  return {
    summary: {
      checkedPairs: pairs.length,
      issueCount: issues.length
    },
    issues
  };
}

async function main() {
  const config = loadLocalStackConfig(repoRoot);
  const mysql = moduleRequire('mysql2/promise');
  const connection = await mysql.createConnection({
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: 'terria_v1_relation'
  });
  try {
    const [items] = await connection.query("SELECT id AS sourceId, internal_name AS internalName, defense FROM projection_items WHERE deleted = 0");
    const [armorRows] = await connection.query("SELECT item_id AS itemId, item_internal_name AS itemInternalName, defense_value AS defenseValue FROM projection_item_armor_attributes WHERE deleted = 0");
    const [effectRows] = await connection.query("SELECT owner_id AS ownerId, item_internal_name AS itemInternalName, stat_key AS statKey, class_scope AS classScope, value_decimal AS valueDecimal, unit FROM projection_equipment_effect_attributes WHERE deleted = 0 AND owner_kind = 'item' AND source_kind = 'armor_attribute_cell'");
    const result = auditEquivalentArmorAttributeRows({
      pairs: flattenEquivalentArmorAttributePairs(),
      items,
      armorRows,
      effectRows
    });
    const outputPath = path.join(repoRoot, 'reports', 'relation', 'equivalent-armor-attributes-2026-06-01.json');
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Equivalent armor attribute audit: checked=${result.summary.checkedPairs} issues=${result.summary.issueCount}`);
    console.log(`Report: ${outputPath}`);
    if (result.issues.length) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run audit tests**

Run:

```bash
node --test scripts/data/audit/audit-equivalent-armor-attributes.test.mjs
```

Expected: PASS.

## Task 4: Local Dry-Run, Apply, And Runtime Verification

**Files:**
- No new code unless previous tasks reveal a testable defect.
- Generated reports remain untracked unless explicitly reviewed and intentionally committed.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
node --test scripts/data/relation/equivalent-armor-attribute-rules.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/audit/audit-equivalent-armor-attributes.test.mjs scripts/data/relation/armor-set-processor.test.mjs scripts/data/relation/projection-sync.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run dry-run sync**

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=armor_attributes
```

Expected:
- `Apply: false`
- `Relation writes: 0`

- [ ] **Step 3: Apply only to local relation DB**

Before running, confirm config:

```bash
sed -n '1,40p' scripts/dev/config/local-stack.config.json
```

Expected DB target:

```json
"host": "127.0.0.1",
"port": 13306
```

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=armor_attributes
```

Expected:
- `Apply: true`
- `Relation writes: performed`

If the script takes several minutes, monitor read-only:

```bash
mysql -h127.0.0.1 -P13306 -uroot -proot -N -e "SHOW PROCESSLIST;"
ps -eo pid,etime,pcpu,pmem,rss,cmd | rg 'sync-maint-to-relation|node scripts/data/relation' | rg -v rg
```

- [ ] **Step 4: Run equivalent audit against local DB**

Run:

```bash
node scripts/data/audit/audit-equivalent-armor-attributes.mjs
```

Expected:
- `issues=0` for configured equivalent groups.

If `AncientIronHelmet` or `AncientGoldHelmet` still have no item effect rows, do not fail this audit unless they are added to the configured rule list. Record them as follow-up evidence gaps if needed.

- [ ] **Step 5: Verify concrete DB samples**

Run:

```bash
mysql -h127.0.0.1 -P13306 -uroot -proot -e "
SELECT owner_id, item_internal_name, stat_key, stat_label_zh, class_scope, value_decimal, unit
FROM terria_v1_relation.projection_equipment_effect_attributes
WHERE owner_kind='item'
  AND source_kind='armor_attribute_cell'
  AND owner_id IN (100,101,102,956,957,958,228,229,230,960,961,962,803,804,805,978,979,980,151,959,2367,2368,2369,5591,5592,5593)
  AND deleted=0
ORDER BY owner_id, stat_key, class_scope, value_decimal;
"
```

Expected:
- Shadow and Ancient Shadow matching signatures.
- Jungle and Ancient Cobalt matching signatures.
- Snow and Pink Snow matching armor rows; effect rows may be empty if source table only has non-numeric `otherBonus`.
- Necro and Ancient Necro matching helmet signatures.
- Angler and Captain matching configured signatures if source numeric rows exist.

- [ ] **Step 6: Verify public item APIs**

Run selected samples:

```bash
curl -sS --max-time 8 http://127.0.0.1:18088/api/public/items/956/equipment-effects
curl -sS --max-time 8 http://127.0.0.1:18088/api/public/items/960/equipment-effects
curl -sS --max-time 8 http://127.0.0.1:18088/api/public/items/959/equipment-effects
```

Expected:
- Non-empty effect arrays where the source equivalent has numeric armor attribute effects.

- [ ] **Step 7: Run frontend and data checks**

Run:

```bash
node front-nuxt/scripts/check-armor-build-projection-groups.mjs
node front-nuxt/scripts/check-armor-stat-visuals.mjs
pnpm --dir front-nuxt run check
```

Expected:
- Contract scripts pass.
- `pnpm --dir front-nuxt run check` passes, allowing the existing Nuxt `module.register()` deprecation warning.

## Task 5: Commit And Handoff

**Files:**
- Commit code/test files only.
- Do not commit large generated reports unless explicitly requested.

- [ ] **Step 1: Check status**

Run:

```bash
git status --short --branch
git diff --cached --stat
```

Expected:
- No staged files before explicit staging.
- Untracked generated reports may remain.

- [ ] **Step 2: Stage explicit files only**

Run:

```bash
git add \
  scripts/data/relation/equivalent-armor-attribute-rules.mjs \
  scripts/data/relation/equivalent-armor-attribute-rules.test.mjs \
  scripts/data/relation/sync-maint-to-relation.mjs \
  scripts/data/relation/sync-maint-to-relation.test.mjs \
  scripts/data/audit/audit-equivalent-armor-attributes.mjs \
  scripts/data/audit/audit-equivalent-armor-attributes.test.mjs \
  docs/superpowers/plans/2026-06-01-equivalent-armor-attribute-inheritance.md
```

- [ ] **Step 3: Review staged scope**

Run:

```bash
git diff --cached --stat
git diff --cached --name-status
```

Expected:
- Only the listed code/test/plan files are staged.
- No `reports/relation/relation-unresolved-2026-05-31.json`.

- [ ] **Step 4: Commit**

Run:

```bash
git commit -m "fix: derive equivalent armor attribute rows"
```

- [ ] **Step 5: Post-commit status**

Run:

```bash
git status --short --branch
git branch -vv
git worktree list --porcelain
```

Expected:
- Branch has the new commit.
- Only intentional untracked generated reports remain.

## Multi-Agent Execution Split

Recommended split if using subagents:

- Agent A owns `scripts/data/relation/equivalent-armor-attribute-rules.mjs` and its test.
- Agent B owns `scripts/data/relation/sync-maint-to-relation.mjs` and sync tests.
- Agent C owns `scripts/data/audit/audit-equivalent-armor-attributes.mjs` and audit tests.
- Main agent owns DB dry-run/apply, API verification, frontend checks, and commit.

No two agents should edit the same file. No subagent should run apply or write DB.

## Plan Audit

## Verdict
- Status: Execution-ready after this plan is committed or explicitly approved for execution.
- Main goal: Fix equivalent armor attribute inheritance beyond Hallowed.
- Closure definition: Configured equivalent groups have matching relation/projection armor rows and item-owned effect signatures; public APIs expose the derived rows; frontend contract checks pass.

## Blocking Plan Defects
- Critical: None.
- Important: `AncientIronHelmet` and `AncientGoldHelmet` are deliberately not in the first configured rule list because current source rows do not provide item-owned effect rows for their paired bodies/legs; adding them would create no useful effect data. They need separate source evidence before inclusion.

## Plan Repairs
- Change: Added audit script as a required gate, not just unit tests.
- Reason: Unit tests could pass while local projection remains stale or missing after apply.
- Validation added: `node scripts/data/audit/audit-equivalent-armor-attributes.mjs`.

## Execution-Ready Plan
- Scope: Relation sync + audit + local DB verification; no crawler or production writes.
- Agent split: Rule module, sync integration, audit module, main runtime verification.
- Smoke test: DB query for `AncientShadow*`, `AncientCobalt*`, `PinkEskimo*`, `AncientNecroHelmet`, and selected public item equipment-effect APIs.
- Final validation: Focused node tests, dry-run, local apply, equivalent audit, API checks, front-nuxt checks, explicit staged commit.

## Residual Risk
- Risk: Some equivalent sets may have non-numeric `otherBonus` rows that the current `buildArmorAttributeEffectRows` parser does not emit as item-owned effects.
- Follow-up trigger: If audit shows matching armor rows but missing effect signatures for groups with only `otherBonus`, decide whether to parse those as structured `special_effect` rows or leave them represented by armor set benefit effects.
