// The four staged writers behind `canonical-item-image-lineage-apply`.
//
// Order is landing, maint, relation, local, and each stage derives from the one
// before it rather than from the bundle: maint is rebuilt from the landing row
// that was just written, relation from the maint rows that actually landed,
// local from those relation rows. A layer that agreed with the bundle but not
// with its predecessor would be a claim about lineage that isn't true.
//
// Every stage owns its transaction. A stage that throws rolls back only itself,
// so the snapshot plus the stage markers describe exactly how far the apply got.

import { createHash } from 'node:crypto';

const DATASET_TYPE = 'item_image_sources_raw';
const OWNED_LOCAL_IMAGE_ROLE = 'icon';
const LANDING_SOURCE_KIND = 'item_image_lineage_bundle';
const LANDING_SOURCE_KEY = 'canonical.item_image_sources';
const LANDING_SOURCE_PAGE = 'item_image_sources';
const LANDING_ARTIFACT_ROLE = 'source_evidence';
const LANDING_PRODUCER_ID = 'canonical.item-image-lineage-apply';
const LANDING_PRODUCER_VERSION = '1';
const KEY_CHUNK = 500;

export function createItemImageLineageAdapter({
  connection,
  databases,
  generatedAt,
  saveSnapshot
} = {}) {
  const maint = requireIdentifier(databases?.maintDatabase, 'maintDatabase');
  const relation = requireIdentifier(databases?.relationDatabase, 'relationDatabase');
  const local = requireIdentifier(databases?.localDatabase, 'localDatabase');
  const stamp = toMysqlDateTime(generatedAt) ?? null;
  const state = { landingId: null };

  return {
    async snapshotOwnedScope(plan) {
      const keys = plan.targetKeys;
      const layers = {
        landing: await selectAll(
          connection,
          `SELECT \`id\`, \`content_hash\`, \`producer_run_key\`
           FROM \`${maint}\`.\`source_dataset_landings\`
           WHERE \`dataset_type\` = ? AND \`is_current\` = 1`,
          [DATASET_TYPE]
        ),
        maint: await selectByKeys(
          connection,
          (placeholders) => `SELECT * FROM \`${maint}\`.\`maint_item_images\`
             WHERE \`item_internal_name\` IN (${placeholders})`,
          keys
        ),
        relation: await selectByKeys(
          connection,
          (placeholders) => `SELECT * FROM \`${relation}\`.\`relation_item_images\`
             WHERE \`item_internal_name\` IN (${placeholders})`,
          keys
        ),
        local: await selectByKeys(
          connection,
          (placeholders) => `SELECT ii.*, i.\`internal_name\` AS \`internal_name\`, i.\`image\` AS \`item_image\`
             FROM \`${local}\`.\`item_images\` ii
             INNER JOIN \`${local}\`.\`items\` i ON i.\`id\` = ii.\`item_id\`
             WHERE i.\`internal_name\` IN (${placeholders})`,
          keys
        )
      };

      const rowCount = Object.values(layers).reduce((total, rows) => total + rows.length, 0);
      const payload = { operationId: plan.operationId, takenAt: generatedAt ?? null, rowCount, layers };
      const snapshotId = requireValue(saveSnapshot, 'saveSnapshot')(payload);
      return { snapshotId, rowCount, takenAt: generatedAt ?? null };
    },

    async applyStage(stage, plan) {
      await connection.beginTransaction();
      try {
        const outcome = await runStage(stage.name, plan);
        await connection.commit();
        return outcome;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    },

    async verifyParity(plan) {
      const keys = plan.targetKeys;
      const counts = {
        landing: await countLandingIdentities(connection, maint, keys),
        maint: await countByKeys(
          connection,
          (placeholders) => `SELECT COUNT(DISTINCT \`item_internal_name\`) AS \`identity_count\`
             FROM \`${maint}\`.\`maint_item_images\`
             WHERE \`deleted\` = 0 AND \`item_internal_name\` IN (${placeholders})`,
          keys
        ),
        relation: await countByKeys(
          connection,
          (placeholders) => `SELECT COUNT(DISTINCT \`item_internal_name\`) AS \`identity_count\`
             FROM \`${relation}\`.\`relation_item_images\`
             WHERE \`deleted\` = 0 AND \`item_internal_name\` IN (${placeholders})`,
          keys
        ),
        local: await countByKeys(
          connection,
          (placeholders) => `SELECT COUNT(DISTINCT i.\`internal_name\`) AS \`identity_count\`
             FROM \`${local}\`.\`item_images\` ii
             INNER JOIN \`${local}\`.\`items\` i ON i.\`id\` = ii.\`item_id\`
             WHERE ii.\`deleted\` = 0 AND ii.\`role\` = '${OWNED_LOCAL_IMAGE_ROLE}'
               AND i.\`internal_name\` IN (${placeholders})`,
          keys
        )
      };

      const preservedRoles = await selectAll(
        connection,
        `SELECT DISTINCT \`role\` FROM \`${local}\`.\`item_images\`
         WHERE \`deleted\` = 0 AND \`role\` <> '${OWNED_LOCAL_IMAGE_ROLE}'`
      );
      return {
        counts,
        preservedLocalRoles: preservedRoles.map((row) => text(row?.role)).filter(Boolean).sort()
      };
    }
  };

  async function runStage(name, plan) {
    if (name === 'landing') return applyLanding(plan);
    if (name === 'maint') return applyMaint(plan);
    if (name === 'relation') return applyRelation(plan);
    if (name === 'local') return applyLocal(plan);
    throw new Error(`unknown lineage stage ${name}`);
  }

  async function applyLanding(plan) {
    const payload = { itemImages: plan.rows };
    const payloadJson = JSON.stringify(payload);
    const contentHash = createHash('sha256').update(payloadJson).digest('hex');

    await connection.execute(
      `UPDATE \`${maint}\`.\`source_dataset_landings\`
       SET \`is_current\` = 0, \`updated_at\` = CURRENT_TIMESTAMP
       WHERE \`dataset_type\` = ? AND \`is_current\` = 1`,
      [DATASET_TYPE]
    );

    const [result] = await connection.execute(
      `INSERT INTO \`${maint}\`.\`source_dataset_landings\`
       (\`dataset_type\`, \`provider\`, \`source_kind\`, \`source_key\`, \`source_locator\`, \`source_page\`,
        \`content_hash\`, \`payload_json\`, \`fetched_at\`, \`parsed_at\`, \`parse_status\`,
        \`artifact_role\`, \`producer_id\`, \`producer_version\`, \`producer_run_key\`, \`is_current\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?, ?, ?, 1)`,
      [
        DATASET_TYPE,
        plan.provider ?? 'terraria.wiki.gg',
        LANDING_SOURCE_KIND,
        LANDING_SOURCE_KEY,
        plan.lineageBundle?.path ?? null,
        LANDING_SOURCE_PAGE,
        contentHash,
        payloadJson,
        stamp,
        stamp,
        LANDING_ARTIFACT_ROLE,
        LANDING_PRODUCER_ID,
        LANDING_PRODUCER_VERSION,
        String(plan.lineageBundle?.sha256 ?? '').replace(/^sha256:/, '')
      ]
    );

    state.landingId = Number(result?.insertId);
    if (!Number.isInteger(state.landingId) || state.landingId <= 0) {
      throw new Error('the landing stage produced no landing id');
    }
    return { rowCount: plan.rows.length, landingId: state.landingId, contentHash };
  }

  async function applyMaint(plan) {
    const landingId = requireLandingId();
    const contentHash = createHash('sha256').update(JSON.stringify({ itemImages: plan.rows })).digest('hex');

    await deleteByKeys(
      connection,
      (placeholders) => `DELETE FROM \`${maint}\`.\`maint_item_images\`
         WHERE \`item_internal_name\` IN (${placeholders})`,
      plan.targetKeys
    );

    for (const row of plan.rows) {
      await connection.execute(
        `INSERT INTO \`${maint}\`.\`maint_item_images\`
         (\`record_key\`, \`item_internal_name\`, \`item_name\`, \`role\`, \`source_provider\`, \`source_file_title\`,
          \`source_page\`, \`source_revision_timestamp\`, \`original_url\`, \`cached_url\`, \`width\`, \`height\`,
          \`content_type\`, \`is_primary\`, \`sort_order\`, \`landing_source_id\`, \`landing_source_key\`,
          \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
          \`raw_json\`, \`status\`, \`deleted\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          recordKeyFor(row),
          text(row.itemInternalName),
          text(row.itemName),
          text(row.role) ?? OWNED_LOCAL_IMAGE_ROLE,
          text(row.provider) ?? 'terraria.wiki.gg',
          text(row.sourceFileTitle),
          text(row.sourcePage),
          toMysqlDateTime(row.sourceRevisionTimestamp),
          text(row.originalUrl),
          text(row.cachedUrl),
          nullableNumber(row.width),
          nullableNumber(row.height),
          text(row.contentType),
          row.isPrimary ? 1 : 0,
          Number(row.sortOrder ?? 0) || 0,
          landingId,
          LANDING_SOURCE_KEY,
          LANDING_SOURCE_PAGE,
          contentHash,
          stamp,
          stamp,
          JSON.stringify(row)
        ]
      );
    }
    return { rowCount: plan.rows.length, landingId };
  }

  async function applyRelation(plan) {
    const maintRows = await selectByKeys(
      connection,
      (placeholders) => `SELECT * FROM \`${maint}\`.\`maint_item_images\`
         WHERE \`deleted\` = 0 AND \`item_internal_name\` IN (${placeholders})`,
      plan.targetKeys
    );
    assertCoversScope(maintRows, plan, 'maint');

    await deleteByKeys(
      connection,
      (placeholders) => `DELETE FROM \`${relation}\`.\`relation_item_images\`
         WHERE \`item_internal_name\` IN (${placeholders})`,
      plan.targetKeys
    );

    for (const row of maintRows) {
      await connection.execute(
        `INSERT INTO \`${relation}\`.\`relation_item_images\`
         (\`record_key\`, \`item_internal_name\`, \`item_name\`, \`role\`, \`source_file_title\`, \`original_url\`,
          \`cached_url\`, \`width\`, \`height\`, \`content_type\`, \`is_primary\`, \`sort_order\`,
          \`source_maint_table\`, \`source_maint_record_key\`, \`source_maint_id\`, \`landing_source_id\`,
          \`landing_source_key\`, \`landing_content_hash\`, \`source_provider\`, \`source_page\`,
          \`source_revision_timestamp\`, \`raw_json\`, \`status\`, \`deleted\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          row.record_key,
          row.item_internal_name,
          row.item_name,
          row.role,
          row.source_file_title,
          row.original_url,
          row.cached_url,
          row.width,
          row.height,
          row.content_type,
          row.is_primary ? 1 : 0,
          Number(row.sort_order ?? 0) || 0,
          'maint_item_images',
          row.record_key,
          Number(row.id) || null,
          Number(row.landing_source_id) || null,
          row.landing_source_key,
          row.landing_content_hash,
          row.source_provider,
          row.source_page,
          toMysqlDateTime(row.source_revision_timestamp),
          row.raw_json ?? '{}'
        ]
      );
    }
    return { rowCount: maintRows.length };
  }

  async function applyLocal(plan) {
    const relationRows = await selectByKeys(
      connection,
      (placeholders) => `SELECT * FROM \`${relation}\`.\`relation_item_images\`
         WHERE \`deleted\` = 0 AND \`item_internal_name\` IN (${placeholders})`,
      plan.targetKeys
    );
    assertCoversScope(relationRows, plan, 'relation');

    const itemRows = await selectByKeys(
      connection,
      (placeholders) => `SELECT \`id\`, \`internal_name\` FROM \`${local}\`.\`items\`
         WHERE \`deleted\` = 0 AND \`internal_name\` IN (${placeholders})`,
      plan.targetKeys
    );
    const itemIdByKey = new Map();
    for (const row of itemRows) {
      const key = text(row?.internal_name);
      if (key) itemIdByKey.set(key, Number(row.id));
    }

    // Only this lane's role is replaced; a detail or banner image for the same
    // item is somebody else's row and must survive untouched.
    //
    // Single-table DELETE on the item ids resolved above, deliberately. A
    // multi-table `DELETE ii FROM db.item_images ii JOIN db.items i` resolves
    // `ii` against the default database rather than the qualified name in the
    // FROM clause, and this connection selects no default database, so that form
    // fails with "No database selected".
    await deleteByKeys(
      connection,
      (placeholders) => `DELETE FROM \`${local}\`.\`item_images\`
         WHERE \`role\` = ? AND \`item_id\` IN (${placeholders})`,
      [...itemIdByKey.values()],
      [OWNED_LOCAL_IMAGE_ROLE]
    );

    let written = 0;
    for (const row of relationRows) {
      const itemId = itemIdByKey.get(text(row.item_internal_name));
      if (!itemId) continue;
      await connection.execute(
        `INSERT INTO \`${local}\`.\`item_images\`
         (\`item_id\`, \`role\`, \`provider\`, \`source_file_title\`, \`source_page\`, \`source_revision_timestamp\`,
          \`original_url\`, \`cached_url\`, \`width\`, \`height\`, \`content_type\`, \`is_primary\`, \`sort_order\`,
          \`last_verified_at\`, \`status\`, \`deleted\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          itemId,
          OWNED_LOCAL_IMAGE_ROLE,
          'wiki_gg',
          row.source_file_title,
          row.source_page,
          toMysqlDateTime(row.source_revision_timestamp),
          row.original_url,
          row.cached_url,
          row.width,
          row.height,
          row.content_type,
          row.is_primary ? 1 : 0,
          Number(row.sort_order ?? 0) || 0,
          stamp
        ]
      );
      await connection.execute(
        `UPDATE \`${local}\`.\`items\` SET \`image\` = ?, \`updated_at\` = CURRENT_TIMESTAMP
         WHERE \`id\` = ? AND \`deleted\` = 0`,
        [row.cached_url, itemId]
      );
      written += 1;
    }
    return { rowCount: written };
  }

  function requireLandingId() {
    if (!Number.isInteger(state.landingId) || state.landingId <= 0) {
      throw new Error('the maint stage requires the landing stage to have produced a landing id');
    }
    return state.landingId;
  }
}

function assertCoversScope(rows, plan, layer) {
  const present = new Set();
  for (const row of rows) {
    const key = text(row?.item_internal_name);
    if (key) present.add(key);
  }
  if (present.size !== plan.expectedIdentityCount) {
    throw new Error(
      `${layer} layer holds ${present.size} of the ${plan.expectedIdentityCount} owned identities`
    );
  }
}

async function selectAll(connection, sql, values = []) {
  const [rows] = await connection.query(sql, values);
  return Array.isArray(rows) ? rows : [];
}

async function selectByKeys(connection, sqlFor, keys, prefixValues = []) {
  const rows = [];
  for (const chunk of chunked(keys)) {
    const [chunkRows] = await connection.query(
      sqlFor(placeholders(chunk.length)),
      [...prefixValues, ...chunk]
    );
    if (Array.isArray(chunkRows)) rows.push(...chunkRows);
  }
  return rows;
}

async function deleteByKeys(connection, sqlFor, keys, prefixValues = []) {
  let affected = 0;
  for (const chunk of chunked(keys)) {
    const [result] = await connection.execute(
      sqlFor(placeholders(chunk.length)),
      [...prefixValues, ...chunk]
    );
    affected += Number(result?.affectedRows ?? 0);
  }
  return affected;
}

async function countByKeys(connection, sqlFor, keys) {
  const seen = new Set();
  let total = 0;
  for (const chunk of chunked(keys)) {
    const [rows] = await connection.query(sqlFor(placeholders(chunk.length)), chunk);
    total += Number(rows?.[0]?.identity_count ?? 0);
    seen.add(chunk.length);
  }
  return total;
}

async function countLandingIdentities(connection, maint, keys) {
  const owned = new Set(keys);
  const rows = await selectAll(
    connection,
    `SELECT \`payload_json\` FROM \`${maint}\`.\`source_dataset_landings\`
     WHERE \`dataset_type\` = ? AND \`is_current\` = 1`,
    [DATASET_TYPE]
  );
  const identities = new Set();
  for (const row of rows) {
    let payload;
    try {
      payload = typeof row?.payload_json === 'string' ? JSON.parse(row.payload_json) : row?.payload_json;
    } catch {
      continue;
    }
    for (const record of Array.isArray(payload?.itemImages) ? payload.itemImages : []) {
      const key = text(record?.itemInternalName);
      if (key && owned.has(key)) identities.add(key);
    }
  }
  return identities.size;
}

function chunked(keys) {
  const chunks = [];
  for (let index = 0; index < keys.length; index += KEY_CHUNK) {
    chunks.push(keys.slice(index, index + KEY_CHUNK));
  }
  return chunks.length ? chunks : [[]];
}

function placeholders(count) {
  return count > 0 ? Array.from({ length: count }, () => '?').join(', ') : 'NULL';
}

function recordKeyFor(row) {
  return createHash('sha256')
    .update(JSON.stringify([
      DATASET_TYPE,
      text(row.itemInternalName),
      text(row.role) ?? OWNED_LOCAL_IMAGE_ROLE,
      Number(row.sortOrder ?? 0) || 0
    ]))
    .digest('hex');
}

function toMysqlDateTime(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requireIdentifier(value, label) {
  const normalized = text(value);
  if (!normalized || !/^[A-Za-z0-9_]+$/.test(normalized)) {
    throw new Error(`${label} must be a plain identifier`);
  }
  return normalized;
}

function requireValue(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  return value;
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}
