import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { buildLocalDbConnectionOptions } from './local-db-connection-options.mjs';

const TABLE_QUERY_DEFINITIONS = [
  {
    key: 'localItems',
    by: 'itemId',
    table: '`terria_v1_local`.`items`',
    conditionColumn: 'id',
    columns: ['id', 'internal_name', 'name', 'name_zh', 'image', 'source_provider', 'source_page', 'source_revision_timestamp', 'last_synced_at', 'status', 'deleted', 'updated_at'],
    orderBy: 'id'
  },
  {
    key: 'localItemImages',
    by: 'itemId',
    table: '`terria_v1_local`.`item_images`',
    conditionColumn: 'item_id',
    columns: ['id', 'item_id', 'role', 'provider', 'source_file_title', 'source_page', 'source_revision_timestamp', 'original_url', 'cached_url', 'width', 'height', 'content_type', 'is_primary', 'sort_order', 'last_verified_at', 'status', 'deleted', 'updated_at'],
    orderBy: 'item_id, is_primary DESC, sort_order, id'
  },
  {
    key: 'maintItems',
    by: 'internalName',
    table: '`terria_v1_maint`.`maint_items`',
    conditionColumn: 'internal_name',
    columns: ['id', 'source_id', 'internal_name', 'english_name', 'name_zh', 'source_provider', 'source_page', 'source_revision_timestamp', 'landing_source_id', 'landing_source_key', 'landing_source_page', 'landing_content_hash', 'canonical_version', 'status', 'deleted', 'updated_at'],
    orderBy: 'internal_name, id'
  },
  {
    key: 'maintItemImages',
    by: 'internalName',
    table: '`terria_v1_maint`.`maint_item_images`',
    conditionColumn: 'item_internal_name',
    columns: ['id', 'record_key', 'item_internal_name', 'item_name', 'role', 'source_provider', 'source_file_title', 'source_page', 'source_revision_timestamp', 'original_url', 'cached_url', 'width', 'height', 'content_type', 'is_primary', 'sort_order', 'landing_source_id', 'landing_source_key', 'landing_source_page', 'landing_content_hash', 'status', 'deleted', 'updated_at'],
    orderBy: 'item_internal_name, is_primary DESC, sort_order, id'
  },
  {
    key: 'relationItems',
    by: 'internalName',
    table: '`terria_v1_relation`.`relation_items`',
    conditionColumn: 'internal_name',
    columns: ['id', 'record_key', 'source_id', 'internal_name', 'english_name', 'name_zh', 'source_maint_table', 'source_maint_record_key', 'source_maint_id', 'landing_source_id', 'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page', 'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'status', 'deleted', 'updated_at'],
    orderBy: 'internal_name, id'
  },
  {
    key: 'relationItemImages',
    by: 'internalName',
    table: '`terria_v1_relation`.`relation_item_images`',
    conditionColumn: 'item_internal_name',
    columns: ['id', 'record_key', 'item_internal_name', 'item_name', 'role', 'source_file_title', 'original_url', 'cached_url', 'width', 'height', 'content_type', 'is_primary', 'sort_order', 'source_maint_table', 'source_maint_record_key', 'source_maint_id', 'landing_source_id', 'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page', 'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'status', 'deleted', 'updated_at'],
    orderBy: 'item_internal_name, is_primary DESC, sort_order, id'
  },
  {
    key: 'projectionItems',
    by: 'internalName',
    table: '`terria_v1_relation`.`projection_items`',
    conditionColumn: 'internal_name',
    columns: ['id', 'relation_record_key', 'internal_name', 'name', 'name_zh', 'slug', 'image', 'source_provider', 'source_page', 'source_revision_timestamp', 'last_synced_at', 'status', 'deleted', 'updated_at'],
    orderBy: 'internal_name, id'
  }
];

const OMITTED_COLUMNS = [
  'description', 'description_zh', 'tooltip', 'tooltip_zh', 'flags_json', 'raw_json',
  'source_npcs_json'
];

export function buildItemImageGapDetailSnapshot({ classification, tables, generatedAt = new Date().toISOString() }) {
  const identities = collectIdentities(classification);
  const records = identities.map((identity) => ({
    ...identity,
    tables: {
      local: {
        items: tableDetail(tables.localItems.filter((row) => Number(row.id) === identity.itemId)),
        images: tableDetail(tables.localItemImages.filter((row) => Number(row.item_id) === identity.itemId))
      },
      maint: {
        items: tableDetail(tables.maintItems.filter((row) => row.internal_name === identity.internalName)),
        images: tableDetail(tables.maintItemImages.filter((row) => row.item_internal_name === identity.internalName))
      },
      relation: {
        items: tableDetail(tables.relationItems.filter((row) => row.internal_name === identity.internalName)),
        images: tableDetail(tables.relationItemImages.filter((row) => row.item_internal_name === identity.internalName))
      },
      projection: {
        items: tableDetail(tables.projectionItems.filter((row) => row.internal_name === identity.internalName))
      }
    }
  }));

  return {
    schemaVersion: '1.0.0',
    entity: 'item_image_gap_detail_snapshot',
    generatedAt,
    readOnly: true,
    databaseWrites: false,
    externalRequests: false,
    crawlerOrFetch: false,
    scope: {
      identityCount: identities.length,
      sourceClassificationEntity: classification?.entity ?? null,
      sourceClassificationGeneratedAt: classification?.generatedAt ?? null
    },
    fieldsIncluded: {
      intent: 'Identity, source/landing lineage, image provenance, cache location, state, and timestamps needed to review each local table row.',
      omittedColumns: OMITTED_COLUMNS
    },
    summary: {
      tableRowCounts: Object.fromEntries(
        Object.entries(tables).map(([key, rows]) => [key, rows.length])
      )
    },
    records
  };
}

export async function runItemImageGapDetailSnapshot({
  repoRoot = process.cwd(),
  classificationPath = defaultClassificationPath(repoRoot),
  outputPath = defaultOutputPath(repoRoot),
  createConnection = defaultCreateConnection
} = {}) {
  const classification = JSON.parse(await readFile(classificationPath, 'utf8'));
  const identities = collectIdentities(classification);
  const connection = await createConnection(buildLocalDbConnectionOptions());

  try {
    const tables = {};
    for (const definition of TABLE_QUERY_DEFINITIONS) {
      tables[definition.key] = await queryRows(connection, definition, identities);
    }

    const snapshot = buildItemImageGapDetailSnapshot({ classification, tables });
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    return snapshot;
  } finally {
    await connection.end();
  }
}

function collectIdentities(classification) {
  const groups = classification?.classification ?? {};
  const identities = [];
  const seen = new Set();

  for (const [classificationKey, group] of Object.entries(groups)) {
    for (const identity of group?.identities ?? []) {
      const itemId = Number(identity.itemId);
      const internalName = String(identity.internalName ?? '').trim();
      const key = `${itemId}:${internalName}`;
      if (!Number.isInteger(itemId) || itemId <= 0 || !internalName || seen.has(key)) continue;
      seen.add(key);
      identities.push({
        itemId,
        internalName,
        classification: classificationKey,
        classificationDecision: group.decision ?? null,
        classificationReason: group.reason ?? identity.evidence ?? identity.verdict ?? null
      });
    }
  }

  return identities;
}

function tableDetail(rows) {
  return {
    rowCount: rows.length,
    activeRowCount: rows.filter(isActive).length,
    rows
  };
}

function isActive(row) {
  return Number(row.status ?? 1) === 1 && Number(row.deleted ?? 0) === 0;
}

async function queryRows(connection, definition, identities) {
  const values = definition.by === 'itemId'
    ? identities.map((identity) => identity.itemId)
    : identities.map((identity) => identity.internalName);
  const uniqueValues = [...new Set(values)];
  if (!uniqueValues.length) return [];

  const valuesSql = uniqueValues.map(escapeSqlValue).join(', ');
  const sql = buildQuery(definition, valuesSql);
  assertReadOnlySql(sql);
  return connection.execute(sql);
}

function buildQuery(definition, valuesSql) {
  const jsonFields = definition.columns
    .map((column) => `'${column}', ordered.${column}`)
    .join(', ');
  return `SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(${jsonFields})), JSON_ARRAY())
    FROM (SELECT ${definition.columns.join(', ')}
          FROM ${definition.table}
          WHERE ${definition.conditionColumn} IN (${valuesSql})
          ORDER BY ${definition.orderBy}) AS ordered`;
}

function escapeSqlValue(value) {
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function assertReadOnlySql(sql) {
  if (!/^SELECT\b/i.test(sql) || /\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql)) {
    throw new Error('Item image detail snapshot accepts SELECT-only table queries.');
  }
}

async function defaultCreateConnection(options) {
  const execFileAsync = promisify(execFile);
  return {
    async execute(sql) {
      const result = await execFileAsync('mysql', [
        '--protocol=TCP', '--host', options.host, '--port', String(options.port),
        '--user', options.user, '--batch', '--raw', '--skip-column-names',
        '--execute', sql
      ], { env: { ...process.env, MYSQL_PWD: options.password } });
      const output = result.stdout.trim();
      return output ? JSON.parse(output) : [];
    },
    async end() {}
  };
}

function defaultClassificationPath(repoRoot) {
  return path.join(repoRoot, 'reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-classification.json');
}

function defaultOutputPath(repoRoot) {
  return path.join(repoRoot, 'reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-table-details.json');
}

function parseArguments(argv) {
  const options = {};
  for (const argument of argv) {
    if (argument === '--help') return { help: true };
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    const [, key, value] = match;
    if (key === 'repo-root') options.repoRoot = path.resolve(value);
    else if (key === 'classification') options.classificationPath = path.resolve(value);
    else if (key === 'output') options.outputPath = path.resolve(value);
    else throw new Error(`Unsupported option: --${key}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node pipelines/audit/item-image-gap-detail-snapshot.mjs [--classification=path] [--output=path] [--repo-root=path]\n');
    return;
  }

  const snapshot = await runItemImageGapDetailSnapshot(options);
  process.stdout.write(`${JSON.stringify({ output: options.outputPath ?? defaultOutputPath(options.repoRoot ?? process.cwd()), identities: snapshot.scope.identityCount, readOnly: snapshot.readOnly })}\n`);
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (executedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
