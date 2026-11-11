import { createHash } from 'node:crypto';

import { verifyBuffIteminfoSemanticCapture } from '../fetch/buff-iteminfo-evidence.mjs';
import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';
import { extractMaintEntitiesFromLandingRow } from './sync-landing-to-maint.mjs';

export const BUFF_ITEM_MAINT_INSERT_OPERATION_ID = 'canonical-buff-item-maint-insert';
export const BUFF_ITEM_MAINT_INSERT_IDENTITIES = Object.freeze([
  [6148, 'PalworldMinionTrustyCattiva'],
  [6149, 'PalworldMinionTrustyFoxsparks'],
  [6155, 'LightningStrike'],
  [6161, 'ClayPotMinion'],
  [6164, 'ForbiddenMinion'],
  [6173, 'ArcSurge'],
].map(([sourceId, internalName]) => Object.freeze({ sourceId, internalName })));

export const BUFF_ITEM_MAINT_INSERT_COLUMNS = Object.freeze(('source_id internal_name english_name name_zh source_provider source_page source_revision_timestamp landing_source_id landing_source_key landing_source_page landing_content_hash landing_fetched_at landing_parsed_at module_generated_at terraria_version major_value combat_value defense_value use_time stack_size width height flags_json raw_json status deleted').split(' '));
export const BUFF_ITEM_LANDING_INSERT_COLUMNS = Object.freeze(('dataset_type provider source_kind source_key source_locator source_page source_revision_timestamp content_hash payload_json fetched_at parsed_at parse_status artifact_role producer_id producer_version producer_run_key bootstrap_manifest_hash full_file_content_hash full_file_byte_size is_current notes').split(' '));
export const BUFF_ITEM_MAINT_SNAPSHOT_COLUMNS = Object.freeze(['id', ...BUFF_ITEM_MAINT_INSERT_COLUMNS, 'created_at', 'updated_at']);
export const BUFF_ITEM_LANDING_SNAPSHOT_COLUMNS = Object.freeze(['id', ...BUFF_ITEM_LANDING_INSERT_COLUMNS, 'created_at', 'updated_at']);
export const BUFF_ITEM_MAINT_OWNERSHIP_KEYS = Object.freeze([
  'local.source_dataset_landings.items_raw.buff_item_dependency_insert',
  'maint.maint_items.buff_item_dependency_insert',
]);

const NAMESPACE = 'canonical.buff-item-dependency.';
const DATE_COLUMNS = new Set(['source_revision_timestamp', 'fetched_at', 'parsed_at',
  'landing_fetched_at', 'landing_parsed_at', 'created_at', 'updated_at']);
const NUMBER_COLUMNS = new Set(['id', 'source_id', 'landing_source_id', 'major_value', 'combat_value',
  'defense_value', 'use_time', 'stack_size', 'width', 'height', 'status', 'deleted',
  'is_current', 'full_file_byte_size']);

export async function buildBuffItemMaintInsertProposal({ source, runId, maintRows, landingRows } = {}) {
  if (typeof runId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(runId) || runId.length > 80) {
    throw new Error('Item dependency run ID is invalid');
  }
  const verified = verifyBuffIteminfoSemanticCapture(source);
  const capturedPage = source.semanticCapture.pages.find(row => row.pageTitle === 'Module:Iteminfo/data');
  const page = { ...JSON.parse(capturedPage.rawBytes.toString('utf8')),
    rawBytes: capturedPage.rawBytes, sha256: capturedPage.sha256 };
  const data = parseIteminfoModulePayload(page.wikitext);
  if (typeof data._generated !== 'string' || !data._generated.trim()
      || data._terrariaversion !== '1.4.5.7') {
    throw new Error('Item source generation/version metadata is invalid');
  }
  const subset = { _generated: data._generated, _terrariaversion: data._terrariaversion };
  for (const { sourceId, internalName } of BUFF_ITEM_MAINT_INSERT_IDENTITIES) {
    const item = data[sourceId];
    if (!item || item.internalName !== internalName || item.id != null && item.id !== sourceId) {
      throw new Error(`Item source identity is invalid: ${sourceId}`);
    }
    subset[sourceId] = item;
  }
  const before = normalizeBuffItemMaintSnapshot({ maintRows, landingRows });
  const sourceKey = `${NAMESPACE}${runId}`;
  if (before.landingRows.some(row => row.source_key === sourceKey)) {
    throw new Error('Item dependency landing namespace already exists');
  }
  for (const { sourceId, internalName } of BUFF_ITEM_MAINT_INSERT_IDENTITIES) {
    if (before.maintRows.some(row => row.source_id === sourceId
        || row.internal_name.toLowerCase() === internalName.toLowerCase())) {
      throw new Error(`Item maint identity conflicts with insert-only scope: ${sourceId}`);
    }
  }
  let equals = '=';
  const json = JSON.stringify(subset);
  while (json.includes(`]${equals}]`)) equals += '=';
  const payload = { moduleContent: `return { ["data"] = [${equals}[${json}]${equals}] }`,
    selectedSourceIds: BUFF_ITEM_MAINT_INSERT_IDENTITIES.map(row => row.sourceId),
    sourceBinding: verified.source };
  const payloadJson = JSON.stringify(payload);
  const landing = {
    dataset_type: 'items_raw', provider: 'terraria.wiki.gg', source_kind: 'bounded_iteminfo',
    source_key: sourceKey, source_locator: 'https://terraria.wiki.gg/wiki/Module:Iteminfo/data',
    source_page: page.pageTitle, source_revision_timestamp: sqlTimestamp(page.revisionTimestamp),
    content_hash: hashBuffItemMaintBytes(Buffer.from(payloadJson)).slice(7), payload_json: payloadJson,
    fetched_at: sqlTimestamp(page.fetchedAt), parsed_at: sqlTimestamp(page.fetchedAt),
    parse_status: 'ok', artifact_role: 'source_evidence', producer_id: BUFF_ITEM_MAINT_INSERT_OPERATION_ID,
    producer_version: '1', producer_run_key: runId,
    bootstrap_manifest_hash: verified.source.manifestSha256.slice(7),
    full_file_content_hash: page.sha256.slice(7), full_file_byte_size: page.rawBytes.length,
    is_current: 0, notes: 'Bounded Buff Item dependencies; six source identities only; excluded from general sync.',
  };
  const extracted = await extractMaintEntitiesFromLandingRow({ ...landing, id: 0 });
  const maintInserts = extracted.rows.map(row => maintInsertRow(row));
  if (JSON.stringify(maintInserts.map(row => [row.source_id, row.internal_name]))
      !== JSON.stringify(BUFF_ITEM_MAINT_INSERT_IDENTITIES.map(row => [row.sourceId, row.internalName]))) {
    throw new Error('Bounded Item maint derivation identity drifted');
  }
  const body = {
    schemaVersion: 'buff-item-maint-insert-proposal/v1', operationId: BUFF_ITEM_MAINT_INSERT_OPERATION_ID,
    runId, executable: false, applyAllowed: false, databaseWrites: false,
    sourceBinding: verified.source, ownershipKeys: [...BUFF_ITEM_MAINT_OWNERSHIP_KEYS],
    before, beforeHash: hashBuffItemMaintValue(before), landing, maintInserts,
    expectedInserts: { landing: 1, maint: 6 }, updates: 0, deletes: 0,
  };
  return { ...body, contractHash: hashBuffItemMaintValue(body) };
}

export function normalizeBuffItemMaintSnapshot({ maintRows, landingRows } = {}) {
  const normalizeRows = (rows, columns, label) => {
    if (!Array.isArray(rows)) throw new Error(`${label} snapshot rows are required`);
    const ids = new Set();
    return rows.map(row => {
      const normalized = {};
      for (const column of columns) {
        if (!Object.hasOwn(row, column) || row[column] === undefined) throw new Error(`${label} snapshot column is missing: ${column}`);
        const value = row[column];
        if (value == null) normalized[column] = null;
        else if (DATE_COLUMNS.has(column)) normalized[column] = sqlTimestamp(value);
        else if (NUMBER_COLUMNS.has(column)) {
          if (typeof value === 'boolean' || value === '' || !Number.isSafeInteger(Number(value))) {
            throw new Error(`${label} snapshot numeric column is invalid: ${column}`);
          }
          normalized[column] = Number(value);
        } else {
          if (typeof value !== 'string') throw new Error(`${label} snapshot text column is invalid: ${column}`);
          normalized[column] = value;
        }
      }
      if (!Number.isSafeInteger(normalized.id) || normalized.id <= 0 || ids.has(normalized.id)) {
        throw new Error(`${label} snapshot row identity is invalid or duplicated`);
      }
      ids.add(normalized.id);
      if (label === 'maint' && (!Number.isSafeInteger(normalized.source_id) || normalized.source_id <= 0
          || !normalized.internal_name)) throw new Error('Item maint snapshot source identity is invalid');
      return normalized;
    }).sort((left, right) => left.id - right.id);
  };
  const result = { maintRows: normalizeRows(maintRows, BUFF_ITEM_MAINT_SNAPSHOT_COLUMNS, 'maint'),
    landingRows: normalizeRows(landingRows, BUFF_ITEM_LANDING_SNAPSHOT_COLUMNS, 'landing') };
  if (new Set(result.maintRows.map(row => row.source_id)).size !== result.maintRows.length
      || new Set(result.maintRows.map(row => row.internal_name.toLowerCase())).size !== result.maintRows.length) {
    throw new Error('Item maint snapshot source identity is duplicated');
  }
  return result;
}

export function hashBuffItemMaintValue(value) {
  const canonical = input => {
    if (input === null || typeof input !== 'object') return JSON.stringify(input);
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`;
    return `{${Object.keys(input).sort().map(key => `${JSON.stringify(key)}:${canonical(input[key])}`).join(',')}}`;
  };
  return hashBuffItemMaintBytes(Buffer.from(canonical(value)));
}

export function hashBuffItemMaintBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function maintInsertRow(row) {
  const camel = ['sourceId', 'internalName', 'englishName', 'nameZh', 'sourceProvider', 'sourcePage',
    'sourceRevisionTimestamp', 'landingSourceId', 'landingSourceKey', 'landingSourcePage',
    'landingContentHash', 'landingFetchedAt', 'landingParsedAt', 'moduleGeneratedAt', 'terrariaVersion',
    'majorValue', 'combatValue', 'defenseValue', 'useTime', 'stackSize', 'width', 'height', 'flagsJson', 'rawJson'];
  return Object.fromEntries(BUFF_ITEM_MAINT_INSERT_COLUMNS.map((column, index) => [column,
    column === 'landing_source_id' ? null : column === 'status' ? 1 : column === 'deleted' ? 0
      : row[camel[index]] ?? null]));
}

function sqlTimestamp(value) {
  const timestamp = value instanceof Date ? value.toISOString()
    : typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
      ? `${value.replace(' ', 'T')}Z` : value;
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error('Item source/snapshot timestamp is invalid');
  }
  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
}
