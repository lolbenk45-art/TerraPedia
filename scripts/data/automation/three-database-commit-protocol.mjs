import { DATABASE_ROLES } from './automation-database-contract.mjs';

const APPLY_TABLE = 'crawler_automation_apply';
const REQUIRED_MANIFEST_FIELDS = ['schemaVersion', 'runId', 'databases', 'serverIdentity'];

function requireField(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

async function requireVerification(work, context, required, label) {
  if (typeof work !== 'function') throw new Error(`${label} callback is required`);
  const result = await work(context);
  if (required.some((field) => result?.[field] !== true)) throw new Error(`${label} failed`);
  return result;
}

function assertManifest(manifest) {
  REQUIRED_MANIFEST_FIELDS.forEach((field) => {
    if (!manifest[field]) throw new Error(`manifest.${field} is required`);
  });

  DATABASE_ROLES.forEach((role) => {
    if (!manifest.databases[role]) {
      throw new Error(`manifest.databases.${role} is required`);
    }
  });

  return true;
}

function classifyServers(manifest) {
  const serverIds = new Set();
  DATABASE_ROLES.forEach((role) => {
    const db = manifest.databases[role];
    const serverId = `${db.host}:${db.port}:${db.serverUuid}`;
    serverIds.add(serverId);
  });

  return {
    isSameServer: serverIds.size === 1,
    serverCount: serverIds.size,
    serverIds: Array.from(serverIds)
  };
}

export function determineCommitProtocol(manifest) {
  assertManifest(manifest);
  const classification = classifyServers(manifest);

  if (classification.isSameServer) {
    return Object.freeze({
      protocol: 'same_server_single_transaction',
      serverCount: 1,
      requiresStaging: false,
      canUseSingleTransaction: true
    });
  }

  return Object.freeze({
    protocol: 'cross_server_staged',
    serverCount: classification.serverCount,
    requiresStaging: true,
    canUseSingleTransaction: false,
    stageOrder: ['maint', 'relation', 'local']
  });
}

export async function executeSameServerTransaction({
  connections,
  runId,
  bundleHash,
  policySetHash,
  decisionHash,
  approvalId,
  mode,
  beforeGenerations,
  applyWork,
  preCommitVerifyWork,
  postCommitVerifyWork
} = {}) {
  requireField(runId, 'runId');
  requireField(bundleHash, 'bundleHash');
  requireField(mode, 'mode');

  if (!connections || !connections.maint || !connections.relation || !connections.local) {
    throw new Error('all three database connections are required');
  }
  if (connections.maint !== connections.relation || connections.relation !== connections.local) {
    throw new Error('same-server protocol requires one shared transaction connection');
  }

  if (!beforeGenerations || typeof beforeGenerations !== 'object') {
    throw new Error('beforeGenerations is required');
  }

  if (typeof applyWork !== 'function') {
    throw new Error('applyWork callback is required');
  }

  // Use the local connection as the transaction coordinator
  const txnConnection = connections.local;
  let databaseCommitted = false;

  try {
    await txnConnection.query('START TRANSACTION');

    // Record the apply intent
    await txnConnection.query(
      `INSERT INTO ${APPLY_TABLE}
         (run_id, bundle_hash, policy_set_hash, decision_hash, approval_id, mode, status,
          before_generation_json, commit_protocol, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'STARTED', ?, 'same_server_single_transaction', NOW())`,
      [
        runId,
        bundleHash,
        policySetHash,
        decisionHash,
        approvalId,
        mode,
        JSON.stringify(beforeGenerations)
      ]
    );

    // Execute the apply work within the transaction
    const appliedGenerations = await applyWork({
      connections,
      runId,
      beforeGenerations,
      transactionActive: true
    });

    if (!appliedGenerations || typeof appliedGenerations !== 'object') {
      throw new Error('applyWork must return appliedGenerations object');
    }
    await requireVerification(preCommitVerifyWork, { connections, runId, appliedGenerations },
      ['relationIntegrity'], 'pre-commit verification');

    // Update the apply record with committed generations
    await txnConnection.query(
      `UPDATE ${APPLY_TABLE}
       SET committed_generation_json = ?, status = 'DB_COMMITTED'
       WHERE run_id = ? AND bundle_hash = ?`,
      [JSON.stringify(appliedGenerations), runId, bundleHash]
    );

    await txnConnection.query('COMMIT');
    databaseCommitted = true;

    try {
      await requireVerification(postCommitVerifyWork, { connections, runId, appliedGenerations },
        ['apiSamples', 'cacheVisible'], 'post-commit verification');
    } catch (error) {
      await txnConnection.query(
        `UPDATE ${APPLY_TABLE} SET status = 'POST_VERIFY_FAILED', completed_at = NOW()
         WHERE run_id = ? AND bundle_hash = ?`, [runId, bundleHash]
      );
      throw error;
    }
    await txnConnection.query(
      `UPDATE ${APPLY_TABLE} SET status = 'COMMITTED', completed_at = NOW()
       WHERE run_id = ? AND bundle_hash = ?`, [runId, bundleHash]
    );

    return Object.freeze({
      protocol: 'same_server_single_transaction',
      status: 'committed',
      appliedGenerations
    });

  } catch (error) {
    if (!databaseCommitted) {
      try {
        await txnConnection.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Transaction rollback failed:', rollbackError);
      }
    }

    throw error;
  }
}

export async function executeStagedProtocol({
  connections,
  runId,
  bundleHash,
  policySetHash,
  decisionHash,
  approvalId,
  mode,
  beforeGenerations,
  applyWork,
  preCommitVerifyWork,
  postCommitVerifyWork
} = {}) {
  requireField(runId, 'runId');
  requireField(bundleHash, 'bundleHash');
  requireField(mode, 'mode');

  if (!connections || !connections.maint || !connections.relation || !connections.local) {
    throw new Error('all three database connections are required');
  }

  if (!beforeGenerations || typeof beforeGenerations !== 'object') {
    throw new Error('beforeGenerations is required');
  }

  if (typeof applyWork !== 'function') {
    throw new Error('applyWork callback is required');
  }

  // Record the staged apply intent on the coordinator (local)
  await connections.local.query(
    `INSERT INTO ${APPLY_TABLE}
       (run_id, bundle_hash, policy_set_hash, decision_hash, approval_id, mode, status,
        before_generation_json, commit_protocol, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'STARTED', ?, 'cross_server_staged', NOW())`,
    [
      runId,
      bundleHash,
      policySetHash,
      decisionHash,
      approvalId,
      mode,
      JSON.stringify(beforeGenerations)
    ]
  );

  const committedStages = {};
  const stageOrder = ['maint', 'relation', 'local'];

  try {
    // Execute staged commits in order
    for (const stage of stageOrder) {
      const stageConnection = connections[stage];

      // Check if we should proceed with this stage
      const shouldProceed = await checkStagedPreconditions(
        connections.local,
        runId,
        bundleHash,
        stage,
        committedStages
      );

      if (!shouldProceed) {
        throw new Error(`staged precondition failed for ${stage}`);
      }

      // Execute the stage-specific apply work
      const stageGenerations = await applyWork({
        connections: { [stage]: stageConnection },
        runId,
        beforeGenerations: { [stage]: beforeGenerations[stage] },
        stage,
        transactionActive: false
      });

      // Record the stage commit marker
      await connections.local.query(
        `UPDATE ${APPLY_TABLE}
         SET status = ?, committed_generation_json = ?
         WHERE run_id = ? AND bundle_hash = ?`,
        [
          `${stage.toUpperCase()}_COMMITTED`,
          JSON.stringify({ ...committedStages, [stage]: stageGenerations[stage] }),
          runId,
          bundleHash
        ]
      );

      committedStages[stage] = stageGenerations[stage];
    }

    await requireVerification(postCommitVerifyWork, { connections, runId, appliedGenerations: committedStages },
      ['relationIntegrity', 'apiSamples', 'cacheVisible'], 'post-commit verification');

    // All stages committed successfully
    await connections.local.query(
      `UPDATE ${APPLY_TABLE}
       SET status = 'COMMITTED', completed_at = NOW()
       WHERE run_id = ? AND bundle_hash = ?`,
      [runId, bundleHash]
    );

    return Object.freeze({
      protocol: 'cross_server_staged',
      status: 'committed',
      appliedGenerations: committedStages
    });

  } catch (error) {
    // Record the failure
    const failureStatus = Object.keys(committedStages).length > 0 ? 'COMPENSATION_REQUIRED' : 'FAILED';
    await connections.local.query(
      `UPDATE ${APPLY_TABLE}
       SET status = '${failureStatus}', completed_at = NOW()
       WHERE run_id = ? AND bundle_hash = ?`,
      [runId, bundleHash]
    );

    throw error;
  }
}

async function checkStagedPreconditions(coordinatorConnection, runId, bundleHash, stage, committedStages) {
  const [rows] = await coordinatorConnection.query(
    `SELECT status, committed_generation_json
     FROM ${APPLY_TABLE}
     WHERE run_id = ? AND bundle_hash = ?`,
    [runId, bundleHash]
  );

  if (rows.length === 0) {
    throw new Error('apply record not found');
  }

  const row = rows[0];
  const status = row.status;

  // Check that prior stages are committed
  const stageOrder = ['maint', 'relation', 'local'];
  const stageIndex = stageOrder.indexOf(stage);

  for (let i = 0; i < stageIndex; i++) {
    const priorStage = stageOrder[i];
    if (!committedStages[priorStage]) {
      return false;
    }
  }

  // Check that status allows this stage
  if (status === 'FAILED') {
    return false;
  }

  return true;
}

export function requireCompensationSnapshot(applyRecord) {
  if (!applyRecord || !applyRecord.status) {
    throw new Error('apply record is required');
  }

  const status = applyRecord.status;
  const protocol = applyRecord.commit_protocol;

  if (protocol === 'same_server_single_transaction') {
    return status === 'POST_VERIFY_FAILED';
  }

  if (protocol === 'cross_server_staged') {
    // Any partially committed stage requires compensation
    const partiallyCommittedStates = ['MAINT_COMMITTED', 'RELATION_COMMITTED', 'COMPENSATION_REQUIRED', 'POST_VERIFY_FAILED'];
    return partiallyCommittedStates.includes(status);
  }

  return false;
}
