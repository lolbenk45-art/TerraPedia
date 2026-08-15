#!/usr/bin/env node

// local.npc_buff_relations projects only relation_type='inflicts'. The relation table also holds
// 'immune' rows that local never projects, so a total-vs-total comparison is meaningless here.
export const RELATION_INFLICTS_SQL = `
  SELECT COUNT(*) AS total FROM terria_v1_relation.npc_buff_relations
  WHERE deleted = 0 AND status = 1 AND relation_type = 'inflicts'`;

export const LOCAL_SQL = `
  SELECT COUNT(*) AS total FROM terria_v1_local.npc_buff_relations WHERE deleted = 0`;

async function readCount(query, label, blockingReasons) {
  try {
    const rows = await query();
    const total = Array.isArray(rows) ? rows[0]?.total : undefined;
    // Number(null) and Number('') are both 0, so an absent count would silently read as
    // "the table is empty" — the opposite of failing closed. Reject those before converting.
    if (total === null || total === undefined || total === '') {
      blockingReasons.push(`${label} returned a non-finite count; failing closed.`);
      return null;
    }
    const numeric = Number(total);
    if (!Number.isFinite(numeric)) {
      blockingReasons.push(`${label} returned a non-finite count; failing closed.`);
      return null;
    }
    return numeric;
  } catch (error) {
    blockingReasons.push(`${label} query failed: ${error.message}`);
    return null;
  }
}

export async function buildNpcBuffRelationPrecheck({
  generatedAt = new Date().toISOString(),
  queryRelationInflictsCount,
  queryLocalCount,
  queryRelationWithoutLocalCount,
  queryLocalWithoutRelationCount,
} = {}) {
  const blockingReasons = [];
  const warningReasons = [];

  const relationInflictsCount = await readCount(queryRelationInflictsCount, 'relation.npc_buff_relations (inflicts)', blockingReasons);
  const localCount = await readCount(queryLocalCount, 'local.npc_buff_relations', blockingReasons);
  const relationWithoutLocal = await readCount(queryRelationWithoutLocalCount, 'relation-without-local', blockingReasons);
  const localWithoutRelation = await readCount(queryLocalWithoutRelationCount, 'local-without-relation', blockingReasons);

  if (relationInflictsCount === 0) {
    blockingReasons.push('relation.npc_buff_relations has no active inflicts rows; the crawler buff enrichment is not materialized.');
  }
  if (localCount === 0) {
    blockingReasons.push('local.npc_buff_relations is empty; the crawler buff enrichment is not materialized.');
  }

  // Projection drift is a real pre-existing issue but it is neither caused nor fixed by this step,
  // so it is reported and never allowed to gate the locator change.
  if (relationWithoutLocal > 0) {
    warningReasons.push(
      `${relationWithoutLocal} relation inflicts row(s) have no local counterpart; the relation-to-local projection is incomplete.`,
    );
  }
  if (localWithoutRelation > 0) {
    warningReasons.push(
      `${localWithoutRelation} local row(s) have no relation counterpart; local has a second writer outside the relation projection.`,
    );
  }

  const enrichmentMaterialized = localCount !== null && localCount > 0;

  return {
    generatedAt,
    checkId: 'npcBuffRelationPrecheck',
    status: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
    requiresDatabase: true,
    writesDatabase: false,
    enrichmentMaterialized,
    relationInflictsCount,
    localCount,
    relationWithoutLocal,
    localWithoutRelation,
    blockingReasons,
    warningReasons,
  };
}
