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
  readArmorIncrementalArtifact } from '../relation/run-armor-set-projection-incremental.mjs';
import { buildArmorItemEffectSourceProposal, readArmorItemEffectSourceSnapshot, validateArmorItemEffectSourceProposal,
  executeArmorItemEffectSourceTransaction } from './armor-item-effect-source-transaction.mjs';
import { buildArmorItemEffectMaintCandidate } from './armor-item-effect-maint-candidate.mjs';

const OPERATION_ID = 'canonical-armor-item-effect-source';
const OWNERSHIP = ['local.source_dataset_landings.armor_item_effects_raw',
  'maint.source_dataset_landings.armor_item_effects_raw', 'maint.maint_armor_attribute_rows.item_effect_sources'];

export function buildArmorItemSourcePaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) throw new Error('Armor item-source result label is required and must be normalized');
  const prefix = `reports/authorization/canonical/${OPERATION_ID}.${resultLabel}`;
  return { proposalPath: `${prefix}.proposal.json`, preparedPath: `${prefix}.prepared.json`, resultPath: `${prefix}.result.json` };
}

function targetPath(root, relativePath) {
  return assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath),
    label: 'Armor item-source artifact', createParent: true });
}

function requireFresh(root, relativePath) {
  const target = targetPath(root, relativePath);
  try { fs.lstatSync(target); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('Armor item-source artifact already exists; use a fresh label');
}

/** Source bytes and revision expectations are explicit; preparation never grants write authority. */
export async function prepareArmorItemEffectSource({
  repoRoot = process.cwd(), resultLabel, source, parsedAt, mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorItemSourcePaths(resultLabel);
  for (const relativePath of Object.values(paths)) requireFresh(root, relativePath);
  const input = { source, parsedAt, currentLocalLandings: [], currentMaintLandings: [], currentMaintRows: [] };
  const candidate = buildArmorItemEffectMaintCandidate(input);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root)));
  let proposal;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION READ ONLY');
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes');
    if (servers.length !== 1 || Number(servers[0].timezoneOffsetMinutes) !== 480) throw new Error('Armor item-source preparation timezone drift');
    const snapshot = await readArmorItemEffectSourceSnapshot({ connection, candidate });
    proposal = buildArmorItemEffectSourceProposal({ input: { ...input, ...snapshot }, serverUuid: servers[0].serverUuid });
  } finally { try { await connection.rollback(); } finally { await connection.end(); } }
  writeJsonNoOverwrite(targetPath(root, paths.proposalPath), proposal);
  return { operationId: OPERATION_ID, ...paths, proposalSha256: proposal.proposalSha256,
    plannedInsertCount: Object.values(proposal.candidate.changes).reduce((sum, changes) => sum + changes.inserts.length, 0),
    acceptance: 'source-persistence-only', databaseWrites: false };
}

export async function applyArmorItemEffectSource({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule } = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorItemSourcePaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel
      || JSON.stringify(context.executionManifest.ownershipKeys) !== JSON.stringify(OWNERSHIP)) throw new Error('Armor item-source packet label/ownership drift');
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== options.port
      || JSON.stringify([...fingerprint.databases].sort()) !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) {
    throw new Error('Armor item-source packet server target drift');
  }
  const binding = context.dataBundleEntries.find(entry => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Armor item-source exact proposal binding is missing');
  const proposal = readArmorIncrementalArtifact(root, paths.proposalPath, binding.contentHash);
  await validateArmorItemEffectSourceProposal(proposal);
  if (fingerprint.serverUuid !== proposal.serverUuid) throw new Error('Armor item-source proposal server UUID drift');
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
    result = await executeArmorItemEffectSourceTransaction({ connection, proposal,
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
        const error = new Error('Armor item-source connection teardown failed', { cause });
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
      const match = /^--(operation-id|result-label|apply)=(.+)$/.exec(token);
      if (!match || Object.hasOwn(options, match[1])) throw new Error('Armor item-source CLI argument is invalid or duplicate');
      options[match[1]] = match[2];
    }
    if (options['operation-id'] !== OPERATION_ID || options.apply !== 'true') {
      throw new Error('Armor item-source CLI requires the exact operation and --apply=true');
    }
    const result = await applyArmorItemEffectSource({ resultLabel: options['result-label'] });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}; requiresReadbackReconciliation=${error.requiresReadbackReconciliation === true}\n`);
    process.exitCode = 1;
  }
}
