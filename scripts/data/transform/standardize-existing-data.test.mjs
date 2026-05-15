import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

test('standardize-existing-data carries item equipment slots into standardized records', () => {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-standardize-source-'));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-standardize-output-'));
  writeJson(path.join(sourceDir, 'normalized', 'items.wiki.json'), {
    source: 'terraria.wiki.gg:Module:Iteminfo/data',
    sourceApi: 'https://terraria.wiki.gg/api.php',
    sourcePageTitle: 'Module:Iteminfo/data',
    sourceRevisionTimestamp: '2026-04-26T00:00:00.000Z',
    fetchedAt: '2026-04-27T00:00:00.000Z',
    wikiVersion: '1.4.4.9',
    moduleGeneratedAt: '2026-04-26',
    generatedAt: '2026-04-27T00:00:00.000Z',
    items: [
      {
        name: 'Wood Helmet',
        internalName: 'WoodHelmet',
        categoryCode: 'HELMET',
        equipment: {
          headSlot: 52,
          bodySlot: null,
          legSlot: null
        },
        defense: 1,
        stackSize: 1,
        isStackable: false,
        status: 1
      }
    ]
  });

  const result = spawnSync(
    process.execPath,
    ['scripts/data/transform/standardize-existing-data.mjs'],
    {
      cwd: path.resolve(import.meta.dirname, '..', '..', '..'),
      env: {
        ...process.env,
        TERRAPEDIA_SOURCE_DATA_DIR: sourceDir,
        TERRAPEDIA_STANDARDIZED_OUTPUT_DIR: outputDir
      },
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(path.join(outputDir, 'items.standardized.json'), 'utf8'));
  assert.equal(output.records.length, 1);
  assert.deepEqual(output.records[0].equipment, {
    headSlot: 52,
    bodySlot: null,
    legSlot: null
  });
});

test('standardize-existing-data preserves structured buff page evidence', () => {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-standardize-source-'));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-standardize-output-'));
  writeJson(path.join(sourceDir, 'raw', 'wiki', 'template__getbuffinfo.parsed.latest.json'), {
    source: 'terraria.wiki.gg:Template:GetBuffInfo',
    sourceApi: 'https://terraria.wiki.gg/api.php',
    sourcePageTitle: 'Template:GetBuffInfo',
    sourceRevisionTimestamp: '2026-05-15T00:00:00.000Z',
    fetchedAt: '2026-05-15T00:00:00.000Z',
    langs: ['en', 'zh'],
    totalBuffs: 1,
    buffs: [
      {
        id: 39,
        internalName: 'CursedInferno',
        englishName: 'Cursed Inferno',
        type: 'debuff',
        image: 'CursedInferno.png',
        localized: {
          zh: { name: '诅咒狱火', tooltip: '正在损失生命值' },
          en: { name: 'Cursed Inferno', tooltip: 'Losing life' }
        },
        sourceItemCount: 1,
        sourceItems: [{
          itemId: 47,
          internalName: 'CursedArrow',
          name: 'Cursed Arrow',
          nameZh: '诅咒箭',
          pageTitle: 'Cursed Arrow',
          sourceSection: '来自玩家',
          sourceProvider: 'terraria.wiki.gg',
          sourceRevisionTimestamp: '2026-05-15T00:00:00.000Z',
          resolveStatus: 'resolved'
        }],
        inflictingNpcs: [{ npcId: 101, internalName: 'Clinger', name: '爬藤怪' }],
        immuneNpcCount: 1,
        immuneNpcs: [{ npcId: 68, internalName: 'DungeonGuardian', name: 'Dungeon Guardian' }],
        immuneNpcSample: [{ npcId: 68, internalName: 'DungeonGuardian', name: 'Dungeon Guardian' }],
        sourceEvidence: {
          provider: 'terraria.wiki.gg',
          pageTitle: '诅咒狱火',
          sourceSection: '原因',
          sourceProvider: 'terraria.wiki.gg',
          sourceRevisionTimestamp: '2026-05-15T00:00:00.000Z',
          sectionAnchors: ['原因', '来自玩家', '来自敌怪', '免疫的_NPC'],
          parseStatus: 'parse_incomplete',
          unresolvedFacts: [
            {
              type: 'source_item',
              pageTitle: 'Unknown Wand',
              name: 'Unknown Wand',
              nameZh: '未知法杖',
              sourceSection: '来自玩家',
              sourceProvider: 'terraria.wiki.gg',
              resolveStatus: 'unresolved'
            }
          ]
        }
      }
    ]
  });

  const result = spawnSync(
    process.execPath,
    ['scripts/data/transform/standardize-existing-data.mjs'],
    {
      cwd: path.resolve(import.meta.dirname, '..', '..', '..'),
      env: {
        ...process.env,
        TERRAPEDIA_SOURCE_DATA_DIR: sourceDir,
        TERRAPEDIA_STANDARDIZED_OUTPUT_DIR: outputDir
      },
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(fs.readFileSync(path.join(outputDir, 'buffs.standardized.json'), 'utf8'));
  assert.equal(output.records.length, 1);
  assert.deepEqual(output.records[0].sourceItems, [
    {
      internalName: 'CursedArrow',
      itemId: 47,
      name: 'Cursed Arrow',
      nameZh: '诅咒箭',
      pageTitle: 'Cursed Arrow',
      resolveStatus: 'resolved',
      sourceProvider: 'terraria.wiki.gg',
      sourceRevisionTimestamp: '2026-05-15T00:00:00.000Z',
      sourceSection: '来自玩家'
    }
  ]);
  assert.deepEqual(output.records[0].inflictingNpcs, [
    { internalName: 'Clinger', name: '爬藤怪', npcId: 101 }
  ]);
  assert.deepEqual(output.records[0].immuneNpcs, [
    { internalName: 'DungeonGuardian', name: 'Dungeon Guardian', npcId: 68 }
  ]);
  assert.deepEqual(output.records[0].sourceEvidence, {
    pageTitle: '诅咒狱火',
    parseStatus: 'parse_incomplete',
    provider: 'terraria.wiki.gg',
    sectionAnchors: ['原因', '来自玩家', '来自敌怪', '免疫的_NPC'],
    sourceProvider: 'terraria.wiki.gg',
    sourceRevisionTimestamp: '2026-05-15T00:00:00.000Z',
    sourceSection: '原因',
    unresolvedFacts: [
      {
        name: 'Unknown Wand',
        nameZh: '未知法杖',
        pageTitle: 'Unknown Wand',
        resolveStatus: 'unresolved',
        sourceProvider: 'terraria.wiki.gg',
        sourceSection: '来自玩家',
        type: 'source_item'
      }
    ]
  });
});
