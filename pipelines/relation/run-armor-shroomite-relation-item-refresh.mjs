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
import { assertArmorIncrementalRuntimeFence, buildArmorIncrementalConnectionOptions } from './run-armor-set-projection-incremental.mjs';
import {
  ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID,
  ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS,
  buildArmorShroomiteRelationItemRefreshCandidate,
  buildArmorShroomiteRelationItemRefreshProposal,
  validateArmorShroomiteRelationItemRefreshProposal,
} from './armor-shroomite-relation-item-refresh.mjs';
export { ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID } from './armor-shroomite-relation-item-refresh.mjs';
import {
  executeArmorShroomiteRelationItemRefreshTransaction,
} from './armor-shroomite-relation-item-refresh-transaction.mjs';

export const ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OWNERSHIP = Object.freeze([
  'relation.relation_items.source_id.1546-1550',
]);

const TARGETS = [...ARMOR_SHROOMITE_RELATION_ITEM_TARGET_IDS];

export function buildArmorShroomiteRelationItemRefreshPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('Shroomite relation-item result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID}.${resultLabel}`;
  return {
    proposalPath: `${prefix}.proposal.json`,
    preparedPath: `${prefix}.prepared.json`,
    resultPath: `${prefix}.result.json`,
  };
}

function privatePath(root, relativePath, label, createParent = false) {
  return assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath), label, createParent });
}

function readPrivateJson(root, relativePath, label) {
  const target = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relativePath), label });
  const stat = fs.statSync(target);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} must be private`);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function writePrivateJson(root, relativePath, value) {
  const target = privatePath(root, relativePath, 'Shroomite relation-item output', true);
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function assertFresh(root, relativePath) {
  try {
    fs.lstatSync(path.resolve(root, relativePath));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Shroomite relation-item output already exists: ${relativePath}`);
}

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function readPrepareRows(connection) {
  const [maintItems] = await connection.query(
    `SELECT * FROM terria_v1_maint.maint_items WHERE source_id IN (${placeholders(TARGETS)}) ORDER BY source_id`,
    TARGETS,
  );
  const names = maintItems.map(row => row.internal_name);
  if (names.length !== TARGETS.length) throw new Error('Shroomite relation-item maint owner baseline is incomplete');
  const [relationItems] = await connection.query(
    `SELECT * FROM terria_v1_relation.relation_items WHERE source_id IN (${placeholders(TARGETS)}) ORDER BY source_id`,
    TARGETS,
  );
  const [numericOverrides] = await connection.query(
    `SELECT item_internal_name, damage_value, defense_value, knockback_value, use_time, buy_value, sell_value
       FROM terria_v1_maint.maint_item_numeric_overrides
      WHERE deleted = 0 AND item_internal_name IN (${placeholders(names)})`,
    names,
  );
  const [itemPages] = await connection.query(
    `SELECT * FROM terria_v1_maint.maint_item_pages
      WHERE deleted = 0 AND item_internal_name IN (${placeholders(names)})`,
    names,
  );
  return { maintItems, relationItems, maintItemNumericOverrides: numericOverrides, maintItemPages: itemPages };
}

export async function prepareArmorShroomiteRelationItemRefresh({ repoRoot = process.cwd(), resultLabel, mysqlModule } = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorShroomiteRelationItemRefreshPaths(resultLabel);
  assertFresh(root, paths.proposalPath);
  assertFresh(root, paths.preparedPath);
  assertFresh(root, paths.resultPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root)));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes');
    if (servers.length !== 1 || Number(servers[0].timezoneOffsetMinutes) !== 480) throw new Error('Shroomite relation-item timezone drift');
    const rows = await readPrepareRows(connection);
    const candidate = buildArmorShroomiteRelationItemRefreshCandidate(rows);
    proposal = buildArmorShroomiteRelationItemRefreshProposal({ candidate, serverUuid: servers[0].serverUuid });
  } finally {
    try { await connection.rollback(); } finally { await connection.end(); }
  }
  writePrivateJson(root, paths.proposalPath, proposal);
  return {
    operationId: ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID,
    ...paths,
    proposalSha256: proposal.proposalSha256,
    targetItemSourceIds: [...TARGETS],
    databaseWrites: false,
    applyAllowed: false,
  };
}

export async function applyArmorShroomiteRelationItemRefresh({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule } = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorShroomiteRelationItemRefreshPaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel
      || JSON.stringify(context.executionManifest.ownershipKeys) !== JSON.stringify(ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OWNERSHIP)) {
    throw new Error('Shroomite relation-item packet label or ownership drifted');
  }
  const binding = context.dataBundleEntries.find(entry => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Shroomite relation-item proposal binding is missing');
  const proposalBytes = fs.readFileSync(path.resolve(root, paths.proposalPath));
  if (`sha256:${createHash('sha256').update(proposalBytes).digest('hex')}` !== binding.contentHash) {
    throw new Error('Shroomite relation-item proposal bytes drifted');
  }
  const proposal = readPrivateJson(root, paths.proposalPath, 'Shroomite relation-item proposal');
  validateArmorShroomiteRelationItemRefreshProposal(proposal);
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== Number(options.port) || fingerprint.serverUuid !== proposal.serverUuid) {
    throw new Error('Shroomite relation-item target drifted');
  }
  assertFresh(root, paths.preparedPath);
  assertFresh(root, paths.resultPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  let primaryError;
  try {
    return await executeArmorShroomiteRelationItemRefreshTransaction({
      connection,
      proposal,
      assertRuntimeFence: async () => assertArmorIncrementalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid }),
      consumePermit: async () => consumeAuthorizedOperationDispatchPermit({
        env,
        authorizedContext: context,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
      }),
      persistPrepared: evidence => writePrivateJson(root, paths.preparedPath, {
        ...evidence,
        authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash },
      }),
      persistOutcome: evidence => writePrivateJson(root, paths.resultPath, {
        ...evidence,
        authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash },
      }),
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try { await connection.end(); } catch (cause) {
      if (primaryError) (primaryError.suppressedErrors ??= []).push(cause);
      else throw cause;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (const token of process.argv.slice(2)) {
    const match = /^--(operation-id|result-label|prepare|apply)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('Shroomite relation-item CLI argument is invalid or duplicated');
    args[match[1]] = match[2];
  }
  const prepare = args.prepare === 'true';
  const apply = args.apply === 'true';
  if (args['operation-id'] !== ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID || prepare === apply || (args.prepare && !prepare) || (args.apply && !apply)) {
    throw new Error('Shroomite relation-item CLI requires the exact operation and one explicit prepare/apply action');
  }
  const action = prepare ? prepareArmorShroomiteRelationItemRefresh : applyArmorShroomiteRelationItemRefresh;
  action({ resultLabel: args['result-label'] })
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}; requiresReadbackReconciliation=${error.requiresReadbackReconciliation === true}\n`); process.exitCode = 1; });
}
