import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { assertRepositoryOrdinaryFile, assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import { assertArmorIncrementalRuntimeFence, buildArmorIncrementalConnectionOptions } from '../relation/run-armor-set-projection-incremental.mjs';
import {
  ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID,
  buildArmorItemLineageRefreshCandidate,
} from './armor-item-lineage-refresh.mjs';
import {
  buildArmorItemLineageRefreshProposal,
  executeArmorItemLineageRefreshTransaction,
  readArmorItemLineageRefreshSnapshot,
  validateArmorItemLineageRefreshProposal,
} from './armor-item-lineage-refresh-transaction.mjs';

export const ARMOR_ITEM_LINEAGE_REFRESH_OWNERSHIP = Object.freeze([
  'local.source_dataset_landings.items_raw.armor_shroomite_lineage',
  'maint.source_dataset_landings.items_raw.armor_shroomite_lineage',
  'maint.maint_items.source_id.1546-1550',
]);
const DEFAULT_SOURCE_ARTIFACT = '.local/tmp/a63-20260929-armor-source-02/module-iteminfo-data.json';

export function buildArmorItemLineageRefreshPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) throw new Error('Armor Iteminfo lineage result label is required and must be normalized');
  const prefix = `reports/authorization/canonical/${ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID}.${resultLabel}`;
  return { proposalPath: `${prefix}.proposal.json`, preparedPath: `${prefix}.prepared.json`, resultPath: `${prefix}.result.json` };
}

function confined(root, relativePath, label) {
  return assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath), label, createParent: true });
}

function readPrivateJson(root, relativePath) {
  const target = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'Armor Iteminfo lineage artifact' });
  if ((fs.statSync(target).mode & 0o077) !== 0) throw new Error('Armor Iteminfo lineage artifact must be private');
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function writePrivateJson(root, relativePath, value) {
  const target = confined(root, relativePath, 'Armor Iteminfo lineage output');
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function assertFresh(root, relativePath) {
  try { fs.lstatSync(path.resolve(root, relativePath)); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Armor Iteminfo lineage output already exists: ${relativePath}`);
}

function sourceArtifact(root, relativePath) {
  const target = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'Armor Iteminfo source artifact' });
  const bytes = fs.readFileSync(target);
  if ((fs.statSync(target).mode & 0o077) !== 0) throw new Error('Armor Iteminfo source artifact must be private');
  return {
    path: relativePath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteSize: bytes.length,
    payload: JSON.parse(bytes.toString('utf8')),
  };
}

export async function prepareArmorItemLineageRefresh({ repoRoot = process.cwd(), resultLabel, sourceArtifactPath = DEFAULT_SOURCE_ARTIFACT, mysqlModule } = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorItemLineageRefreshPaths(resultLabel);
  assertFresh(root, paths.proposalPath); assertFresh(root, paths.preparedPath); assertFresh(root, paths.resultPath);
  const source = sourceArtifact(root, sourceArtifactPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root)));
  let candidate;
  let serverUuid;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes');
    if (servers.length !== 1 || Number(servers[0].timezoneOffsetMinutes) !== 480) throw new Error('Armor Iteminfo lineage timezone drift');
    serverUuid = servers[0].serverUuid;
    const [localLandings] = await connection.query('SELECT * FROM terria_v1_local.source_dataset_landings WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ? ORDER BY id', ['items_raw', 'terraria.wiki.gg', 'wiki.module.iteminfo.armor-shroomite.1023241', 'Module:Iteminfo/data#ArmorShroomite/1546-1550']);
    const [maintLandings] = await connection.query('SELECT * FROM terria_v1_maint.source_dataset_landings WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ? ORDER BY id', ['items_raw', 'terraria.wiki.gg', 'wiki.module.iteminfo.armor-shroomite.1023241', 'Module:Iteminfo/data#ArmorShroomite/1546-1550']);
    const [maintItems] = await connection.query('SELECT * FROM terria_v1_maint.maint_items WHERE source_id IN (1546,1547,1548,1549,1550) ORDER BY source_id');
    candidate = buildArmorItemLineageRefreshCandidate({ source: source.payload, sourceArtifactPath: source.path, sourceArtifactSha256: source.sha256, sourceArtifactByteSize: source.byteSize, currentLocalLandings: localLandings, currentMaintLandings: maintLandings, currentMaintItems: maintItems });
  } finally { try { await connection.rollback(); } finally { await connection.end(); } }
  const proposal = buildArmorItemLineageRefreshProposal({ candidate, serverUuid });
  writePrivateJson(root, paths.proposalPath, proposal);
  return { operationId: ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID, ...paths, proposalSha256: proposal.proposalSha256, databaseWrites: false, applyAllowed: false };
}

export async function applyArmorItemLineageRefresh({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule } = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorItemLineageRefreshPaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel || JSON.stringify(context.executionManifest.ownershipKeys) !== JSON.stringify(ARMOR_ITEM_LINEAGE_REFRESH_OWNERSHIP)) throw new Error('Armor Iteminfo lineage packet label or ownership drifted');
  const binding = context.dataBundleEntries.find(entry => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Armor Iteminfo lineage proposal binding is missing');
  const proposal = readPrivateJson(root, paths.proposalPath);
  if (`sha256:${createHash('sha256').update(fs.readFileSync(path.resolve(root, paths.proposalPath))).digest('hex')}` !== binding.contentHash) throw new Error('Armor Iteminfo lineage proposal bytes drifted');
  validateArmorItemLineageRefreshProposal(proposal);
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== Number(options.port) || fingerprint.serverUuid !== proposal.serverUuid) throw new Error('Armor Iteminfo lineage target drifted');
  assertFresh(root, paths.preparedPath); assertFresh(root, paths.resultPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  let primaryError; let result;
  try {
    result = await executeArmorItemLineageRefreshTransaction({
      connection,
      proposal,
      assertRuntimeFence: async () => assertArmorIncrementalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid }),
      consumePermit: async () => consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context, decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') }),
      persistPrepared: evidence => writePrivateJson(root, paths.preparedPath, { ...evidence, authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash } }),
      persistOutcome: evidence => writePrivateJson(root, paths.resultPath, { ...evidence, authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash } }),
    });
    return result;
  } catch (error) { primaryError = error; throw error; }
  finally {
    try { await connection.end(); } catch (cause) { if (primaryError) (primaryError.suppressedErrors ??= []).push(cause); else throw cause; }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (const token of process.argv.slice(2)) {
    const match = /^--(operation-id|result-label|apply)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('Armor Iteminfo lineage CLI argument is invalid or duplicated');
    args[match[1]] = match[2];
  }
  if (args['operation-id'] !== ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID || args.apply !== 'true') throw new Error('Armor Iteminfo lineage CLI requires the exact operation and --apply=true');
  applyArmorItemLineageRefresh({ resultLabel: args['result-label'] }).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error.message}; requiresReadbackReconciliation=${error.requiresReadbackReconciliation === true}\n`); process.exitCode = 1; });
}
