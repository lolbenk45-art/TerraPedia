const ITEM_ID_KEYS = Object.freeze(['itemId', 'sourceId', 'source_id']);

/**
 * Build a read-only readiness report for Item rows required by a Buff
 * secondary relation. Compatibility/local row IDs are evidence only; the
 * canonical identity is always the source game ID from Iteminfo.
 */
export function buildBuffItemMaintReadiness({
  requiredItems,
  iteminfoAssertions,
  maintItemRows,
  localItemRows = [],
} = {}) {
  if (!Array.isArray(requiredItems) || requiredItems.length === 0) {
    throw new Error('required Item identities are required');
  }
  if (!Array.isArray(iteminfoAssertions) || !Array.isArray(maintItemRows)
      || !Array.isArray(localItemRows)) {
    throw new Error('Item readiness inputs must be arrays');
  }

  const requiredById = new Map();
  for (const input of requiredItems) {
    const sourceId = positiveId(input?.sourceId);
    const sourceInternalName = text(input?.sourceInternalName);
    const buffId = positiveId(input?.buffId);
    if (typeof input?.sourceId !== 'number' || sourceId == null
        || !sourceInternalName || buffId == null) {
      throw new Error('required Item identity is invalid');
    }
    const current = requiredById.get(sourceId);
    if (current) {
      if (current.sourceInternalName !== sourceInternalName) {
        throw new Error(`required Item source identity conflicts: ${sourceId}`);
      }
      current.buffIds.push(buffId);
    } else {
      requiredById.set(sourceId, { sourceId, sourceInternalName, buffIds: [buffId] });
    }
  }

  const iteminfoById = indexIteminfo(iteminfoAssertions);
  const maintBySourceId = indexMaint(maintItemRows);
  const localByName = indexLocal(localItemRows);
  const rows = [];
  const proposedRows = [];
  for (const required of requiredById.values()) {
    const evidence = iteminfoById.get(required.sourceId);
    if (!evidence) {
      throw new Error(`Item source evidence is missing: ${required.sourceId}`);
    }
    const evidenceName = text(evidence.internalName);
    const sourceNameDrift = evidenceName !== required.sourceInternalName;
    const maint = maintBySourceId.get(required.sourceId) ?? null;
    const local = localByName.get(evidenceName) ?? null;
    const maintActive = maint && [1, '1'].includes(maint.status) && [0, '0'].includes(maint.deleted);
    const maintNameConflict = [...maintBySourceId.values()].some(row =>
      row.source_id !== required.sourceId
      && row.internal_name.toLowerCase() === evidenceName.toLowerCase());
    let classification;
    let promotable = false;
    if (sourceNameDrift) {
      classification = 'maint-source-name-drift';
    } else if (maint && !maintActive) {
      classification = 'maint-inactive-or-unknown';
    } else if (maintNameConflict || maint && maint.internal_name !== evidenceName) {
      classification = 'maint-identity-conflict';
    } else if (maint) {
      classification = 'maint-present-exact';
      promotable = true;
    } else if (local) {
      classification = 'missing-maint-with-local-evidence';
    } else {
      classification = 'missing-maint-without-local-evidence';
    }

    if (!maint && !sourceNameDrift && !maintNameConflict) {
      proposedRows.push({
        source_id: required.sourceId,
        internal_name: evidenceName,
        english_name: text(evidence.name) || null,
        landing_source_id: null,
        maint_row_id: null,
      });
    }
    rows.push({
      sourceId: required.sourceId,
      proposedCanonicalSourceId: required.sourceId,
      buffIds: [...new Set(required.buffIds)].sort((left, right) => left - right),
      requiredInternalName: required.sourceInternalName,
      evidenceInternalName: evidenceName,
      englishName: text(evidence.name) || null,
      evidenceItemId: positiveId(evidence.itemId),
      maintRowId: maint?.id ?? null,
      maintSourceId: positiveId(maint?.source_id),
      maintInternalName: text(maint?.internal_name) || null,
      maintActive: Boolean(maintActive),
      localRowId: local?.id ?? null,
      localSourceId: positiveId(local?.source_id),
      localRowIdIsCanonicalSourceId: false,
      sourceNameDrift,
      classification,
      promotable,
    });
  }

  const readyCount = rows.filter(row => row.promotable).length;
  const missingMaintCount = rows.filter(row => !row.maintRowId).length;
  const blockedCount = rows.length - readyCount;
  return {
    schemaVersion: 'buff-item-maint-readiness/v1',
    readOnly: true,
    databaseWrites: false,
    networkRequests: 0,
    executable: false,
    applyAllowed: false,
    verdict: blockedCount === 0 ? 'ready' : 'blocked',
    rows,
    proposedRows,
    summary: {
      requiredCount: rows.length,
      sourceEvidenceCount: rows.length,
      maintPresentCount: rows.filter(row => row.classification === 'maint-present-exact').length,
      missingMaintCount,
      localEvidenceCount: rows.filter(row => row.localRowId != null).length,
      sourceNameDriftCount: rows.filter(row => row.sourceNameDrift).length,
      blockedCount,
      readyCount,
    },
    blockedBy: blockedCount === 0 ? [] : rows.filter(row => !row.promotable).map(row => ({
      sourceId: row.sourceId,
      classification: row.classification,
    })),
  };
}

function indexIteminfo(rows) {
  const index = new Map();
  for (const row of rows) {
    const itemId = positiveId(first(row, ITEM_ID_KEYS));
    const internalName = text(row?.internalName ?? row?.internal_name);
    if (itemId == null || !internalName) throw new Error('Iteminfo source identity is invalid');
    if (index.has(itemId)) throw new Error(`duplicate Iteminfo source ID: ${itemId}`);
    index.set(itemId, { ...row, itemId, internalName });
  }
  return index;
}

function indexMaint(rows) {
  const index = new Map();
  for (const row of rows) {
    const sourceId = positiveId(row?.source_id ?? row?.sourceId);
    if (sourceId == null) throw new Error('maint source identity is invalid');
    if (positiveId(row.id) == null) throw new Error(`maint primary key is invalid: ${sourceId}`);
    if (index.has(sourceId)) throw new Error(`duplicate maint source ID: ${sourceId}`);
    index.set(sourceId, {
      ...row,
      source_id: sourceId,
      internal_name: text(row.internal_name ?? row.internalName),
      status: row.status ?? null,
      deleted: row.deleted ?? null,
    });
  }
  return index;
}

function indexLocal(rows) {
  const index = new Map();
  for (const row of rows) {
    const internalName = text(row?.internal_name ?? row?.internalName);
    if (!internalName) continue;
    if (index.has(internalName)) throw new Error(`duplicate local Item name: ${internalName}`);
    index.set(internalName, { ...row, source_id: positiveId(row.source_id ?? row.sourceId) });
  }
  return index;
}

function first(row, keys) {
  for (const key of keys) {
    if (row?.[key] != null) return row[key];
  }
  return null;
}

function positiveId(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function text(value) {
  const result = String(value ?? '').trim();
  return result || '';
}
