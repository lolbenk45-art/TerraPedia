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

test('buildNpcNormalizedLight infers hostile npc quality fields for Medusa-style pages', async () => {
  const fixture = JSON.parse(await fs.readFile(medusaFixturePath, 'utf8'));
  const record = buildNpcNormalizedLight(fixture);

  assert.ok(record.summary.leadText.startsWith('Medusa is a [[Hardmode]] [[Enemies|enemy]]'));
  assert.ok(!record.summary.leadText.includes('[[File:'));
  assert.ok(!record.summary.leadText.includes('{{dablink|'));
  assert.equal(record.profile.kind, 'enemy');
  assert.equal(record.profile.boundVariantName, '');
  assert.equal(record.combat.baseDamageText, '20 / {{expert|40}} / {{master|60}}');
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
