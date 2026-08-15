import test from 'node:test';
import assert from 'node:assert/strict';

import { matchNpcBridgeRecord, matchNpcBridgeRecords } from '../src/bridge/npc-bridge-match.mjs';

test('matchNpcBridgeRecord matches by exact internalName first', () => {
  const match = matchNpcBridgeRecord({
    crawlerRecord: {
      entityId: 'medusa',
      display: { name: 'Medusa' },
      source: { pageTitle: 'Medusa' }
    },
    standardizedRecords: [
      { id: 480, internalName: 'Medusa', name: 'Medusa' }
    ]
  });

  assert.equal(match.reason, 'internalName');
  assert.equal(match.record.internalName, 'Medusa');
});

test('matchNpcBridgeRecord matches Goblin Tinkerer deterministically without a miss', () => {
  const match = matchNpcBridgeRecord({
    crawlerRecord: {
      entityId: 'goblin-tinkerer',
      display: { name: 'Goblin Tinkerer' },
      source: { pageTitle: 'Goblin Tinkerer' }
    },
    standardizedRecords: [
      { id: 107, internalName: 'GoblinTinkerer', name: 'Goblin Tinkerer' }
    ]
  });

  assert.ok(['internalName', 'name'].includes(match.reason));
  assert.equal(match.record.internalName, 'GoblinTinkerer');
});

test('matchNpcBridgeRecord surfaces misses instead of silently succeeding', () => {
  const match = matchNpcBridgeRecord({
    crawlerRecord: {
      entityId: 'unknown-npc',
      display: { name: 'Unknown NPC' },
      source: { pageTitle: 'Unknown NPC' }
    },
    standardizedRecords: [
      { id: 107, internalName: 'GoblinTinkerer', name: 'Goblin Tinkerer' }
    ]
  });

  assert.equal(match.record, null);
  assert.equal(match.reason, 'unmatched');
});

test('matchNpcBridgeRecords maps group-page scoped infobox ids to standardized NPC ids', () => {
  const match = matchNpcBridgeRecords({
    crawlerRecord: {
      entityId: 'ghouls',
      display: { name: 'Ghouls' },
      source: { pageTitle: 'Ghouls' },
      buffInflictions: [
        { buffName: 'Cursed Inferno', sourceInfobox: { autoId: '525', image: 'Vile Ghoul.gif', name: '' } },
        { buffName: 'Ichor', sourceInfobox: { autoId: '526', image: 'Tainted Ghoul.gif', name: '' } },
        { buffName: 'Confused', sourceInfobox: { autoId: '527', image: 'Dreamer Ghoul.gif', name: '' } }
      ]
    },
    standardizedRecords: [
      { id: 525, internalName: 'DesertGhoulCorruption', name: 'Vile Ghoul' },
      { id: 526, internalName: 'DesertGhoulCrimson', name: 'Tainted Ghoul' },
      { id: 527, internalName: 'DesertGhoulHallow', name: 'Dreamer Ghoul' }
    ]
  });

  assert.equal(match.reason, 'sourceInfoboxAutoId');
  assert.deepEqual(
    match.records.map((record) => record.internalName),
    ['DesertGhoulCorruption', 'DesertGhoulCrimson', 'DesertGhoulHallow']
  );
});

test('matchNpcBridgeRecords keeps secondary exact image matches from multi-image infobox scope', () => {
  const match = matchNpcBridgeRecords({
    crawlerRecord: {
      entityId: 'antlion-charger',
      display: { name: 'Antlion Charger' },
      source: { pageTitle: 'Antlion Charger' },
      loot: [
        {
          itemName: 'Antlion Mandible',
          sourceInfobox: {
            autoId: '580',
            image: '[[File:Antlion Charger.gif|link=]] [[File:Giant Antlion Charger.gif|link=]]',
            name: 'Antlion Charger'
          }
        }
      ]
    },
    standardizedRecords: [
      { id: 580, internalName: 'WalkingAntlion', name: 'Antlion Charger', imageFileTitle: 'Antlion Charger.gif' },
      { id: 508, internalName: 'GiantWalkingAntlion', name: 'Giant Antlion Charger', imageFileTitle: 'Giant Antlion Charger.gif' }
    ]
  });

  assert.equal(match.reason, 'sourceInfoboxImageTitle');
  assert.deepEqual(
    match.records.map((record) => record.internalName),
    ['WalkingAntlion', 'GiantWalkingAntlion']
  );
});

test('matchNpcBridgeRecords maps no-loot source infobox ids to exact standardized NPC ids', () => {
  const match = matchNpcBridgeRecords({
    crawlerRecord: {
      entityId: 'owl',
      display: { name: 'Owl' },
      source: { pageTitle: 'Owl' },
      sourceInfoboxes: [
        { autoId: '689', image: 'Owl.png', name: '' }
      ],
      loot: []
    },
    standardizedRecords: [
      { id: 611, internalName: 'Owl', name: 'Owl', imageFileTitle: 'Owl.gif' },
      { id: 689, internalName: 'OwlMimic', name: 'Owl', imageFileTitle: 'Owl.png' }
    ]
  });

  assert.equal(match.reason, 'sourceInfoboxAutoId');
  assert.deepEqual(
    match.records.map((record) => record.internalName),
    ['OwlMimic']
  );
});

test('matchNpcBridgeRecords does not treat single-image source infobox auto-id conflicts as scoped image matches', () => {
  const match = matchNpcBridgeRecords({
    crawlerRecord: {
      entityId: 'wither-beast',
      display: { name: 'Wither Beast' },
      source: { pageTitle: 'Wither Beast' },
      sourceInfoboxes: [
        { autoId: '568', image: 'Wither Beast.gif', name: '' }
      ],
      loot: []
    },
    standardizedRecords: [
      { id: 569, internalName: 'DD2WitherBeastT3', name: 'Wither Beast', imageFileTitle: 'Wither Beast.gif' }
    ]
  });

  assert.equal(match.reason, 'name');
  assert.deepEqual(
    match.records.map((record) => record.internalName),
    ['DD2WitherBeastT3']
  );
});
