import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { assertRepositoryPathConfinement, assertRepositoryOrdinaryFile } from '../lib/private-repository-path.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import { buildArmorEffectKeyRetirementPlan } from './armor-semantic-repair.mjs';

export const ARMOR_SEMANTIC_REPAIR_OPERATION_ID = 'canonical-armor-semantic-repair';
export const ARMOR_SEMANTIC_REPAIR_OWNERSHIP = Object.freeze([
  'local.source_dataset_landings.armor_attributes_raw',
  'maint.source_dataset_landings.armor_attributes_raw',
  'maint.maint_armor_attribute_rows',
  'relation.relation_armor_attribute_rows',
  'relation.relation_equipment_effect_attributes.status_deleted',
  'relation.relation_equipment_effect_attributes.insert',
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const TABLE_COLUMNS = Object.freeze({
  maint_armor_attribute_rows: new Set([
    'record_key', 'section_code', 'slot_group', 'item_page_title', 'item_href', 'item_name_zh',
    'defense_value', 'raw_cells_json', 'source_provider', 'source_page', 'source_revision_timestamp',
    'landing_source_id', 'landing_source_key', 'landing_source_page', 'landing_content_hash',
    'landing_fetched_at', 'landing_parsed_at', 'raw_json', 'status', 'deleted',
  ]),
  relation_armor_attribute_rows: new Set([
    'record_key', 'item_id', 'item_internal_name', 'item_name_zh', 'item_page_title', 'item_href',
    'section_code', 'slot_group', 'defense_value', 'raw_cells_json', 'source_maint_table',
    'source_maint_record_key', 'source_maint_id', 'landing_source_id', 'landing_source_key',
    'landing_content_hash', 'source_provider', 'source_page', 'source_revision_timestamp',
    'confidence', 'review_status', 'reason', 'raw_json', 'status', 'deleted',
  ]),
  relation_equipment_effect_attributes: new Set([
    'record_key', 'owner_kind', 'owner_record_key', 'owner_id', 'owner_key', 'source_kind',
    'source_locale', 'source_line_index', 'source_line', 'effect_index', 'apply_scope', 'variant_label',
    'item_internal_name', 'slot_type', 'stat_key', 'stat_label_zh', 'class_scope', 'operation',
    'value_decimal', 'value_max_decimal', 'unit', 'condition_text', 'raw_text', 'parse_status',
    'source_maint_table', 'source_maint_record_key', 'source_maint_id', 'landing_source_id',
    'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page',
    'source_revision_timestamp', 'confidence', 'review_status', 'reason', 'raw_json', 'status', 'deleted',
  ]),
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function hash(value) { return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex')}`; }
function hashFile(file) { return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`; }
function snakeCase(key) { return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`); }
function active(row) { return Number(row?.status) === 1 && Number(row?.deleted) === 0; }
function mysqlDate(value) {
  if (value == null || value === '') return value;
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text)) return value;
  const shifted = new Date(Date.parse(text) + (8 * 60 * 60 * 1000)).toISOString();
  return shifted.slice(0, 19).replace('T', ' ');
}

export function buildArmorSemanticRepairPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) throw new Error('Armor semantic repair result label is required and must be normalized');
  const prefix = `reports/authorization/canonical/${ARMOR_SEMANTIC_REPAIR_OPERATION_ID}.${resultLabel}`;
  return { proposalPath: `${prefix}.proposal.json`, resultPath: `${prefix}.result.json` };
}

export function validateArmorSemanticRepairProposal(proposal) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new Error('Armor semantic repair proposal is required');
  if (proposal.schemaVersion !== 'canonical-armor-semantic-repair-proposal/v1' || proposal.operationId !== ARMOR_SEMANTIC_REPAIR_OPERATION_ID) throw new Error('Armor semantic repair proposal identity is invalid');
  if (proposal.proposalOnly !== false || proposal.databaseWrites !== true || proposal.localItemWrites !== false || proposal.ddl !== false || proposal.schedulerActivation !== false) throw new Error('Armor semantic repair proposal flags are invalid');
  if (JSON.stringify(proposal.writeTargets) !== JSON.stringify(ARMOR_SEMANTIC_REPAIR_OWNERSHIP)) throw new Error('Armor semantic repair write targets drifted');
  if (!HASH.test(proposal.sourceEvidenceHash ?? '') || !proposal.sourceEvidencePath) throw new Error('Armor semantic repair source evidence binding is required');
  if (!Array.isArray(proposal.selectedMemberIds) || proposal.selectedMemberIds.length === 0) throw new Error('Armor semantic repair member scope is required');
  const plan = proposal.effectPlan;
  if (!plan || plan.planKind !== 'armor_effect_key_retirement' || !HASH.test(plan.planSha256 ?? '') || plan.deletes?.length !== 0) throw new Error('Armor semantic repair effect plan is invalid');
  if (!Array.isArray(proposal.landingRows) || proposal.landingRows.length !== 1) throw new Error('Armor semantic repair requires one landing row');
  if (!['reuse-current', 'insert-new-current'].includes(proposal.landingDisposition)
      || !Array.isArray(proposal.maintRetireRecordKeys) || !Array.isArray(proposal.relationRetireRecordKeys)) throw new Error('Armor semantic repair retirement scope is invalid');
  for (const [key, rows] of Object.entries({ maintRows: proposal.maintRows, relationRows: proposal.relationRows, proposedEffects: proposal.proposedEffects })) {
    if (!Array.isArray(rows)) throw new Error(`Armor semantic repair ${key} are required`);
  }
  const recomputed = buildArmorEffectKeyRetirementPlan({
    selectedMemberIds: proposal.selectedMemberIds,
    currentRows: proposal.currentEffects ?? [],
    proposedRows: proposal.proposedEffects,
  });
  if (recomputed.planSha256 !== plan.planSha256) throw new Error('Armor semantic repair effect plan hash drifted');
  return true;
}

function readPrivateJson(repoRoot, relativePath) {
  const file = assertRepositoryOrdinaryFile({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label: 'Armor semantic repair proposal' });
  if ((fs.statSync(file).mode & 0o077) !== 0) throw new Error('Armor semantic repair proposal must be private');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writePrivateJson(repoRoot, relativePath, value) {
  const file = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label: 'Armor semantic repair result', createParent: true });
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function connectionOptions(config) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(config?.database?.host) || Number(config?.database?.port) !== 13306) throw new Error('Armor semantic repair target must be loopback:13306');
  return { host: config.database.host, port: 13306, user: config.database.username, password: config.database.password, database: 'terria_v1_local', timezone: '+08:00' };
}

function mapRow(row) { return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id' && key !== 'created_at' && key !== 'updated_at').map(([key, value]) => [snakeCase(key), value])); }

async function upsertRows(connection, database, table, rows) {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) throw new Error(`Armor semantic repair table is outside ownership: ${table}`);
  let count = 0;
  for (const row of rows) {
    const mapped = mapRow(row);
    const columns = Object.keys(mapped).filter((column) => allowed.has(column));
    if (!columns.includes('record_key')) throw new Error(`${table} row record_key is required`);
    const updates = columns.filter((column) => column !== 'record_key').map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
    await connection.execute(`INSERT INTO \`${database}\`.\`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${updates || '`record_key` = VALUES(`record_key`)'}`, columns.map((column) => /(?:_timestamp|_at)$/.test(column) ? mysqlDate(mapped[column]) : mapped[column]));
    count += 1;
  }
  return count;
}

export async function applyArmorSemanticRepair({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule, now = new Date().toISOString() } = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorSemanticRepairPaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: ARMOR_SEMANTIC_REPAIR_OPERATION_ID, env, now });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel || JSON.stringify(context.executionManifest.ownershipKeys) !== JSON.stringify(ARMOR_SEMANTIC_REPAIR_OWNERSHIP)) throw new Error('Armor semantic repair packet label/ownership drifted');
  const binding = context.dataBundleEntries.find((entry) => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Armor semantic repair proposal binding is missing');
  const proposal = readPrivateJson(root, paths.proposalPath);
  if (hashFile(path.resolve(root, paths.proposalPath)) !== binding.contentHash) throw new Error('Armor semantic repair proposal hash drifted');
  validateArmorSemanticRepairProposal(proposal);
  const source = readPrivateJson(root, proposal.sourceEvidencePath);
  if (hashFile(path.resolve(root, proposal.sourceEvidencePath)) !== proposal.sourceEvidenceHash || source.schemaVersion !== 'canonical-armor-semantic-repair-source/v1') throw new Error('Armor semantic repair source evidence drifted');
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  if (fingerprint.host !== '127.0.0.1' || Number(fingerprint.port) !== 13306 || JSON.stringify([...fingerprint.databases].sort()) !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) throw new Error('Armor semantic repair packet server target drifted');
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(loadLocalStackConfig(root)));
  let committed = false;
  try {
    await connection.beginTransaction();
    const landing = proposal.landingRows[0];
    const [current] = await connection.execute('SELECT id FROM `source_dataset_landings` WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ? AND is_current = 1 FOR UPDATE', [landing.dataset_type, landing.provider, landing.source_key, landing.source_page]);
    let landingId;
    if (proposal.landingDisposition === 'reuse-current' && current.length === 1 && current[0].content_hash === landing.content_hash) {
      landingId = Number(current[0].id);
    } else {
      for (const row of current) await connection.execute('UPDATE `source_dataset_landings` SET is_current = 0 WHERE id = ?', [row.id]);
      const landingColumns = ['dataset_type', 'provider', 'source_kind', 'source_key', 'source_locator', 'source_page', 'source_revision_timestamp', 'content_hash', 'payload_json', 'fetched_at', 'parsed_at', 'parse_status', 'artifact_role', 'producer_id', 'producer_version', 'producer_run_key', 'bootstrap_manifest_hash', 'full_file_content_hash', 'full_file_byte_size', 'is_current', 'notes'];
      const landingSql = `INSERT INTO \`source_dataset_landings\` (${landingColumns.map((column) => `\`${column}\``).join(', ')}) VALUES (${landingColumns.map(() => '?').join(', ')})`;
      const [landingInsert] = await connection.execute(landingSql, landingColumns.map((column) => /(?:_timestamp|_at)$/.test(column) ? mysqlDate(landing[column]) : landing[column] ?? null));
      landingId = Number(landingInsert?.insertId);
    if (!Number.isSafeInteger(landingId) || landingId <= 0) throw new Error('Armor semantic repair landing insert did not return an id');
    }
    const [maintCurrent] = await connection.execute('SELECT * FROM `terria_v1_maint`.`source_dataset_landings` WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ? AND is_current = 1 FOR UPDATE', [landing.dataset_type, landing.provider, landing.source_key, landing.source_page]);
    let maintLandingId;
    let maintLandingInserted = 0;
    const maintRevisionMatches = maintCurrent.length === 1
      && new Date(maintCurrent[0].source_revision_timestamp).toISOString().slice(0, 19) === String(landing.source_revision_timestamp).slice(0, 19);
    if (maintRevisionMatches && maintCurrent[0].content_hash === landing.content_hash) {
      maintLandingId = Number(maintCurrent[0].id);
    } else {
      for (const row of maintCurrent) await connection.execute('UPDATE `terria_v1_maint`.`source_dataset_landings` SET is_current = 0 WHERE id = ?', [row.id]);
      const landingColumns = ['dataset_type', 'provider', 'source_kind', 'source_key', 'source_locator', 'source_page', 'source_revision_timestamp', 'content_hash', 'payload_json', 'fetched_at', 'parsed_at', 'parse_status', 'artifact_role', 'producer_id', 'producer_version', 'producer_run_key', 'bootstrap_manifest_hash', 'full_file_content_hash', 'full_file_byte_size', 'is_current', 'notes'];
      const landingSql = `INSERT INTO \`terria_v1_maint\`.\`source_dataset_landings\` (${landingColumns.map((column) => `\`${column}\``).join(', ')}) VALUES (${landingColumns.map(() => '?').join(', ')})`;
      const [landingInsert] = await connection.execute(landingSql, landingColumns.map((column) => /(?:_timestamp|_at)$/.test(column) ? mysqlDate(landing[column]) : landing[column] ?? null));
      maintLandingId = Number(landingInsert?.insertId); maintLandingInserted = 1;
      if (!Number.isSafeInteger(maintLandingId) || maintLandingId <= 0) throw new Error('Armor semantic repair maint landing insert did not return an id');
    }
    const maintRows = proposal.maintRows.map((row) => ({ ...row, landing_source_id: maintLandingId }));
    const maintCount = await upsertRows(connection, 'terria_v1_maint', 'maint_armor_attribute_rows', maintRows);
    const maintKeyPlaceholders = maintRows.map(() => '?').join(', ');
    const [maintIds] = await connection.execute(`SELECT id, record_key FROM \`terria_v1_maint\`.\`maint_armor_attribute_rows\` WHERE record_key IN (${maintKeyPlaceholders}) FOR UPDATE`, maintRows.map((row) => row.record_key));
    const maintIdByKey = new Map(maintIds.map((row) => [row.record_key, Number(row.id)]));
    const relationRows = proposal.relationRows.map((row) => ({ ...row, landing_source_id: maintLandingId, source_maint_id: maintIdByKey.get(row.source_maint_record_key) ?? null }));
    if (relationRows.some((row) => row.source_maint_id == null)) throw new Error('Armor semantic repair maint lineage readback is incomplete');
    const relationCount = await upsertRows(connection, 'terria_v1_relation', 'relation_armor_attribute_rows', relationRows);
    for (const recordKey of proposal.maintRetireRecordKeys) {
      await connection.execute('UPDATE `terria_v1_maint`.`maint_armor_attribute_rows` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE record_key = ? AND status = 1 AND deleted = 0', [recordKey]);
    }
    for (const recordKey of proposal.relationRetireRecordKeys) {
      await connection.execute('UPDATE `terria_v1_relation`.`relation_armor_attribute_rows` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE record_key = ? AND status = 1 AND deleted = 0', [recordKey]);
    }
    for (const row of proposal.effectPlan.retire) {
      await connection.execute('UPDATE `terria_v1_relation`.`relation_equipment_effect_attributes` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE record_key = ? AND owner_kind = ? AND owner_id = ? AND status = 1 AND deleted = 0', [row.record_key, row.owner_kind, row.owner_id]);
    }
    const effectRows = proposal.effectPlan.insert.map((row) => ({ ...row, landing_source_id: maintLandingId, source_maint_id: maintIdByKey.get(row.source_maint_record_key) ?? null }));
    if (effectRows.some((row) => row.source_maint_id == null)) throw new Error('Armor semantic repair effect maint lineage readback is incomplete');
    const effectUpdates = proposal.effectPlan.update.map((change) => ({ ...change.after, landing_source_id: maintLandingId, source_maint_id: maintIdByKey.get(change.after.source_maint_record_key) ?? null }));
    if (effectUpdates.some((row) => row.source_maint_id == null)) throw new Error('Armor semantic repair effect update lineage readback is incomplete');
    let effectCount = await upsertRows(connection, 'terria_v1_relation', 'relation_equipment_effect_attributes', effectRows);
    for (const row of effectUpdates) {
      const mapped = mapRow(row);
      const columns = Object.keys(mapped).filter((column) => TABLE_COLUMNS.relation_equipment_effect_attributes.has(column) && column !== 'record_key' && column !== 'id');
      await connection.execute(`UPDATE \`terria_v1_relation\`.\`relation_equipment_effect_attributes\` SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')} WHERE record_key = ? AND status = 1 AND deleted = 0`, [...columns.map((column) => /(?:_timestamp|_at)$/.test(column) ? mysqlDate(mapped[column]) : mapped[column]), row.record_key]);
      effectCount += 1;
    }
    await connection.commit(); committed = true;
    consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context, decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') });
    const result = { schemaVersion: 1, resultKind: 'canonical_armor_semantic_repair_result', operationId: ARMOR_SEMANTIC_REPAIR_OPERATION_ID, status: 'COMPLETED', transactionCommitted: true, counts: { landingInserted: proposal.landingDisposition === 'insert-new-current' ? 1 : 0, maintLandingInserted, maintUpserts: maintCount, maintRetired: proposal.maintRetireRecordKeys.length, relationUpserts: relationCount, relationRetired: proposal.relationRetireRecordKeys.length, effectsRetired: proposal.effectPlan.retire.length, effectsInserted: effectCount }, authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash }, completedAt: now };
    writePrivateJson(root, paths.resultPath, result);
    return result;
  } catch (error) {
    if (!committed) { try { await connection.rollback(); } catch { /* Preserve primary error. */ } }
    throw error;
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=')]; }));
  if (args['operation-id'] !== ARMOR_SEMANTIC_REPAIR_OPERATION_ID || args.apply !== 'true') throw new Error('Armor semantic repair CLI requires exact operation and --apply=true');
  applyArmorSemanticRepair({ resultLabel: args['result-label'] }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
