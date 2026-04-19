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
