import { createHash } from 'node:crypto';

import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';
import { normalizeBuffRowValue } from './sync-buffs-to-relation.mjs';

const COLUMNS = Object.freeze(('source_id internal_name english_name name_zh source_provider source_page '
  + 'source_revision_timestamp landing_source_id landing_source_key landing_source_page landing_content_hash '
  + 'landing_fetched_at landing_parsed_at module_generated_at terraria_version major_value combat_value '
  + 'defense_value use_time stack_size width height flags_json raw_json status deleted').split(' '));

// Pure planning only: the caller must bind the landing ID to a persisted or
// transaction-reserved row and rederive from locked snapshots before applying.
export async function buildBuffMaintMutationPlan({ landingRow, currentRows, allowUnmaterializedLandingId = false } = {}) {
  validateLanding(landingRow, { allowUnmaterializedLandingId });
  if (!Array.isArray(currentRows)) throw new Error('Buff maint complete baseline is required');
  const baseline = currentRows.map(row => structuredClone(row));
  const current = indexIdentities(baseline, true);
  const extracted = await extractMaintEntitiesFromLandingRow(landingRow);
  if (extracted.scope !== 'buffs' || extracted.rows.length === 0
      || extracted.rows.some(row => row.tableName !== 'maint_buffs')) {
    throw new Error('Buff maint landing mapping scope is invalid or empty');
  }
  const proposed = extracted.rows.map(row => {
    const mapped = Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value,
    ]));
    mapped.status = 1;
    mapped.deleted = 0;
    return Object.fromEntries(COLUMNS.map(column => [column, mapped[column] ?? null]));
  });
  indexIdentities(proposed, false);
  const inserts = [];
  const updates = [];
  const unchanged = [];
  const touched = new Set();
  for (const row of proposed.sort((left, right) => left.source_id - right.source_id)) {
    const before = current.bySource.get(Number(row.source_id));
    const byName = current.byName.get(row.internal_name);
    if ((before && before.internal_name !== row.internal_name)
        || (byName && Number(byName.source_id) !== Number(row.source_id))) {
      throw new Error(`Buff maint identity remap is forbidden: ${row.internal_name}`);
    }
    if (!before) { inserts.push(row); continue; }
    touched.add(Number(before.id));
    const changedColumns = COLUMNS.filter(column => !sameValue(before[column], row[column], column));
    if (changedColumns.length === 0) { unchanged.push(before); continue; }
    updates.push({ before, after: { ...before, ...row }, changedColumns });
  }
  return {
    schemaVersion: 'buff-maint-mutation-plan/v1',
    table: 'terria_v1_maint.maint_buffs',
    executable: false,
    executionBlocker: 'locked-upstream-executor-required',
    landingIdentity: {
      id: landingRow.id == null ? null : Number(landingRow.id),
      sourceKey: landingRow.source_key, contentHash: landingRow.content_hash,
    },
    baseline,
    inserts, updates, unchanged,
    preserved: baseline.filter(row => !touched.has(Number(row.id))),
    deletes: [], destructiveClear: false,
  };
}

export function bindBuffMaintMutationPlanToLanding({ plan, landingRow } = {}) {
  if (!plan || plan.schemaVersion !== 'buff-maint-mutation-plan/v1'
      || plan.landingIdentity?.id !== null) {
    throw new Error('Buff maint plan must defer exactly one landing ID');
  }
  validateLanding(landingRow);
  if (plan.landingIdentity.sourceKey !== landingRow.source_key
      || plan.landingIdentity.contentHash !== landingRow.content_hash) {
    throw new Error('Buff maint landing source identity or hash drifted');
  }
  const landingId = Number(landingRow.id);
  const bindRow = row => ({ ...row, landing_source_id: landingId });
  const updates = [...plan.updates];
  const unchanged = [];
  for (const row of plan.unchanged) {
    if (Number(row.landing_source_id) === landingId) {
      unchanged.push(row);
    } else {
      updates.push({
        before: row,
        after: bindRow(row),
        changedColumns: ['landing_source_id'],
      });
    }
  }
  return {
    ...plan,
    landingIdentity: { ...plan.landingIdentity, id: landingId },
    inserts: plan.inserts.map(bindRow),
    updates: updates.map(change => {
      const after = bindRow(change.after);
      const changedColumns = new Set(change.changedColumns);
      if (JSON.stringify(change.before.landing_source_id) !== JSON.stringify(after.landing_source_id)) {
        changedColumns.add('landing_source_id');
      }
      return { ...change, after, changedColumns: [...changedColumns] };
    }),
    unchanged,
  };
}

function validateLanding(row, { allowUnmaterializedLandingId = false } = {}) {
  const validId = allowUnmaterializedLandingId ? row?.id == null || positiveId(row?.id) : positiveId(row?.id);
  if (!row || !validId || row.dataset_type !== 'buffs_raw'
      || row.provider !== 'terraria.wiki.gg' || row.parse_status !== 'ok' || Number(row.is_current) !== 1
      || !row.source_key || !row.source_page || !/^[a-f0-9]{64}$/.test(row.content_hash ?? '')) {
    throw new Error('Buff maint landing identity is invalid');
  }
  let payload;
  try { payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json; }
  catch { throw new Error('Buff maint landing payload is invalid'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Buff maint landing payload is invalid');
  const contentHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (contentHash !== row.content_hash) throw new Error('Buff maint landing content hash drifted');
}

function positiveId(value) {
  return (typeof value === 'number' || typeof value === 'string' && /^[1-9]\d*$/.test(value))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function indexIdentities(rows, requireId) {
  const bySource = new Map();
  const byName = new Map();
  const ids = new Set();
  for (const row of rows) {
    if (!positiveId(row?.source_id) || typeof row.internal_name !== 'string'
        || !row.internal_name.trim() || row.internal_name !== row.internal_name.trim()
        || requireId && (!positiveId(row.id) || ids.has(Number(row.id)))
        || bySource.has(Number(row.source_id)) || byName.has(row.internal_name)) {
      throw new Error('Buff maint identity is invalid or duplicated');
    }
    ids.add(Number(row.id));
    bySource.set(Number(row.source_id), row);
    byName.set(row.internal_name, row);
  }
  return { bySource, byName };
}

function sameValue(left, right, column) {
  return JSON.stringify(normalizeBuffRowValue(left, column)) === JSON.stringify(normalizeBuffRowValue(right, column));
}
