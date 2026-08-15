import { createHash } from 'node:crypto';

import { requireAutoDomainOperation } from './automatic-domain-operation-contract.mjs';

export async function runAutomaticDomainOperation({
  domain,
  loadActivation,
  runSource,
  freezeInput,
  executeImport,
  acknowledgeSource,
} = {}) {
  const config = requireAutoDomainOperation(domain);
  requireFunction(loadActivation, 'loadActivation');
  requireFunction(runSource, 'runSource');
  requireFunction(freezeInput, 'freezeInput');
  requireFunction(executeImport, 'executeImport');
  requireFunction(acknowledgeSource, 'acknowledgeSource');

  const activation = await loadActivation(domain);
  if (!activation) throw new Error(`no fresh scheduler activation for automatic domain: ${domain}`);
  const source = await runSource({ domain, config, activation });
  const frozenInput = await freezeInput({ domain, config, activation, source });
  return runImportThenAcknowledge({
    executeImport: () => executeImport({
      domain,
      operationId: config.operationId,
      databaseMode: config.databaseMode,
      ownedTables: config.ownedTables,
      activation,
      source,
      frozenInput,
    }),
    acknowledgeSource: ({ result }) => acknowledgeSource({
      domain, config, activation, source, frozenInput, result,
    }),
  });
}

export async function runImportThenAcknowledge({
  alreadyCommitted = false,
  executeImport,
  acknowledgeSource,
} = {}) {
  requireFunction(executeImport, 'executeImport');
  requireFunction(acknowledgeSource, 'acknowledgeSource');
  const result = alreadyCommitted
    ? Object.freeze({ status: 'completed', reconciledCommittedRun: true })
    : await executeImport();
  await acknowledgeSource({ result });
  return result;
}

export function buildAutomaticRunId(domain, sourceFingerprint) {
  const identity = `${String(domain ?? '').trim()}\n${String(sourceFingerprint ?? '').trim()}`;
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 32);
  return `${String(domain ?? '').trim()}_l1_auto_${digest}`;
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} is required`);
}
