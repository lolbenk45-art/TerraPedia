import { createHash } from 'node:crypto';

const DATABASE = 'terria_v1_local';
const TABLE = 'source_dataset_landings';
const DATASET_TYPE = 'buffs_raw';
const PROVIDER = 'terraria.wiki.gg';
const SOURCE_PAGE = 'Template:GetBuffInfo';
const NAMESPACE = 'canonical.buff-page-immunity';
const INSERT_COLUMNS = Object.freeze([
  'dataset_type', 'provider', 'source_kind', 'source_key', 'source_locator', 'source_page',
  'source_revision_timestamp', 'content_hash', 'payload_json', 'fetched_at', 'parsed_at',
  'parse_status', 'artifact_role', 'producer_id', 'producer_version', 'producer_run_key',
  'bootstrap_manifest_hash', 'full_file_content_hash', 'full_file_byte_size', 'is_current', 'notes',
]);

export function buildBuffLandingInsertPlan({ landingRow, sourceEvidenceHash, runId } = {}) {
  const row = validateLandingRow(landingRow, { runId });
  const evidenceHash = requireSha256(sourceEvidenceHash, 'sourceEvidenceHash');
  const { id: _id, ...insertRow } = row;
  return Object.freeze({
    schemaVersion: 'buff-landing-mutation/v1',
    executable: true,
    write: Object.freeze({ database: DATABASE, table: TABLE, mode: 'insert-only' }),
    sourceEvidenceHash: evidenceHash,
    landing: Object.freeze(insertRow),
  });
}

export function assertBuffLandingMutationPlan(plan) {
  validatePlan(plan);
  return true;
}

export async function applyBuffLandingMutation({ connection, plan, transactionContext } = {}) {
  validatePlan(plan);
  if (!transactionContext?.transactionActive || !transactionContext?.fenceHeld) {
    throw new Error('Buff landing mutation requires an active transaction and held ownership fence');
  }
  if (!connection || typeof connection.execute !== 'function') {
    throw new TypeError('Buff landing mutation connection is required');
  }
  const row = plan.landing;
  const [existing] = await connection.execute(
    `SELECT id, source_key, source_page, content_hash, is_current
       FROM ${DATABASE}.${TABLE}
      WHERE dataset_type = ? AND provider = ? AND source_key = ? AND source_page = ?
      FOR UPDATE`,
    [row.dataset_type, row.provider, row.source_key, row.source_page],
  );
  if (Array.isArray(existing) && existing.length > 0) {
    throw new Error('Buff landing namespace already exists; historical overwrite is forbidden');
  }

  const [insertResult] = await connection.execute(
    `INSERT INTO ${DATABASE}.${TABLE} (${INSERT_COLUMNS.map(quote).join(', ')})
     VALUES (${INSERT_COLUMNS.map(() => '?').join(', ')})`,
    INSERT_COLUMNS.map(column => row[column] ?? null),
  );
  if (Number(insertResult?.affectedRows) !== 1 || !positiveId(insertResult?.insertId)) {
    throw new Error('Buff landing insert did not return exactly one real landing id');
  }
  const landingId = Number(insertResult.insertId);
  const [readback] = await connection.execute(
    `SELECT id, dataset_type, provider, source_key, source_page, source_revision_timestamp,
            content_hash, payload_json, is_current
       FROM ${DATABASE}.${TABLE}
      WHERE id = ?
      FOR UPDATE`,
    [landingId],
  );
  if (!Array.isArray(readback) || readback.length !== 1) {
    throw new Error('Buff landing insert readback is missing');
  }
  assertLandingReadback(readback[0], row, landingId);
  return Object.freeze({ landingId, row: Object.freeze({ ...readback[0] }), sourceEvidenceHash: plan.sourceEvidenceHash });
}

function validatePlan(plan) {
  if (!plan || plan.schemaVersion !== 'buff-landing-mutation/v1' || plan.executable !== true
      || plan.write?.database !== DATABASE || plan.write?.table !== TABLE || plan.write?.mode !== 'insert-only') {
    throw new Error('Buff landing mutation plan is invalid');
  }
  requireSha256(plan.sourceEvidenceHash, 'sourceEvidenceHash');
  validateLandingRow(plan.landing, { runId: runIdFromKey(plan.landing?.source_key) });
  if (Object.hasOwn(plan.landing, 'id') && plan.landing.id != null) {
    throw new Error('Buff landing mutation plan cannot carry an allocated id');
  }
}

function validateLandingRow(row, { runId } = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Buff landing row is required');
  if (row.id != null) throw new Error('Buff landing row cannot carry an allocated id');
  if (row.dataset_type !== DATASET_TYPE || row.provider !== PROVIDER || row.source_page !== SOURCE_PAGE) {
    throw new Error('Buff landing source identity is invalid');
  }
  if (typeof runId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(runId)) {
    throw new Error('Buff landing run id is invalid');
  }
  const expectedKey = `${NAMESPACE}.${runId}`;
  if (row.source_key !== expectedKey || row.source_key.startsWith('wiki.')) {
    throw new Error('Buff landing source key is outside the fresh namespace');
  }
  if (row.artifact_role !== 'source_evidence' || row.parse_status !== 'ok' || Number(row.is_current) !== 1) {
    throw new Error('Buff landing artifact markers are invalid');
  }
  for (const field of ['source_kind', 'source_key', 'source_locator', 'producer_id', 'producer_version', 'producer_run_key']) {
    if (typeof row[field] !== 'string' || !row[field].trim()) throw new Error(`Buff landing ${field} is required`);
  }
  requireBareHash(row.content_hash, 'content hash');
  const payload = parsePayload(row.payload_json);
  if (payload.sourcePageTitle !== SOURCE_PAGE || payload.sourceRevisionTimestamp !== row.source_revision_timestamp) {
    throw new Error('Buff landing source revision binding drifted');
  }
  if (!Array.isArray(payload.buffs) || payload.buffs.length === 0 || payload.totalBuffs !== payload.buffs.length) {
    throw new Error('Buff landing payload coverage is invalid');
  }
  const ids = new Set();
  const names = new Set();
  for (const buff of payload.buffs) {
    if (!positiveId(buff?.id) || typeof buff.internalName !== 'string' || !buff.internalName.trim()
        || ids.has(Number(buff.id)) || names.has(buff.internalName)) {
      throw new Error('Buff landing payload identity is invalid or duplicated');
    }
    ids.add(Number(buff.id));
    names.add(buff.internalName);
    const evidence = buff.sourceEvidence;
    if (!positiveId(evidence?.revisionId) || typeof evidence.canonicalPageTitle !== 'string'
        || !evidence.canonicalPageTitle.trim() || typeof evidence.revisionTimestamp !== 'string'
        || evidence.parseStatus !== 'parsed') {
      throw new Error('Buff landing payload source revision evidence is incomplete');
    }
  }
  const actualHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (actualHash !== row.content_hash) throw new Error('Buff landing content hash drifted');
  return row;
}

function assertLandingReadback(actual, expected, landingId) {
  if (Number(actual.id) !== landingId || actual.dataset_type !== expected.dataset_type
      || actual.provider !== expected.provider || actual.source_key !== expected.source_key
      || actual.source_page !== expected.source_page || actual.content_hash !== expected.content_hash
      || Number(actual.is_current) !== 1 || actual.source_revision_timestamp !== expected.source_revision_timestamp) {
    throw new Error('Buff landing insert readback drifted');
  }
}

function parsePayload(value) {
  let payload;
  try { payload = typeof value === 'string' ? JSON.parse(value) : value; } catch { payload = null; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Buff landing payload is invalid');
  return payload;
}

function runIdFromKey(sourceKey) {
  const prefix = `${NAMESPACE}.`;
  return typeof sourceKey === 'string' && sourceKey.startsWith(prefix) ? sourceKey.slice(prefix.length) : '';
}

function requireSha256(value, field) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Buff landing ${field} must be a sha256 hash`);
  }
  return value;
}

function requireBareHash(value, field) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Buff landing ${field} must be a 64-character sha256 hash`);
  }
  return value;
}

function positiveId(value) {
  return (typeof value === 'number' || typeof value === 'string' && /^[1-9]\d*$/.test(value))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function quote(identifier) {
  if (typeof identifier !== 'string' || !/^[a-z][a-z0-9_]*$/.test(identifier)) throw new Error('invalid SQL identifier');
  return `\`${identifier}\``;
}
