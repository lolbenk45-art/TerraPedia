import test from 'node:test';
import assert from 'node:assert/strict';

import { matchNpcBridgeRecord } from '../src/bridge/npc-bridge-match.mjs';

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
