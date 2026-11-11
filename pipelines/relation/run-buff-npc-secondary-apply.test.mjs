import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUFF_NPC_SECONDARY_OPERATION_ID,
  parseBuffNpcSecondaryArgs,
} from './run-buff-npc-secondary-apply.mjs';

test('NPC secondary prepare accepts an explicit candidate path', () => {
  assert.deepEqual(parseBuffNpcSecondaryArgs([
    `--operation-id=${BUFF_NPC_SECONDARY_OPERATION_ID}`,
    '--result-label=identity-scope-94',
    '--prepare=true',
    '--candidate-path=.local/tmp/buff-npc-secondary-candidate-20261006-v4.json',
  ]), {
    operationId: BUFF_NPC_SECONDARY_OPERATION_ID,
    resultLabel: 'identity-scope-94',
    candidatePath: '.local/tmp/buff-npc-secondary-candidate-20261006-v4.json',
    apply: false,
  });
});

test('NPC secondary apply rejects a candidate path override', () => {
  assert.throws(() => parseBuffNpcSecondaryArgs([
    `--operation-id=${BUFF_NPC_SECONDARY_OPERATION_ID}`,
    '--result-label=identity-scope-94',
    '--apply=true',
    '--candidate-path=.local/tmp/other.json',
  ]), /candidate.*path|prepare/i);
});
