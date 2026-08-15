import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAutomaticRunId,
  runAutomaticDomainOperation,
  runImportThenAcknowledge,
} from './run-automatic-domain-operation.mjs';

test('activation is checked before source or progress work', async () => {
  const events = [];
  await assert.rejects(
    runAutomaticDomainOperation({
      domain: 'npcs',
      loadActivation: async () => { events.push('activation'); return null; },
      runSource: async () => events.push('source'),
      freezeInput: async () => events.push('freeze'),
      executeImport: async () => events.push('import'),
      acknowledgeSource: async () => events.push('acknowledge'),
    }),
    /no fresh scheduler activation/,
  );
  assert.deepEqual(events, ['activation']);
});

test('NPC automatic operation runs source, frozen input, and governed apply in order', async () => {
  const events = [];
  const result = await runAutomaticDomainOperation({
    domain: 'npcs',
    loadActivation: async () => { events.push('activation'); return activation(); },
    runSource: async () => { events.push('source'); return { sourceFingerprint: 'sha256:source' }; },
    freezeInput: async () => { events.push('freeze'); return { path: 'frozen.json', sha256: 'sha256:frozen' }; },
    executeImport: async (context) => { events.push(`import:${context.databaseMode}`); return { status: 'completed' }; },
    acknowledgeSource: async () => events.push('acknowledge'),
  });
  assert.deepEqual(events, ['activation', 'source', 'freeze', 'import:ACTIVATION_GATED_APPLY', 'acknowledge']);
  assert.equal(result.status, 'completed');
});

test('automatic operation does not acknowledge a source when import fails', async () => {
  const events = [];
  await assert.rejects(
    runAutomaticDomainOperation({
      domain: 'npcs',
      loadActivation: async () => activation(),
      runSource: async () => ({ sourceFingerprint: 'sha256:source' }),
      freezeInput: async () => ({ path: 'frozen.json', sha256: 'sha256:frozen' }),
      executeImport: async () => { events.push('import'); throw new Error('controlled import failure'); },
      acknowledgeSource: async () => events.push('acknowledge'),
    }),
    /controlled import failure/,
  );
  assert.deepEqual(events, ['import']);
});

test('Items automatic operation remains a dry-run after source and freeze', async () => {
  let received;
  await runAutomaticDomainOperation({
    domain: 'items',
    loadActivation: async () => activation(),
    runSource: async () => ({ sourceFingerprint: 'sha256:source' }),
    freezeInput: async () => ({ path: 'frozen.json', sha256: 'sha256:frozen' }),
    executeImport: async (context) => { received = context; return { status: 'completed' }; },
    acknowledgeSource: async () => {},
  });
  assert.equal(received.databaseMode, 'DRY_RUN');
  assert.deepEqual(received.ownedTables, []);
});

test('committed automatic run reconciliation only retries acknowledgement', async () => {
  const events = [];
  const result = await runImportThenAcknowledge({
    alreadyCommitted: true,
    executeImport: async () => { events.push('import'); return { status: 'completed' }; },
    acknowledgeSource: async () => events.push('acknowledge'),
  });
  assert.deepEqual(events, ['acknowledge']);
  assert.equal(result.reconciledCommittedRun, true);
});

test('automatic run identity is stable for the same domain and source fingerprint', () => {
  const first = buildAutomaticRunId('npcs', 'sha256:source-a');
  assert.equal(first, buildAutomaticRunId('npcs', 'sha256:source-a'));
  assert.notEqual(first, buildAutomaticRunId('npcs', 'sha256:source-b'));
  assert.notEqual(first, buildAutomaticRunId('buffs', 'sha256:source-a'));
});

function activation() {
  return {
    decisionIdentity: 'activation-1',
    packetHash: `sha256:${'a'.repeat(64)}`,
    policySetHash: `sha256:${'b'.repeat(64)}`,
  };
}
