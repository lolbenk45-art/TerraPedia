import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { writeJsonNoOverwrite } from '../lib/wiki-item-utils.mjs';
import {
  ARMOR_HISTORICAL_TUPLE_REPAIR_OPERATION_ID,
  buildArmorHistoricalTupleRepairProposal,
  executeArmorHistoricalTupleRepairTransaction,
  validateArmorHistoricalTupleRepairProposal,
} from './armor-historical-tuple-repair.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import { computePolicySetHash } from '../automation/policy-set-hash.mjs';

export const ARMOR_HISTORICAL_TUPLE_CANDIDATE_PATH = '.local/tmp/armor-source-relation-alignment-candidate-20261001-01.json';

function requireLabel(value) {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error('historical tuple result label is invalid');
  return value;
}

export function buildArmorHistoricalTupleRepairPaths(resultLabel) {
  const label = requireLabel(resultLabel);
  const prefix = `reports/authorization/canonical/canonical-armor-historical-tuple-repair.${label}`;
  return { proposalPath: `${prefix}.proposal.json`, preparedPath: `${prefix}.prepared.json`, resultPath: `${prefix}.result.json` };
}

function readCandidate(repoRoot, relativePath) {
  const target = path.resolve(repoRoot, relativePath);
  if (!target.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) throw new Error('historical tuple candidate path escaped repository');
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function connectionOptions(config) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.database.host) || Number(config.database.port) !== 13306) {
    throw new Error('historical tuple repair target must be loopback MySQL 13306');
  }
  return { host: config.database.host, port: 13306, user: config.database.username, password: config.database.password,
    database: 'terria_v1_local', timezone: '+08:00', dateStrings: false };
}

async function assertHistoricalRuntimeFence({ connection, authorizedContext, serverUuid }) {
  const [owners] = await connection.query('SELECT username, status FROM terria_v1_local.crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE');
  if (owners.length !== 1 || owners[0].status !== 'ACTIVE' || owners[0].username !== authorizedContext.actor) throw new Error('historical tuple active Owner drifted');
  const [policies] = await connection.query('SELECT p.domain_id AS domainId, p.current_version AS policyVersion, pv.policy_hash AS policyHash FROM terria_v1_local.crawler_automation_policy p JOIN terria_v1_local.crawler_automation_policy_version pv ON pv.domain_id=p.domain_id AND pv.policy_version=p.current_version ORDER BY p.domain_id FOR UPDATE');
  if (computePolicySetHash(policies) !== authorizedContext.policySetHash) throw new Error('historical tuple policy drifted');
  const [fences] = await connection.query('SELECT id, (expires_at > CURRENT_TIMESTAMP) AS active FROM terria_v1_local.crawler_automation_write_fence ORDER BY id FOR UPDATE');
  if (fences.some((row) => Number(row.active) !== 0)) throw new Error('historical tuple live writer fence blocks publication');
  const [servers] = await connection.query("SELECT @@server_uuid AS serverUuid, @@port AS serverPort, DATABASE() AS databaseName, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes, DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') AS nowUtc");
  const server = servers[0];
  if (servers.length !== 1 || server.serverUuid !== serverUuid || Number(server.serverPort) !== 13306 || server.databaseName !== 'terria_v1_local' || Number(server.timezoneOffsetMinutes) !== 480) throw new Error('historical tuple server or clock drifted');
}

function idsFromCandidate(candidate) {
  const entries = candidate.sets.filter((entry) => entry.status === 'candidate_alignment');
  return {
    maintIds: entries.map((entry) => Number(entry.current.maintId)),
    relationIds: entries.map((entry) => Number(entry.current.relationRecordKey ? entry.current.maintId : entry.current.maintId)),
    relationKeys: entries.map((entry) => entry.current.relationRecordKey),
    childIds: entries.flatMap((entry) => entry.delta.extraRelationTuples.map((row) => Number(row.id))),
    itemIds: [...new Set(entries.flatMap((entry) => entry.proposedRelationItems.map((row) => Number(row.itemSourceId))))],
  };
}

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function readRows(connection, candidate) {
  const ids = idsFromCandidate(candidate);
  const read = async (sql, values) => {
    const [rows] = await connection.query(sql, values);
    if (!Array.isArray(rows)) throw new Error('historical tuple read-only query returned malformed rows');
    return rows;
  };
  return {
    maintArmorSets: await read(`SELECT * FROM terria_v1_maint.maint_armor_sets WHERE id IN (${placeholders(ids.maintIds)}) ORDER BY id`, ids.maintIds),
    relationArmorSets: await read(`SELECT * FROM terria_v1_relation.relation_armor_sets WHERE source_maint_id IN (${placeholders(ids.relationIds)}) ORDER BY id`, ids.relationIds),
    relationArmorSetItems: await read(`SELECT * FROM terria_v1_relation.relation_armor_set_items WHERE armor_set_record_key IN (${placeholders(ids.relationKeys)}) AND status = 1 AND deleted = 0 ORDER BY id`, ids.relationKeys),
    maintItems: await read(`SELECT * FROM terria_v1_maint.maint_items WHERE source_id IN (${placeholders(ids.itemIds)}) ORDER BY source_id`, ids.itemIds),
    projectionArmorSets: await read(`SELECT * FROM terria_v1_relation.projection_armor_sets WHERE relation_record_key IN (${placeholders(ids.relationKeys)}) ORDER BY id`, ids.relationKeys),
    projectionItems: await read(`SELECT id, name_zh, image, status, deleted FROM terria_v1_relation.projection_items WHERE id IN (${placeholders(ids.itemIds)}) ORDER BY id`, ids.itemIds),
  };
}

export async function prepareArmorHistoricalTupleRepair({
  repoRoot = process.cwd(),
  resultLabel,
  candidatePath = ARMOR_HISTORICAL_TUPLE_CANDIDATE_PATH,
  mysqlModule,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorHistoricalTupleRepairPaths(resultLabel);
  const candidate = readCandidate(root, candidatePath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(loadLocalStackConfig(root)));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [[server]] = await connection.query('SELECT @@server_uuid AS serverUuid');
    const currentRows = await readRows(connection, candidate);
    proposal = buildArmorHistoricalTupleRepairProposal({ candidateArtifact: candidate, currentRows,
      serverUuid: server.serverUuid, generatedAt });
  } finally {
    try { await connection.rollback(); } finally { await connection.end(); }
  }
  const outputPath = path.resolve(root, paths.proposalPath);
  writeJsonNoOverwrite(outputPath, proposal);
  return { operationId: proposal.operationId, ...paths, proposalSha256: proposal.proposalSha256, counts: proposal.counts };
}

function readPrivateJson(root, relativePath, expectedHash = null) {
  const bytes = fs.readFileSync(path.resolve(root, relativePath));
  if (expectedHash && `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== expectedHash) {
    throw new Error('historical tuple proposal hash drifted');
  }
  return JSON.parse(bytes.toString('utf8'));
}

function writePrivateJson(root, relativePath, value) {
  writeJsonNoOverwrite(path.resolve(root, relativePath), value);
}

export async function applyArmorHistoricalTupleRepair({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule } = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorHistoricalTupleRepairPaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: ARMOR_HISTORICAL_TUPLE_REPAIR_OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel) throw new Error('historical tuple packet label drifted');
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = connectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== options.port || !fingerprint.serverUuid) {
    throw new Error('historical tuple packet target drifted');
  }
  const binding = context.dataBundleEntries.find((entry) => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('historical tuple proposal binding is missing');
  const proposal = readPrivateJson(root, paths.proposalPath, binding.contentHash);
  validateArmorHistoricalTupleRepairProposal(proposal);
  if (proposal.serverUuid !== fingerprint.serverUuid) throw new Error('historical tuple proposal server drifted');
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  const gate = () => assertHistoricalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid });
  const persist = (relativePath, evidence) => writePrivateJson(root, relativePath, {
    ...evidence,
    authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash },
    recordedAt: new Date().toISOString(),
  });
  try {
    return await executeArmorHistoricalTupleRepairTransaction({
      connection,
      proposal,
      assertRuntimeFence: async () => { await gate(); assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context }); },
      consumePermit: async () => { await gate(); assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context }); consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context, decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') }); },
      persistPrepared: async (evidence) => persist(paths.preparedPath, evidence),
      persistOutcome: async (evidence) => persist(paths.resultPath, evidence),
    });
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  for (const token of process.argv.slice(2)) {
    const match = /^--(operation-id|result-label|candidate|apply)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(options, match[1])) throw new Error('historical tuple CLI argument is invalid or duplicated');
    options[match[1]] = match[2];
  }
  if (options['operation-id'] && options['operation-id'] !== ARMOR_HISTORICAL_TUPLE_REPAIR_OPERATION_ID) throw new Error('historical tuple CLI operation id drifted');
  if (!options['result-label']) throw new Error('historical tuple CLI requires --result-label');
  const action = options.apply === 'true'
    ? applyArmorHistoricalTupleRepair({ resultLabel: options['result-label'] })
    : prepareArmorHistoricalTupleRepair({ resultLabel: options['result-label'], candidatePath: options.candidate ?? ARMOR_HISTORICAL_TUPLE_CANDIDATE_PATH });
  action
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
