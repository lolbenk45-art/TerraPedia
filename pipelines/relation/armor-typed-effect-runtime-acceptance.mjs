import { resolveBackendApiBase } from '../../scripts/lib/local-runtime-config.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';
import { buildArmorProjectionApiAcceptance } from './armor-projection-api-acceptance.mjs';

const EFFECT_SOURCE_KINDS = new Set(['armor_attribute_cell', 'armor_item_page']);

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function positiveId(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function snakeCase(value) {
  return String(value).replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toSnakeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [snakeCase(key), value]));
}

function blockedEvidence(blockers, details = {}) {
  return {
    schemaVersion: 'armor-projection-api-acceptance/v1',
    status: 'blocked',
    runtimeVerified: false,
    databaseWrites: false,
    apiReadOnly: true,
    postCommit: true,
    blockers,
    ...details,
  };
}

function ownerIdsFromProposal(proposal) {
  const rows = Array.isArray(proposal?.proposedRows) ? proposal.proposedRows : [];
  const ids = [...new Set(rows
    .filter(row => row?.owner_kind === 'item' || row?.ownerKind === 'item')
    .map(row => Number(row.owner_id ?? row.ownerId))
    .filter(positiveId))];
  return ids.sort((left, right) => left - right);
}

function relationRowsForOwners(rows, ownerIds) {
  const owners = new Set(ownerIds);
  return rows
    .filter(row => active(row)
      && row.owner_kind === 'item'
      && owners.has(Number(row.owner_id))
      && EFFECT_SOURCE_KINDS.has(row.source_kind))
    .sort((left, right) => String(left.record_key).localeCompare(String(right.record_key)));
}

function expectedProjectionRows(relationRows) {
  const generated = buildProjectionPayload({
    relationEquipmentEffectAttributes: relationRows,
  }).projectionEquipmentEffectAttributes.map(toSnakeRow);
  const byKey = new Map(relationRows.map(row => [row.record_key, row]));
  return generated.map(row => {
    const relation = byKey.get(row.relation_record_key) ?? {};
    return {
      ...row,
      id: Number(relation.id) || row.id,
      source_maint_record_key: relation.source_maint_record_key ?? null,
      source_maint_id: relation.source_maint_id ?? null,
      landing_source_id: relation.landing_source_id ?? null,
      landing_source_key: relation.landing_source_key ?? null,
      landing_content_hash: relation.landing_content_hash ?? null,
      source_provider: relation.source_provider ?? null,
      source_page: relation.source_page ?? null,
      source_revision_timestamp: relation.source_revision_timestamp ?? null,
    };
  });
}

function appendBlockers(result, blockers) {
  if (!blockers.length) return result;
  return {
    ...result,
    status: 'blocked',
    runtimeVerified: false,
    blockers: [...result.blockers, ...blockers],
  };
}

/**
 * Performs the real post-commit readback for typed Armor effects.
 * Every operation is read-only; unavailable projection/API evidence remains blocked.
 */
export async function buildArmorTypedEffectPostCommitAcceptance({
  connection,
  proposal,
  relationRows,
  repoRoot = process.cwd(),
  apiBase = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const blockers = [];
  const ownerIds = ownerIdsFromProposal(proposal);
  if (!ownerIds.length) {
    return blockedEvidence([{ code: 'typed-effect-owner-readback-scope-empty' }]);
  }

  let allRelationRows = relationRows;
  if (!Array.isArray(allRelationRows)) {
    if (typeof connection?.query !== 'function') {
      return blockedEvidence([{ code: 'relation-readback-connection-required' }]);
    }
    try {
      const [rows] = await connection.query(
        `SELECT * FROM terria_v1_relation.relation_equipment_effect_attributes `
          + `WHERE owner_kind = 'item' AND owner_id IN (${ownerIds.map(() => '?').join(', ')}) `
          + 'AND status = 1 AND deleted = 0 ORDER BY id',
        ownerIds,
      );
      allRelationRows = rows;
    } catch (error) {
      return blockedEvidence([{ code: 'relation-readback-failed', message: error.message }]);
    }
  }
  if (!Array.isArray(allRelationRows)) {
    return blockedEvidence([{ code: 'relation-readback-invalid' }]);
  }
  const expectedEffects = relationRowsForOwners(allRelationRows, ownerIds);
  if (!expectedEffects.length) {
    blockers.push({ code: 'typed-effect-relation-readback-missing' });
  }

  let observedProjection = [];
  if (typeof connection?.query !== 'function') {
    blockers.push({ code: 'projection-readback-connection-required' });
  } else {
    try {
      const [rows] = await connection.query(
        `SELECT * FROM terria_v1_relation.projection_equipment_effect_attributes `
          + `WHERE owner_kind = 'item' AND owner_id IN (${ownerIds.map(() => '?').join(', ')}) `
          + `AND source_kind IN ('armor_attribute_cell', 'armor_item_page') `
          + 'AND status = 1 AND deleted = 0 ORDER BY id',
        ownerIds,
      );
      observedProjection = rows;
      if (!Array.isArray(observedProjection)) blockers.push({ code: 'projection-readback-invalid' });
    } catch (error) {
      blockers.push({ code: 'projection-readback-failed', message: error.message });
    }
  }

  const apiRows = [];
  const base = String(apiBase ?? resolveBackendApiBase({}, { repoRoot })).replace(/\/+$/, '');
  if (typeof fetchImpl !== 'function') {
    blockers.push({ code: 'public-api-fetch-unavailable' });
  } else {
    for (const ownerId of ownerIds) {
      const url = `${base}/public/items/${ownerId}/equipment-effects`;
      try {
        const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
        if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
        const payload = await response.json();
        if (!Array.isArray(payload?.data)) throw new Error('response data is not an array');
        apiRows.push(...payload.data);
      } catch (error) {
        blockers.push({ code: 'public-api-readback-failed', ownerId, message: error.message });
      }
    }
  }

  let comparison;
  try {
    const expectedRows = expectedProjectionRows(expectedEffects);
    const relationByKey = new Map(expectedEffects.map(row => [row.record_key, row]));
    const observedProjectionWithLineage = (Array.isArray(observedProjection) ? observedProjection : [])
      .map(row => ({
        ...row,
        ...(relationByKey.has(row.relation_record_key) ? {
          source_maint_record_key: relationByKey.get(row.relation_record_key).source_maint_record_key ?? null,
          source_maint_id: relationByKey.get(row.relation_record_key).source_maint_id ?? null,
          landing_source_id: relationByKey.get(row.relation_record_key).landing_source_id ?? null,
          landing_source_key: relationByKey.get(row.relation_record_key).landing_source_key ?? null,
          landing_content_hash: relationByKey.get(row.relation_record_key).landing_content_hash ?? null,
          source_provider: relationByKey.get(row.relation_record_key).source_provider ?? null,
          source_page: relationByKey.get(row.relation_record_key).source_page ?? null,
          source_revision_timestamp: relationByKey.get(row.relation_record_key).source_revision_timestamp ?? null,
        } : {}),
      }));
    comparison = buildArmorProjectionApiAcceptance({
      candidate: {
        operationId: 'canonical-armor-typed-effect-publication',
        candidateSha256: null,
        acceptance: { status: 'dependencies-satisfied', blockers: [] },
        expectedRows: { projection_armor_sets: [] },
        dependencyExpectations: {
          projection_item_armor_attributes: [],
          projection_equipment_effect_attributes: expectedRows,
        },
      },
      projectionArmorSets: [],
      projectionItemArmorAttributes: [],
      projectionEquipmentEffectAttributes: observedProjectionWithLineage,
      apiItemArmorAttributes: [],
      apiItemEquipmentEffects: apiRows,
    });
  } catch (error) {
    return blockedEvidence([...blockers, { code: 'projection-api-comparison-failed', message: error.message }], {
      ownerIds,
    });
  }
  return appendBlockers({ ...comparison, ownerIds }, blockers);
}
