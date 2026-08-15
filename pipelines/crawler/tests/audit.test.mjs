import test from 'node:test';
import assert from 'node:assert/strict';

import { auditNpcRichClosure } from '../src/phases/audit.mjs';

test('auditNpcRichClosure returns pass when summary and at least one structured signal exist', () => {
  const result = auditNpcRichClosure({
    summary: { leadText: 'Goblin Tinkerer is a helpful NPC.' },
    profile: { environment: ['Cavern'] },
    shop: { items: [] },
    contentBlocks: { dialogue: '', history: '', tips: '' }
  });

  assert.deepEqual(result, {
    status: 'pass',
    reasons: []
  });
});

test('auditNpcRichClosure returns warn when happiness or shop template is present but empty', () => {
  const result = auditNpcRichClosure({
    summary: { leadText: 'Goblin Tinkerer is a helpful NPC.' },
    profile: { environment: [] },
    shop: { items: [] },
    happiness: { sourceTemplatePresent: true, notes: [] },
    contentBlocks: { dialogue: '', history: '', tips: '' },
    sourceSignals: { shopTemplatePresent: true, infoboxPresent: true }
  });

  assert.equal(result.status, 'warn');
  assert.ok(result.reasons.length > 0);
});
