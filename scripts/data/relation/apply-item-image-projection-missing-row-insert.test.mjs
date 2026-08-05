import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runItemImageProjectionMissingRowInsertApply,
} from './apply-item-image-projection-missing-row-insert.mjs';

test('missing-row apply executes the frozen five-row proposal and emits an applied completed result', async () => {
  const writes = [];
  const input = inputContract();
  const result = await runItemImageProjectionMissingRowInsertApply({
    inputContract: input,
    inputContractPath: 'reports/authorization/canonical/item-image-projection-missing-row-insert/test/input.json',
    apply: true,
    now: '2026-08-05T01:30:00.000Z',
  }, {
    connect: async () => ({ end: async () => {} }),
    consumeDispatchPermit: async () => {},
    executeTransaction: async () => ({ insertedRowCount: 5 }),
    writeResult: async ({ result: value }) => writes.push(value),
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.apply, true);
  assert.equal(result.insertedRowCount, 5);
  assert.equal(writes.length, 1);
});

test('missing-row apply rejects a non-five-row input before connecting', async () => {
  let connected = false;
  const input = inputContract();
  input.insertedRowCount = 4;

  await assert.rejects(
    runItemImageProjectionMissingRowInsertApply({
      inputContract: input,
      inputContractPath: 'reports/authorization/canonical/item-image-projection-missing-row-insert/test/input.json',
      apply: true,
    }, {
      connect: async () => { connected = true; },
    }),
    /five|count/i,
  );
  assert.equal(connected, false);
});

function inputContract() {
  const keys = ['AntlionEggs', 'BoneWhip', 'RoninShirt', 'TVHeadPants', 'TimelessTravelerHood'];
  return {
    operationId: 'canonical-item-image-projection-missing-row-insert',
    attemptId: 'test',
    attemptRoot: 'reports/authorization/canonical/item-image-projection-missing-row-insert/test',
    keys,
    insertedRowCount: 5,
    projectionRows: keys.map((internalName, index) => ({
      id: index + 1,
      internalName,
      image: `/terrapedia-images/items/${internalName}.png`,
    })),
  };
}
