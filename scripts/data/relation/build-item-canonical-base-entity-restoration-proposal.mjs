import {
  buildItemCanonicalBaseEntityRestorationProposal,
} from './item-canonical-base-entity-restoration-contract.mjs';

export async function runItemCanonicalBaseEntityRestorationProposal(options = {}, dependencies = {}) {
  const openReadOnlyConnection = dependencies.openReadOnlyConnection;
  const readSnapshot = dependencies.readSnapshot;
  if (typeof openReadOnlyConnection !== 'function' || typeof readSnapshot !== 'function') {
    throw new Error('read-only restoration proposal dependencies are required');
  }
  const connection = await openReadOnlyConnection();
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const snapshot = await readSnapshot(connection, { target: options.target });
    return buildItemCanonicalBaseEntityRestorationProposal({ ...options, ...snapshot });
  } finally {
    await connection.rollback?.();
    await connection.end?.();
  }
}
