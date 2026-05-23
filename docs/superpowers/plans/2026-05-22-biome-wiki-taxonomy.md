# Biome Wiki Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TerraPedia biome data and admin UI match the Terraria wiki.gg Biomes table-of-contents hierarchy, including top-level and nested categories such as `Space`, `Surface and Underground > Forest`, `Cavern > Ice biome`, `Hardmode > Underground Hallow`, `Micro-biomes > Spike Caves`, and `Treasure rooms > Underground Cabin`.

**Architecture:** Keep `biomes.layer_type` and `biomes.biome_type` for backward compatibility, but add explicit wiki taxonomy fields sourced from the Biomes page section tree: `wiki_group_code`, `wiki_group_name_en`, `wiki_group_name_zh`, `wiki_parent_group_code`, `wiki_section_level`, `wiki_sort_order`, and `wiki_section_anchor`. Fetch records preserve section metadata, transform records derive stable category codes and Chinese labels, import persists them, backend exposes them, and the admin page renders wiki-style hierarchy filters instead of the current flattened chips.

**Tech Stack:** Node crawler/transform/import scripts, MySQL Flyway migrations, Spring Boot/MyBatis Plus backend, Nuxt/Vue admin app, Node test runner, JUnit/Mockito.

---

## Current Evidence

- Wiki API `parse&prop=sections&page=Biomes` exposes the exact hierarchy needed for the screenshot: top-level sections are `Space`, `Surface and Underground`, `Cavern`, `Underworld`, `Hardmode`, `Mini-biomes`, `Micro-biomes`, and `Treasure rooms`; nested sections include `Forest`, `Snow biome`, `Desert`, `Corruption and Crimson`, `Spike Caves`, and others.
- Current DB/API already contains `space` and `spike_caves`, so the immediate user-visible failure is taxonomy shape, not only missing rows.
- Current model flattens taxonomy into `layerType` and `biomeType`. That cannot express wiki entries like `2.1 Forest`, `4.1 The Hallow`, or preserve sort order matching the wiki screenshot.
- Current `data/generated/wiki-biomes.latest.json` was not present in the clean main worktree during planning, so implementation must regenerate or use temp fixtures before DB apply.
- The main worktree currently has unrelated unresolved changes in `data-query-app/pages/entities/[type].vue`; implement in a new clean worktree/branch, not directly on that dirty main worktree.

## File Map

- Modify `scripts/data/fetch/fetch-wiki-biomes.mjs`: preserve wiki section path, parent top-level group, section level, section index, and section anchor on every target and output record.
- Modify `scripts/data/fetch/fetch-wiki-biomes.test.mjs`: add fixtures that prove wiki taxonomy fields exist for `Space`, `Forest`, `The Hallow`, and `Spike Caves`.
- Modify `scripts/data/transform/transform-wiki-biomes-to-import.mjs`: derive stable wiki taxonomy codes, Chinese group labels, parent codes, and sort order from fetch records.
- Modify `scripts/data/transform/transform-wiki-biomes-to-import.test.mjs`: prove transformed importable records retain the wiki hierarchy.
- Modify `scripts/data/import/import-biomes-to-db.mjs`: persist taxonomy fields and keep image preservation behavior unchanged.
- Modify `scripts/data/import/import-biomes-to-db.test.mjs`: prove SQL includes taxonomy columns and does not regress icon handling or soft delete behavior.
- Add `back/src/main/resources/db/migration/V45__add_biome_wiki_taxonomy_fields.sql`: add taxonomy columns and indexes to `biomes`.
- Modify `back/src/main/resources/schema.sql` and `back/src/main/resources/db/migration/V13__create_biome_and_image_tables.sql`: keep baseline schema aligned.
- Modify `back/src/main/java/com/terraria/skills/entity/Biome.java`: add taxonomy fields.
- Modify `back/src/main/java/com/terraria/skills/dto/BiomeDTO.java` and `back/src/main/java/com/terraria/skills/dto/AdminBiomeUpsertRequestDTO.java`: expose/edit taxonomy fields.
- Modify `back/src/main/java/com/terraria/skills/controller/AdminBiomeController.java`: filter by `wikiGroupCode` and return a taxonomy endpoint or grouped metadata.
- Modify `back/src/test/java/com/terraria/skills/controller/AdminBiomeControllerTest.java`: verify wiki group filtering and DTO field exposure.
- Modify `data-query-app/pages/entities/[type].vue`: replace flattened biome category chips with wiki-style grouped hierarchy and show row category path.
- Modify `data-query-app/tests/biome-admin-detail-contract.test.mjs`: assert UI contract includes wiki hierarchy labels, route query, API params, and row path display.
- Optionally modify `front-nuxt/pages/biomes/index.vue` and `front-nuxt/pages/biomes/[id].vue` only if public biome pages consume admin biome taxonomy; keep public changes out if not needed for `http://localhost:3001/entities/biomes`.

## Target Taxonomy Mapping

Use these stable codes and labels for the current wiki sections:

| Wiki number | English path | Chinese path | group code | parent code |
| --- | --- | --- | --- | --- |
| 1 | Space | 太空 | `space` | null |
| 2 | Surface and Underground | 地表和地下 | `surface_and_underground` | null |
| 2.1 | Surface and Underground > Forest | 地表和地下 > 森林 | `forest` | `surface_and_underground` |
| 2.2 | Surface and Underground > Snow biome | 地表和地下 > 雪原生物群系 | `snow_biome` | `surface_and_underground` |
| 2.3 | Surface and Underground > Desert | 地表和地下 > 沙漠 | `desert` | `surface_and_underground` |
| 2.4 | Surface and Underground > Corruption and Crimson | 地表和地下 > 腐化和猩红 | `corruption_and_crimson` | `surface_and_underground` |
| 2.5 | Surface and Underground > Jungle | 地表和地下 > 丛林 | `jungle` | `surface_and_underground` |
| 2.6 | Surface and Underground > Dungeon | 地表和地下 > 地牢 | `dungeon` | `surface_and_underground` |
| 2.7 | Surface and Underground > Ocean | 地表和地下 > 海洋 | `ocean` | `surface_and_underground` |
| 2.8 | Surface and Underground > Glowing Mushroom biome | 地表和地下 > 发光蘑菇生物群系 | `glowing_mushroom_biome` | `surface_and_underground` |
| 3 | Cavern | 洞穴 | `cavern` | null |
| 3.1 | Cavern > Ice biome | 洞穴 > 冰雪生物群系 | `ice_biome` | `cavern` |
| 3.2 | Cavern > Underground Desert | 洞穴 > 地下沙漠 | `underground_desert` | `cavern` |
| 3.3 | Cavern > Underground Jungle | 洞穴 > 地下丛林 | `underground_jungle` | `cavern` |
| 3.4 | Cavern > Underground Mushroom | 洞穴 > 地下蘑菇 | `underground_mushroom` | `cavern` |
| 4 | Underworld | 地狱 | `underworld` | null |
| 5 | Hardmode | 困难模式 | `hardmode` | null |
| 5.1 | Hardmode > The Hallow | 困难模式 > 神圣之地 | `the_hallow` | `hardmode` |
| 5.2 | Hardmode > Underground Hallow | 困难模式 > 地下神圣之地 | `underground_hallow` | `hardmode` |
| 5.3 | Hardmode > Underground Corruption | 困难模式 > 地下腐化之地 | `underground_corruption` | `hardmode` |
| 5.4 | Hardmode > Underground Crimson | 困难模式 > 地下猩红之地 | `underground_crimson` | `hardmode` |
| 5.5 | Hardmode > Corrupted, Crimson, and Hallowed Desert | 困难模式 > 腐化、猩红、和神圣沙漠 | `corrupted_crimson_hallowed_desert` | `hardmode` |
| 5.6 | Hardmode > Corrupted, Crimson, and Hallowed Ice | 困难模式 > 腐化、猩红、和神圣冰雪 | `corrupted_crimson_hallowed_ice` | `hardmode` |
| 6 | Mini-biomes | 小型群系 | `mini_biomes` | null |
| 7 | Micro-biomes | 微型群系 | `micro_biomes` | null |
| 7.7 | Micro-biomes > Spike Caves | 微型群系 > 尖刺洞穴 | `spike_caves` | `micro_biomes` |
| 8 | Treasure rooms | 宝藏房 | `treasure_rooms` | null |

Implementation should derive codes generically from section titles, with override aliases only where a stable legacy row code differs from the wiki section code. Do not hard-code only the screenshot subset; tests must cover representative entries from every top-level group.

## Task 1: Branch Hygiene And Baseline Checks

**Files:** none

- [ ] **Step 1: Create a clean implementation worktree**

Run:

```bash
git worktree add -b fix/biome-wiki-taxonomy-2026-05-22 /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-biome-wiki-taxonomy-2026-05-22 main
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-biome-wiki-taxonomy-2026-05-22
```

Expected: new worktree on `fix/biome-wiki-taxonomy-2026-05-22`, no unresolved files.

- [ ] **Step 2: Verify clean branch state**

Run:

```bash
git status --short --branch
git branch -vv
git worktree list
```

Expected: branch is clean and based on `main` commit `43d8c41` or later; no `UU` files in the implementation worktree.

- [ ] **Step 3: Verify current source hierarchy from wiki API without writing repo data**

Run:

```bash
node - <<'NODE'
const url = new URL('https://terraria.wiki.gg/api.php');
url.searchParams.set('action', 'parse');
url.searchParams.set('page', 'Biomes');
url.searchParams.set('prop', 'sections');
url.searchParams.set('formatversion', '2');
url.searchParams.set('format', 'json');
const json = await (await fetch(url, { headers: { 'user-agent': 'TerraPediaTaxonomyAudit/1.0' }})).json();
for (const s of json.parse.sections) {
  const level = Number(s.level);
  if (level === 2 || level === 3) console.log(`${s.index}\tL${s.level}\t${s.line}\t${s.anchor}`);
}
NODE
```

Expected: output includes `1 L2 Space`, `2 L2 Surface and Underground`, `37 L2 Micro-biomes`, `44 L3 Spike Caves`, and `45 L2 Treasure rooms`.

## Task 2: Add Crawler Taxonomy Fields Test First

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-biomes.test.mjs`
- Modify later: `scripts/data/fetch/fetch-wiki-biomes.mjs`

- [ ] **Step 1: Add a failing test for wiki section path and sort metadata**

Add this test to `scripts/data/fetch/fetch-wiki-biomes.test.mjs` after the existing section-record test:

```js
test('biome fetch preserves wiki taxonomy path and section order for top-level and nested sections', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-biome-taxonomy-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = writeBiomeTaxonomyMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: 'test-biome-taxonomy-refresh',
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const output = JSON.parse(fs.readFileSync(path.join(worktreeRoot, 'data', 'generated', 'wiki-biomes.latest.json'), 'utf8'));
  const space = output.records.find(record => record.requestedTitle === 'Space');
  assert.deepEqual(space?.wikiSectionPath, ['Space']);
  assert.equal(space?.wikiTopGroup, 'Space');
  assert.equal(space?.wikiSectionLevel, 2);
  assert.equal(space?.wikiSortOrder, 1);
  assert.equal(space?.sourceSectionAnchor, 'Space');

  const forest = output.records.find(record => record.requestedTitle === 'Forest');
  assert.deepEqual(forest?.wikiSectionPath, ['Surface and Underground', 'Forest']);
  assert.equal(forest?.wikiTopGroup, 'Surface and Underground');
  assert.equal(forest?.wikiParentGroup, 'Surface and Underground');
  assert.equal(forest?.wikiSectionLevel, 3);
  assert.equal(forest?.wikiSortOrder, 3);

  const hallow = output.records.find(record => record.requestedTitle === 'The Hallow');
  assert.deepEqual(hallow?.wikiSectionPath, ['Hardmode', 'The Hallow']);
  assert.equal(hallow?.wikiTopGroup, 'Hardmode');
  assert.equal(hallow?.wikiParentGroup, 'Hardmode');
  assert.equal(hallow?.wikiSortOrder, 18);

  const spikeCaves = output.records.find(record => record.requestedTitle === 'Spike Caves');
  assert.deepEqual(spikeCaves?.wikiSectionPath, ['Micro-biomes', 'Spike Caves']);
  assert.equal(spikeCaves?.wikiTopGroup, 'Micro-biomes');
  assert.equal(spikeCaves?.wikiParentGroup, 'Micro-biomes');
  assert.equal(spikeCaves?.wikiSectionLevel, 3);
  assert.equal(spikeCaves?.wikiSortOrder, 44);
});
```

Also add this fixture helper near the other mock helpers:

```js
function writeBiomeTaxonomyMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-taxonomy-api.json');
  const rendered = `
    <div class="mw-parser-output">
      <h2><span id="Space">Space</span></h2><p>Space is the top layer.</p><img src="/images/Space.png" width="260" height="120">
      <h2><span id="Surface_and_Underground">Surface and Underground</span></h2>
      <h3><span id="Forest">Forest</span></h3><p>Forest is a surface biome.</p><img src="/images/Forest_biome.png" width="260" height="120">
      <h2><span id="Hardmode">Hardmode</span></h2>
      <h3><span id="The_Hallow">The Hallow</span></h3><p>The Hallow appears in Hardmode.</p><img src="/images/Hallow.png" width="260" height="120">
      <h2><span id="Micro-biomes">Micro-biomes</span></h2>
      <h3><span id="Spike_Caves">Spike Caves</span></h3><p>Spike Caves contain traps and spikes.</p><img src="/images/Spike_Caves.png" width="260" height="120">
    </div>`;
  const responses = {
    'action=query&titles=Biomes': queryPage('Biomes', '2026-05-20T00:00:00Z'),
    'action=parse&page=Biomes&prop=text': parseText('Biomes', rendered),
    'action=parse&page=Biomes&prop=sections': parseSections('Biomes', [
      section('1', 2, 'Space', 'Space'),
      section('2', 2, 'Surface and Underground', 'Surface_and_Underground'),
      section('3', 3, 'Forest', 'Forest'),
      section('17', 2, 'Hardmode', 'Hardmode'),
      section('18', 3, 'The Hallow', 'The_Hallow'),
      section('37', 2, 'Micro-biomes', 'Micro-biomes'),
      section('44', 3, 'Spike Caves', 'Spike_Caves'),
    ]),
    'action=query&titles=Space': queryPage('Space', '2026-05-20T00:00:00Z'),
    'action=parse&page=Space&prop=text': parseText('Space', '<div class="mw-parser-output"><p>Space is the top layer.</p><img src="/images/Space.png" width="260" height="120"></div>'),
    'action=query&titles=Forest': queryPage('Forest', '2026-05-20T00:00:00Z'),
    'action=parse&page=Forest&prop=text': parseText('Forest', '<div class="mw-parser-output"><p>Forest is a surface biome.</p><img src="/images/Forest_biome.png" width="260" height="120"></div>'),
    'action=query&titles=The Hallow': queryPage('The Hallow', '2026-05-20T00:00:00Z'),
    'action=parse&page=The Hallow&prop=text': parseText('The Hallow', '<div class="mw-parser-output"><p>The Hallow appears in Hardmode.</p><img src="/images/Hallow.png" width="260" height="120"></div>'),
    'action=query&titles=Spike Caves': missingPage('Spike Caves'),
  };
  fs.writeFileSync(mockPath, JSON.stringify(responses, null, 2));
  return mockPath;
}
```

- [ ] **Step 2: Run the new test and verify it fails for missing fields**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-biomes.test.mjs
```

Expected: FAIL because `wikiSectionPath`, `wikiTopGroup`, `wikiParentGroup`, `wikiSectionLevel`, or `wikiSortOrder` are undefined.

## Task 3: Preserve Wiki Taxonomy In Fetch Output

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-biomes.mjs`

- [ ] **Step 1: Add taxonomy metadata to discovered targets**

In `discoverBiomeTargets`, add `wikiSectionPath`, `wikiTopGroup`, `wikiParentGroup`, `wikiSectionLevel`, and numeric `wikiSortOrder` to every target. For level 2 sections, path is `[line]` and parent is `null`. For level 3 sections, path is `[currentTopGroup, line]` and parent is `currentTopGroup`.

Implementation shape:

```js
function buildWikiTaxonomyMetadata({ topGroup, sectionTitle, level, index }) {
  const normalizedLevel = Number(level || 0);
  const sortOrder = Number(index || 0) || null;
  const pathParts = normalizedLevel === 2
    ? [topGroup]
    : [topGroup, sectionTitle].filter(Boolean);
  return {
    wikiSectionPath: pathParts,
    wikiTopGroup: topGroup,
    wikiParentGroup: normalizedLevel === 2 ? null : topGroup,
    wikiSectionLevel: normalizedLevel,
    wikiSortOrder: sortOrder,
  };
}
```

When pushing level 2 targets:

```js
const metadata = buildWikiTaxonomyMetadata({ topGroup: line, sectionTitle: line, level, index: section.index });
targets.push({
  topGroup: line,
  sectionGroup: null,
  pageTitle: title,
  sectionAnchor: section.anchor ?? toWikiAnchor(line),
  sectionIndex: section.index ?? null,
  sectionLevel: level,
  ...metadata,
});
```

When pushing level 3 targets:

```js
const metadata = buildWikiTaxonomyMetadata({ topGroup: currentTopGroup, sectionTitle: line, level, index: section.index });
targets.push({
  topGroup: currentTopGroup,
  sectionGroup: line,
  pageTitle: title,
  sectionAnchor: section.anchor ?? toWikiAnchor(line),
  sectionIndex: section.index ?? null,
  sectionLevel: level,
  ...metadata,
});
```

- [ ] **Step 2: Copy taxonomy metadata into all record builders**

Create helper:

```js
function pickWikiTaxonomy(entry) {
  return {
    wikiSectionPath: Array.isArray(entry.wikiSectionPath) ? entry.wikiSectionPath : [entry.topGroup, entry.sectionGroup].filter(Boolean),
    wikiTopGroup: entry.wikiTopGroup ?? entry.topGroup ?? null,
    wikiParentGroup: entry.wikiParentGroup ?? (entry.sectionGroup ? entry.topGroup : null),
    wikiSectionLevel: Number(entry.wikiSectionLevel ?? entry.sectionLevel ?? 0) || null,
    wikiSortOrder: Number(entry.wikiSortOrder ?? entry.sectionIndex ?? 0) || null,
  };
}
```

Spread this helper into normal page records, derived records, unresolved records, and `buildOverviewSectionRecord` output.

- [ ] **Step 3: Run fetch tests**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-biomes.test.mjs
```

Expected: PASS, including the new taxonomy test.

## Task 4: Transform Taxonomy Fields Test First

**Files:**
- Modify: `scripts/data/transform/transform-wiki-biomes-to-import.test.mjs`
- Modify later: `scripts/data/transform/transform-wiki-biomes-to-import.mjs`

- [ ] **Step 1: Add a failing transform test for category path fields**

Add this test:

```js
test('transform emits wiki taxonomy codes and Chinese labels matching the Biomes page hierarchy', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biome-transform-taxonomy-'));
  const generatedDir = path.join(tempDir, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(path.join(generatedDir, 'wiki-biomes.latest.json'), JSON.stringify({
    entity: 'wiki_biomes',
    generatedAt: '2026-05-20T00:00:00.000Z',
    overview: { title: 'Biomes' },
    derivedRecords: [],
    unresolved: [],
    records: [
      {
        topGroup: 'Space',
        requestedTitle: 'Space',
        title: 'Space',
        wikiSectionPath: ['Space'],
        wikiTopGroup: 'Space',
        wikiParentGroup: null,
        wikiSectionLevel: 2,
        wikiSortOrder: 1,
        sourceSectionAnchor: 'Space',
        revisionTimestamp: '2026-05-20T00:00:00Z',
        intro: 'Space is the top layer.',
        aliases: ['Space'],
        iconUrl: 'https://terraria.wiki.gg/images/Space.png',
      },
      {
        topGroup: 'Surface and Underground',
        sectionGroup: 'Forest',
        requestedTitle: 'Forest',
        title: 'Forest',
        wikiSectionPath: ['Surface and Underground', 'Forest'],
        wikiTopGroup: 'Surface and Underground',
        wikiParentGroup: 'Surface and Underground',
        wikiSectionLevel: 3,
        wikiSortOrder: 3,
        sourceSectionAnchor: 'Forest',
        revisionTimestamp: '2026-05-20T00:00:00Z',
        intro: 'Forest is a surface biome.',
        aliases: ['Forest'],
        iconUrl: 'https://terraria.wiki.gg/images/Forest_biome.png',
      },
      {
        topGroup: 'Micro-biomes',
        sectionGroup: 'Spike Caves',
        requestedTitle: 'Spike Caves',
        title: 'Spike Caves',
        sourceType: 'overview_section',
        sourcePageTitle: 'Biomes',
        sourceSectionAnchor: 'Spike_Caves',
        wikiSectionPath: ['Micro-biomes', 'Spike Caves'],
        wikiTopGroup: 'Micro-biomes',
        wikiParentGroup: 'Micro-biomes',
        wikiSectionLevel: 3,
        wikiSortOrder: 44,
        revisionTimestamp: '2026-05-20T00:00:00Z',
        intro: 'Spike Caves contain traps and spikes.',
        aliases: ['Spike Caves'],
        iconUrl: null,
      }
    ]
  }), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: tempDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(path.join(generatedDir, 'wiki-biomes.importable.latest.json'), 'utf8'));

  const space = output.biomes.find(row => row.code === 'space');
  assert.equal(space.wikiGroupCode, 'space');
  assert.equal(space.wikiGroupNameEn, 'Space');
  assert.equal(space.wikiGroupNameZh, '太空');
  assert.equal(space.wikiParentGroupCode, null);
  assert.equal(space.wikiSectionLevel, 2);
  assert.equal(space.wikiSortOrder, 1);
  assert.equal(space.wikiCategoryPathZh, '太空');

  const forest = output.biomes.find(row => row.code === 'forest');
  assert.equal(forest.wikiGroupCode, 'forest');
  assert.equal(forest.wikiGroupNameEn, 'Forest');
  assert.equal(forest.wikiGroupNameZh, '森林');
  assert.equal(forest.wikiParentGroupCode, 'surface_and_underground');
  assert.equal(forest.wikiParentGroupNameZh, '地表和地下');
  assert.equal(forest.wikiSectionLevel, 3);
  assert.equal(forest.wikiSortOrder, 3);
  assert.equal(forest.wikiCategoryPathZh, '地表和地下 > 森林');

  const spikeCaves = output.biomes.find(row => row.code === 'spike_caves');
  assert.equal(spikeCaves.wikiGroupCode, 'spike_caves');
  assert.equal(spikeCaves.wikiGroupNameZh, '尖刺洞穴');
  assert.equal(spikeCaves.wikiParentGroupCode, 'micro_biomes');
  assert.equal(spikeCaves.wikiParentGroupNameZh, '微型群系');
  assert.equal(spikeCaves.wikiCategoryPathZh, '微型群系 > 尖刺洞穴');
});
```

- [ ] **Step 2: Run transform test and verify it fails for missing fields**

Run:

```bash
node --test scripts/data/transform/transform-wiki-biomes-to-import.test.mjs
```

Expected: FAIL because `wikiGroupCode` and related fields do not exist yet.

## Task 5: Derive Taxonomy In Transform Output

**Files:**
- Modify: `scripts/data/transform/transform-wiki-biomes-to-import.mjs`

- [ ] **Step 1: Add wiki group Chinese label map**

Add near `zhNameMap`:

```js
const wikiGroupZhMap = new Map([
  ['Space', '太空'],
  ['Surface and Underground', '地表和地下'],
  ['Forest', '森林'],
  ['Snow biome', '雪原生物群系'],
  ['Desert', '沙漠'],
  ['Corruption and Crimson', '腐化和猩红'],
  ['Jungle', '丛林'],
  ['Dungeon', '地牢'],
  ['Ocean', '海洋'],
  ['Glowing Mushroom biome', '发光蘑菇生物群系'],
  ['Cavern', '洞穴'],
  ['Ice biome', '冰雪生物群系'],
  ['Underground Desert', '地下沙漠'],
  ['Underground Jungle', '地下丛林'],
  ['Underground Mushroom', '地下蘑菇'],
  ['Underworld', '地狱'],
  ['Hardmode', '困难模式'],
  ['The Hallow', '神圣之地'],
  ['Underground Hallow', '地下神圣之地'],
  ['Underground Corruption', '地下腐化之地'],
  ['Underground Crimson', '地下猩红之地'],
  ['Corrupted, Crimson, and Hallowed Desert', '腐化、猩红、和神圣沙漠'],
  ['Corrupted, Crimson, and Hallowed Ice', '腐化、猩红、和神圣冰雪'],
  ['Mini-biomes', '小型群系'],
  ['Micro-biomes', '微型群系'],
  ['Treasure rooms', '宝藏房'],
]);
```

- [ ] **Step 2: Add stable wiki group code helpers**

Add:

```js
const wikiGroupCodeOverrides = new Map([
  ['Surface and Underground', 'surface_and_underground'],
  ['Corruption and Crimson', 'corruption_and_crimson'],
  ['Glowing Mushroom biome', 'glowing_mushroom_biome'],
  ['Ice biome', 'ice_biome'],
  ['Underground Mushroom', 'underground_mushroom'],
  ['The Hallow', 'the_hallow'],
  ['Corrupted, Crimson, and Hallowed Desert', 'corrupted_crimson_hallowed_desert'],
  ['Corrupted, Crimson, and Hallowed Ice', 'corrupted_crimson_hallowed_ice'],
  ['Mini-biomes', 'mini_biomes'],
  ['Micro-biomes', 'micro_biomes'],
  ['Treasure rooms', 'treasure_rooms'],
]);

function deriveWikiGroupCode(title) {
  const text = toNullableString(title);
  if (!text) return null;
  if (wikiGroupCodeOverrides.has(text)) return wikiGroupCodeOverrides.get(text);
  return text
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function deriveWikiTaxonomy(record) {
  const pathParts = Array.isArray(record.wikiSectionPath) && record.wikiSectionPath.length
    ? record.wikiSectionPath.map(value => String(value).trim()).filter(Boolean)
    : [record.topGroup, record.sectionGroup || record.requestedTitle || record.title].filter(Boolean);
  const groupNameEn = pathParts[pathParts.length - 1] ?? null;
  const parentNameEn = pathParts.length > 1 ? pathParts[pathParts.length - 2] : null;
  const groupNameZh = wikiGroupZhMap.get(groupNameEn) || deriveZhName({ ...record, title: groupNameEn, requestedTitle: groupNameEn }) || null;
  const parentNameZh = parentNameEn ? (wikiGroupZhMap.get(parentNameEn) || null) : null;
  const pathZh = pathParts.map(part => wikiGroupZhMap.get(part) || deriveZhName({ ...record, title: part, requestedTitle: part }) || part).join(' > ');
  return {
    wikiGroupCode: deriveWikiGroupCode(groupNameEn),
    wikiGroupNameEn: groupNameEn,
    wikiGroupNameZh: groupNameZh,
    wikiParentGroupCode: deriveWikiGroupCode(parentNameEn),
    wikiParentGroupNameEn: parentNameEn,
    wikiParentGroupNameZh: parentNameZh,
    wikiSectionLevel: Number(record.wikiSectionLevel ?? record.sectionLevel ?? pathParts.length + 1) || null,
    wikiSortOrder: Number(record.wikiSortOrder ?? record.sectionIndex ?? 0) || null,
    wikiSectionAnchor: toNullableString(record.sourceSectionAnchor),
    wikiCategoryPathEn: pathParts.join(' > '),
    wikiCategoryPathZh: pathZh,
  };
}
```

- [ ] **Step 3: Spread taxonomy fields into each biome object**

Inside `filteredRecords.map`, compute:

```js
const wikiTaxonomy = deriveWikiTaxonomy(record);
```

Then add to returned object:

```js
...wikiTaxonomy,
```

Keep existing `layerType` and `biomeType` output unchanged for compatibility.

- [ ] **Step 4: Sort importable biomes by wiki order**

After mapping, sort:

```js
biomes.sort((left, right) =>
  Number(left.wikiSortOrder ?? 9999) - Number(right.wikiSortOrder ?? 9999)
  || String(left.code).localeCompare(String(right.code))
);
```

- [ ] **Step 5: Run transform tests**

Run:

```bash
node --test scripts/data/transform/transform-wiki-biomes-to-import.test.mjs
```

Expected: PASS.

## Task 6: Add DB Schema Fields

**Files:**
- Add: `back/src/main/resources/db/migration/V45__add_biome_wiki_taxonomy_fields.sql`
- Modify: `back/src/main/resources/schema.sql`
- Modify: `back/src/main/resources/db/migration/V13__create_biome_and_image_tables.sql`

- [ ] **Step 1: Create Flyway migration**

Create `back/src/main/resources/db/migration/V45__add_biome_wiki_taxonomy_fields.sql`:

```sql
SET @schema_name = DATABASE();

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_group_code'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_group_code` VARCHAR(100) DEFAULT NULL AFTER `biome_type`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_group_name_en'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_group_name_en` VARCHAR(255) DEFAULT NULL AFTER `wiki_group_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_group_name_zh'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_group_name_zh` VARCHAR(255) DEFAULT NULL AFTER `wiki_group_name_en`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_parent_group_code'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_parent_group_code` VARCHAR(100) DEFAULT NULL AFTER `wiki_group_name_zh`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_parent_group_name_en'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_parent_group_name_en` VARCHAR(255) DEFAULT NULL AFTER `wiki_parent_group_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_parent_group_name_zh'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_parent_group_name_zh` VARCHAR(255) DEFAULT NULL AFTER `wiki_parent_group_name_en`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_section_level'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_section_level` INT DEFAULT NULL AFTER `wiki_parent_group_name_zh`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_sort_order'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_sort_order` INT DEFAULT NULL AFTER `wiki_section_level`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_section_anchor'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_section_anchor` VARCHAR(255) DEFAULT NULL AFTER `wiki_sort_order`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND INDEX_NAME = 'idx_biomes_wiki_group'
  ),
  'ALTER TABLE `biomes` ADD INDEX `idx_biomes_wiki_group` (`wiki_group_code`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND INDEX_NAME = 'idx_biomes_wiki_parent_group'
  ),
  'ALTER TABLE `biomes` ADD INDEX `idx_biomes_wiki_parent_group` (`wiki_parent_group_code`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND INDEX_NAME = 'idx_biomes_wiki_order'
  ),
  'ALTER TABLE `biomes` ADD INDEX `idx_biomes_wiki_order` (`wiki_sort_order`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

- [ ] **Step 2: Update baseline schema definitions**

In both `schema.sql` and `V13__create_biome_and_image_tables.sql`, add the same columns after `biome_type` in the `biomes` table and add these indexes:

```sql
  INDEX `idx_biomes_wiki_group` (`wiki_group_code`),
  INDEX `idx_biomes_wiki_parent_group` (`wiki_parent_group_code`),
  INDEX `idx_biomes_wiki_order` (`wiki_sort_order`)
```

- [ ] **Step 3: Run backend compile smoke**

Run:

```bash
cd back && mvn -DskipTests compile
```

Expected: PASS.

## Task 7: Persist Taxonomy In Import Script Test First

**Files:**
- Modify: `scripts/data/import/import-biomes-to-db.test.mjs`
- Modify later: `scripts/data/import/import-biomes-to-db.mjs`

- [ ] **Step 1: Add test asserting taxonomy columns are written**

Add a test near existing SQL contract tests:

```js
test('importBiomes persists wiki taxonomy columns while preserving managed image fallback behavior', async () => {
  const calls = [];
  const conn = {
    async query(sql) {
      if (/SELECT code, icon_url FROM biomes WHERE deleted = 0/i.test(sql)) {
        return [[{ code: 'spike_caves', icon_url: null }]];
      }
      return [[]];
    },
    async execute(sql, params) {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  };
  const stats = makeStatsSection(1);
  const result = await importBiomes(conn, [{
    code: 'spike_caves',
    nameEn: 'Spike Caves',
    nameZh: '尖刺洞穴',
    layerType: 'micro_biome',
    biomeType: 'micro_biome',
    wikiGroupCode: 'spike_caves',
    wikiGroupNameEn: 'Spike Caves',
    wikiGroupNameZh: '尖刺洞穴',
    wikiParentGroupCode: 'micro_biomes',
    wikiParentGroupNameEn: 'Micro-biomes',
    wikiParentGroupNameZh: '微型群系',
    wikiSectionLevel: 3,
    wikiSortOrder: 44,
    wikiSectionAnchor: 'Spike_Caves',
    sourcePage: 'Biomes#Spike_Caves',
  }], stats);

  assert.equal(result.get('spike_caves') > 0, true);
  const insert = calls.find(call => /INSERT INTO biomes/i.test(call.sql));
  assert.match(insert.sql, /wiki_group_code/);
  assert.match(insert.sql, /wiki_parent_group_code/);
  assert.match(insert.sql, /wiki_sort_order/);
  assert.ok(insert.params.includes('spike_caves'));
  assert.ok(insert.params.includes('micro_biomes'));
  assert.ok(insert.params.includes(44));
});
```

If `makeStatsSection` or `importBiomes` is not exported, export only the minimum helper needed for the test.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
node --test scripts/data/import/import-biomes-to-db.test.mjs
```

Expected: FAIL because SQL does not include taxonomy columns.

## Task 8: Import Taxonomy Fields

**Files:**
- Modify: `scripts/data/import/import-biomes-to-db.mjs`

- [ ] **Step 1: Extend `INSERT INTO biomes` columns and update clause**

Change the SQL column list to include taxonomy columns after `biome_type`:

```sql
wiki_group_code, wiki_group_name_en, wiki_group_name_zh,
wiki_parent_group_code, wiki_parent_group_name_en, wiki_parent_group_name_zh,
wiki_section_level, wiki_sort_order, wiki_section_anchor,
```

Add matching placeholders and `ON DUPLICATE KEY UPDATE` assignments:

```sql
wiki_group_code = VALUES(wiki_group_code),
wiki_group_name_en = VALUES(wiki_group_name_en),
wiki_group_name_zh = VALUES(wiki_group_name_zh),
wiki_parent_group_code = VALUES(wiki_parent_group_code),
wiki_parent_group_name_en = VALUES(wiki_parent_group_name_en),
wiki_parent_group_name_zh = VALUES(wiki_parent_group_name_zh),
wiki_section_level = VALUES(wiki_section_level),
wiki_sort_order = VALUES(wiki_sort_order),
wiki_section_anchor = VALUES(wiki_section_anchor),
```

- [ ] **Step 2: Add params from raw record**

Insert these values in the params array after `toNullableString(raw?.biomeType)`:

```js
toNullableString(raw?.wikiGroupCode),
toNullableString(raw?.wikiGroupNameEn),
toNullableString(raw?.wikiGroupNameZh),
toNullableString(raw?.wikiParentGroupCode),
toNullableString(raw?.wikiParentGroupNameEn),
toNullableString(raw?.wikiParentGroupNameZh),
toNullableNumber(raw?.wikiSectionLevel),
toNullableNumber(raw?.wikiSortOrder),
toNullableString(raw?.wikiSectionAnchor),
```

Add helper if missing:

```js
function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
```

- [ ] **Step 3: Run import tests**

Run:

```bash
node --test scripts/data/import/import-biomes-to-db.test.mjs
```

Expected: PASS.

## Task 9: Expose Taxonomy Fields In Backend

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/entity/Biome.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/BiomeDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/AdminBiomeUpsertRequestDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminBiomeController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminBiomeControllerTest.java`

- [ ] **Step 1: Add failing backend tests**

In `AdminBiomeControllerTest`, add:

```java
@Test
void listShouldAcceptWikiGroupCodeFilterAndSortByWikiOrder() throws Exception {
    AdminBiomeController controller = new AdminBiomeController(
        biomeMapper,
        biomeRelationMapper,
        biomeResourceMapper,
        itemMapper,
        managedItemImageResolver
    );
    when(biomeMapper.selectPage(any(), any())).thenReturn(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<Biome>(1, 20));

    Method getBiomes = AdminBiomeController.class.getMethod(
        "getBiomes",
        Integer.class,
        Integer.class,
        Integer.class,
        String.class,
        String.class,
        String.class
    );
    getBiomes.invoke(controller, 1, 20, null, null, null, "micro_biomes");

    verify(biomeMapper).selectPage(any(), any());
}

@Test
void detailShouldExposeWikiTaxonomyFields() {
    AdminBiomeController controller = new AdminBiomeController(
        biomeMapper,
        biomeRelationMapper,
        biomeResourceMapper,
        itemMapper,
        managedItemImageResolver
    );

    Biome biome = new Biome();
    biome.setId(241L);
    biome.setCode("spike_caves");
    biome.setNameEn("Spike Caves");
    biome.setNameZh("尖刺洞穴");
    biome.setWikiGroupCode("spike_caves");
    biome.setWikiGroupNameEn("Spike Caves");
    biome.setWikiGroupNameZh("尖刺洞穴");
    biome.setWikiParentGroupCode("micro_biomes");
    biome.setWikiParentGroupNameEn("Micro-biomes");
    biome.setWikiParentGroupNameZh("微型群系");
    biome.setWikiSectionLevel(3);
    biome.setWikiSortOrder(44);
    biome.setWikiSectionAnchor("Spike_Caves");

    when(biomeMapper.selectById(241L)).thenReturn(biome);
    when(biomeRelationMapper.selectList(any())).thenReturn(List.of());
    when(biomeResourceMapper.selectList(any())).thenReturn(List.of());

    ResponseEntity<ApiResponse<BiomeDTO>> response = controller.getBiomeById(241L);

    assertNotNull(response.getBody());
    BiomeDTO detail = response.getBody().getData();
    assertEquals("spike_caves", detail.getWikiGroupCode());
    assertEquals("尖刺洞穴", detail.getWikiGroupNameZh());
    assertEquals("micro_biomes", detail.getWikiParentGroupCode());
    assertEquals("微型群系", detail.getWikiParentGroupNameZh());
    assertEquals(3, detail.getWikiSectionLevel());
    assertEquals(44, detail.getWikiSortOrder());
    assertEquals("Spike_Caves", detail.getWikiSectionAnchor());
}
```

- [ ] **Step 2: Run backend test and verify failure**

Run:

```bash
cd back && mvn -Dtest=AdminBiomeControllerTest test
```

Expected: FAIL because method signature/fields are missing.

- [ ] **Step 3: Add fields to Java model and DTOs**

Add to `Biome.java` with `@TableField` mappings:

```java
@TableField("wiki_group_code")
private String wikiGroupCode;
@TableField("wiki_group_name_en")
private String wikiGroupNameEn;
@TableField("wiki_group_name_zh")
private String wikiGroupNameZh;
@TableField("wiki_parent_group_code")
private String wikiParentGroupCode;
@TableField("wiki_parent_group_name_en")
private String wikiParentGroupNameEn;
@TableField("wiki_parent_group_name_zh")
private String wikiParentGroupNameZh;
@TableField("wiki_section_level")
private Integer wikiSectionLevel;
@TableField("wiki_sort_order")
private Integer wikiSortOrder;
@TableField("wiki_section_anchor")
private String wikiSectionAnchor;
```

Add the same camelCase fields to `BiomeDTO` and `AdminBiomeUpsertRequestDTO`.

- [ ] **Step 4: Extend list endpoint filter and sorting**

Change `AdminBiomeController.getBiomes` signature to accept:

```java
@RequestParam(required = false) String wikiGroupCode
```

Filtering behavior:

```java
String normalizedWikiGroupCode = normalizeText(wikiGroupCode);
if (normalizedWikiGroupCode != null) {
    wrapper.and(w -> w.eq(Biome::getWikiGroupCode, normalizedWikiGroupCode)
        .or().eq(Biome::getWikiParentGroupCode, normalizedWikiGroupCode));
}
```

Sorting behavior:

```java
.orderByAsc(Biome::getWikiSortOrder)
.orderByAsc(Biome::getId);
```

Keep existing `group` filter for backward compatibility.

- [ ] **Step 5: Copy fields in create/update/detail**

In `applyBiomeFields`, set taxonomy fields from request when present:

```java
biome.setWikiGroupCode(trimToNull(request.getWikiGroupCode()));
biome.setWikiGroupNameEn(trimToNull(request.getWikiGroupNameEn()));
biome.setWikiGroupNameZh(trimToNull(request.getWikiGroupNameZh()));
biome.setWikiParentGroupCode(trimToNull(request.getWikiParentGroupCode()));
biome.setWikiParentGroupNameEn(trimToNull(request.getWikiParentGroupNameEn()));
biome.setWikiParentGroupNameZh(trimToNull(request.getWikiParentGroupNameZh()));
biome.setWikiSectionLevel(request.getWikiSectionLevel());
biome.setWikiSortOrder(request.getWikiSortOrder());
biome.setWikiSectionAnchor(trimToNull(request.getWikiSectionAnchor()));
```

`BeanUtils.copyProperties` in detail should copy fields automatically after DTO fields exist.

- [ ] **Step 6: Run backend tests**

Run:

```bash
cd back && mvn -Dtest=AdminBiomeControllerTest test
```

Expected: PASS.

## Task 10: Update Admin UI Contract Test First

**Files:**
- Modify: `data-query-app/tests/biome-admin-detail-contract.test.mjs`
- Modify later: `data-query-app/pages/entities/[type].vue`

- [ ] **Step 1: Add failing UI contract test**

Add:

```js
test('biome admin uses wiki taxonomy hierarchy instead of flattened layer chips', () => {
  assert.match(entitiesPage, /biomeWikiGroupOptions/);
  assert.match(entitiesPage, /selectedBiomeWikiGroup/);
  assert.match(entitiesPage, /params\.wikiGroupCode = selectedBiomeWikiGroup\.value/);
  assert.match(entitiesPage, /nextQuery\.biomeWikiGroup = selectedBiomeWikiGroup\.value/);

  for (const label of ['太空', '地表和地下', '森林', '洞穴', '困难模式', '微型群系', '尖刺洞穴', '宝藏房']) {
    assert.match(entitiesPage, new RegExp(label));
  }

  assert.match(entitiesPage, /getBiomeWikiCategoryPath\(row\)/);
  assert.match(entitiesPage, /wikiCategoryPathZh/);
});
```

- [ ] **Step 2: Run UI contract test and verify failure**

Run:

```bash
node --test data-query-app/tests/biome-admin-detail-contract.test.mjs
```

Expected: FAIL because wiki taxonomy UI symbols do not exist.

## Task 11: Render Wiki-Style Taxonomy In Admin UI

**Files:**
- Modify: `data-query-app/pages/entities/[type].vue`

- [ ] **Step 1: Add wiki taxonomy option data**

Replace or supplement current `biomeGroupOptions` with `biomeWikiGroupOptions` that matches wiki order. Keep old group options only as internal compatibility if needed.

Use this shape:

```ts
type BiomeWikiGroupFilter =
  | 'all'
  | 'space'
  | 'surface_and_underground'
  | 'forest'
  | 'snow_biome'
  | 'desert'
  | 'corruption_and_crimson'
  | 'jungle'
  | 'dungeon'
  | 'ocean'
  | 'glowing_mushroom_biome'
  | 'cavern'
  | 'ice_biome'
  | 'underground_desert'
  | 'underground_jungle'
  | 'underground_mushroom'
  | 'underworld'
  | 'hardmode'
  | 'the_hallow'
  | 'underground_hallow'
  | 'underground_corruption'
  | 'underground_crimson'
  | 'corrupted_crimson_hallowed_desert'
  | 'corrupted_crimson_hallowed_ice'
  | 'mini_biomes'
  | 'micro_biomes'
  | 'spike_caves'
  | 'treasure_rooms';

const selectedBiomeWikiGroup = ref<BiomeWikiGroupFilter>('all');

const biomeWikiGroupOptions = [
  { value: 'all', label: '全部群系', level: 0, description: '显示 wiki Biomes 页面全部分类。' },
  { value: 'space', label: '太空', level: 1, description: 'Wiki 1. Space' },
  { value: 'surface_and_underground', label: '地表和地下', level: 1, description: 'Wiki 2. Surface and Underground' },
  { value: 'forest', label: '森林', level: 2, parent: 'surface_and_underground', description: 'Wiki 2.1 Forest' },
  { value: 'snow_biome', label: '雪原生物群系', level: 2, parent: 'surface_and_underground', description: 'Wiki 2.2 Snow biome' },
  { value: 'desert', label: '沙漠', level: 2, parent: 'surface_and_underground', description: 'Wiki 2.3 Desert' },
  { value: 'corruption_and_crimson', label: '腐化和猩红', level: 2, parent: 'surface_and_underground', description: 'Wiki 2.4 Corruption and Crimson' },
  { value: 'jungle', label: '丛林', level: 2, parent: 'surface_and_underground', description: 'Wiki 2.5 Jungle' },
  { value: 'dungeon', label: '地牢', level: 2, parent: 'surface_and_underground', description: 'Wiki 2.6 Dungeon' },
  { value: 'ocean', label: '海洋', level: 2, parent: 'surface_and_underground', description: 'Wiki 2.7 Ocean' },
  { value: 'glowing_mushroom_biome', label: '发光蘑菇生物群系', level: 2, parent: 'surface_and_underground', description: 'Wiki 2.8 Glowing Mushroom biome' },
  { value: 'cavern', label: '洞穴', level: 1, description: 'Wiki 3. Cavern' },
  { value: 'ice_biome', label: '冰雪生物群系', level: 2, parent: 'cavern', description: 'Wiki 3.1 Ice biome' },
  { value: 'underground_desert', label: '地下沙漠', level: 2, parent: 'cavern', description: 'Wiki 3.2 Underground Desert' },
  { value: 'underground_jungle', label: '地下丛林', level: 2, parent: 'cavern', description: 'Wiki 3.3 Underground Jungle' },
  { value: 'underground_mushroom', label: '地下蘑菇', level: 2, parent: 'cavern', description: 'Wiki 3.4 Underground Mushroom' },
  { value: 'underworld', label: '地狱', level: 1, description: 'Wiki 4. Underworld' },
  { value: 'hardmode', label: '困难模式', level: 1, description: 'Wiki 5. Hardmode' },
  { value: 'the_hallow', label: '神圣之地', level: 2, parent: 'hardmode', description: 'Wiki 5.1 The Hallow' },
  { value: 'underground_hallow', label: '地下神圣之地', level: 2, parent: 'hardmode', description: 'Wiki 5.2 Underground Hallow' },
  { value: 'underground_corruption', label: '地下腐化之地', level: 2, parent: 'hardmode', description: 'Wiki 5.3 Underground Corruption' },
  { value: 'underground_crimson', label: '地下猩红之地', level: 2, parent: 'hardmode', description: 'Wiki 5.4 Underground Crimson' },
  { value: 'corrupted_crimson_hallowed_desert', label: '腐化、猩红、和神圣沙漠', level: 2, parent: 'hardmode', description: 'Wiki 5.5 Corrupted, Crimson, and Hallowed Desert' },
  { value: 'corrupted_crimson_hallowed_ice', label: '腐化、猩红、和神圣冰雪', level: 2, parent: 'hardmode', description: 'Wiki 5.6 Corrupted, Crimson, and Hallowed Ice' },
  { value: 'mini_biomes', label: '小型群系', level: 1, description: 'Wiki 6. Mini-biomes' },
  { value: 'micro_biomes', label: '微型群系', level: 1, description: 'Wiki 7. Micro-biomes' },
  { value: 'spike_caves', label: '尖刺洞穴', level: 2, parent: 'micro_biomes', description: 'Wiki 7.7 Spike Caves' },
  { value: 'treasure_rooms', label: '宝藏房', level: 1, description: 'Wiki 8. Treasure rooms' },
] as const;
```

Include all omitted child rows from the target mapping table, not only the abbreviated list above.

- [ ] **Step 2: Replace biome filter template**

Render options as a compact hierarchy. Example template structure:

```vue
<div v-if="entityType === 'biomes'" class="biome-taxonomy-filter" aria-label="Wiki 群系目录筛选">
  <button
    v-for="option in biomeWikiGroupOptions"
    :key="option.value"
    type="button"
    class="filter-chip biome-taxonomy-filter__chip"
    :class="[`biome-taxonomy-filter__chip--level-${option.level}`, { 'filter-chip--active': selectedBiomeWikiGroup === option.value }]"
    :aria-pressed="selectedBiomeWikiGroup === option.value"
    @click="handleBiomeWikiGroupChange(option.value)"
  >
    <span>{{ option.label }}</span>
    <small>{{ option.description }}</small>
  </button>
</div>
```

- [ ] **Step 3: Send new query param to backend**

In `fetchRows`:

```ts
if (entityType.value === 'biomes' && selectedBiomeWikiGroup.value !== 'all') {
  params.wikiGroupCode = selectedBiomeWikiGroup.value;
}
```

Keep the old `group` only if a route query from older links uses `biomeGroup`.

- [ ] **Step 4: Persist route query**

Use `biomeWikiGroup` in route query:

```ts
if (entityType.value === 'biomes' && selectedBiomeWikiGroup.value !== 'all') {
  nextQuery.biomeWikiGroup = selectedBiomeWikiGroup.value;
}
```

On route init:

```ts
const rawBiomeWikiGroup = typeof route.query.biomeWikiGroup === 'string' ? route.query.biomeWikiGroup.trim().toLowerCase() : '';
selectedBiomeWikiGroup.value = biomeWikiGroupOptions.some(option => option.value === rawBiomeWikiGroup)
  ? rawBiomeWikiGroup as BiomeWikiGroupFilter
  : 'all';
```

- [ ] **Step 5: Add row category path display**

Add helper:

```ts
function getBiomeWikiCategoryPath(row: Record<string, any>) {
  const zhPath = [row.wikiParentGroupNameZh, row.wikiGroupNameZh].filter(Boolean).join(' > ');
  const enPath = [row.wikiParentGroupNameEn, row.wikiGroupNameEn].filter(Boolean).join(' > ');
  return zhPath || row.wikiCategoryPathZh || enPath || getBiomeLayerLabel(row.layerType);
}
```

Update biome columns to include:

```ts
{ key: 'wikiCategoryPathZh', label: 'Wiki 分类' }
```

In `formatCell`:

```ts
if (entityType.value === 'biomes' && key === 'wikiCategoryPathZh') return getBiomeWikiCategoryPath(row);
```

- [ ] **Step 6: Run UI contract and typecheck**

Run:

```bash
node --test data-query-app/tests/biome-admin-detail-contract.test.mjs
cd data-query-app && pnpm run check
```

Expected: PASS.

## Task 12: Data Refresh Dry Run And Apply

**Files:** generated data and local DB only; do not commit generated outputs unless explicitly requested.

- [ ] **Step 1: Verify no active crawler writer**

Run:

```bash
ps -eo pid,ppid,cmd | rg 'fetch-wiki-biomes|run-wiki-sync|run-backend-data-refresh|wiki-crawler|crawl' | rg -v 'rg ' || true
```

Expected: no active writer for biome fetch/import outputs.

- [ ] **Step 2: Run bounded biome fetch with monitor-visible progress**

Run:

```bash
TERRAPEDIA_CRAWLER_ACTION_ID=biomes-refresh \
node scripts/data/fetch/fetch-wiki-biomes.mjs \
  --progress-path=data/generated/wiki-sync-progress.latest.json
```

Expected: command exits 0, `data/generated/wiki-biomes.latest.json` contains records with taxonomy fields, progress status is `completed`.

- [ ] **Step 3: Transform to importable**

Run:

```bash
node scripts/data/transform/transform-wiki-biomes-to-import.mjs
```

Expected: `data/generated/wiki-biomes.importable.latest.json` contains taxonomy fields for `space`, `forest`, `the_hallow` or `hallow`, `spike_caves`, and `underground_cabin`.

- [ ] **Step 4: Backup current local DB biome table**

Run:

```bash
mysql -h127.0.0.1 -P13306 -uroot -proot terria_v1_local -e "CREATE TABLE IF NOT EXISTS biomes_wiki_taxonomy_backup_20260522 AS SELECT * FROM biomes; SELECT COUNT(*) AS backup_count FROM biomes_wiki_taxonomy_backup_20260522;"
```

Expected: backup count equals current active biome rows plus any deleted rows present in `biomes`.

- [ ] **Step 5: Apply import to local DB**

Run the existing biome import command used by the previous biome task. If the script supports default paths, run:

```bash
node scripts/data/import/import-biomes-to-db.mjs --wiki-biomes-file=data/generated/wiki-biomes.importable.latest.json
```

If required by script options, include the existing standardized biome and relation paths from `scripts/data/import/import-biomes-to-db.mjs` defaults. Expected: import completes without writing unrelated item/category tables.

- [ ] **Step 6: Verify local DB taxonomy rows**

Run:

```bash
mysql -h127.0.0.1 -P13306 -uroot -proot terria_v1_local -e "SELECT code,name_zh,wiki_group_code,wiki_group_name_zh,wiki_parent_group_code,wiki_parent_group_name_zh,wiki_sort_order FROM biomes WHERE code IN ('space','forest','hallow','spike_caves','underground_cabin') ORDER BY wiki_sort_order;"
```

Expected:

- `space`: `wiki_group_code=space`, parent null, sort 1.
- `forest`: `wiki_group_code=forest`, parent `surface_and_underground`, sort 3.
- `hallow`: parent `hardmode`, sort 18.
- `spike_caves`: parent `micro_biomes`, sort 44.
- `underground_cabin`: parent `treasure_rooms`, sort 46.

## Task 13: API And Runtime Verification

**Files:** none unless failures require repairs.

- [ ] **Step 1: Restart main local stack from the implementation branch**

Run:

```bash
bash ./scripts/dev/stop-local-stack.sh --force-ports
bash ./scripts/dev/start-local-stack.sh
```

Expected: manifest points to the implementation worktree branch, backend 18088 and admin 3001 are running from that path.

- [ ] **Step 2: Verify backend API wiki group filters**

Run:

```bash
node - <<'NODE'
const login = await fetch('http://localhost:18088/api/auth/login', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({username:'admin',password:'admin123456'})});
const token = (await login.json()).data.token;
for (const wikiGroupCode of ['space','surface_and_underground','micro_biomes','spike_caves','treasure_rooms']) {
  const url = new URL('http://localhost:18088/api/admin/biomes');
  url.searchParams.set('wikiGroupCode', wikiGroupCode);
  url.searchParams.set('page','1');
  url.searchParams.set('limit','100');
  const payload = await (await fetch(url, {headers:{Authorization:`Bearer ${token}`}})).json();
  console.log(wikiGroupCode, payload.pagination?.total, (payload.data ?? []).map(row => `${row.code}:${row.wikiParentGroupCode ?? '-'}>${row.wikiGroupCode}`).join(','));
}
NODE
```

Expected:

- `space` returns only Space row.
- `surface_and_underground` returns its child rows such as Forest/Snow/Desert, plus top-level row only if stored as an actual biome row.
- `micro_biomes` returns the 7 micro-biome rows including `spike_caves`.
- `spike_caves` returns only `spike_caves`.
- `treasure_rooms` returns the 10 treasure room rows.

- [ ] **Step 3: Verify admin DOM with Chromium CDP**

Run the existing browser-level check pattern used in prior verification, but navigate to:

```text
http://localhost:3001/entities/biomes?biomeWikiGroup=micro_biomes
```

Evaluate:

```js
(() => ({
  headers: Array.from(document.querySelectorAll('th')).map(el => el.innerText.trim()).filter(Boolean),
  activeChip: document.querySelector('.filter-chip--active')?.innerText.trim() || '',
  visibleSummary: Array.from(document.querySelectorAll('.table-card__summary span')).map(el => el.innerText.trim()),
  rows: Array.from(document.querySelectorAll('tbody tr')).map(row => row.innerText.trim()).slice(0, 10),
  contains: {
    wikiCategory: document.body.innerText.includes('Wiki 分类'),
    micro: document.body.innerText.includes('微型群系'),
    spike: document.body.innerText.includes('尖刺洞穴'),
    space: document.body.innerText.includes('太空'),
    surface: document.body.innerText.includes('地表和地下')
  }
}))()
```

Expected: `headers` includes `Wiki 分类`, active chip contains `微型群系`, rows include `尖刺洞穴`, and the page text contains `太空` and `地表和地下` in the taxonomy filter.

## Task 14: Final Validation And Commit

**Files:** all changed files only.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-biomes.test.mjs scripts/data/transform/transform-wiki-biomes-to-import.test.mjs scripts/data/import/import-biomes-to-db.test.mjs data-query-app/tests/biome-admin-detail-contract.test.mjs
cd back && mvn -Dtest=AdminBiomeControllerTest test
cd ../data-query-app && pnpm run check
```

Expected: all pass.

- [ ] **Step 2: Run stack verification**

Run:

```bash
bash ./scripts/dev/verify-local-stack.sh
```

Expected: all requested checks pass.

- [ ] **Step 3: Check diff scope before commit**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected: only biome taxonomy crawler/transform/import/backend/admin/test files plus the migration are changed; no generated JSON/log/report files staged.

- [ ] **Step 4: Stage explicit files**

Run:

```bash
git add \
  scripts/data/fetch/fetch-wiki-biomes.mjs \
  scripts/data/fetch/fetch-wiki-biomes.test.mjs \
  scripts/data/transform/transform-wiki-biomes-to-import.mjs \
  scripts/data/transform/transform-wiki-biomes-to-import.test.mjs \
  scripts/data/import/import-biomes-to-db.mjs \
  scripts/data/import/import-biomes-to-db.test.mjs \
  back/src/main/resources/db/migration/V45__add_biome_wiki_taxonomy_fields.sql \
  back/src/main/resources/schema.sql \
  back/src/main/resources/db/migration/V13__create_biome_and_image_tables.sql \
  back/src/main/java/com/terraria/skills/entity/Biome.java \
  back/src/main/java/com/terraria/skills/dto/BiomeDTO.java \
  back/src/main/java/com/terraria/skills/dto/AdminBiomeUpsertRequestDTO.java \
  back/src/main/java/com/terraria/skills/controller/AdminBiomeController.java \
  back/src/test/java/com/terraria/skills/controller/AdminBiomeControllerTest.java \
  data-query-app/pages/entities/[type].vue \
  data-query-app/tests/biome-admin-detail-contract.test.mjs
```

- [ ] **Step 5: Inspect staged scope**

Run:

```bash
git diff --cached --stat
git diff --cached --name-status
```

Expected: staged files match Step 4 and no generated data files are staged.

- [ ] **Step 6: Commit**

Run:

```bash
git commit -m "fix(data): align biome taxonomy with wiki hierarchy"
```

Expected: commit succeeds.

- [ ] **Step 7: Merge to main and restart if requested by user**

If the user wants immediate local integration:

```bash
git switch main
git merge --no-ff fix/biome-wiki-taxonomy-2026-05-22
bash ./scripts/dev/stop-local-stack.sh --force-ports
bash ./scripts/dev/start-local-stack.sh
bash ./scripts/dev/verify-local-stack.sh
```

Expected: main contains the fix, local 3001/18088 run from main, stack verification passes.

## Plan Self-Review

- Spec coverage: The plan covers wiki source hierarchy, fetch metadata, transform fields, DB schema, import, backend API filtering, admin UI hierarchy, data refresh, runtime verification, and commit/merge.
- Placeholder scan: No `TBD`, `TODO`, or vague test-only instructions remain. Each code-changing task includes concrete file paths, test commands, and expected outcomes.
- Type consistency: `wikiGroupCode`, `wikiParentGroupCode`, `wikiSectionLevel`, `wikiSortOrder`, and `wikiSectionAnchor` are used consistently across JS importable data, Java model/DTOs, API query params, and Vue UI.
- Known risk: The exact next Flyway version `V45` assumes no newer migration exists in the implementation worktree. If a newer migration exists by execution time, rename this migration to the next unused version before writing it.
