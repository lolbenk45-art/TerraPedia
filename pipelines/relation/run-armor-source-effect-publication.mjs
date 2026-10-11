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
import { buildArmorIncrementalConnectionOptions, assertArmorIncrementalRuntimeFence } from './run-armor-set-projection-incremental.mjs';
import {
  ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID,
  buildArmorSourceEffectPublicationPlan,
  buildArmorSourceEffectRows,
  validateArmorSourceEffectPublicationPlan,
} from './armor-source-effect-publication.mjs';
import { computeArmorSetPageEffectEvidenceHash } from '../fetch/armor-set-page-effect-evidence.mjs';
import {
  executeArmorSourceEffectPublicationTransaction,
  readArmorSourceEffectRelationRows,
} from './armor-source-effect-publication-db.mjs';

const EVIDENCE_SCHEMA = 'armor-set-page-effect-evidence/v1';
const HASH = /^(?:sha256:)?[a-f0-9]{64}$/;

export { ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID };

function hashBytes(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function hashJson(value) { return hashBytes(Buffer.from(JSON.stringify(stable(value)), 'utf8')); }
function targetPath(root, relativePath, label) {
  return assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath), label, createParent: true });
}
function freshPath(root, relativePath, label) {
  const file = targetPath(root, relativePath, label);
  try { fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return file; throw error; }
  throw new Error(`${label} already exists: ${relativePath}`);
}
function writePrivateJson(root, relativePath, value, label) {
  const file = freshPath(root, relativePath, label);
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function readPrivateJson(root, relativePath, label) {
  const file = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relativePath), label });
  if ((fs.statSync(file).mode & 0o077) !== 0) throw new Error(`${label} must be private`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${label} must be valid JSON: ${error.message}`, { cause: error }); }
}
function sourceFingerprint(evidence) {
  const moduleRevisionId = Number(evidence?.enrichedModulePayload?.sourceRevisionId);
  const pageRevisionIds = [...new Set((evidence?.pages ?? []).filter(page => page.effectText).map(page => Number(page.revisionId)))].sort((a, b) => a - b);
  return { moduleRevisionId, pageRevisionIds };
}
function readEvidenceInputPayload(root, evidence, pathKey, datasetType) {
  const inputPath = evidence?.input?.[pathKey];
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error(`Armor source-effect evidence input ${pathKey} is required`);
  }
  const file = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.resolve(root, inputPath),
    label: `Armor source-effect evidence ${pathKey}`,
  });
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Armor source-effect evidence ${pathKey} must be valid JSON: ${error.message}`, { cause: error });
  }
  if (payload?.payload_json) return JSON.parse(payload.payload_json);
  const landing = payload?.incomingLandingRows?.find(row => row.dataset_type === datasetType);
  if (landing?.payload_json) return JSON.parse(landing.payload_json);
  return payload;
}
function assertEvidence(evidence, { repoRoot }) {
  if (!evidence || evidence.schemaVersion !== EVIDENCE_SCHEMA || evidence.databaseWrites !== false
      || evidence.executable !== false || evidence.applyAllowed !== false
      || !HASH.test(String(evidence.evidenceHash ?? '')) || !evidence.enrichedModulePayload) {
    throw new Error('Armor source-effect page evidence is invalid or drifted');
  }
  if (!Array.isArray(evidence.enrichedModulePayload.armorSets)) throw new Error('Armor source-effect enriched module payload is incomplete');
  const modulePayload = readEvidenceInputPayload(repoRoot, evidence, 'modulePath', 'armor_sets_raw');
  const imagePayload = readEvidenceInputPayload(repoRoot, evidence, 'imagePath', 'armor_set_images_raw');
  const expectedEvidenceHash = computeArmorSetPageEffectEvidenceHash({
    modulePayload,
    imagePayload,
    pages: evidence.pages,
    owners: evidence.owners,
  });
  if (expectedEvidenceHash !== evidence.evidenceHash) {
    throw new Error('Armor source-effect page evidence semantic hash drifted');
  }
  return evidence;
}

export function buildArmorSourceEffectPublicationPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) throw new Error('Armor source-effect result label is required');
  const prefix = `reports/authorization/canonical/${ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID}.${resultLabel}`;
  return { proposalPath: `${prefix}.proposal.json`, preparedPath: `${prefix}.prepared.json`, resultPath: `${prefix}.result.json` };
}

async function readSourceSnapshot(connection, { lock = false } = {}) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const query = async sql => {
    const [rows] = await connection.query(sql);
    if (!Array.isArray(rows)) throw new Error('Armor source-effect snapshot query did not return rows');
    return structuredClone(rows);
  };
  const relationArmorSets = await query(`SELECT * FROM terria_v1_relation.relation_armor_sets WHERE status = 1 AND deleted = 0 ORDER BY id${suffix}`);
  const relationArmorSetItems = await query(`SELECT item_source_id FROM terria_v1_relation.relation_armor_set_items WHERE status = 1 AND deleted = 0 ORDER BY id${suffix}`);
  const relationArmorAttributeRows = await query(`SELECT * FROM terria_v1_relation.relation_armor_attribute_rows WHERE status = 1 AND deleted = 0 ORDER BY id${suffix}`);
  const currentRelationRows = await readArmorSourceEffectRelationRows(connection, { lock });
  const memberIds = new Set(relationArmorSetItems.map(row => Number(row.item_source_id)));
  return { relationArmorSets, relationArmorAttributeRows: relationArmorAttributeRows.filter(row => memberIds.has(Number(row.item_id))), currentRelationRows };
}

function proposalFromSnapshot(snapshot, evidence) {
  const fingerprint = sourceFingerprint(evidence);
  const proposedRows = buildArmorSourceEffectRows({ ...snapshot, enrichedModulePayload: evidence.enrichedModulePayload });
  const plan = buildArmorSourceEffectPublicationPlan({ proposedRows, currentRelationRows: snapshot.currentRelationRows,
    sourceEvidenceHash: evidence.evidenceHash, sourceFingerprint: fingerprint });
  return { schemaVersion: 'armor-source-effect-publication-proposal/v1', operationId: ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID,
    sourceEvidenceHash: evidence.evidenceHash, sourceEvidence: evidence, plan,
    proposalSha256: hashJson({ sourceEvidenceHash: evidence.evidenceHash, sourceEvidence: evidence, plan }) };
}

function validateProposal(proposal, { repoRoot = process.cwd() } = {}) {
  if (!proposal || proposal.schemaVersion !== 'armor-source-effect-publication-proposal/v1'
      || proposal.operationId !== ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID
      || proposal.proposalSha256 !== hashJson({ sourceEvidenceHash: proposal.sourceEvidenceHash, sourceEvidence: proposal.sourceEvidence, plan: proposal.plan })) {
    throw new Error('Armor source-effect publication proposal identity or hash is invalid');
  }
  assertEvidence(proposal.sourceEvidence, { repoRoot });
  validateArmorSourceEffectPublicationPlan(proposal.plan);
  if (proposal.plan.sourceEvidenceHash !== proposal.sourceEvidenceHash) throw new Error('Armor source-effect proposal evidence binding drifted');
  return true;
}

export async function prepareArmorSourceEffectPublication({ repoRoot = process.cwd(), resultLabel, evidencePath, mysqlModule } = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorSourceEffectPublicationPaths(resultLabel);
  for (const relativePath of Object.values(paths)) freshPath(root, relativePath, 'Armor source-effect artifact');
  if (typeof evidencePath !== 'string' || path.posix.normalize(evidencePath) !== evidencePath) throw new Error('Armor source-effect evidence path is required');
  const evidenceFile = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, evidencePath), label: 'Armor source-effect page evidence' });
  const evidenceBytes = fs.readFileSync(evidenceFile);
  const evidence = assertEvidence(JSON.parse(evidenceBytes.toString('utf8')), { repoRoot: root });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root)));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes');
    if (servers.length !== 1 || Number(servers[0].timezoneOffsetMinutes) !== 480) throw new Error('Armor source-effect preparation server/timezone drift');
    proposal = proposalFromSnapshot(await readSourceSnapshot(connection), evidence);
  } finally { try { await connection.rollback(); } finally { await connection.end(); } }
  writePrivateJson(root, paths.proposalPath, { ...proposal, sourceEvidencePath: evidencePath }, 'Armor source-effect proposal');
  return { operationId: ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID, ...paths, proposalSha256: proposal.proposalSha256,
    sourceEvidenceHash: evidence.evidenceHash, changedRowCount: proposal.plan.changes.inserts.length + proposal.plan.changes.updates.length + proposal.plan.changes.retire.length };
}

export async function applyArmorSourceEffectPublication({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule } = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorSourceEffectPublicationPaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel) throw new Error('Armor source-effect packet label drifted');
  const binding = context.dataBundleEntries.find(entry => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Armor source-effect proposal binding is missing');
  const proposalBytes = fs.readFileSync(assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, paths.proposalPath), label: 'Armor source-effect proposal' }));
  if (hashBytes(proposalBytes) !== binding.contentHash) throw new Error('Armor source-effect proposal hash drifted');
  const proposal = JSON.parse(proposalBytes.toString('utf8')); validateProposal(proposal, { repoRoot: root });
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== options.port
      || JSON.stringify([...fingerprint.databases].sort()) !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) throw new Error('Armor source-effect packet target drifted');
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule }); const connection = await mysql.createConnection(options);
  const consumePermit = async () => consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context,
    decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') });
  let outcome;
  try {
    outcome = await executeArmorSourceEffectPublicationTransaction({ connection, proposal: proposal.plan,
      rederiveSourceEffects: async ({ connection: lockedConnection }) => {
        const snapshot = await readSourceSnapshot(lockedConnection ?? connection, { lock: true });
        const fingerprintValue = sourceFingerprint(proposal.sourceEvidence);
        return { proposedRows: buildArmorSourceEffectRows({ ...snapshot, enrichedModulePayload: proposal.sourceEvidence.enrichedModulePayload }),
          sourceEvidenceHash: proposal.sourceEvidenceHash, sourceFingerprint: fingerprintValue };
      },
      assertRuntimeFence: async () => assertArmorIncrementalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid }),
      consumePermit,
      persistPrepared: async evidence => writePrivateJson(root, paths.preparedPath, { ...evidence, authorization: { packetHash: context.packetHash, decisionIdentity: context.decisionIdentity } }, 'Armor source-effect prepared evidence'),
      persistOutcome: async evidence => writePrivateJson(root, paths.resultPath, { ...evidence, authorization: { packetHash: context.packetHash, decisionIdentity: context.decisionIdentity } }, 'Armor source-effect result evidence'),
    });
    return outcome;
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(token => {
    const [key, ...rest] = token.replace(/^--/, '').split('='); return [key, rest.join('=')];
  }));
  if (args['operation-id'] !== ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID || args['result-label'] == null
      || (args.prepare === 'true') === (args.apply === 'true') || args.prepare === 'true' && args.evidence == null) {
    throw new Error('Armor source-effect CLI requires exactly --prepare=true --evidence=... or --apply=true');
  }
  const run = args.prepare === 'true'
    ? prepareArmorSourceEffectPublication({ resultLabel: args['result-label'], evidencePath: args.evidence })
    : applyArmorSourceEffectPublication({ resultLabel: args['result-label'] });
  run.then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
