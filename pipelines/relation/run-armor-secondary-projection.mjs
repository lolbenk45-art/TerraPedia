import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { writeJsonNoOverwrite } from '../lib/wiki-item-utils.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { assertAuthorizedOperationDataBundle, consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext, loadAuthorizedOperationServerFingerprint } from '../automation/authorized-operation-context.mjs';
import { assertArmorIncrementalRuntimeFence, buildArmorIncrementalConnectionOptions,
  readArmorIncrementalArtifact } from './run-armor-set-projection-incremental.mjs';
import { ARMOR_SECONDARY_PROJECTION_OPERATION_ID as OPERATION_ID,
  buildArmorSecondaryProjectionProposal, validateArmorSecondaryProjectionProposal } from './armor-secondary-projection.mjs';
import { readArmorSecondarySnapshot, executeArmorSecondaryProjectionTransaction } from './armor-secondary-projection-db.mjs';

const OWNERSHIP = ['relation.projection_item_armor_attributes.armor_members',
  'relation.projection_equipment_effect_attributes.armor_member_item_cells'];

export function buildArmorSecondaryPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) throw new Error('Armor secondary result label is required and must be normalized');
  const prefix = `reports/authorization/canonical/${OPERATION_ID}.${resultLabel}`;
  return { proposalPath: `${prefix}.proposal.json`, preparedPath: `${prefix}.prepared.json`, resultPath: `${prefix}.result.json` };
}

function targetPath(root, relativePath) {
  return assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath),
    label: 'Armor secondary artifact', createParent: true });
}

function requireFresh(root, relativePath) {
  const target = targetPath(root, relativePath);
  try { fs.lstatSync(target); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('Armor secondary artifact already exists; use a fresh label');
}

export async function prepareArmorSecondaryProjection({ repoRoot = process.cwd(), resultLabel, selectedMemberIds, mysqlModule } = {}) {
  if (!Array.isArray(selectedMemberIds) || !selectedMemberIds.length) throw new Error('Armor secondary preparation requires an explicit member scope');
  const root = path.resolve(repoRoot); const paths = buildArmorSecondaryPaths(resultLabel);
  for (const relativePath of Object.values(paths)) requireFresh(root, relativePath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root)));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes');
    if (servers.length !== 1 || Number(servers[0].timezoneOffsetMinutes) !== 480) throw new Error('Armor secondary source timezone drift');
    const snapshot = await readArmorSecondarySnapshot({ connection });
    proposal = await buildArmorSecondaryProjectionProposal({ ...snapshot, selectedMemberIds,
      serverUuid: servers[0].serverUuid, generatedAt: new Date().toISOString() });
  } finally { try { await connection.rollback(); } finally { await connection.end(); } }
  writeJsonNoOverwrite(targetPath(root, paths.proposalPath), proposal);
  return { operationId: OPERATION_ID, ...paths, proposalSha256: proposal.proposalSha256,
    changedRowCount: proposal.changedRowCount, coverage: proposal.coverage };
}

export async function applyArmorSecondaryProjection({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule } = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorSecondaryPaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel
      || JSON.stringify(context.executionManifest.ownershipKeys) !== JSON.stringify(OWNERSHIP)) throw new Error('Armor secondary packet label/ownership drift');
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== options.port
      || JSON.stringify([...fingerprint.databases].sort()) !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) {
    throw new Error('Armor secondary packet server target drift');
  }
  const binding = context.dataBundleEntries.find(entry => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Armor secondary exact proposal binding is missing');
  const proposal = readArmorIncrementalArtifact(root, paths.proposalPath, binding.contentHash);
  await validateArmorSecondaryProjectionProposal(proposal);
  if (fingerprint.serverUuid !== proposal.serverUuid) throw new Error('Armor secondary proposal server UUID drift');
  requireFresh(root, paths.preparedPath); requireFresh(root, paths.resultPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  let primaryError; let result;
  const authorization = { packetHash: context.packetHash, decisionIdentity: context.decisionIdentity,
    policySetHash: context.policySetHash, actor: context.actor, serverFingerprint: fingerprint };
  const writeEvidence = (relativePath, evidence) => writeJsonNoOverwrite(targetPath(root, relativePath), {
    ...evidence, authorization, recordedAt: new Date().toISOString(),
  });
  try {
    result = await executeArmorSecondaryProjectionTransaction({ connection, proposal,
      assertRuntimeFence: async () => {
        assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
        await assertArmorIncrementalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid });
      },
      consumePermit: async () => consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') }),
      persistPrepared: async evidence => writeEvidence(paths.preparedPath, evidence),
      persistOutcome: async evidence => writeEvidence(paths.resultPath, evidence),
    });
    return result;
  } catch (error) { primaryError = error; throw error; }
  finally {
    try { await connection.end(); }
    catch (cause) {
      if (primaryError) (primaryError.suppressedErrors ??= []).push(cause);
      else {
        const error = new Error('Armor secondary connection teardown failed', { cause });
        error.transactionCommitted = result?.status === 'COMMITTED';
        error.requiresReadbackReconciliation = true;
        throw error;
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (const token of process.argv.slice(2)) {
      const match = /^--(operation-id|result-label|apply|prepare|members)=(.+)$/.exec(token);
      if (!match || Object.hasOwn(options, match[1])) throw new Error('Armor secondary CLI argument is invalid or duplicate');
      options[match[1]] = match[2];
    }
    if (options['operation-id'] !== OPERATION_ID || (options.apply === 'true') === (options.prepare === 'true')
        || Object.hasOwn(options, 'apply') && options.apply !== 'true'
        || Object.hasOwn(options, 'prepare') && options.prepare !== 'true'
        || options.apply === 'true' && Object.hasOwn(options, 'members')) throw new Error('Armor secondary CLI requires one exact operation/action with no apply-time member override');
    const result = options.apply === 'true'
      ? await applyArmorSecondaryProjection({ resultLabel: options['result-label'] })
      : await prepareArmorSecondaryProjection({ resultLabel: options['result-label'], selectedMemberIds: String(options.members ?? '').split(',').map(Number) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}; requiresReadbackReconciliation=${error.requiresReadbackReconciliation === true}\n`);
    process.exitCode = 1;
  }
}
