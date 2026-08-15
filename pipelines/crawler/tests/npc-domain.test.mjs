import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildNpcNormalizedLight } from '../src/domains/npc-domain.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, 'fixtures', 'npc', 'goblin-tinkerer.fixture.json');
const medusaFixturePath = path.join(__dirname, 'fixtures', 'npc', 'medusa.fixture.json');

test('buildNpcNormalizedLight assembles summary, profile, shop, happiness, relationships, and contentBlocks', async () => {
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  const record = buildNpcNormalizedLight(fixture);

  assert.equal(record.display.name, 'Goblin Tinkerer');
  assert.equal(record.summary.leadText, 'Goblin Tinkerer is a helpful NPC who can reforge items.');
  assert.equal(record.profile.kind, 'NPC');
  assert.deepEqual(record.shop.items.map((item) => item.name), ['Rocket Boots']);
  assert.equal(record.happiness.sourceTemplatePresent, true);
  assert.ok(record.contentBlocks.dialogue.includes('Line one'));
});

test('buildNpcNormalizedLight preserves normalized shop, loot, projectile, and backfill evidence', () => {
  const record = buildNpcNormalizedLight({
    entityId: 'zombie',
    pageTitle: 'Zombie',
    pageDescription: 'Zombie is a common enemy.',
    sourceMetadata: {
      apiUrl: 'https://terraria.wiki.gg/zh/api.php',
      pageId: 123
    },
    revisionText: [
      '{{npc infobox',
      '| type = Enemy',
      '| id projectile = 24',
      '}}',
      "'''Zombie''' is a common enemy.",
      '',
      '{{shop|{{shop row|Lesser Healing Potion|value=3 silver|Always}}}}',
      '',
      '== Drops ==',
      '{| class="terraria drop"',
      '! Item !! Quantity !! Chance !! Condition',
      '|-',
      '| [[Shackle]] || 1 || 2% || Expert Mode',
      '|}'
    ].join('\n')
  });

  assert.equal(record.combat.projectileId, '24');
  assert.deepEqual(record.sourceMetadata, {
    apiUrl: 'https://terraria.wiki.gg/zh/api.php',
    pageId: 123
  });
  assert.deepEqual(record.shop.normalizedRows, [
    {
      relationType: 'shop',
      itemName: 'Lesser Healing Potion',
      priceText: '3 silver',
      conditionText: 'Always',
      npcInternalName: 'zombie',
      npcName: 'Zombie',
      sourceSection: 'shop',
      sourceRowIndex: 0,
      raw: {
        name: 'Lesser Healing Potion',
        valueText: '3 silver',
        availabilityNote: 'Always'
      }
    }
  ]);
  assert.deepEqual(record.loot, [
    {
      relationType: 'loot',
      itemName: 'Shackle',
      chanceText: '2%',
      quantityText: '1',
      conditionText: 'Expert Mode',
      npcInternalName: 'zombie',
      npcName: 'Zombie',
      sourceSection: 'drops',
      sourceRowIndex: 0,
      raw: {
        itemName: 'Shackle',
        quantityText: '1',
        chanceText: '2%',
        conditionText: 'Expert Mode',
        sourceSection: 'drops'
      }
    }
  ]);
  assert.deepEqual(record.backfillCandidates, []);
});

test('buildNpcNormalizedLight preserves source-infobox scoped loot from group pages', () => {
  const record = buildNpcNormalizedLight({
    entityId: 'mimics',
    pageTitle: 'Mimics',
    pageDescription: 'Mimics are enemies.',
    revisionText: [
      '{{npc infobox',
      '| auto = 473',
      '| name = Crimson Mimic',
      '| image = Crimson Mimic.gif',
      '| type = Enemy',
      '}}',
      '',
      '=== Drops ===',
      '{| class="terraria drop"',
      '! Item !! Quantity !! Chance',
      '|-',
      '| [[Life Drain]] || 1 || 20%',
      '|}',
      '',
      '{{npc infobox',
      '| auto = 474',
      '| name = Hallowed Mimic',
      '| image = Hallowed Mimic.gif',
      '| type = Enemy',
      '}}',
      '',
      '=== Drops ===',
      '{| class="terraria drop"',
      '! Item !! Quantity !! Chance',
      '|-',
      '| [[Flying Knife]] || 1 || 25%',
      '|}'
    ].join('\n')
  });

  assert.deepEqual(
    record.loot.map((row) => ({
      itemName: row.itemName,
      autoId: row.sourceInfobox?.autoId,
      name: row.sourceInfobox?.name
    })),
    [
      { itemName: 'Life Drain', autoId: '473', name: 'Crimson Mimic' },
      { itemName: 'Flying Knife', autoId: '474', name: 'Hallowed Mimic' }
    ]
  );
});

test('buildNpcNormalizedLight creates open backfill candidates when NPC item and projectile evidence is missing', () => {
  const record = buildNpcNormalizedLight({
    entityId: 'mystery-caster',
    pageTitle: 'Mystery Caster',
    pageDescription: 'Mystery Caster is an enemy with ranged attacks.',
    revisionText: [
      '{{npc infobox',
      '| type = Enemy',
      '| damage = 20',
      '}}',
      "'''Mystery Caster''' is an enemy.",
      '',
      '== Combat ==',
      'Mystery Caster fires a magic bolt at the player.'
    ].join('\n')
  });

  assert.equal(record.loot.length, 0);
  assert.equal(record.shop.normalizedRows.length, 0);
  assert.equal(record.backfillCandidates.length, 2);
  assert.deepEqual(
    record.backfillCandidates.map((candidate) => ({
      domain: candidate.domain,
      entityType: candidate.entityType,
      entityInternalName: candidate.entityInternalName,
      missingField: candidate.missingField,
      recommendedAction: candidate.recommendedAction,
      status: candidate.status
    })),
    [
      {
        domain: 'npc_item_relation',
        entityType: 'npc',
        entityInternalName: 'mystery-caster',
        missingField: 'loot',
        recommendedAction: 'crawl_npc_page',
        status: 'open'
      },
      {
        domain: 'npc_projectile_relation',
        entityType: 'npc',
        entityInternalName: 'mystery-caster',
        missingField: 'projectileId',
        recommendedAction: 'crawl_npc_page',
        status: 'open'
      }
    ]
  );
  assert.ok(record.backfillCandidates.every((candidate) => candidate.candidateKey.length === 64));
  assert.ok(record.backfillCandidates.every((candidate) => Array.isArray(candidate.evidenceJson)));
});

test('buildNpcNormalizedLight infers hostile npc quality fields for Medusa-style pages', async () => {
  const fixture = JSON.parse(await fs.readFile(medusaFixturePath, 'utf8'));
  const record = buildNpcNormalizedLight(fixture);

  assert.ok(record.summary.leadText.startsWith('Medusa is a [[Hardmode]] [[Enemies|enemy]]'));
  assert.ok(!record.summary.leadText.includes('[[File:'));
  assert.ok(!record.summary.leadText.includes('{{dablink|'));
  assert.equal(record.profile.kind, 'enemy');
  assert.equal(record.profile.boundVariantName, '');
  assert.equal(record.combat.baseDamageText, '20 / {{expert|40}} / {{master|60}}');
  assert.deepEqual(record.buffInflictions, [
    {
      buffName: 'Stoned',
      durationText: '{{duration|rawseconds=1–4}}',
      rawBuffText: 'Stoned',
      sourceField: 'debuff',
      durationField: 'debuffduration',
      sourceSection: 'infobox'
    }
  ]);
});

test('buildNpcNormalizedLight normalizes town pet alias pages to standardized display names', () => {
  const record = buildNpcNormalizedLight({
    entityId: 'town-cat',
    pageTitle: 'Town Cat',
    pageDescription: 'A town pet.',
    revisionText: "'''Town Cat''' is a town pet."
  });

  assert.equal(record.source.pageTitle, 'Town Cat');
  assert.equal(record.display.name, 'Cat');
});

test('buildNpcNormalizedLight extracts town slime group members from the group page', () => {
  const record = buildNpcNormalizedLight({
    entityId: 'town-slimes',
    pageTitle: 'Town Slimes',
    pageDescription: 'Town Slimes are a type of town pet.',
    revisionText: [
      '{{npc infobox',
      '| auto = 670',
      '| name = Town Slimes',
      '| type = NPC / Slime',
      '}}',
      '',
      "'''Town Slimes''' are a type of [[town pet]].",
      '',
      '== Types ==',
      '{| class="terraria lined"',
      '|-',
      '| [[File:Portrait SlimeSquire.png|50px]]',
      '| {{npc infobox|auto=684|type=NPC}}',
      '| Spawns from dropping a [[Copper Helmet]] or a [[Copper Shortsword]] on a [[slime]] enemy.',
      '| [[File:Map Icon Squire Slime.png|link=]]',
      '|-',
      '| [[File:Portrait SlimeClumsy.png|50px]]',
      '| {{npc infobox|auto=680|type=NPC}}',
      '| Spawns from breaking the balloon of a [[Clumsy Balloon Slime]].',
      '| [[File:Map Icon Clumsy Slime.png|link=]]',
      '|}'
    ].join('\n')
  });

  assert.deepEqual(
    record.groupMembers,
    [
      {
        entityId: 'squire-slime',
        name: 'Squire Slime',
        pageTitle: 'Town Slimes',
        moveInCondition: 'Spawns from dropping a [[Copper Helmet]] or a [[Copper Shortsword]] on a [[slime]] enemy.'
      },
      {
        entityId: 'clumsy-slime',
        name: 'Clumsy Slime',
        pageTitle: 'Town Slimes',
        moveInCondition: 'Spawns from breaking the balloon of a [[Clumsy Balloon Slime]].'
      }
    ]
  );
});
