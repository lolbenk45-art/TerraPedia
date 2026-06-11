import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  auditRemainingSourceRawPageCandidates,
  parseAuditRemainingSourceRawPageCandidatesArgs
} from './audit-remaining-source-raw-page-candidates.mjs';

test('parseAuditRemainingSourceRawPageCandidatesArgs rejects mutation flags', () => {
  for (const flag of ['apply', 'write-db', 'sync', 'import', 'backfill', 'crawler', 'fetch', 'pipeline', 'materialize', 'flyway', 'refresh']) {
    assert.throws(
      () => parseAuditRemainingSourceRawPageCandidatesArgs([`--${flag}=true`]),
      /read-only raw page candidate audit refuses mutation flag/
    );
  }
});

test('parseAuditRemainingSourceRawPageCandidatesArgs rejects --apply=true explicitly', () => {
  assert.throws(
    () => parseAuditRemainingSourceRawPageCandidatesArgs(['--apply=true']),
    /read-only raw page candidate audit refuses mutation flag/
  );
});

test('auditRemainingSourceRawPageCandidates extracts only requested remaining rows from raw pages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remaining-source-candidates-'));
  const rawDir = path.join(root, 'raw');
  const reportPath = path.join(root, 'closure.json');
  fs.mkdirSync(rawDir, { recursive: true });

  fs.writeFileSync(reportPath, JSON.stringify({
    rowsByLane: {
      needs_external_source_evidence: [
        { itemId: 1, internalName: 'MagicMirror', name: 'Magic Mirror', categoryCode: 'TOOL' },
        { itemId: 2, internalName: 'MissingRaw', name: 'Missing Raw', categoryCode: 'MATERIAL' }
      ]
    }
  }));
  fs.writeFileSync(path.join(rawDir, 'magicmirror.latest.json'), JSON.stringify({
    itemInternalName: 'MagicMirror',
    itemName: 'Magic Mirror',
    pageTitle: 'Magic Mirrors',
    revisionTimestamp: '2026-04-02T10:40:10Z',
    wikitext: '',
    html: `
      <p>Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.</p>
      <table class="drop">
        <tr><th>Entity</th><th>Qty</th><th>Chance</th></tr>
        <tr><td><a title="Gold Chest">Gold Chest</a></td><td>1</td><td>1/6 (16.67%)</td></tr>
      </table>
    `
  }));

  const report = auditRemainingSourceRawPageCandidates({
    closureReportPath: reportPath,
    rawItemPageDir: rawDir,
    npcLookup: new Map()
  });

  assert.equal(report.summary.totalRows, 2);
  assert.equal(report.summary.rawPageFound, 1);
  assert.equal(report.summary.candidatesWithExtractedSources, 1);
  assert.equal(report.summary.missingRawPage, 1);
  assert.equal(report.summary.hardBlockedRows, 1);
  assert.equal(report.summary.unresolvedTotal, 0);
  assert.equal(report.summary.reviewLaneCounts.family_or_shared_page_candidate, 1);
  assert.equal(report.summary.hardBlockLaneCounts.missing_raw_page, 1);
  assert.equal(report.candidates[0].itemInternalName, 'MagicMirror');
  assert.deepEqual(report.candidates[0].extractedSources.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefName]), [
    ['container', 'container', 'Gold Chest'],
    ['worldgen', 'world', 'Magic Mirrors worldgen']
  ]);
  assert.equal(report.hardBlockedRows[0].internalName, 'MissingRaw');
  assert.equal(report.hardBlockedRows[0].hardBlockLane, 'missing_raw_page');
  assert.equal(report.hardBlockedRows[0].blockerReason, 'missing raw wiki page cache');
  assert.equal(report.hardBlockedRows[0].specificBlockerReason, 'missing raw wiki page cache for Missing Raw');
  assert.ok(report.hardBlockedRows[0].attemptedRawPath.endsWith('missingraw.latest.json'));
  assert.equal(report.hardBlockedRows[0].sourceRefName, undefined);
  assert.deepEqual(report.hardBlockedRows[0].extractedSources, []);
  assert.deepEqual(
    report.pageResolutionSummary.map((row) => ({
      pageTitle: row.pageTitle,
      convertedToCandidate: row.convertedToCandidate,
      remainingHardBlocked: row.remainingHardBlocked,
      reason: row.reason
    })),
    [
      {
        pageTitle: 'Magic Mirrors',
        convertedToCandidate: 1,
        remainingHardBlocked: 0,
        reason: 'converted'
      },
      {
        pageTitle: 'Missing Raw',
        convertedToCandidate: 0,
        remainingHardBlocked: 1,
        reason: 'missing_raw_page'
      }
    ]
  );
});

test('auditRemainingSourceRawPageCandidates summarizes unresolved raw pages by review lane', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remaining-source-unresolved-'));
  const rawDir = path.join(root, 'raw');
  const reportPath = path.join(root, 'closure.json');
  fs.mkdirSync(rawDir, { recursive: true });

  fs.writeFileSync(reportPath, JSON.stringify({
    rowsByLane: {
      needs_external_source_evidence: [
        { itemId: 1, internalName: 'BlueDungeonChair', name: 'Blue Dungeon Chair', categoryCode: 'FURNITURE' },
        { itemId: 2, internalName: 'ExactNoSource', name: 'Exact No Source', categoryCode: 'MATERIAL' }
      ]
    }
  }));
  fs.writeFileSync(path.join(rawDir, 'bluedungeonchair.latest.json'), JSON.stringify({
    itemInternalName: 'BlueDungeonChair',
    itemName: 'Blue Dungeon Chair',
    pageTitle: 'Chairs',
    wikitext: '',
    html: '<table class="terraria cellborder recipes"><tr><th>Result</th><th>Ingredients</th></tr><tr><td>Item IDs</td><td>Blue Brick</td></tr></table>'
  }));
  fs.writeFileSync(path.join(rawDir, 'exactnosource.latest.json'), JSON.stringify({
    itemInternalName: 'ExactNoSource',
    itemName: 'Exact No Source',
    pageTitle: 'Exact No Source',
    wikitext: '',
    html: '<p>No acquisition prose here.</p>'
  }));

  const report = auditRemainingSourceRawPageCandidates({
    closureReportPath: reportPath,
    rawItemPageDir: rawDir,
    npcLookup: new Map()
  });

  assert.equal(report.summary.rawPagesWithoutSources, 0);
  assert.equal(report.summary.rawPageFound, 2);
  assert.equal(report.summary.hardBlockedRows, 2);
  assert.equal(report.summary.unresolvedTotal, 0);
  assert.equal(report.summary.hardBlockLaneCounts.requires_family_table_parser, 1);
  assert.equal(report.summary.hardBlockLaneCounts.requires_page_specific_parser, 1);
  assert.deepEqual(report.rawPagesWithoutSources, []);
  assert.deepEqual(report.unresolvedLanes, []);
  assert.deepEqual(
    report.hardBlockedRows.map((row) => [row.internalName, row.hardBlockLane, row.specificBlockerReason]),
    [
      ['BlueDungeonChair', 'requires_family_table_parser', 'family/shared page Chairs has no supported target row parser for Blue Dungeon Chair'],
      ['ExactNoSource', 'requires_page_specific_parser', 'exact page Exact No Source has no supported source pattern for Exact No Source']
    ]
  );
});

test('auditRemainingSourceRawPageCandidates converts exact and family recipe rows into craft candidates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remaining-source-recipes-'));
  const rawDir = path.join(root, 'raw');
  const reportPath = path.join(root, 'closure.json');
  fs.mkdirSync(rawDir, { recursive: true });

  fs.writeFileSync(reportPath, JSON.stringify({
    rowsByLane: {
      needs_external_source_evidence: [
        { itemId: 1, internalName: 'HighTestFishingLine', name: 'High Test Fishing Line', categoryCode: 'MATERIAL' },
        { itemId: 2, internalName: 'BlueDungeonChair', name: 'Blue Dungeon Chair', categoryCode: 'FURNITURE' },
        { itemId: 3, internalName: 'PollutedOnly', name: 'Polluted Only', categoryCode: 'FURNITURE' }
      ]
    }
  }));
  const recipeTable = `
    <table class="terraria cellborder recipes sortable">
      <tr><th class="result">Result</th><th class="ingredients">Ingredients</th><th class="station">Crafting station</th></tr>
      <tr>
        <td class="result" data-sort-value="High Test Fishing Line"><a title="High Test Fishing Line">High Test Fishing Line</a></td>
        <td class="ingredients"><ul><li><span class="i"><a title="Cobweb">Cobweb</a></span><span class="am">8</span></li></ul></td>
        <td class="station"><a title="Loom">Loom</a></td>
      </tr>
    </table>
  `;
  fs.writeFileSync(path.join(rawDir, 'hightestfishingline.latest.json'), JSON.stringify({
    itemInternalName: 'HighTestFishingLine',
    itemName: 'High Test Fishing Line',
    pageTitle: 'High Test Fishing Line',
    wikitext: '',
    html: recipeTable
  }));
  fs.writeFileSync(path.join(rawDir, 'bluedungeonchair.latest.json'), JSON.stringify({
    itemInternalName: 'BlueDungeonChair',
    itemName: 'Blue Dungeon Chair',
    pageTitle: 'Chairs',
    wikitext: '',
    html: `
      <table class="terraria cellborder recipes sortable">
        <tr><th class="result">Result</th><th class="ingredients">Ingredients</th><th class="station">Crafting station</th></tr>
        <tr>
          <td class="result" data-sort-value="Blue Dungeon Chair">
            <span><a title="Blue Dungeon Chair">Blue Dungeon Chair</a></span>
            <span class="id"><a title="Item IDs">Internal Item ID</a>: 1396</span>
          </td>
          <td class="ingredients"><ul><li><span class="i"><a title="Blue Brick">Blue Brick</a></span><span class="am">4</span></li></ul></td>
          <td class="station"><a title="Work Bench">Work Bench</a></td>
        </tr>
      </table>
    `
  }));
  fs.writeFileSync(path.join(rawDir, 'pollutedonly.latest.json'), JSON.stringify({
    itemInternalName: 'PollutedOnly',
    itemName: 'Polluted Only',
    pageTitle: 'Polluted Family',
    wikitext: '',
    html: `
      <table class="terraria cellborder recipes sortable">
        <tr><th class="result">Result</th><th class="ingredients">Ingredients</th></tr>
        <tr><td class="result"><a title="Item IDs">Internal Item ID</a>: 1</td><td class="ingredients"><ul><li><a title="Stone Block">Stone Block</a></li></ul></td></tr>
      </table>
    `
  }));

  const report = auditRemainingSourceRawPageCandidates({
    closureReportPath: reportPath,
    rawItemPageDir: rawDir,
    npcLookup: new Map()
  });
  const byInternalName = new Map(report.candidates.map((candidate) => [candidate.internalName, candidate]));

  assert.equal(report.summary.candidatesWithExtractedSources, 2);
  assert.equal(report.summary.hardBlockedRows, 1);
  assert.equal(byInternalName.get('HighTestFishingLine').reviewLane, 'direct_page_candidate');
  assert.equal(byInternalName.get('BlueDungeonChair').reviewLane, 'family_recipe_exact_result_candidate');
  assert.deepEqual(
    byInternalName.get('BlueDungeonChair').extractedSources.map((source) => [
      source.sourceType,
      source.sourceRefType,
      source.sourceRefName,
      source.quantityText,
      source.conditions,
      source.matchedRecipeResultName
    ]),
    [['craft', 'item', 'Blue Brick', '1', 'Crafted at Work Bench', 'Blue Dungeon Chair']]
  );
  assert.equal(report.hardBlockedRows.find((row) => row.internalName === 'PollutedOnly').hardBlockLane, 'requires_family_table_parser');
});

test('auditRemainingSourceRawPageCandidates uses target-aware hard-block parsers for exact and shared pages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remaining-source-target-aware-'));
  const rawDir = path.join(root, 'raw');
  const reportPath = path.join(root, 'closure.json');
  fs.mkdirSync(rawDir, { recursive: true });

  fs.writeFileSync(reportPath, JSON.stringify({
    rowsByLane: {
      needs_external_source_evidence: [
        { itemId: 321, internalName: 'Tombstone', name: 'Tombstone', categoryCode: 'FURNITURE' },
        { itemId: 2450, internalName: 'Batfish', name: 'Batfish', categoryCode: 'QUEST_FISH' },
        { itemId: 2451, internalName: 'BumblebeeTuna', name: 'Bumblebee Tuna', categoryCode: 'QUEST_FISH' },
        { itemId: 1281, internalName: 'SkeletronMask', name: 'Skeletron Mask', categoryCode: 'VANITY' },
        { itemId: 3183, internalName: 'GoldenBugNet', name: 'Golden Bug Net', categoryCode: 'TOOL' },
        { itemId: 5043, internalName: 'TorchGodsFavor', name: "Torch God's Favor", categoryCode: 'CONSUMABLE' },
        { itemId: 5275, internalName: 'JojaCola', name: 'Joja Cola', categoryCode: 'CONSUMABLE' },
        { itemId: 5114, internalName: 'AbigailsFlower', name: "Abigail's Flower", categoryCode: 'SUMMON' },
        { itemId: 9999, internalName: 'PinkJellyfishBaitRecipe', name: 'Pink Jellyfish (bait)', categoryCode: 'BAIT' }
      ]
    }
  }));

  fs.writeFileSync(path.join(rawDir, 'tombstone.latest.json'), JSON.stringify({
    itemInternalName: 'Tombstone',
    itemName: 'Tombstone',
    pageTitle: 'Tombstones',
    wikitext: "A '''Tombstone''' is a furniture item that drops when a player dies. Variants are chosen randomly upon death.",
    html: '<p>A <b>Tombstone</b> is a furniture item that drops when a player dies.</p><p>Variants are chosen randomly upon death.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'batfish.latest.json'), JSON.stringify({
    itemInternalName: 'Batfish',
    itemName: 'Batfish',
    pageTitle: 'Angler/Quests',
    wikitext: `
      Below is a list of fishing quests given by the Angler.
      {{:Angler/Quests/row|2450
      | [[Underground]] and below
      | [[Pure biome]]
      }}
      {{:Angler/Quests/row|2451
      | Any
      | Any (Must be fished from {{item|Honey}})
      }}
    `,
    html: '<p>Below is a list of fishing quests given by the Angler.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'bumblebeetuna.latest.json'), fs.readFileSync(path.join(rawDir, 'batfish.latest.json')));
  fs.writeFileSync(path.join(rawDir, 'skeletronmask.latest.json'), JSON.stringify({
    itemInternalName: 'SkeletronMask',
    itemName: 'Skeletron Mask',
    pageTitle: 'Masks',
    wikitext: `
      '''Masks''' are vanity items dropped by all non-event bosses.
      Each boss has a {{chance|1/7}} chance to drop its own mask.
      {{item infobox|type=Vanity|tags=drop| auto = 1281 | link = Skeletron}}
      {{item infobox|type=Vanity|tags=drop| auto = 2106 | link = The Twins}}
    `,
    html: '<p><b>Masks</b> are vanity items dropped by all non-event bosses.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'goldenbugnet.latest.json'), JSON.stringify({
    itemInternalName: 'GoldenBugNet',
    itemName: 'Golden Bug Net',
    pageTitle: 'Golden Bug Net',
    wikitext: '',
    html: '<p>The Golden Bug Net has a base 1/80 (1.25%) chance of being obtained from the Angler as a reward for completing fishing quests.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'torchgodsfavor.latest.json'), JSON.stringify({
    itemInternalName: 'TorchGodsFavor',
    itemName: "Torch God's Favor",
    pageTitle: "Torch God's Favor",
    wikitext: '',
    html: "<p>The Torch God's Favor can only be obtained by surviving The Torch God event if at least 95 Torches were fired during the event.</p>"
  }));
  fs.writeFileSync(path.join(rawDir, 'jojacola.latest.json'), JSON.stringify({
    itemInternalName: 'JojaCola',
    itemName: 'Joja Cola',
    pageTitle: 'Joja Cola',
    wikitext: '',
    html: '<p>Joja Cola has a 1/8 (12.5%) chance of being fished up instead of a junk item when fishing. This is a crossover reference to Stardew Valley.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'abigailsflower.latest.json'), JSON.stringify({
    itemInternalName: 'AbigailsFlower',
    itemName: "Abigail's Flower",
    pageTitle: "Abigail's Flower",
    wikitext: '',
    html: "<p>Abigail's Flower can be uncommonly found as a plant growing on grass near a placed Tombstone.</p>"
  }));
  fs.writeFileSync(path.join(rawDir, 'pinkjellyfish.latest.json'), JSON.stringify({
    itemInternalName: 'PinkJellyfish',
    itemName: 'Pink Jellyfish',
    pageTitle: 'Jellyfish',
    wikitext: '',
    html: '<p>Jellyfish are enemies found in water. Pink Jellyfish can spawn in the Ocean.</p><h2>History</h2><p>Pink Jellyfish now drops Glowsticks.</p>'
  }));

  const report = auditRemainingSourceRawPageCandidates({
    closureReportPath: reportPath,
    rawItemPageDir: rawDir,
    npcLookup: new Map([['skeletron', { boss: true }]])
  });
  const byName = new Map(report.candidates.map((candidate) => [candidate.internalName, candidate]));

  assert.equal(report.summary.candidatesWithExtractedSources, 8);
  assert.equal(report.summary.hardBlockedRows, 1);
  assert.deepEqual(byName.get('Batfish').extractedSources.map((source) => [
    source.sourceType,
    source.sourceRefType,
    source.sourceRefName,
    source.sourceTargetItemName,
    source.sourceRowText
  ]), [[
    'unknown',
    'world',
    'Angler quest fish catch',
    'Batfish',
    '{{:Angler/Quests/row|2450 | [[Underground]] and below | [[Pure biome]] }}'
  ]]);
  assert.equal(byName.get('BumblebeeTuna').extractedSources[0].conditions.includes('Honey'), true);
  assert.deepEqual(byName.get('SkeletronMask').extractedSources.map((source) => [
    source.sourceType,
    source.sourceRefType,
    source.sourceRefName,
    source.chanceText,
    source.sourceTargetItemName
  ]), [['drop', 'boss', 'Skeletron', '1/7', 'Skeletron Mask']]);
  assert.deepEqual(byName.get('GoldenBugNet').extractedSources.map((source) => [source.sourceType, source.sourceRefName, source.chanceText]), [
    ['quest_reward', 'Angler', '1/80 (1.25%)']
  ]);
  assert.equal(byName.get('TorchGodsFavor').extractedSources[0].conditions.includes('95 Torches'), true);
  assert.equal(byName.get('JojaCola').extractedSources.length, 1);
  assert.equal(byName.get('JojaCola').extractedSources[0].conditions.includes('Stardew'), false);
  assert.equal(byName.get('AbigailsFlower').extractedSources[0].sourceRefName, 'grass near a placed Tombstone');
  assert.equal(report.hardBlockedRows[0].internalName, 'PinkJellyfishBaitRecipe');
  assert.equal(report.hardBlockedRows[0].hardBlockLane, 'missing_raw_page');
  assert.equal(report.hardBlockedRows[0].specificBlockerReason, 'alias raw page Jellyfish does not prove identity for Pink Jellyfish (bait)');
});

test('auditRemainingSourceRawPageCandidates parses safe family source rows and keeps unsupported taxonomy explicit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remaining-source-family-'));
  const rawDir = path.join(root, 'raw');
  const reportPath = path.join(root, 'closure.json');
  fs.mkdirSync(rawDir, { recursive: true });

  fs.writeFileSync(reportPath, JSON.stringify({
    rowsByLane: {
      needs_external_source_evidence: [
        { itemId: 1451, internalName: 'MarchingBonesBanner', name: 'Marching Bones Banner', categoryCode: 'FURNITURE' },
        { itemId: 1396, internalName: 'BlueDungeonChair', name: 'Blue Dungeon Chair', categoryCode: 'FURNITURE' },
        { itemId: 3032, internalName: 'SuperAbsorbantSponge', name: 'Super Absorbant Sponge', categoryCode: 'TOOL' },
        { itemId: 4872, internalName: 'LavaAbsorbantSponge', name: 'Lava Absorbant Sponge', categoryCode: 'TOOL' },
        { itemId: 1994, internalName: 'MonarchButterfly', name: 'Monarch Butterfly', categoryCode: 'CRITTER' },
        { itemId: 1803, internalName: 'JungleKeyMold', name: 'Jungle Key Mold', categoryCode: 'MATERIAL' }
      ]
    }
  }));

  const bannerPayload = JSON.stringify({
    itemInternalName: 'MarchingBonesBanner',
    itemName: 'Marching Bones Banner',
    pageTitle: 'Banners (decorative)',
    wikitext: '{{banner|Marching Bones Banner|id=1451|cargo=y|tags=plunder}}\n{{banner|Necromantic Sign|id=1452|cargo=y|tags=plunder}}',
    html: '<p>Decorative banners can be found placed in the Dungeon.</p>'
  });
  fs.writeFileSync(path.join(rawDir, 'marchingbonesbanner.latest.json'), bannerPayload);
  fs.writeFileSync(path.join(rawDir, 'bluedungeonchair.latest.json'), JSON.stringify({
    itemInternalName: 'BlueDungeonChair',
    itemName: 'Blue Dungeon Chair',
    pageTitle: 'Chairs',
    wikitext: '{{item infobox |view=item| auto = 1396 | type = Furniture | width = 1 | height = 2 | tags = plunder}}',
    html: '<p>Noncraftable Chairs can be found in the Dungeon.</p>'
  }));
  const spongesPayload = JSON.stringify({
    itemInternalName: 'SuperAbsorbantSponge',
    itemName: 'Super Absorbant Sponge',
    pageTitle: 'Sponges',
    wikitext: `
      {{item infobox|type=Tool|auto=3032|tags = quest rewards / hardmode|col:source=
      * [[Angler]] [[quest]] reward ({{chance|1/70}} chance after 10th quest)}}
      {{item infobox|type=Tool|auto=4872|col:source=
      * [[Fishing]] in lava}}
    `,
    html: '<p>Sponges are tools used to erase liquids.</p>'
  });
  fs.writeFileSync(path.join(rawDir, 'superabsorbantsponge.latest.json'), spongesPayload);
  fs.writeFileSync(path.join(rawDir, 'lavaabsorbantsponge.latest.json'), spongesPayload);
  fs.writeFileSync(path.join(rawDir, 'monarchbutterfly.latest.json'), JSON.stringify({
    itemInternalName: 'MonarchButterfly',
    itemName: 'Monarch Butterfly',
    pageTitle: 'Butterflies',
    wikitext: '',
    html: '<p>Butterflies are small critters that can be found in Forests during daytime. They can be caught with a Bug Net.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'junglekeymold.latest.json'), JSON.stringify({
    itemInternalName: 'JungleKeyMold',
    itemName: 'Jungle Key Mold',
    pageTitle: 'Legacy:Biome Key Molds',
    wikitext: 'After the Wall of Flesh is defeated, every enemy killed within an eligible biome has a 1/2500 (0.04%) chance of dropping a Biome Key Mold. The type of key mold that is dropped depends on the biome the player is currently in (Jungle, Corruption, Crimson, Hallow, or Snow).',
    html: '<p>After the Wall of Flesh is defeated, every enemy killed within an eligible biome has a 1/2500 (0.04%) chance of dropping a Biome Key Mold. The type of key mold that is dropped depends on the biome the player is currently in (Jungle, Corruption, Crimson, Hallow, or Snow).</p>'
  }));

  const report = auditRemainingSourceRawPageCandidates({
    closureReportPath: reportPath,
    rawItemPageDir: rawDir,
    npcLookup: new Map()
  });
  const byName = new Map(report.candidates.map((candidate) => [candidate.internalName, candidate]));
  const blocked = new Map(report.hardBlockedRows.map((row) => [row.internalName, row]));

  assert.deepEqual(byName.get('MarchingBonesBanner').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.sourceTargetItemName]), [
    ['worldgen', 'world', 'Banners (decorative) plunder', 'Marching Bones Banner']
  ]);
  assert.equal(byName.get('BlueDungeonChair').extractedSources[0].sourceRefName, 'Chairs plunder');
  assert.equal(byName.get('SuperAbsorbantSponge').extractedSources[0].sourceRefName, 'Angler');
  assert.deepEqual(byName.get('JungleKeyMold').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.chanceText]), [
    ['drop', 'npc_group', 'enemies in Jungle biome', '1/2500 (0.04%)']
  ]);
  assert.equal(blocked.get('LavaAbsorbantSponge'), undefined);
  assert.deepEqual(byName.get('LavaAbsorbantSponge').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName]), [
    ['fishing', 'world', 'Lava fishing']
  ]);
  assert.equal(blocked.get('MonarchButterfly'), undefined);
  assert.deepEqual(byName.get('MonarchButterfly').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName]), [
    ['capture', 'world', 'Bug Net capture']
  ]);
});

test('auditRemainingSourceRawPageCandidates parses expanded HTML source rows and exact reward prose', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remaining-source-second-pass-'));
  const rawDir = path.join(root, 'raw');
  const reportPath = path.join(root, 'closure.json');
  fs.mkdirSync(rawDir, { recursive: true });

  fs.writeFileSync(reportPath, JSON.stringify({
    rowsByLane: {
      needs_external_source_evidence: [
        { itemId: 665, internalName: 'RedsWings', name: "Red's Wings", categoryCode: 'ACCESSORY' },
        { itemId: 3883, internalName: 'BetsyWings', name: "Betsy's Wings", categoryCode: 'ACCESSORY' },
        { itemId: 2360, internalName: 'FishHook', name: 'Fish Hook', categoryCode: 'TOOL' },
        { itemId: 3561, internalName: 'GelDye', name: 'Gel Dye', categoryCode: 'DYE' },
        { itemId: 2428, internalName: 'FuzzyCarrot', name: 'Fuzzy Carrot', categoryCode: 'MOUNT' },
        { itemId: 3225, internalName: 'BalloonPufferfish', name: 'Balloon Pufferfish', categoryCode: 'ACCESSORY' }
      ]
    }
  }));

  const wingsHtml = `
    <table class="terraria">
      <tr>
        <td><span title="Red's Wings">Red's Wings</span><span class="id">Internal <a title="Item IDs">Item ID</a>: 665</span></td>
        <td align="left"><a title="Hardmode">Hardmode</a> <a title="Treasure Bag">Treasure Bag</a> (except <a title="Queen Slime">Queen Slime</a>'s)</td>
        <td><ul><li><a title="Developer item">Developer item</a></li></ul></td>
      </tr>
      <tr>
        <td><span title="Betsy's Wings">Betsy's Wings</span><span class="id">Internal <a title="Item IDs">Item ID</a>: 3883</span></td>
        <td align="left">Dropped by <a title="Betsy">Betsy</a></td>
        <td><ul><li>Drop chance: <span class="chance">1/4 (25%)</span></li></ul></td>
      </tr>
    </table>
  `;
  fs.writeFileSync(path.join(rawDir, 'redswings.latest.json'), JSON.stringify({
    itemInternalName: 'RedsWings',
    itemName: "Red's Wings",
    pageTitle: 'Wings',
    wikitext: '',
    html: wingsHtml
  }));
  fs.writeFileSync(path.join(rawDir, 'betsywings.latest.json'), JSON.stringify({
    itemInternalName: 'BetsyWings',
    itemName: "Betsy's Wings",
    pageTitle: 'Wings',
    wikitext: '',
    html: wingsHtml
  }));
  const hooksWikitext = '{{item infobox | auto = 2360| type = Tool | tags = Hooks / quest rewards\n| col:source = [[Angler]] (1.7%)\n| col:hooks = 3\n}}';
  fs.writeFileSync(path.join(rawDir, 'fishhook.latest.json'), JSON.stringify({
    itemInternalName: 'FishHook',
    itemName: 'Fish Hook',
    pageTitle: 'Hooks',
    wikitext: hooksWikitext,
    html: '<p>Hooks are tools.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'geldye.latest.json'), JSON.stringify({
    itemInternalName: 'GelDye',
    itemName: 'Gel Dye',
    pageTitle: 'Gel Dye',
    wikitext: '',
    html: '<p>Gel Dye is a Hardmode dye acquired by giving a Strange Plant to the Dye Trader. It is received as a random reward.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'fuzzycarrot.latest.json'), JSON.stringify({
    itemInternalName: 'FuzzyCarrot',
    itemName: 'Fuzzy Carrot',
    pageTitle: 'Fuzzy Carrot',
    wikitext: '',
    html: '<p>The Fuzzy Carrot is obtained from the Angler as a reward for completing his 5th fishing quest.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'balloonpufferfish.latest.json'), JSON.stringify({
    itemInternalName: 'BalloonPufferfish',
    itemName: 'Balloon Pufferfish',
    pageTitle: 'Balloon Pufferfish',
    wikitext: '',
    html: '<p>It can be obtained via fishing in any biome.</p>'
  }));

  const report = auditRemainingSourceRawPageCandidates({
    closureReportPath: reportPath,
    rawItemPageDir: rawDir,
    npcLookup: new Map([['betsy', { boss: true }]])
  });
  const byName = new Map(report.candidates.map((candidate) => [candidate.internalName, candidate]));
  const blocked = new Map(report.hardBlockedRows.map((row) => [row.internalName, row]));

  assert.deepEqual(byName.get('RedsWings').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.sourceTargetItemName]), [
    ['treasure_bag', 'treasure_bag', 'Hardmode Treasure Bag (except Queen Slime)', "Red's Wings"]
  ]);
  assert.deepEqual(byName.get('BetsyWings').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.chanceText]), [
    ['drop', 'boss', 'Betsy', '1/4 (25%)']
  ]);
  assert.deepEqual(byName.get('FishHook').extractedSources.map((source) => [source.sourceType, source.sourceRefName, source.chanceText]), [
    ['quest_reward', 'Angler', '1.7%']
  ]);
  assert.equal(byName.get('GelDye').extractedSources[0].sourceRefName, 'Dye Trader');
  assert.equal(byName.get('FuzzyCarrot').extractedSources[0].conditions.includes('5th fishing quest'), true);
  assert.equal(blocked.get('BalloonPufferfish'), undefined);
  assert.deepEqual(byName.get('BalloonPufferfish').extractedSources.map((source) => [source.sourceType, source.sourceRefName]), [
    ['fishing', 'Fishing']
  ]);
});

test('auditRemainingSourceRawPageCandidates converts reviewed fishing and capture taxonomy sources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remaining-source-fishing-capture-'));
  const rawDir = path.join(root, 'raw');
  const reportPath = path.join(root, 'closure.json');
  fs.mkdirSync(rawDir, { recursive: true });

  fs.writeFileSync(reportPath, JSON.stringify({
    rowsByLane: {
      needs_external_source_evidence: [
        { itemId: 2420, internalName: 'ZephyrFish', name: 'Zephyr Fish', categoryCode: 'PET' },
        { itemId: 2315, internalName: 'Obsidifish', name: 'Obsidifish', categoryCode: 'MATERIAL' },
        { itemId: 4878, internalName: 'LavaCrateHard', name: 'Hellstone Crate', categoryCode: 'CRATE' },
        { itemId: 4820, internalName: 'BottomlessLavaBucket', name: 'Bottomless Lava Bucket', categoryCode: 'TOOL' },
        { itemId: 1994, internalName: 'MonarchButterfly', name: 'Monarch Butterfly', categoryCode: 'CRITTER' },
        { itemId: 4845, internalName: 'HellButterfly', name: 'Hell Butterfly', categoryCode: 'CRITTER' },
        { itemId: 4847, internalName: 'Lavafly', name: 'Lavafly', categoryCode: 'CRITTER' },
        { itemId: 4849, internalName: 'MagmaSnail', name: 'Magma Snail', categoryCode: 'CRITTER' }
      ]
    }
  }));

  fs.writeFileSync(path.join(rawDir, 'zephyrfish.latest.json'), JSON.stringify({
    itemInternalName: 'ZephyrFish',
    itemName: 'Zephyr Fish',
    pageTitle: 'Zephyr Fish',
    wikitext: '{{item infobox|auto=2420|tags=fished}}',
    html: '<p>The Zephyr Fish is rarely caught from fishing in any body of water. The chance to catch it is 2/3125 (0.06%) with 50% Fishing Power and 4/3125 (0.13%) with 100% Fishing Power.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'obsidifish.latest.json'), JSON.stringify({
    itemInternalName: 'Obsidifish',
    itemName: 'Obsidifish',
    pageTitle: 'Obsidifish',
    wikitext: '{{item infobox|auto=2315|tags=Potion ingredients / fished}}',
    html: '<p>Obsidifish are found rarely by fishing in any biome in any layer, but only in lava.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'lavacratehard.latest.json'), JSON.stringify({
    itemInternalName: 'LavaCrateHard',
    itemName: 'Hellstone Crate',
    pageTitle: 'Hellstone Crate',
    wikitext: '{{item infobox|auto=4878|tags=fished / hardmode}}',
    html: '<p>The Hellstone Crate is a Hardmode crate that can only be fished in lava.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'bottomlesslavabucket.latest.json'), JSON.stringify({
    itemInternalName: 'BottomlessLavaBucket',
    itemName: 'Bottomless Lava Bucket',
    pageTitle: 'Bottomless Buckets',
    wikitext: `
      {{item infobox|type=Tool|auto=4820|tags=fished|col:source=
      * [[Fishing]] in [[lava]]}}
    `,
    html: '<p>Bottomless Lava Bucket is obtained by fishing in lava.</p>'
  }));
  const butterfliesPayload = JSON.stringify({
    itemInternalName: 'MonarchButterfly',
    itemName: 'Monarch Butterfly',
    pageTitle: 'Butterflies',
    wikitext: '{{npc infobox|auto=356|type=Critter}}',
    html: '<p>Butterflies are small critters that can be found in Forests during daytime. They can be caught with a Bug Net and carried in the inventory.</p>'
  });
  fs.writeFileSync(path.join(rawDir, 'monarchbutterfly.latest.json'), butterfliesPayload);
  fs.writeFileSync(path.join(rawDir, 'hellbutterfly.latest.json'), JSON.stringify({
    itemInternalName: 'HellButterfly',
    itemName: 'Hell Butterfly',
    pageTitle: 'Butterflies',
    wikitext: '{{npc infobox|auto=653|type=Critter|environment=The Underworld}}',
    html: '<p>The Hell Butterfly can spawn in the Underworld during daytime, or spawn from destroyed wild Ash grass plants. The Hell Butterfly can only be caught with the Lavaproof Bug Net or Golden Bug Net.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'lavafly.latest.json'), JSON.stringify({
    itemInternalName: 'Lavafly',
    itemName: 'Lavafly',
    pageTitle: 'Lavafly',
    wikitext: '{{item infobox|auto=4847}}{{npc infobox|auto=654|type=Critter}}',
    html: '<p>The Lavafly is a critter that spawns occasionally in the Underworld at night. The Lavafly can only be caught with the Lavaproof Bug Net or the Golden Bug Net.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'magmasnail.latest.json'), JSON.stringify({
    itemInternalName: 'MagmaSnail',
    itemName: 'Magma Snail',
    pageTitle: 'Magma Snail',
    wikitext: '{{item infobox|auto=4849}}{{npc infobox|auto=655|type=Critter}}',
    html: '<p>The Magma Snail is a critter that spawns in The Underworld. The Magma Snail can only be caught with the Lavaproof Bug Net or the Golden Bug Net.</p>'
  }));

  const report = auditRemainingSourceRawPageCandidates({
    closureReportPath: reportPath,
    rawItemPageDir: rawDir,
    npcLookup: new Map()
  });
  const byName = new Map(report.candidates.map((candidate) => [candidate.internalName, candidate]));

  assert.equal(report.summary.hardBlockedRows, 0);
  assert.deepEqual(byName.get('ZephyrFish').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.chanceText]), [
    ['fishing', 'world', 'Fishing', '2/3125 (0.06%)']
  ]);
  assert.deepEqual(byName.get('Obsidifish').extractedSources.map((source) => [source.sourceType, source.sourceRefName]), [
    ['fishing', 'Lava fishing']
  ]);
  assert.equal(byName.get('LavaCrateHard').extractedSources[0].conditions.includes('fished in lava'), true);
  assert.equal(byName.get('BottomlessLavaBucket').extractedSources[0].sourceRowText.includes('auto=4820'), true);
  assert.deepEqual(byName.get('MonarchButterfly').extractedSources.map((source) => [source.sourceType, source.sourceRefName]), [
    ['capture', 'Bug Net capture']
  ]);
  assert.equal(byName.get('HellButterfly').extractedSources[0].sourceRefName, 'Lavaproof or Golden Bug Net capture');
  assert.equal(byName.get('Lavafly').extractedSources[0].conditions.includes('Underworld'), true);
  assert.equal(byName.get('MagmaSnail').extractedSources[0].conditions.includes('Underworld'), true);
});

test('auditRemainingSourceRawPageCandidates converts reviewed exact one-off acquisition pages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remaining-source-oneoffs-'));
  const rawDir = path.join(root, 'raw');
  const reportPath = path.join(root, 'closure.json');
  fs.mkdirSync(rawDir, { recursive: true });

  fs.writeFileSync(reportPath, JSON.stringify({
    rowsByLane: {
      needs_external_source_evidence: [
        { itemId: 766, internalName: 'BoneBlock', name: 'Bone Block', categoryCode: 'BLOCK' },
        { itemId: 969, internalName: 'CookedMarshmallow', name: 'Cooked Marshmallow', categoryCode: 'FOOD' },
        { itemId: 5400, internalName: 'DirtiestBlock', name: 'The Dirtiest Block', categoryCode: 'PET' },
        { itemId: 5574, internalName: 'LuckyClover', name: 'Lucky Clover', categoryCode: 'TOOL' },
        { itemId: 5665, internalName: 'PalworldPetChillet', name: 'Chillet', categoryCode: 'MOUNT' },
        { itemId: 5666, internalName: 'PalworldPetChilletIgnis', name: 'Chillet Ignis', categoryCode: 'MOUNT' },
        { itemId: 5668, internalName: 'SoundGun', name: 'The Imploder', categoryCode: 'WEAPON' }
      ]
    }
  }));

  fs.writeFileSync(path.join(rawDir, 'boneblock.latest.json'), JSON.stringify({
    itemInternalName: 'BoneBlock',
    itemName: 'Bone Block',
    pageTitle: 'Bone Block',
    wikitext: '{{item infobox|auto=766}}',
    html: '<p>Mining Bone Blocks now drops Bones. There is no way to obtain the block as an item in these versions.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'cookedmarshmallow.latest.json'), JSON.stringify({
    itemInternalName: 'CookedMarshmallow',
    itemName: 'Cooked Marshmallow',
    pageTitle: 'Cooked Marshmallow',
    wikitext: '{{item infobox|auto=969}}',
    html: '<p>The Cooked Marshmallow is created by holding a Marshmallow on a Stick over a Campfire for up to 15 seconds.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'dirtiestblock.latest.json'), JSON.stringify({
    itemInternalName: 'DirtiestBlock',
    itemName: 'The Dirtiest Block',
    pageTitle: 'The Dirtiest Block',
    wikitext: '{{item infobox|auto=5400|tags=plunder}}',
    html: '<p>The Dirtiest Block can be found extremely rarely as a block that looks identical to Dirt Blocks. Upon world generation, random Dirt Blocks will be replaced with The Dirtiest Blocks.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'luckyclover.latest.json'), JSON.stringify({
    itemInternalName: 'LuckyClover',
    itemName: 'Lucky Clover',
    pageTitle: 'Lucky Clover',
    wikitext: '{{item infobox|auto=5574}}',
    html: '<p>The Lucky Clover is an item rarely obtained from cutting tall grass. The Lucky Clover can only drop from tall grass plants without flowers.</p>'
  }));
  const chilletPayload = JSON.stringify({
    itemInternalName: 'PalworldPetChillet',
    itemName: 'Chillet',
    pageTitle: 'Chillet',
    wikitext: '{{item infobox|auto=5665|tags=bag loot}}{{item infobox|auto=5666|tags=bag loot}}',
    html: '<p>Chillet and Chillet Ignis are mount-summoning items. Chillet and Chillet Ignis are functionally identical, and either variant can be obtained from the Huge Dragon Egg at a 50% chance.</p>'
  });
  fs.writeFileSync(path.join(rawDir, 'palworldpetchillet.latest.json'), chilletPayload);
  fs.writeFileSync(path.join(rawDir, 'palworldpetchilletignis.latest.json'), chilletPayload);
  fs.writeFileSync(path.join(rawDir, 'soundgun.latest.json'), JSON.stringify({
    itemInternalName: 'SoundGun',
    itemName: 'The Imploder',
    pageTitle: 'The Imploder',
    wikitext: '{{item infobox|auto=5668|tags=unobtainable}}',
    html: '<p>The Imploder is an unimplemented item. It cannot be obtained or used through any means.</p>'
  }));

  const report = auditRemainingSourceRawPageCandidates({
    closureReportPath: reportPath,
    rawItemPageDir: rawDir,
    npcLookup: new Map()
  });
  const byName = new Map(report.candidates.map((candidate) => [candidate.internalName, candidate]));

  assert.equal(report.summary.hardBlockedRows, 0);
  assert.equal(byName.get('BoneBlock').extractedSources[0].sourceRefName, 'unobtainable as item');
  assert.equal(byName.get('CookedMarshmallow').extractedSources[0].sourceRefName, 'Campfire cooking');
  assert.equal(byName.get('DirtiestBlock').extractedSources[0].sourceType, 'worldgen');
  assert.equal(byName.get('LuckyClover').extractedSources[0].sourceRefName, 'tall grass');
  assert.deepEqual(byName.get('PalworldPetChillet').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.chanceText]), [
    ['drop', 'item', 'Huge Dragon Egg', '50%']
  ]);
  assert.equal(byName.get('PalworldPetChilletIgnis').extractedSources[0].sourceRefName, 'Huge Dragon Egg');
  assert.equal(byName.get('SoundGun').extractedSources[0].sourceRefName, 'unimplemented');
});

test('auditRemainingSourceRawPageCandidates converts remaining raw-backed family and exact rows', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remaining-source-final-raw-backed-'));
  const rawDir = path.join(root, 'raw');
  const reportPath = path.join(root, 'closure.json');
  fs.mkdirSync(rawDir, { recursive: true });

  fs.writeFileSync(reportPath, JSON.stringify({
    rowsByLane: {
      needs_external_source_evidence: [
        { itemId: 2494, internalName: 'FinWings', name: 'Fin Wings', categoryCode: 'ACCESSORY' },
        { itemId: 3353, internalName: 'MinecartMech', name: 'Mechanical Cart', categoryCode: 'MOUNT' },
        { itemId: 3580, internalName: 'Yoraiz0rWings', name: "Yoraiz0r's Spell", categoryCode: 'ACCESSORY' },
        { itemId: 3822, internalName: 'DD2EnergyCrystal', name: 'Etherian Mana', categoryCode: 'MATERIAL' },
        { itemId: 3885, internalName: 'GoldenChest', name: 'Golden Chest', categoryCode: 'FURNITURE' },
        { itemId: 4058, internalName: 'SkeletonBow', name: 'Skull Bow', categoryCode: 'WEAPON' },
        { itemId: 4067, internalName: 'FishMinecart', name: 'Minecarp', categoryCode: 'MOUNT' },
        { itemId: 4880, internalName: 'LavaFishbowl', name: 'Lava Serpent Bowl', categoryCode: 'FURNITURE' },
        { itemId: 4917, internalName: 'TeleportationPylonUnderground', name: 'Cavern Pylon', categoryCode: 'FURNITURE' },
        { itemId: 5059, internalName: 'CapricornLegs', name: 'Capricorn Hooves', categoryCode: 'VANITY' },
        { itemId: 5325, internalName: 'ClosedVoidBag', name: 'Closed Void Bag', categoryCode: 'TOOL' },
        { itemId: 5359, internalName: 'ShellphoneSpawn', name: 'Shellphone (Spawn)', categoryCode: 'TOOL' },
        { itemId: 5360, internalName: 'ShellphoneOcean', name: 'Shellphone (Ocean)', categoryCode: 'TOOL' },
        { itemId: 5361, internalName: 'ShellphoneHell', name: 'Shellphone (Underworld)', categoryCode: 'TOOL' },
        { itemId: 5455, internalName: 'DontHurtComboBookInactive', name: 'Guide to Peaceful Coexistence (Inactive)', categoryCode: 'TOOL' },
        { itemId: 5737, internalName: 'ChippysWingsInactive', name: "Chippy's Cloak (Inactive)", categoryCode: 'ACCESSORY' }
      ]
    }
  }));

  fs.writeFileSync(path.join(rawDir, 'finwings.latest.json'), JSON.stringify({
    itemInternalName: 'FinWings',
    itemName: 'Fin Wings',
    pageTitle: 'Wings',
    wikitext: '{{item infobox|auto=2494}}',
    html: '<table><tr><td>Fin Wings<span>Internal <a>Item ID</a>: 2494</span></td><td>Quest reward from Angler</td><td>1/70 chance for every quest after 10th quest in Hardmode only.</td></tr></table>'
  }));
  fs.writeFileSync(path.join(rawDir, 'minecartmech.latest.json'), JSON.stringify({
    itemInternalName: 'MinecartMech',
    itemName: 'Mechanical Cart',
    pageTitle: 'Minecarts',
    wikitext: '{{item infobox|auto=3353|col:source=Obtained by using a [[Minecart Upgrade Kit]].|col:notes=* [[Expert Mode]]-exclusive.}}',
    html: '<table><tr><td>Mechanical Cart<span>Internal <a>Item ID</a>: 3353</span></td><td>Obtained by using a Minecart Upgrade Kit.</td><td>Expert Mode-exclusive.</td></tr></table>'
  }));
  fs.writeFileSync(path.join(rawDir, 'yoraiz0rwings.latest.json'), JSON.stringify({
    itemInternalName: 'Yoraiz0rWings',
    itemName: "Yoraiz0r's Spell",
    pageTitle: "Yoraiz0r's Spell",
    wikitext: '{{item infobox|auto=3580|tags=Developer / wings / hardmode / bag loot}}',
    html: '<p>Yoraiz0r\'s Spell is a developer item. Developer items are obtained from Hardmode Treasure Bags, except Queen Slime.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'dd2energycrystal.latest.json'), JSON.stringify({
    itemInternalName: 'DD2EnergyCrystal',
    itemName: 'Etherian Mana',
    pageTitle: 'Etherian Mana',
    wikitext: '{{item infobox|auto=3822|tags=drop}}',
    html: '<p>Etherian Mana is used to summon Tavernkeep sentries during the Old One\'s Army event, and is dropped by all of the event\'s enemies.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'goldenchest.latest.json'), JSON.stringify({
    itemInternalName: 'GoldenChest',
    itemName: 'Golden Chest',
    pageTitle: 'Chests',
    wikitext: '{{item infobox|auto=3885|tags=Plunder}}',
    html: '<table><tr><td>Golden Chest<span>Internal <a>Item ID</a>: 3885</span></td><td>Pirate Invasion</td></tr></table>'
  }));
  fs.writeFileSync(path.join(rawDir, 'skeletonbow.latest.json'), JSON.stringify({
    itemInternalName: 'SkeletonBow',
    itemName: 'Skull Bow',
    pageTitle: 'Skull Bow',
    wikitext: '{{item infobox|auto=4058|tags=unobtainable}}',
    html: '<p>The Skull Bow is an unobtainable bow.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'fishminecart.latest.json'), JSON.stringify({
    itemInternalName: 'FishMinecart',
    itemName: 'Minecarp',
    pageTitle: 'Minecarts',
    wikitext: '{{item infobox|auto=4067|col:source=Received as a quest reward from the [[Angler]].|col:notes=* Does not slow down in water.}}',
    html: '<table><tr><td>Minecarp<span>Internal <a>Item ID</a>: 4067</span></td><td>Received as a quest reward from the Angler.</td></tr></table>'
  }));
  fs.writeFileSync(path.join(rawDir, 'lavafishbowl.latest.json'), JSON.stringify({
    itemInternalName: 'LavaFishbowl',
    itemName: 'Lava Serpent Bowl',
    pageTitle: 'Fish Bowls',
    wikitext: '{{item infobox|auto=4880|tags=bag loot}}',
    html: '<p>The Lava Serpent Bowl has a 39/200 (19.5%) chance of being found inside Obsidian Crates and Hellstone Crates.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'teleportationpylonunderground.latest.json'), JSON.stringify({
    itemInternalName: 'TeleportationPylonUnderground',
    itemName: 'Cavern Pylon',
    pageTitle: 'Pylons',
    wikitext: '{{item infobox|auto=4917|tags=vendor|col:usable=When below the surface (including [[the Underworld]]).}}',
    html: '<table><tr><td>Cavern Pylon<span>Internal <a>Item ID</a>: 4917</span></td><td>10 GC</td><td>When below the surface (including the Underworld).</td></tr></table>'
  }));
  fs.writeFileSync(path.join(rawDir, 'capricornlegs.latest.json'), JSON.stringify({
    itemInternalName: 'CapricornLegs',
    itemName: 'Capricorn Hooves',
    pageTitle: 'Capricorn set',
    wikitext: '{{item infobox|auto=5059}}',
    html: '<p>The leggings of this vanity have the unique feature of being able to switch from tail to legs and vice-versa via the Open / Activate key when they are not equipped.</p><table><tr><td>Capricorn Tail</td><td>Silk 20 Fallen Star 5 Silver Dye</td><td>Loom</td></tr></table>'
  }));
  fs.writeFileSync(path.join(rawDir, 'closedvoidbag.latest.json'), JSON.stringify({
    itemInternalName: 'ClosedVoidBag',
    itemName: 'Closed Void Bag',
    pageTitle: 'Void Bag',
    wikitext: '{{item infobox|auto=5325}}',
    html: '<p>Pressing Open / Activate on the Void Bag item in the inventory turns it into the Closed Void Bag. Pressing the button again opens the Void Bag again.</p>'
  }));
  const shellphonePayload = JSON.stringify({
    itemInternalName: 'ShellphoneSpawn',
    itemName: 'Shellphone (Spawn)',
    pageTitle: 'Shellphone',
    wikitext: '{{item infobox|auto=5359}}{{item infobox|auto=5360}}{{item infobox|auto=5361}}{{recipes|result=Shellphone}}',
    html: '<p>The Shellphone is an informational item and tool that combines the functions of the Cell Phone, Magic Conch, and Demon Conch.</p><table><tr><td>Shellphone (Spawn)<span>Internal <a>Item ID</a>: 5359</span></td><td>Right click to toggle destination</td></tr><tr><td>Shellphone (Ocean)<span>Internal <a>Item ID</a>: 5360</span></td><td>Right click to toggle destination</td></tr><tr><td>Shellphone (Underworld)<span>Internal <a>Item ID</a>: 5361</span></td><td>Right click to toggle destination</td></tr></table>'
  });
  fs.writeFileSync(path.join(rawDir, 'shellphonespawn.latest.json'), shellphonePayload);
  fs.writeFileSync(path.join(rawDir, 'shellphoneocean.latest.json'), shellphonePayload.replace('ShellphoneSpawn', 'ShellphoneOcean').replace('Shellphone (Spawn)', 'Shellphone (Ocean)'));
  fs.writeFileSync(path.join(rawDir, 'shellphonehell.latest.json'), shellphonePayload.replace('ShellphoneSpawn', 'ShellphoneHell').replace('Shellphone (Spawn)', 'Shellphone (Underworld)'));
  fs.writeFileSync(path.join(rawDir, 'donthurtcombobookinactive.latest.json'), JSON.stringify({
    itemInternalName: 'DontHurtComboBookInactive',
    itemName: 'Guide to Peaceful Coexistence (Inactive)',
    pageTitle: 'Guide to Peaceful Coexistence',
    wikitext: '{{item infobox|auto=5455}}',
    html: '<p>Pressing Open / Activate on the Guide to Peaceful Coexistence in the player\'s inventory or hotbar will toggle it between the Guide to Peaceful Coexistence and the Guide to Peaceful Coexistence (Inactive), disabling its functions.</p>'
  }));
  fs.writeFileSync(path.join(rawDir, 'chippyswingsinactive.latest.json'), JSON.stringify({
    itemInternalName: 'ChippysWingsInactive',
    itemName: "Chippy's Cloak (Inactive)",
    pageTitle: 'Wings',
    wikitext: '{{item infobox|auto=5737}}',
    html: '<p>Inactive Wings can be obtained in pre-Hardmode. The inactive version of Chippy\'s Cloak is dropped by Skeletron\'s Red Hat variant.</p>'
  }));

  const report = auditRemainingSourceRawPageCandidates({
    closureReportPath: reportPath,
    rawItemPageDir: rawDir,
    npcLookup: new Map([['betsy', { boss: true }]])
  });
  const byName = new Map(report.candidates.map((candidate) => [candidate.internalName, candidate]));

  assert.equal(report.summary.hardBlockedRows, 0);
  assert.deepEqual(byName.get('FinWings').extractedSources.map((source) => [source.sourceType, source.sourceRefName, source.chanceText]), [
    ['quest_reward', 'Angler', '1/70']
  ]);
  assert.deepEqual(byName.get('MinecartMech').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName]), [
    ['unknown', 'item', 'Minecart Upgrade Kit']
  ]);
  assert.equal(byName.get('Yoraiz0rWings').extractedSources[0].sourceRefName, 'Hardmode Treasure Bag (except Queen Slime)');
  assert.deepEqual(byName.get('DD2EnergyCrystal').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName]), [
    ['drop', 'npc_group', "Old One's Army enemies"]
  ]);
  assert.deepEqual(byName.get('GoldenChest').extractedSources.map((source) => [source.sourceType, source.sourceRefName]), [
    ['drop', 'Pirate Invasion']
  ]);
  assert.equal(byName.get('SkeletonBow').extractedSources[0].sourceRefName, 'unobtainable');
  assert.deepEqual(byName.get('FishMinecart').extractedSources.map((source) => [source.sourceType, source.sourceRefName]), [
    ['quest_reward', 'Angler']
  ]);
  assert.deepEqual(byName.get('LavaFishbowl').extractedSources.map((source) => [source.sourceType, source.sourceRefName, source.chanceText]), [
    ['crate', 'Obsidian Crate', '39/200 (19.5%)'],
    ['crate', 'Hellstone Crate', '39/200 (19.5%)']
  ]);
  assert.deepEqual(byName.get('TeleportationPylonUnderground').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName]), [
    ['shop', 'npc_group', 'eligible NPC vendors selling pylons']
  ]);
  assert.equal(byName.get('CapricornLegs').extractedSources[0].sourceRefName, 'Capricorn Tail');
  assert.equal(byName.get('ClosedVoidBag').extractedSources[0].sourceRefName, 'Void Bag');
  assert.equal(byName.get('ShellphoneSpawn').extractedSources[0].sourceRefName, 'Shellphone');
  assert.equal(byName.get('ShellphoneOcean').extractedSources[0].sourceRefName, 'Shellphone');
  assert.equal(byName.get('ShellphoneHell').extractedSources[0].sourceRefName, 'Shellphone');
  assert.equal(byName.get('DontHurtComboBookInactive').extractedSources[0].sourceRefName, 'Guide to Peaceful Coexistence');
  assert.deepEqual(byName.get('ChippysWingsInactive').extractedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName]), [
    ['drop', 'boss_group', "Skeletron's Red Hat variant"]
  ]);
});
