import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { materializeRecordedResponse } from './recorded-http-fixture-source.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

const ISOLATED = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_(local|maint|relation)$/;
const FORMAL_LOCAL = 'terria_v1_local';

function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function assertDatabaseSet(databases) {
  for (const role of ['local', 'maint', 'relation']) {
    if (!ISOLATED.test(String(databases?.[role] ?? ''))) throw new Error(`recorded Item target ${role} database is not run-derived`);
  }
  const keys = ['local', 'maint', 'relation'].map((role) => String(databases[role]).replace(/_(local|maint|relation)$/, ''));
  if (new Set(keys).size !== 1) throw new Error('recorded Item target databases must share one run key');
}

export function collectRecordedItemSelection({ payload, sourcePath, limit = 100 } = {}) {
  const normalizedSource = String(sourcePath ?? '').replaceAll('\\', '/');
  if (!normalizedSource || path.isAbsolute(normalizedSource) || /^(?:https?:)?\/\//i.test(normalizedSource)) {
    throw new Error('recorded Item source must be repository-relative');
  }
  if (!Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 100) throw new Error('recorded Item selection allows at most one hundred records');
  if (payload?.entity !== 'items' || !Array.isArray(payload.records)) throw new Error('recorded Item payload must contain entity=items records');
  const selected = payload.records.slice(0, Number(limit)).map((record) => ({ ...record, internalName: text(record.internalName) }));
  if (!selected.length || selected.some((record) => !record.internalName)) throw new Error('recorded Item selection contains an invalid internalName');
  return Object.freeze({ networkAccess: false, sourcePath: normalizedSource, records: selected, internalNames: selected.map((record) => record.internalName) });
}

function safeColumns(row) {
  const columns = Object.keys(row ?? {}).filter((column) => /^[a-z0-9_]+$/i.test(column));
  if (!columns.length) throw new Error('Item row has no safe columns');
  return columns;
}

async function insertRows(connection, database, table, rows) {
  for (const row of rows) {
    const columns = safeColumns(row);
    const quoted = columns.map((column) => `\`${column}\``).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    await connection.query(
      `INSERT INTO \`${database}\`.\`${table}\` (${quoted}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ')}`,
      columns.map((column) => row[column]),
    );
  }
}

function buildMaintRow(record, sourceRow, sourcePath, sourceHash) {
  const stats = record.stats ?? {};
  const stack = record.stack ?? {};
  return {
    source_id: Number(sourceRow.id ?? record.id), internal_name: sourceRow.internal_name ?? record.internalName,
    english_name: sourceRow.name ?? record.name ?? null, name_zh: sourceRow.name_zh ?? null,
    source_provider: 'recorded-standardized-item', source_page: sourcePath, landing_source_id: 0,
    landing_source_key: `recorded-item:${sourceRow.id ?? record.id}`, landing_source_page: sourcePath,
    landing_content_hash: sourceHash.replace(/^sha256:/, ''), raw_json: JSON.stringify(record), status: Number(sourceRow.status ?? record.status ?? 1), deleted: 0,
    major_value: record.economy?.buy ?? null, combat_value: stats.damage ?? null, defense_value: stats.defense ?? null,
    use_time: stats.useTime ?? null, stack_size: stack.stackSize ?? null, width: stats.width ?? null, height: stats.height ?? null,
    flags_json: JSON.stringify({ stackable: Boolean(stack.isStackable) }),
  };
}

function buildRelationRow(record, sourceRow, sourcePath, sourceHash, maintRow) {
  const recordKey = createHash('sha256').update(`recorded-item:${sourceRow.id ?? record.id}:${sourceRow.internal_name ?? record.internalName}`).digest('hex');
  return {
    record_key: recordKey, source_id: Number(sourceRow.id ?? record.id), internal_name: sourceRow.internal_name ?? record.internalName,
    english_name: sourceRow.name ?? record.name ?? null, name_zh: sourceRow.name_zh ?? null, major_value: maintRow.major_value,
    combat_value: maintRow.combat_value, defense_value: maintRow.defense_value, use_time: maintRow.use_time, stack_size: maintRow.stack_size,
    width: maintRow.width, height: maintRow.height, source_maint_table: 'maint_items', source_maint_record_key: recordKey,
    landing_source_id: 0, landing_source_key: `recorded-item:${sourceRow.id ?? record.id}`, landing_content_hash: sourceHash.replace(/^sha256:/, ''),
    source_provider: 'recorded-standardized-item', source_page: sourcePath, confidence: 1, reason: 'recorded_item_mirrored', review_status: 'accepted', raw_json: JSON.stringify(record), status: 1, deleted: 0,
  };
}

export async function runRecordedItemAutoIngestion({
  profile, runId, repoRoot, databases, mysql, markerRoot, sourcePath = 'data/standardized/items.standardized.json', limit = 100,
  progressPath, createConnectionImpl = (options) => loadMysqlModule().createConnection(options),
} = {}) {
  if (profile !== 't1') throw new Error('recorded Item auto-ingestion requires T1 profile');
  assertDatabaseSet(databases);
  if (mysql?.host !== '127.0.0.1' || !text(mysql?.readonlyUsername) || !text(mysql?.readonlyPassword) || !text(mysql?.username) || !text(mysql?.password)) throw new Error('recorded Item ingestion requires loopback readonly and provisioner identities');
  const response = materializeRecordedResponse({ repoRoot, sourcePath, markerRoot, limit, maxLimit: 100, requestUrl: '/recorded/items' });
  const selection = collectRecordedItemSelection({ payload: JSON.parse(response.response.body), sourcePath, limit });
  const writeProgress = (status, phase, message) => {
    if (!progressPath) return;
    fs.writeFileSync(progressPath, `${JSON.stringify({ actionId: 'crawler-queue-v2-items-fixture', status, phase, message, networkAccess: false, itemCount: selection.records.length, generatedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  };
  writeProgress('starting', 'resolve-formal-items', 'resolving selected Item identities through readonly formal local.items');
  const source = await createConnectionImpl({ host: mysql.host, port: Number(mysql.port), user: mysql.readonlyUsername, password: mysql.readonlyPassword, database: FORMAL_LOCAL });
  let targets = [];
  try {
    const names = selection.internalNames;
    const placeholders = names.map(() => '?').join(', ');
    const [rows] = await source.query(`SELECT * FROM \`${FORMAL_LOCAL}\`.\`items\` WHERE \`deleted\` = 0 AND \`internal_name\` IN (${placeholders})`, names);
    const byName = new Map(rows.map((row) => [String(row.internal_name).toLowerCase(), row]));
    const missing = names.filter((name) => !byName.has(name.toLowerCase()));
    if (missing.length) throw new Error(`recorded Item dependency closure is incomplete: ${JSON.stringify({ missingItems: missing })}`);
    targets = await Promise.all(['local', 'maint', 'relation'].map((role) => createConnectionImpl({ host: mysql.host, port: Number(mysql.port), user: mysql.username, password: mysql.password, database: databases[role] })));
    for (const target of targets) await target.beginTransaction();
    const maintRows = selection.records.map((record) => buildMaintRow(record, byName.get(record.internalName.toLowerCase()), sourcePath, response.sourceHash));
    const relationRows = selection.records.map((record, index) => buildRelationRow(record, byName.get(record.internalName.toLowerCase()), sourcePath, response.sourceHash, maintRows[index]));
    await insertRows(targets[0], databases.local, 'items', selection.records.map((record) => byName.get(record.internalName.toLowerCase())));
    await insertRows(targets[1], databases.maint, 'maint_items', maintRows);
    await insertRows(targets[2], databases.relation, 'relation_items', relationRows);
    for (const target of targets) await target.commit();
    const summaryPath = path.join(path.resolve(markerRoot), 'item-ingestion-summary.json');
    fs.writeFileSync(summaryPath, `${JSON.stringify({ itemCount: selection.records.length, maintCount: maintRows.length, relationCount: relationRows.length, unresolvedIdentities: 0, internalNames: selection.internalNames, recordKeys: relationRows.map((row) => row.record_key), sourceHash: response.sourceHash }, null, 2)}\n`, { mode: 0o600, flag: 'w' });
    writeProgress('completed', 'completed', 'recorded Item rows persisted to isolated local, maint, and relation databases');
    return { status: 'passed', networkAccess: false, sourceHash: response.sourceHash, selectedRecords: selection.records.length, itemCount: selection.records.length, maintCount: maintRows.length, relationCount: relationRows.length, unresolvedIdentities: 0, progressPath: progressPath ?? null, summaryPath };
  } catch (error) {
    await Promise.allSettled(targets.map((target) => target.rollback()));
    writeProgress('failed', 'failed', error.message);
    throw error;
  } finally {
    await Promise.allSettled([source.end(), ...targets.map((target) => target.end())]);
  }
}
