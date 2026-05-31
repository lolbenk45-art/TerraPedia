# Armor Set Backend Projection Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix armor set relation/projection generation so public armor-set APIs stop returning interchangeable equivalent pieces as noisy cartesian duplicate builds.

**Architecture:** Repair the data-generation chain before touching UI. The public API reads `terria_v1_relation.projection_armor_sets`, so the fix belongs in `scripts/data/relation/armor-set-processor.mjs` and the generated definition-map behavior, with API/runtime checks only used as final proof.

**Tech Stack:** Node data relation scripts, MySQL local stack, Java Spring public API, Node test runner.

---

## Current Evidence

Read-only checks on 2026-05-31:

- Current worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/main-merge-crafting-graph`
- Current branch: `fix/armor-set-detail-dedup-values-2026-05-31`
- Public backend URL: `http://127.0.0.1:18088`
- Source DBs checked: `terria_v1_local`, `terria_v1_maint`, `terria_v1_relation`
- Public API detail for Hallowed armor reads projection data directly through `PublicArmorSetServiceImpl`.

The original symptom is already present in `terria_v1_relation.projection_armor_sets`:

| id | text_key | name_zh | set_count | unique_item_count | related_items_json length |
| --- | --- | --- | ---: | ---: | ---: |
| 2879750981 | WikiArmorSet.Hallowed armor | 神圣盔甲 | 24 | 10 | 72 |
| 3551390261 | WikiArmorSet.Ancient Hallowed armor | 远古神圣盔甲 | 24 | 10 | 72 |

The legacy local table still has page-specific base rows:

| local id | source_key | text_key | set_count | unique_item_count | sets_json |
| --- | --- | --- | ---: | ---: | --- |
| 51 | 神圣盔甲 | ArmorSetBonus.Hallowed | 1 | 3 | `[[559,551,552]]` |
| 52 | 远古神圣盔甲 | ArmorSetBonus.Hallowed | 1 | 3 | `[[4899,4900,4901]]` |
| 132 | ArmorSetBonus.Hallowed | ArmorSetBonus.Hallowed | 24 | 10 | full 24 cartesian variants |

## Full Scan Findings

Full projection scan checked all 88 armor-set rows. Risk detection looked for:

- `set_count` equal to the product of unique `head/body/legs` candidate counts.
- `related_items_json` length equal to `set_count * 3`.
- Multiple pages returning the same unique item-id set.
- Page names mixed with another interchangeable family.

Confirmed problematic or high-risk cartesian expansions:

| id | text_key | name_zh | set_count | unique_item_count | role counts | verdict |
| --- | --- | --- | ---: | ---: | --- | --- |
| 2879750981 | WikiArmorSet.Hallowed armor | 神圣盔甲 | 24 | 10 | head 6, body 2, legs 2 | Confirmed bad: page mixes ancient family and expands equivalent pieces |
| 3551390261 | WikiArmorSet.Ancient Hallowed armor | 远古神圣盔甲 | 24 | 10 | head 6, body 2, legs 2 | Confirmed bad: page mixes non-ancient family and expands equivalent pieces |
| 1617709070 | WikiArmorSet.Snow armor | 防雪盔甲 | 8 | 6 | head 2, body 2, legs 2 | High risk: same unique ids as Pink Snow |
| 1842894606 | WikiArmorSet.Pink Snow armor | 粉色防雪盔甲 | 8 | 6 | head 2, body 2, legs 2 | High risk: same unique ids as Snow |
| 2504219796 | WikiArmorSet.Jungle armor | 丛林盔甲 | 8 | 6 | head 2, body 2, legs 2 | High risk: same unique ids as Ancient Cobalt |
| 3375457010 | WikiArmorSet.Ancient Cobalt armor | 远古钴盔甲 | 8 | 6 | head 2, body 2, legs 2 | High risk: same unique ids as Jungle |
| 3057093197 | WikiArmorSet.Ancient Shadow armor | 远古暗影盔甲 | 8 | 6 | head 2, body 2, legs 2 | High risk: ancient/non-ancient family expansion |
| 1033016154 | WikiArmorSet.Angler armor | 渔夫盔甲 | 8 | 6 | head 2, body 2, legs 2 | High risk: angler/captain interchangeable family |
| 416147549 | WikiArmorSet.Mining armor | 挖矿盔甲 | 12 | 7 | head 3, body 2, legs 2 | Protection sample: may be valid multi-variant data; do not blindly collapse |

Duplicate unique-item groups found:

- Metal group: Gold/Tungsten/Lead/Silver/Platinum all currently share 13 unique item ids with `set_count=5`.
- Copper/Tin/Iron group all currently share 10 unique item ids with `set_count=4`.
- Wood family: Pearlwood/Ash Wood/Rich Mahogany/Shadow/Shadewood/Ebonwood/Wood/Palm Wood/Boreal Wood all currently share 21 unique item ids with `set_count=7`.
- Snow/Pink Snow share 6 unique item ids with `set_count=8`.
- Jungle/Ancient Cobalt share 6 unique item ids with `set_count=8`.
- Hallowed/Ancient Hallowed share 10 unique item ids with `set_count=24`.

These groups must be reviewed by rule, not hardcoded one by one.

## Root Cause

`scripts/data/relation/armor-set-processor.mjs` builds wiki armor page rows from `wikiArmorSets`.

The problematic path:

1. `findWikiArmorItems(record, slotItems)` includes items from `record.pageTitle` and every `record.interchangeableSetTitles` entry.
2. Items are grouped by `head`, `body`, and `legs`.
3. If a mapped maint definition exists, `mappedDefinition.sets` is used directly.
4. Otherwise `cartesianArmorSets(groups)` expands every role candidate into full variants.
5. `relation_armor_set_items` and then `projection_armor_sets.related_items_json` receive every expanded item row.

`scripts/data/generate/generate-armor-set-definition-map.mjs` currently worsens Hallowed:

```js
['神圣盔甲', 'ArmorSetBonus.Hallowed'],
['远古神圣盔甲', 'ArmorSetBonus.Hallowed'],
```

That points both wiki pages to the same Module:ArmorSetBonuses definition, which already contains all 24 Hallowed/Ancient Hallowed interchangeable variants.

## Scope

In scope:

- Fix relation/projection generation for armor set interchangeable families.
- Preserve page-level images and effect text from `data/generated/wiki-armor-sets.latest.json`.
- Preserve item-level attributes and images in `related_items_json`.
- Add tests for confirmed bad samples and protection samples.
- Run a local relation sync only after tests pass.
- Verify public API detail responses after data refresh.

Out of scope:

- Frontend layout or CSS changes.
- Crawler changes or wiki fetching.
- Production database writes.
- Broad armor attribute parsing changes.
- Hardcoded Hallowed-only frontend fixes.

## File Map

- Modify: `scripts/data/relation/armor-set-processor.mjs`
  - Add equivalence-aware variant selection for wiki armor page rows.
  - Keep relation image handling unchanged.
- Modify: `scripts/data/relation/armor-set-processor.test.mjs`
  - Add failing tests for Hallowed/Ancient Hallowed and high-risk equivalent families.
  - Keep Mining/Rich Mahogany as protection samples.
- Modify: `scripts/data/generate/generate-armor-set-definition-map.mjs`
  - Stop forcing page rows to inherit full effect-key cartesian definitions when a page-specific local base row exists.
- Modify: `scripts/data/generate/armor-set-definition-source.test.mjs` or create focused generator test if needed.
  - Cover Hallowed local page-specific seed behavior.
- Read-only validation: `back/src/main/java/com/terraria/skills/service/impl/PublicArmorSetServiceImpl.java`
  - No expected code change unless projection contract cannot represent the fixed data.

## Desired Data Contract

For a public armor-set page:

- `setCount` should represent meaningful build variants, not every equivalent ancient/non-ancient material swap.
- `relatedItems` should include the pieces needed to explain the variants and their alternatives.
- Equivalent alternatives should remain visible as alternatives, not repeated as full duplicated builds.
- Real build differences must still create distinct variants.

Equivalent alternative candidates can be grouped when all of these hold:

- Same equipment slot role (`head`, `body`, or `legs`).
- Same defense value when armor attributes exist.
- Same normalized item effect signature when equipment effect attributes exist.
- Same set-bonus effect context for the owning armor set.
- Same interchangeable family from wiki page metadata or same generated definition group.

If effect or defense data is missing, do not silently collapse high-risk cases unless a test fixture and source evidence make the equivalence explicit.

## Task 1: Add Failing Relation Tests For Hallowed

**Files:**

- Modify: `scripts/data/relation/armor-set-processor.test.mjs`

- [ ] **Step 1: Add test fixture items**

Add Hallowed and Ancient Hallowed item fixtures in the test file near existing armor relation tests:

```js
const hallowedItems = [
  item(558, 'HallowedHeadgear', 'Hallowed Headgear', { headSlot: 56 }),
  item(553, 'HallowedHelmet', 'Hallowed Helmet', { headSlot: 53 }),
  item(559, 'HallowedMask', 'Hallowed Mask', { headSlot: 57 }),
  item(4898, 'AncientHallowedHeadgear', 'Ancient Hallowed Headgear', { headSlot: 249 }),
  item(4897, 'AncientHallowedHelmet', 'Ancient Hallowed Helmet', { headSlot: 248 }),
  item(4896, 'AncientHallowedMask', 'Ancient Hallowed Mask', { headSlot: 247 }),
  item(551, 'HallowedPlateMail', 'Hallowed Plate Mail', { bodySlot: 24 }),
  item(4900, 'AncientHallowedPlateMail', 'Ancient Hallowed Plate Mail', { bodySlot: 250 }),
  item(552, 'HallowedGreaves', 'Hallowed Greaves', { legSlot: 23 }),
  item(4901, 'AncientHallowedGreaves', 'Ancient Hallowed Greaves', { legSlot: 250 }),
]
```

- [ ] **Step 2: Add failing Hallowed page test**

Add a test that currently fails because the processor emits 24 variants:

```js
test('buildArmorSetRelations does not expand equivalent Hallowed ancient swaps into duplicate page builds', () => {
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Hallowed armor',
        nameZh: '神圣盔甲',
        section: 'hardmode',
        compositionKind: 'traditional_set',
        effectText: '+7% 伤害\n每个部件都可以和远古神圣盔甲的部件互换\n神圣头饰：+12% 魔法伤害\n神圣头盔：+15% 远程伤害\n神圣面具：+10% 近战伤害',
        interchangeableSetTitles: ['Ancient Hallowed armor'],
        images: [],
        sourceRevisionTimestamp: '2026-04-04T07:46:03Z',
      }
    ],
    armorSetDefinitionMap: {
      records: {
        286: {
          name: '神圣盔甲',
          internalCode: '神圣盔甲',
          definition: { textKey: 'ArmorSetBonus.Hallowed' },
        },
      },
    },
    maintArmorSets: [
      {
        id: 44,
        record_key: 'hallowed-maint-key',
        text_key: 'ArmorSetBonus.Hallowed',
        benefit_expression: 'ArmorSetBonuses.Benefits.Hallowed',
        primary_part: 'Head',
        set_count: 24,
        unique_item_count: 10,
        sets_json: JSON.stringify([
          [558, 551, 552], [558, 551, 4901], [558, 4900, 552], [558, 4900, 4901],
          [553, 551, 552], [553, 551, 4901], [553, 4900, 552], [553, 4900, 4901],
          [559, 551, 552], [559, 551, 4901], [559, 4900, 552], [559, 4900, 4901],
          [4898, 551, 552], [4898, 551, 4901], [4898, 4900, 552], [4898, 4900, 4901],
          [4897, 551, 552], [4897, 551, 4901], [4897, 4900, 552], [4897, 4900, 4901],
          [4896, 551, 552], [4896, 551, 4901], [4896, 4900, 552], [4896, 4900, 4901],
        ]),
        unique_item_ids_json: JSON.stringify([558, 551, 552, 4901, 4900, 553, 559, 4898, 4897, 4896]),
        raw_json: '{}',
        ...baseTrace,
      },
    ],
    maintItems: hallowedItems,
  })

  assert.equal(actual.relationArmorSets.length, 1)
  assert.ok(actual.relationArmorSets[0].setCount < 24)
  assert.notEqual(actual.relationArmorSetItems.length, 72)
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 551))
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 4900))
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 552))
  assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 4901))
})
```

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected: FAIL because the current implementation returns `setCount=24` and 72 relation item rows.

## Task 2: Add Full-Scan Guard Test Cases

**Files:**

- Modify: `scripts/data/relation/armor-set-processor.test.mjs`

- [ ] **Step 1: Add high-risk family tests**

Add table-driven tests for Snow/Pink Snow, Jungle/Ancient Cobalt, and Ancient Shadow style interchangeable pages. Each test should use two same-family sets with two heads, two bodies, and two legs and assert the page row does not emit all 8 cartesian variants when all swapped pieces are equivalent alternatives.

Use this structure:

```js
test('buildArmorSetRelations does not expand fully equivalent two-set interchangeable families', () => {
  const actual = buildArmorSetRelations({
    wikiArmorSets: [
      {
        pageTitle: 'Snow armor',
        nameZh: '防雪盔甲',
        compositionKind: 'traditional_set',
        interchangeableSetTitles: ['Pink Snow armor'],
        effectText: '每个部件都可以和粉色防雪盔甲的部件互换\n套装奖励：免疫冰冻',
        images: [],
      },
    ],
    maintItems: [
      item(803, 'EskimoHood', 'Snow Hood', { headSlot: 74 }),
      item(978, 'PinkEskimoHood', 'Pink Snow Hood', { headSlot: 74 }),
      item(804, 'EskimoCoat', 'Snow Coat', { bodySlot: 44 }),
      item(979, 'PinkEskimoCoat', 'Pink Snow Coat', { bodySlot: 44 }),
      item(805, 'EskimoPants', 'Snow Pants', { legSlot: 43 }),
      item(980, 'PinkEskimoPants', 'Pink Snow Pants', { legSlot: 43 }),
    ],
  })

  assert.equal(actual.relationArmorSets.length, 1)
  assert.ok(actual.relationArmorSets[0].setCount < 8)
  assert.ok(actual.relationArmorSetItems.length < 24)
})
```

- [ ] **Step 2: Keep protection tests explicit**

Do not remove or weaken existing Mining and Rich Mahogany assertions. Keep these current checks green:

```js
assert.equal(actual.relationArmorSets[0].setCount, 12)
assert.equal(actual.relationArmorSetItems.length, 36)
```

and:

```js
assert.equal(actual.relationArmorSets[0].setCount, 2)
assert.equal(actual.relationArmorSetItems.length, 6)
```

These protect against a blunt collapse that would hide legitimate multi-variant structures.

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected: FAIL on the newly added equivalent-family tests, existing Mining/Rich Mahogany tests remain meaningful.

## Task 3: Implement Equivalence-Aware Variant Selection

**Files:**

- Modify: `scripts/data/relation/armor-set-processor.mjs`

- [ ] **Step 1: Add normalized family helpers**

Add helper functions near `normalizeArmorDefinitionKey`:

```js
function normalizeInterchangeableFamilyName(value) {
  return normalizeNameKey(value)
    ?.replace(/\bancient\b/g, '')
    .replace(/\bpink\b/g, '')
    .replace(/\bsnow\b/g, 'snow')
    .replace(/\s+/g, ' ')
    .trim() ?? null;
}

function armorItemFamilyKey(entry) {
  const itemName = entry?.item?.english_name ?? entry?.item?.englishName ?? entry?.item?.name ?? entry?.item?.internal_name ?? entry?.item?.internalName;
  const role = entry?.slot?.partRole ?? 'unknown';
  const key = normalizeNameKey(itemName)
    ?.replace(/\bancient\b/g, '')
    .replace(/\bpink\b/g, '')
    .replace(/\bhelmet\b|\bheadgear\b|\bmask\b|\bhood\b|\bhat\b/g, role === 'head' ? 'head' : '')
    .replace(/\bplate mail\b|\bbreastplate\b|\bshirt\b|\bcoat\b|\bscalemail\b|\bscale mail\b|\bbody\b|\bvest\b/g, role === 'body' ? 'body' : '')
    .replace(/\bgreaves\b|\bleggings\b|\bpants\b|\blegs\b/g, role === 'legs' ? 'legs' : '')
    .replace(/\s+/g, ' ')
    .trim();
  return key ? `${role}:${key}` : `${role}:${entry?.sourceId ?? ''}`;
}
```

- [ ] **Step 2: Add variant collapse helper**

Add a helper before `buildWikiArmorSetRecord`:

```js
function collapseEquivalentCartesianVariants({ variants, effectiveSetItems, record }) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return variants;
  }
  const itemBySourceId = new Map(effectiveSetItems.map((entry) => [entry.sourceId, entry]));
  const hasInterchangeable = Array.isArray(record?.interchangeableSetTitles) && record.interchangeableSetTitles.length > 0;
  if (!hasInterchangeable) {
    return variants;
  }

  const seen = new Set();
  const collapsed = [];
  for (const variant of variants) {
    const signature = variant
      .map((sourceId) => itemBySourceId.get(sourceId))
      .map((entry) => armorItemFamilyKey(entry))
      .join('|');
    if (!signature || seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    collapsed.push(variant);
  }

  return collapsed.length > 0 ? collapsed : variants;
}
```

This is the first implementation pass. If it over-collapses Mining, keep Mining tests as the blocking signal and refine the signature to include real per-item stat/effect differences from available attributes.

- [ ] **Step 3: Use collapsed variants for wiki page rows**

In `buildWikiArmorSetRelations`, after `effectiveSetItems` is built and before `buildWikiArmorSetRecord`, replace:

```js
const armorSet = buildWikiArmorSetRecord(record, effectiveSetItems, variants, uniqueItemIds);
```

with:

```js
const effectiveVariants = compositionKind === 'traditional_set'
  ? collapseEquivalentCartesianVariants({ variants, effectiveSetItems, record })
  : variants;
const effectiveUniqueItemIds = stableUnique([
  ...effectiveVariants.flat(),
  ...stableUnique(effectiveSetItems.map((entry) => entry.sourceId)),
]);
const armorSet = buildWikiArmorSetRecord(record, effectiveSetItems, effectiveVariants, effectiveUniqueItemIds);
```

Then use `effectiveVariants` in the loop that creates `relationArmorSetItems`:

```js
for (let setVariantIndex = 0; setVariantIndex < effectiveVariants.length; setVariantIndex += 1) {
  const variant = effectiveVariants[setVariantIndex];
  ...
}
```

- [ ] **Step 4: Verify GREEN or refine**

Run:

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected: Hallowed and equivalent-family tests pass, Mining/Rich Mahogany protection tests still pass. If Mining fails, refine `armorItemFamilyKey` so non-equivalent upgraded/prospector/ultrabright variants remain distinct.

## Task 4: Repair Definition Map Page Override Behavior

**Files:**

- Modify: `scripts/data/generate/generate-armor-set-definition-map.mjs`
- Modify or create test: `scripts/data/generate/armor-set-definition-source.test.mjs`

- [ ] **Step 1: Add generator test**

Add a test that proves a page-specific local armor row can keep its own item ids instead of inheriting the full module bonus definition:

```js
test('toArmorSetDefinitionSeedRow preserves page-specific hallowed armor item ids', () => {
  const seed = toArmorSetDefinitionSeedRow({
    id: 51,
    source_key: '神圣盔甲',
    text_key: 'ArmorSetBonus.Hallowed',
    sets_json: '[[559,551,552]]',
    unique_item_ids_json: '[559,551,552]',
  })

  assert.equal(seed.armorSetId, 51)
  assert.equal(seed.name, '神圣盔甲')
  assert.deepEqual(seed.itemIds, [559, 551, 552])
})
```

- [ ] **Step 2: Remove unconditional Hallowed manual override**

In `manualDefinitionOverrides`, remove these two lines:

```js
['神圣盔甲', 'ArmorSetBonus.Hallowed'],
['远古神圣盔甲', 'ArmorSetBonus.Hallowed'],
```

If a manual mapping is still needed for effect text lookup, add a separate field that does not replace page-specific `sets_json`.

- [ ] **Step 3: Verify generator tests**

Run:

```bash
node --test scripts/data/generate/armor-set-definition-source.test.mjs
```

Expected: PASS.

## Task 5: Dry-Run Relation Projection And Inspect Armor Results

**Files:**

- No production file edits.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs
node --test scripts/data/relation/projection-sync.test.mjs
node --test scripts/data/generate/armor-set-definition-source.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run relation sync dry-run**

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --scopes=armor-set
```

Expected: no DB writes unless `--apply` is present. The report should show armor set projection rows generated without applying.

- [ ] **Step 3: Inspect dry-run report**

Inspect the newest relation report under `reports/` and confirm the planned projection data for:

- `WikiArmorSet.Hallowed armor`
- `WikiArmorSet.Ancient Hallowed armor`
- `WikiArmorSet.Snow armor`
- `WikiArmorSet.Pink Snow armor`
- `WikiArmorSet.Jungle armor`
- `WikiArmorSet.Ancient Cobalt armor`
- `WikiArmorSet.Mining armor`
- `WikiArmorSet.Rich Mahogany armor`

Expected:

- Hallowed and Ancient Hallowed no longer have 24 variants or 72 related items.
- Snow/Pink Snow and Jungle/Ancient Cobalt no longer expose pure equivalent cartesian noise.
- Mining remains a valid multi-variant protection sample unless source evidence proves otherwise.

## Task 6: Apply Local Data Refresh

**Files:**

- DB write target: local `terria_v1_relation`

- [ ] **Step 1: Confirm local-only target**

Run:

```bash
node - <<'NODE'
const fs = require('fs')
const cfg = JSON.parse(fs.readFileSync('scripts/dev/config/local-stack.config.json', 'utf8'))
console.log(JSON.stringify({ database: cfg.database?.name, host: cfg.database?.host, port: cfg.database?.port }, null, 2))
NODE
```

Expected:

```json
{
  "database": "terria_v1_local",
  "host": "127.0.0.1",
  "port": 13306
}
```

- [ ] **Step 2: Apply relation sync**

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --apply --scopes=armor-set
```

Expected: local relation/projection armor tables update successfully.

- [ ] **Step 3: Query updated projection rows**

Run:

```bash
MYSQL_PWD="$(node -pe "JSON.parse(require('fs').readFileSync('scripts/dev/config/local-stack.config.json','utf8')).database.password")" \
mysql -h "$(node -pe "JSON.parse(require('fs').readFileSync('scripts/dev/config/local-stack.config.json','utf8')).database.host")" \
  -P "$(node -pe "JSON.parse(require('fs').readFileSync('scripts/dev/config/local-stack.config.json','utf8')).database.port")" \
  -u "$(node -pe "JSON.parse(require('fs').readFileSync('scripts/dev/config/local-stack.config.json','utf8')).database.username")" \
  -N -e "SELECT id,text_key,name_zh,set_count,unique_item_count,JSON_LENGTH(related_items_json) FROM terria_v1_relation.projection_armor_sets WHERE text_key IN ('WikiArmorSet.Hallowed armor','WikiArmorSet.Ancient Hallowed armor','WikiArmorSet.Mining armor','WikiArmorSet.Rich Mahogany armor') ORDER BY text_key;"
```

Expected:

- Hallowed rows are below the previous `24/72`.
- Mining and Rich Mahogany remain explainable and not empty.

## Task 7: Runtime API Validation

**Files:**

- No production file edits unless runtime contract reveals missing backend fields.

- [ ] **Step 1: Restart local stack if backend cache or process is stale**

Run:

```bash
bash ./scripts/dev/start-local-stack.sh
```

Expected: backend URL is available at `http://127.0.0.1:18088`.

- [ ] **Step 2: Probe public armor APIs**

Run:

```bash
node --input-type=commonjs - <<'NODE'
(async () => {
  const ids = [
    2879750981,
    3551390261,
    416147549,
    1088810409,
    1617709070,
    1842894606,
    2504219796,
    3375457010,
  ]
  for (const id of ids) {
    const body = await (await fetch(`http://127.0.0.1:18088/api/public/armor-sets/${id}`)).json()
    const data = body.data ?? body
    const related = data.relatedItems ?? []
    console.log(JSON.stringify({
      id,
      nameZh: data.nameZh,
      setCount: data.setCount,
      uniqueItemCount: data.uniqueItemCount,
      relatedItems: related.length,
      variants: [...new Set(related.map((item) => item.setVariantIndex))].length,
    }))
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
NODE
```

Expected:

- `2879750981` and `3551390261` no longer show 24 variants and 72 related items.
- Protection samples still have non-empty related item data.

- [ ] **Step 3: Run local smoke**

Run:

```bash
bash ./scripts/dev/smoke-local-stack.sh
```

Expected: pass.

## Task 8: Final Review And Commit

**Files:**

- Code files changed by previous tasks.
- This plan file.

- [ ] **Step 1: Run final checks**

Run:

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs
node --test scripts/data/relation/projection-sync.test.mjs
node --test scripts/data/generate/armor-set-definition-source.test.mjs
bash ./scripts/dev/smoke-local-stack.sh
git status --short
```

Expected: tests and smoke pass; status shows only focused task files and generated data/report files that are intentionally kept.

- [ ] **Step 2: Review diff**

Run:

```bash
git diff -- scripts/data/relation/armor-set-processor.mjs scripts/data/relation/armor-set-processor.test.mjs scripts/data/generate/generate-armor-set-definition-map.mjs scripts/data/generate/armor-set-definition-source.test.mjs docs/superpowers/plans/2026-05-31-armor-set-backend-projection-dedup.md
```

Expected: diff only contains the armor set projection fix, tests, and this plan.

- [ ] **Step 3: Commit focused files only**

Run:

```bash
git add scripts/data/relation/armor-set-processor.mjs \
  scripts/data/relation/armor-set-processor.test.mjs \
  scripts/data/generate/generate-armor-set-definition-map.mjs \
  scripts/data/generate/armor-set-definition-source.test.mjs \
  docs/superpowers/plans/2026-05-31-armor-set-backend-projection-dedup.md
git diff --cached --stat
git commit -m "fix: dedupe armor set projection variants"
```

Do not use `git add .`.

## Plan Audit Verdict

Status: execution-ready after user approval.

This plan closes the original backend/data-visible complaint because it targets the source of the API response, not the frontend renderer. It includes a runtime API probe for the exact complained IDs and full-scan samples so the plan cannot pass while Hallowed still returns 24 duplicate builds.

Residual risks:

- Some duplicate unique-item groups may be legitimate families with shared bonus definitions. The implementation must use tests and source evidence, not raw `set_count` alone.
- If current item effect/defense data is incomplete, the first implementation may need a conservative fallback that leaves uncertain families unchanged and only collapses evidence-backed equivalent swaps.
- If `sync-maint-to-relation.mjs --scopes=armor-set` is not a supported isolated scope, run the existing documented relation sync path and inspect only armor set outputs before applying.
