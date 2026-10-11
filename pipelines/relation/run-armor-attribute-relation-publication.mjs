#!/usr/bin/env node

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
  ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID,
  ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OWNERSHIP,
  ARMOR_ATTRIBUTE_RELATION_TARGET_IDS,
  buildArmorAttributeRelationPublicationCandidate,
  buildArmorAttributeRelationPublicationProposal,
  validateArmorAttributeRelationPublicationProposal,
} from './armor-attribute-relation-publication.mjs';
import {
  executeArmorAttributeRelationPublicationTransaction,
  readArmorAttributeRelationPublicationSnapshot,
} from './armor-attribute-relation-publication-db.mjs';

const TARGETS = [...ARMOR_ATTRIBUTE_RELATION_TARGET_IDS];
const OWNERSHIP = [...ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OWNERSHIP];

export function buildArmorAttributeRelationPublicationPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('Armor attribute relation result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID}.${resultLabel}`;
  return { proposalPath: `${prefix}.proposal.json`, preparedPath: `${prefix}.prepared.json`, resultPath: `${prefix}.result.json` };
}

function targetPath(root, relativePath) {
  return assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'Armor attribute relation artifact', createParent: true });
}
function assertFresh(root, relativePath) {
  try { fs.lstatSync(targetPath(root, relativePath)); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Armor attribute relation artifact already exists: ${relativePath}`);
}
function readPrivate(root, relativePath, label) {
  const file = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relativePath), label });
  if ((fs.statSync(file).mode & 0o077) !== 0) throw new Error(`${label} must be private`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writePrivate(root, relativePath, value) {
  const file = targetPath(root, relativePath);
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function placeholders(values) { return values.map(() => '?').join(', '); }

async function readSourceSnapshot(connection) {
  const ids = TARGETS;
  const [maintArmorAttributeRows] = await connection.query(
    `SELECT * FROM terria_v1_maint.maint_armor_attribute_rows WHERE item_page_title IN (SELECT english_name FROM terria_v1_maint.maint_items WHERE source_id IN (${placeholders(ids)})) ORDER BY id`, ids,
  );
  const [maintItems] = await connection.query(
    `SELECT * FROM terria_v1_maint.maint_items WHERE source_id IN (${placeholders(ids)}) AND status = 1 AND deleted = 0 ORDER BY source_id`, ids,
  );
  const [relationArmorSetItems] = await connection.query(
    `SELECT * FROM terria_v1_relation.relation_armor_set_items WHERE item_source_id IN (${placeholders(ids)}) AND status = 1 AND deleted = 0 ORDER BY item_source_id, id`, ids,
  );
  const [currentRelationAttributeRows] = await connection.query(
    `SELECT * FROM terria_v1_relation.relation_armor_attribute_rows WHERE item_id IN (${placeholders(ids)}) AND status = 1 AND deleted = 0 ORDER BY item_id, id`, ids,
  );
  const [currentRelationEffectRows] = await connection.query(
    `SELECT * FROM terria_v1_relation.relation_equipment_effect_attributes WHERE owner_id IN (${placeholders(ids)}) AND owner_kind = 'item' AND source_kind = 'armor_attribute_cell' ORDER BY owner_id, id`, ids,
  );
  if (maintArmorAttributeRows.length !== ids.length || maintItems.length !== ids.length) {
    throw new Error('Armor attribute relation source owner scope is incomplete');
  }
  return { maintArmorAttributeRows, maintItems, relationArmorSetItems, currentRelationAttributeRows, currentRelationEffectRows };
}

export async function prepareArmorAttributeRelationPublication({ repoRoot = process.cwd(), resultLabel, mysqlModule } = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorAttributeRelationPublicationPaths(resultLabel);
  for (const relativePath of Object.values(paths)) assertFresh(root, relativePath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root)));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes');
    if (servers.length !== 1 || Number(servers[0].timezoneOffsetMinutes) !== 480) throw new Error('Armor attribute relation timezone drift');
    const snapshot = await readSourceSnapshot(connection);
    const candidate = buildArmorAttributeRelationPublicationCandidate(snapshot);
    proposal = buildArmorAttributeRelationPublicationProposal({ candidate, serverUuid: servers[0].serverUuid });
  } finally { try { await connection.rollback(); } finally { await connection.end(); } }
  writePrivate(root, paths.proposalPath, proposal);
  return { operationId: ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID, ...paths,
    proposalSha256: proposal.proposalSha256, targetItemSourceIds: TARGETS,
    plannedChanges: { attributeInserts: proposal.candidate.changes.relationArmorAttributeRows.inserts.length,
      effectInserts: proposal.candidate.changes.relationEquipmentEffectAttributes.inserts.length },
    databaseWrites: false, applyAllowed: false };
}

export async function applyArmorAttributeRelationPublication({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule } = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorAttributeRelationPublicationPaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel
      || JSON.stringify(context.executionManifest.ownershipKeys) !== JSON.stringify(OWNERSHIP)) throw new Error('Armor attribute relation packet scope drifted');
  const binding = context.dataBundleEntries.find(entry => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Armor attribute relation proposal binding is missing');
  const bytes = fs.readFileSync(assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, paths.proposalPath), label: 'Armor attribute relation proposal' }));
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== binding.contentHash) throw new Error('Armor attribute relation proposal bytes drifted');
  const proposal = readPrivate(root, paths.proposalPath, 'Armor attribute relation proposal');
  validateArmorAttributeRelationPublicationProposal(proposal);
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== Number(options.port) || fingerprint.serverUuid !== proposal.serverUuid) throw new Error('Armor attribute relation target drifted');
  assertFresh(root, paths.preparedPath); assertFresh(root, paths.resultPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  let primaryError;
  try {
    return await executeArmorAttributeRelationPublicationTransaction({
      connection, proposal,
      rederive: async ({ connection: lockedConnection }) => {
        const source = await readSourceSnapshot(lockedConnection);
        const candidate = buildArmorAttributeRelationPublicationCandidate(source);
        return buildArmorAttributeRelationPublicationProposal({ candidate, serverUuid: proposal.serverUuid });
      },
      assertRuntimeFence: async () => assertArmorIncrementalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid }),
      consumePermit: async () => consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') }),
      persistPrepared: evidence => writePrivate(root, paths.preparedPath, { ...evidence,
        authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash } }),
      persistOutcome: evidence => writePrivate(root, paths.resultPath, { ...evidence,
        authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash } }),
    });
  } catch (error) { primaryError = error; throw error; }
  finally { try { await connection.end(); } catch (cause) { if (primaryError) (primaryError.suppressedErrors ??= []).push(cause); else throw cause; } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = {};
    for (const token of process.argv.slice(2)) {
      const match = /^--(operation-id|result-label|prepare|apply)=(.+)$/.exec(token);
      if (!match || Object.hasOwn(args, match[1])) throw new Error('Armor attribute relation CLI argument is invalid or duplicated');
      args[match[1]] = match[2];
    }
    const prepare = args.prepare === 'true'; const apply = args.apply === 'true';
    if (args['operation-id'] !== ARMOR_ATTRIBUTE_RELATION_PUBLICATION_OPERATION_ID || prepare === apply) throw new Error('Armor attribute relation CLI requires exactly one prepare/apply action');
    (prepare ? prepareArmorAttributeRelationPublication : applyArmorAttributeRelationPublication)({ resultLabel: args['result-label'] })
      .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch(error => { process.stderr.write(`${error.message}; requiresReadbackReconciliation=${error.requiresReadbackReconciliation === true}\n`); process.exitCode = 1; });
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
