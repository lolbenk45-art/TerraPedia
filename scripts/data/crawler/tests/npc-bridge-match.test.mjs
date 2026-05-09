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
