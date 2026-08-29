#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  buildLocalNpcAdmissionRowPlan,
  canonicalJson,
  selectLocalNpcAdmissions,
  sha256,
} from './item-source-local-npc-admission.mjs';

export const ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID = 'canonical-item-source-local-npc-admission';

const LOCAL_DATABASE = 'terria_v1_local';
const MAINT_DATABASE = 'terria_v1_maint';
const RELATION_DATABASE = 'terria_v1_relation';
const OWNED_TABLES = Object.freeze([
  `${LOCAL_DATABASE}.source_dataset_landings`,
  `${MAINT_DATABASE}.maint_npc_crawler_facts`,
  `${RELATION_DATABASE}.item_source_facts`,
  `${RELATION_DATABASE}.item_source_details`,
  `${RELATION_DATABASE}.item_npc_shop_relations`,
  `${RELATION_DATABASE}.item_npc_loot_relations`,
  `${LOCAL_DATABASE}.item_acquisition_sources`,
]);

export function parseLocalNpcAdmissionProposalArgs(argv = process.argv.slice(2)) {
  const options = Object.fromEntries(argv.map((argument) => {
    const [key, ...rest] = argument.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }));
  const parsed = {
    partitionPath: options.partition ?? options['partition-path'],
    outputPath: options.output,
    verifyProposalPath: options['verify-proposal'] ?? options.verifyProposal,
  };
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'verifyProposalPath') continue;
    if (!text(value)) throw new Error(`${key} is required`);
  }
  for (const key of ['apply', 'packet', 'permit', 'network', 'authorization-input']) {
    if (options[key] !== undefined) throw new Error(`local NPC admission proposal does not accept --${key}`);
  }
  return parsed;
}

export async function runLocalNpcAdmissionProposal(options = {}, dependencies = {}) {
  rejectNonProposalOptions(options);
  const repoRoot = path.resolve(options.repoRoot ?? getProjectRoot());
  const partitionPath = resolveRepositoryPath(repoRoot, options.partitionPath, 'partitionPath');
  const outputPath = resolveRepositoryPath(repoRoot, options.outputPath, 'outputPath');
  const verifyProposalPath = options.verifyProposalPath
    ? resolveRepositoryPath(repoRoot, options.verifyProposalPath, 'verifyProposalPath')
    : null;
  const loadRuntimeConfig = dependencies.loadRuntimeConfig ?? loadLocalStackConfig;
  const runtimeConfig = loadRuntimeConfig(repoRoot);
  assertLocalRuntimeConfig(runtimeConfig);
  const readPartition = dependencies.readPartition ?? readFrozenPartition;
  const partitionInput = await readPartition({ repoRoot, partitionPath });
  const partition = assertFrozenPartition(partitionInput?.partition ?? partitionInput);
  const partitionSha256 = requireHash(
    partitionInput?.sha256 ?? sha256Bytes(Buffer.from(canonicalJson(partition))),
    'partition SHA-256',
  );
  const readSnapshotPairs = dependencies.readSnapshotPairs ?? readLocalNpcSnapshotPairs;
  const snapshotPairs = await readSnapshotPairs({ repoRoot });
  assertSnapshotPairs(snapshotPairs);
  const candidateSnapshotPairs = selectCandidateSnapshotPairs(partition, snapshotPairs);
  const readDatabaseSnapshot = dependencies.readDatabaseSnapshot ?? readDefaultDatabaseSnapshot;
  const databaseSnapshot = await readDatabaseSnapshot({ repoRoot, runtimeConfig });
  let closed = false;
  const closeSnapshot = async () => {
    if (closed) return;
    closed = true;
    await databaseSnapshot?.close?.();
  };
  try {
    assertDatabaseSnapshot(databaseSnapshot, runtimeConfig);
    const selection = selectLocalAdmissions({ partition, snapshotPairs: candidateSnapshotPairs, databaseSnapshot });
    assertSelectionConservation(selection, partition);
    const sourceFreeze = buildSourceFreeze({ partition, partitionPath, partitionSha256, snapshotPairs: candidateSnapshotPairs });
    if (selection.summary.accepted === 0 || selection.summary.blocked > 0 || selection.summary.unclassified > 0) {
      const blocker = buildAdmissionBlocker({ partition, selection, sourceFreeze, databaseFingerprint: databaseSnapshot.databaseFingerprint });
      await writeAdmissionOutput({ repoRoot, outputPath, value: blocker, dependencies });
      return blocker;
    }
    const rowPlan = buildLocalNpcAdmissionRowPlan({
      acceptedRows: selection.acceptedRows,
      snapshots: candidateSnapshotPairs,
      items: databaseSnapshot.items,
      npcs: databaseSnapshot.npcs,
    });
    const currentRows = databaseSnapshot.readCurrentRows
      ? await databaseSnapshot.readCurrentRows(rowPlan)
      : databaseSnapshot.currentRows;
    assertCurrentRowsComplete(currentRows);
    const proposal = buildLocalNpcAdmissionProposal({
      partition,
      selection,
      snapshots: candidateSnapshotPairs,
      items: databaseSnapshot.items,
      npcs: databaseSnapshot.npcs,
      databaseFingerprint: databaseSnapshot.databaseFingerprint,
      currentRows,
    });
    const result = {
      ...proposal,
      authorizationAllowed: true,
      sourceFreeze,
    };
    if (verifyProposalPath) {
      const verified = readJsonFile(path.join(repoRoot, verifyProposalPath), 'existing proposal');
      assertIndependentSelectedIdentityRebuild(verified, result);
      result.independentRebuild = {
        verifiedProposalPath: verifyProposalPath,
        selectedIdentityHash: result.selectedIdentityHash,
      };
    }
    await writeAdmissionOutput({ repoRoot, outputPath, value: result, dependencies });
    return result;
  } finally {
    await closeSnapshot();
  }
}

export function buildLocalNpcAdmissionProposal({
  partition,
  selection,
  snapshots = [],
  items = [],
  npcs = [],
  databaseFingerprint = {},
  currentRows = {},
} = {}) {
  const partitionScopeHash = requireHash(partition?.scopeHash, 'partition scopeHash');
  const acceptedRows = Array.isArray(selection?.acceptedRows) ? selection.acceptedRows : [];
  if (acceptedRows.length === 0) {
    throw new Error('local NPC admission proposal requires at least one accepted row');
  }
  if (Number(selection?.summary?.blocked ?? 0) > 0 || Number(selection?.summary?.unclassified ?? 0) > 0) {
    throw new Error('local NPC admission proposal requires a fully classified, unblocked selection');
  }
  const plan = buildLocalNpcAdmissionRowPlan({ acceptedRows, snapshots, items, npcs });
  const localSourceReconciliation = freezeLocalSourceReconciliation(
    selection?.reconciliationRows,
    currentRows,
  );
  const reconciledIdentityHashes = new Set(localSourceReconciliation.map((row) => row.sourceIdentityHash));
  const localSourceInserts = plan.localSourceRows.filter((row, index) => (
    !reconciledIdentityHashes.has(acceptedRows[index]?.sourceIdentityHash)
  ));
  const writeSets = {
    'terria_v1_local.source_dataset_landings': plan.landingRows.map(stripPlanningOnlyFields),
    'terria_v1_maint.maint_npc_crawler_facts': plan.maintTemplates.map(toDatabaseRow),
    'terria_v1_relation.item_source_facts': plan.relationRows.sourceFacts.map(toDatabaseRow),
    'terria_v1_relation.item_source_details': plan.relationRows.sourceDetails.map(toDatabaseRow),
    'terria_v1_relation.item_npc_shop_relations': plan.relationRows.npcShopRelations.map(toDatabaseRow),
    'terria_v1_relation.item_npc_loot_relations': plan.relationRows.npcLootRelations.map(toDatabaseRow),
    'terria_v1_local.item_acquisition_sources': localSourceInserts.map(stripPlanningOnlyFields),
  };
  assertOnlyOwnedTables(writeSets, plan.allowedTables);
  assertTargetRowsAbsent(writeSets, currentRows);
  const orderedWriteSets = orderWriteSets(writeSets);
  const lineageBindings = buildLineageBindings(plan);
  const changedRowCount = Object.values(orderedWriteSets).reduce((sum, rows) => sum + rows.length, 0)
    + localSourceReconciliation.length;
  const tableBeforeFingerprints = buildTableBeforeFingerprints(currentRows, Object.keys(orderedWriteSets));
  const beforeFingerprint = sha256(tableBeforeFingerprints);
  const afterFingerprint = sha256({
    writeSets: orderedWriteSets,
    lineageBindings,
    localSourceReconciliation,
  });
  const selectedIdentityHash = sha256(acceptedRows
    .map((row) => row.sourceIdentityHash)
    .sort());
  const scopeHash = sha256({
    operationId: ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
    partitionScopeHash,
    databaseFingerprint,
    acceptedIdentityHashes: acceptedRows.map((row) => row.sourceIdentityHash).sort(),
    beforeFingerprint,
    afterFingerprint,
  });
  return {
    schemaVersion: 'item-source-local-npc-admission-proposal-v1',
    operationId: ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
    readOnly: true,
    partitionScopeHash,
    databaseFingerprint,
    summary: {
      candidates: Number(selection?.summary?.candidates ?? 0),
      accepted: acceptedRows.length,
      duplicates: Number(selection?.summary?.duplicates ?? 0),
      quarantine: Number(selection?.summary?.quarantine ?? 0),
      blocked: Number(selection?.summary?.blocked ?? 0),
      unclassified: Number(selection?.summary?.unclassified ?? 0),
      selectedSnapshots: plan.landingRows.length,
      localSourceReconciliation: localSourceReconciliation.length,
    },
    selectedRows: acceptedRows.map((row) => ({
      sourceIdentity: row.sourceIdentity,
      sourceIdentityHash: row.sourceIdentityHash,
      candidateSourcePage: row.candidateSourcePage,
      snapshotEvidence: row.snapshotEvidence,
      priceText: row.priceText,
    })),
    retainedQuarantineRows: selection?.quarantineRows ?? [],
    writeSets: orderedWriteSets,
    localSourceReconciliation,
    lineageBindings,
    tableBeforeFingerprints,
    changedRowCount,
    beforeFingerprint,
    afterFingerprint,
    selectedIdentityHash,
    scopeHash,
  };
}

function selectLocalAdmissions({ partition, snapshotPairs, databaseSnapshot }) {
  return selectLocalNpcAdmissions({
    candidateRows: partition.quarantineRows,
    snapshots: snapshotPairs,
    items: databaseSnapshot.items,
    npcs: databaseSnapshot.npcs,
    existingLocalSourceRows: databaseSnapshot.existingLocalSourceRows,
  });
}

function assertFrozenPartition(partition) {
  if (partition?.schemaVersion !== 'item-source-governed-partition-v1' || partition?.readOnly !== true) {
    throw new Error('frozen Item-source partition must be the read-only governed partition');
  }
  const lanes = ['acceptedRows', 'duplicateRows', 'quarantineRows', 'blockedRows'];
  for (const lane of lanes) {
    if (!Array.isArray(partition[lane])) throw new Error(`frozen Item-source partition ${lane} is required`);
    for (const row of partition[lane]) {
      const identity = row?.sourceIdentity;
      if (!identity || sha256(identity) !== requireHash(row?.sourceIdentityHash, 'partition sourceIdentityHash')) {
        throw new Error('frozen Item-source partition source identity hash drifted');
      }
    }
  }
  const expectedScopeHash = sha256({
    schemaVersion: partition.schemaVersion,
    acceptedRows: partition.acceptedRows,
    duplicateRows: partition.duplicateRows,
    quarantineRows: partition.quarantineRows,
    blockedRows: partition.blockedRows,
  });
  if (requireHash(partition.scopeHash, 'partition scopeHash') !== expectedScopeHash) {
    throw new Error('frozen Item-source partition scope hash drifted');
  }
  const summary = partition.summary ?? {};
  const sourceRowCount = lanes.reduce((count, lane) => count + partition[lane].length, 0);
  if (Number(summary.selectedSourceRowCount) !== sourceRowCount
      || Number(summary.accepted) !== partition.acceptedRows.length
      || Number(summary.duplicates) !== partition.duplicateRows.length
      || Number(summary.quarantine) !== partition.quarantineRows.length
      || Number(summary.blocked) !== partition.blockedRows.length
      || Number(summary.unclassified) !== 0) {
    throw new Error('frozen Item-source partition summary drifted');
  }
  const candidateCount = new Set([
    ...partition.acceptedRows,
    ...partition.duplicateRows,
    ...partition.quarantineRows,
    ...partition.blockedRows,
  ].map((row) => text(row?.itemInternalName)).filter(Boolean)).size;
  if (Number(summary.candidateItemCount) !== candidateCount) {
    throw new Error('frozen Item-source partition candidate count drifted');
  }
  return partition;
}

function assertSelectionConservation(selection, partition) {
  const total = selection.summary.accepted + selection.summary.duplicates
    + selection.summary.quarantine + selection.summary.blocked + selection.summary.unclassified;
  if (selection.summary.candidates !== partition.quarantineRows.length || total !== partition.quarantineRows.length) {
    throw new Error('local NPC admission selection does not conserve frozen quarantine candidates');
  }
}

function buildSourceFreeze({ partition, partitionPath, partitionSha256, snapshotPairs }) {
  return {
    partition: {
      path: partitionPath,
      sha256: partitionSha256,
      scopeHash: partition.scopeHash,
      candidateCount: partition.quarantineRows.length,
    },
    snapshotPairs: snapshotPairs.map((pair) => ({
      entityId: requireText(pair?.audit?.entityId ?? pair?.normalized?.entityId, 'NPC snapshot entityId'),
      normalizedPath: requireText(pair?.normalizedPath, 'NPC normalized snapshot path'),
      normalizedSha256: requireHash(pair?.normalizedSha256, 'NPC normalized snapshot SHA-256'),
      auditPath: requireText(pair?.auditPath, 'NPC audit path'),
      auditSha256: requireHash(pair?.auditSha256, 'NPC audit SHA-256'),
    })).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
  };
}

function buildAdmissionBlocker({ partition, selection, sourceFreeze, databaseFingerprint }) {
  return {
    schemaVersion: 'item-source-local-npc-admission-blocker-v1',
    operationId: ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
    readOnly: true,
    authorizationAllowed: false,
    reason: selection.summary.accepted === 0
      ? 'no_local_npc_source_admissions'
      : 'selection_contains_blocked_or_unclassified_rows',
    partitionScopeHash: partition.scopeHash,
    databaseFingerprint,
    sourceFreeze,
    selection: {
      summary: selection.summary,
      duplicateRows: selection.duplicateRows,
      quarantineRows: selection.quarantineRows,
      blockedRows: selection.blockedRows,
    },
  };
}

function assertDatabaseSnapshot(snapshot, runtimeConfig) {
  if (!Array.isArray(snapshot?.items) || !Array.isArray(snapshot?.npcs)
      || !Array.isArray(snapshot?.existingLocalSourceRows)) {
    throw new Error('read-only database snapshot is incomplete');
  }
  const fingerprint = snapshot.databaseFingerprint ?? {};
  if (text(fingerprint.host) !== text(runtimeConfig.database.host)
      || Number(fingerprint.port) !== Number(runtimeConfig.database.port)
      || !text(fingerprint.serverUuid)
      || canonicalJson(fingerprint.databases) !== canonicalJson([LOCAL_DATABASE, MAINT_DATABASE, RELATION_DATABASE])) {
    throw new Error('read-only database snapshot fingerprint drifted from local runtime configuration');
  }
}

function assertCurrentRowsComplete(currentRows) {
  if (!currentRows || typeof currentRows !== 'object') throw new Error('current target rows are required');
  for (const table of OWNED_TABLES) {
    if (!Array.isArray(currentRows[table])) throw new Error(`current target rows missing owned table: ${table}`);
  }
}

function assertSnapshotPairs(snapshotPairs) {
  if (!Array.isArray(snapshotPairs) || snapshotPairs.length === 0) return;
  for (const pair of snapshotPairs) {
    if (!pair?.normalized || !pair?.audit) throw new Error('NPC source snapshot requires paired normalized and audit JSON');
    requireHash(pair.normalizedSha256, 'NPC normalized snapshot SHA-256');
    requireHash(pair.auditSha256, 'NPC audit SHA-256');
  }
}

function selectCandidateSnapshotPairs(partition, snapshotPairs) {
  const candidateNpcIds = new Set(partition.quarantineRows
    .filter((row) => text(row?.sourceIdentity?.sourceRefType) === 'npc')
    .map((row) => positiveId(row?.sourceIdentity?.sourceRefId))
    .filter(Boolean));
  return snapshotPairs.filter((pair) => snapshotSourceIds(pair).some((id) => candidateNpcIds.has(id)));
}

function snapshotSourceIds(pair) {
  const normalized = pair?.normalized ?? {};
  return [...new Set([
    normalized?.sourceMetadata?.sourceId,
    normalized?.sourceId,
    ...(Array.isArray(normalized?.sourceInfoboxes)
      ? normalized.sourceInfoboxes.map((entry) => entry?.autoId)
      : []),
  ].map(positiveId).filter(Boolean))];
}

function buildTableBeforeFingerprints(currentRows, tables) {
  return Object.fromEntries(tables.map((table) => [
    table,
    sha256(Array.isArray(currentRows?.[table])
      ? [...currentRows[table]].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
      : []),
  ]));
}

function assertOnlyOwnedTables(writeSets, allowedTables) {
  const allowed = new Set(allowedTables);
  for (const table of Object.keys(writeSets)) {
    if (!allowed.has(table)) throw new Error(`proposal contains unowned table: ${table}`);
  }
}

function assertTargetRowsAbsent(writeSets, currentRows) {
  for (const [table, plannedRows] of Object.entries(writeSets)) {
    const current = Array.isArray(currentRows?.[table]) ? currentRows[table] : [];
    for (const planned of plannedRows) {
      if (current.some((row) => isSameTarget(table, row, planned))) {
        throw new Error(`target table drift: existing target row in ${table}`);
      }
    }
  }
}

function freezeLocalSourceReconciliation(rows, currentRows) {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw new Error('local source reconciliation rows must be an array');
  if (rows.length === 0) return [];
  const current = currentRows?.[`${LOCAL_DATABASE}.item_acquisition_sources`];
  if (!Array.isArray(current)) throw new Error('local source reconciliation requires current local source rows');
  const seen = new Set();
  return rows.map((row) => {
    const kind = requireText(row?.kind, 'local source reconciliation kind');
    if (![
      'set_missing_source_revision_timestamp',
      'restore_archived_exact_source',
      'soft_delete_stale_active_duplicate',
    ].includes(kind)) {
      throw new Error(`local source reconciliation kind is not allowed: ${kind}`);
    }
    const rowId = positiveId(row?.rowId);
    const sourceIdentityHash = requireHash(row?.sourceIdentityHash, 'local source reconciliation source identity hash');
    if (!rowId || seen.has(rowId)) throw new Error('local source reconciliation primary keys must be unique positive IDs');
    seen.add(rowId);
    const before = row?.before;
    const after = row?.after;
    if (positiveId(before?.id) !== rowId || positiveId(after?.id) !== rowId) {
      throw new Error('local source reconciliation before and after images must keep the same primary key');
    }
    if (!current.some((candidate) => positiveId(candidate?.id) === rowId
        && canonicalJson(candidate) === canonicalJson(before))) {
      throw new Error(`local source reconciliation before image drifted: ${rowId}`);
    }
    return {
      kind,
      rowId,
      sourceIdentityHash,
      before,
      beforeHash: sha256(before),
      after,
      afterHash: sha256(after),
    };
  }).sort((left, right) => left.rowId - right.rowId);
}

function isSameTarget(table, current, planned) {
  if (table.endsWith('source_dataset_landings')) {
    return text(current.source_key) === text(planned.source_key);
  }
  if (table.endsWith('maint_npc_crawler_facts') || table.includes('terria_v1_relation.')) {
    return text(current.record_key) === text(planned.record_key);
  }
  if (table.endsWith('item_acquisition_sources')) {
    return Number(current.item_id) === Number(planned.item_id)
      && text(current.source_type) === text(planned.source_type)
      && text(current.source_ref_type) === text(planned.source_ref_type)
      && Number(current.source_ref_id) === Number(planned.source_ref_id)
      && Number(current.status ?? 1) === 1
      && Number(current.deleted ?? 0) === 0;
  }
  return false;
}

function stripPlanningOnlyFields(row) {
  const { record_key, normalized_content_hash, audit_content_hash, ...output } = row;
  return output;
}

function toDatabaseRow(row) {
  const output = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'scope' || key === 'tableName') continue;
    if (key === 'landingSourceId' && Number(value) === 0) continue;
    output[key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)] = value;
  }
  return output;
}

function buildLineageBindings(plan) {
  const rowsByTable = {
    'terria_v1_maint.maint_npc_crawler_facts': plan.maintTemplates,
    'terria_v1_relation.item_source_facts': plan.relationRows.sourceFacts,
    'terria_v1_relation.item_source_details': plan.relationRows.sourceDetails,
    'terria_v1_relation.item_npc_shop_relations': plan.relationRows.npcShopRelations,
    'terria_v1_relation.item_npc_loot_relations': plan.relationRows.npcLootRelations,
  };
  return Object.fromEntries(Object.entries(rowsByTable)
    .map(([table, rows]) => [table, rows
      .filter((row) => Number(row?.landingSourceId) === 0)
      .map((row) => ({
        recordKey: row.recordKey,
        landingSourceKey: row.landingSourceKey,
      }))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))])
    .filter(([, rows]) => rows.length > 0));
}

function orderWriteSets(writeSets) {
  return Object.fromEntries(Object.entries(writeSets).map(([table, rows]) => [
    table,
    [...rows].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
  ]));
}

function orderCurrentRows(currentRows) {
  return Object.fromEntries(Object.entries(currentRows ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([table, rows]) => [
    table,
    Array.isArray(rows)
      ? [...rows].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
      : [],
  ]));
}

function requireHash(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function text(value) {
  const normalized = String(value ?? '').normalize('NFKC').trim().replaceAll(/\s+/g, ' ');
  return normalized || null;
}

function requireText(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function positiveId(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function rejectNonProposalOptions(options) {
  for (const key of ['apply', 'packet', 'permit', 'network', 'authorizationInput']) {
    if (options[key] !== undefined) throw new Error(`local NPC admission proposal does not accept ${key}`);
  }
}

function resolveRepositoryPath(repoRoot, value, label) {
  const normalized = requireText(value, label);
  const absolutePath = path.resolve(repoRoot, normalized);
  const relativePath = path.relative(repoRoot, absolutePath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must stay inside the repository`);
  }
  return relativePath.split(path.sep).join('/');
}

function assertLocalRuntimeConfig(config) {
  const database = config?.database ?? {};
  const host = requireText(database.host ?? '127.0.0.1', 'local database host');
  const port = Number(database.port ?? 13306);
  const name = requireText(database.name ?? LOCAL_DATABASE, 'local database name');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || name !== LOCAL_DATABASE || !host) {
    throw new Error('standard local runtime configuration is invalid for local NPC admission');
  }
}

function readFrozenPartition({ repoRoot, partitionPath }) {
  const absolutePath = path.join(repoRoot, partitionPath);
  const bytes = fs.readFileSync(absolutePath);
  return {
    partition: parseJson(bytes, 'frozen Item-source partition'),
    sha256: sha256Bytes(bytes),
  };
}

function readLocalNpcSnapshotPairs({ repoRoot }) {
  const normalizedRoot = path.join(repoRoot, 'data', 'wiki-crawler', 'normalized-light', 'npc');
  const auditRoot = path.join(repoRoot, 'data', 'wiki-crawler', 'audit', 'npc');
  const normalizedNames = readLatestJsonNames(normalizedRoot, 'normalized NPC snapshots');
  const auditNames = readLatestJsonNames(auditRoot, 'NPC audits');
  if (canonicalJson(normalizedNames) !== canonicalJson(auditNames)) {
    throw new Error('local NPC snapshot and audit file sets are not paired exactly');
  }
  return normalizedNames.map((name) => {
    const normalizedPath = `data/wiki-crawler/normalized-light/npc/${name}`;
    const auditPath = `data/wiki-crawler/audit/npc/${name}`;
    const normalizedBytes = fs.readFileSync(path.join(repoRoot, normalizedPath));
    const auditBytes = fs.readFileSync(path.join(repoRoot, auditPath));
    return {
      normalized: parseJson(normalizedBytes, `normalized NPC snapshot ${normalizedPath}`),
      audit: parseJson(auditBytes, `NPC audit ${auditPath}`),
      normalizedPath,
      normalizedSha256: sha256Bytes(normalizedBytes),
      auditPath,
      auditSha256: sha256Bytes(auditBytes),
    };
  });
}

function readLatestJsonNames(directory, label) {
  if (!fs.existsSync(directory)) throw new Error(`${label} directory is missing`);
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.latest.json'))
    .sort();
}

async function readDefaultDatabaseSnapshot({ repoRoot, runtimeConfig }) {
  const connection = await openDefaultConnection({ repoRoot, runtimeConfig });
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const fingerprintRows = await readRows(connection, 'SELECT @@server_uuid AS serverUuid');
    const [items, npcs, existingLocalSourceRows] = await Promise.all([
      readRows(connection, `SELECT source_id, internal_name, english_name
        FROM \`${MAINT_DATABASE}\`.\`maint_items\`
        WHERE status = 1 AND deleted = 0 ORDER BY source_id`),
      readRows(connection, `SELECT source_id, internal_name, english_name
        FROM \`${MAINT_DATABASE}\`.\`maint_npcs\`
        WHERE status = 1 AND deleted = 0 ORDER BY source_id`),
      readRows(connection, `SELECT * FROM \`${LOCAL_DATABASE}\`.\`item_acquisition_sources\`
        ORDER BY id`),
    ]);
    const databaseFingerprint = {
      host: runtimeConfig.database.host ?? '127.0.0.1',
      port: Number(runtimeConfig.database.port ?? 13306),
      serverUuid: fingerprintRows[0]?.serverUuid,
      databases: [LOCAL_DATABASE, MAINT_DATABASE, RELATION_DATABASE],
    };
    return {
      databaseFingerprint,
      items,
      npcs,
      existingLocalSourceRows,
      async readCurrentRows(rowPlan) {
        return readCurrentRowsForPlan(connection, rowPlan, existingLocalSourceRows);
      },
      async close() {
        await connection.rollback();
        await connection.end();
      },
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    await connection.end().catch(() => {});
    throw error;
  }
}

async function openDefaultConnection({ repoRoot, runtimeConfig }) {
  const require = createRequire(path.join(repoRoot, 'apps', 'admin-console', 'package.json'));
  const mysql = require('mysql2/promise');
  const database = runtimeConfig.database ?? {};
  return mysql.createConnection({
    host: database.host ?? '127.0.0.1',
    port: Number(database.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? database.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? database.password ?? 'root',
  });
}

async function readCurrentRowsForPlan(connection, rowPlan, existingLocalSourceRows) {
  const landingKeys = rowPlan.landingRows.map((row) => row.source_key);
  const maintKeys = rowPlan.maintTemplates.map((row) => row.recordKey);
  const sourceFactKeys = rowPlan.relationRows.sourceFacts.map((row) => row.recordKey);
  const detailKeys = rowPlan.relationRows.sourceDetails.map((row) => row.recordKey);
  const shopKeys = rowPlan.relationRows.npcShopRelations.map((row) => row.recordKey);
  const lootKeys = rowPlan.relationRows.npcLootRelations.map((row) => row.recordKey);
  return {
    [`${LOCAL_DATABASE}.source_dataset_landings`]: await readRowsByValues(
      connection, LOCAL_DATABASE, 'source_dataset_landings', 'source_key', landingKeys,
    ),
    [`${MAINT_DATABASE}.maint_npc_crawler_facts`]: await readRowsByValues(
      connection, MAINT_DATABASE, 'maint_npc_crawler_facts', 'record_key', maintKeys,
    ),
    [`${RELATION_DATABASE}.item_source_facts`]: await readRowsByValues(
      connection, RELATION_DATABASE, 'item_source_facts', 'record_key', sourceFactKeys,
    ),
    [`${RELATION_DATABASE}.item_source_details`]: await readRowsByValues(
      connection, RELATION_DATABASE, 'item_source_details', 'record_key', detailKeys,
    ),
    [`${RELATION_DATABASE}.item_npc_shop_relations`]: await readRowsByValues(
      connection, RELATION_DATABASE, 'item_npc_shop_relations', 'record_key', shopKeys,
    ),
    [`${RELATION_DATABASE}.item_npc_loot_relations`]: await readRowsByValues(
      connection, RELATION_DATABASE, 'item_npc_loot_relations', 'record_key', lootKeys,
    ),
    [`${LOCAL_DATABASE}.item_acquisition_sources`]: existingLocalSourceRows.filter((row) => rowPlan.localSourceRows.some((planned) => (
      Number(row.item_id) === Number(planned.item_id)
      && text(row.source_type) === text(planned.source_type)
      && text(row.source_ref_type) === text(planned.source_ref_type)
      && Number(row.source_ref_id) === Number(planned.source_ref_id)
    ))),
  };
}

async function readRowsByValues(connection, database, table, column, values) {
  const uniqueValues = [...new Set(values.filter((value) => text(value)))];
  if (uniqueValues.length === 0) return [];
  const placeholders = uniqueValues.map(() => '?').join(', ');
  return readRows(
    connection,
    `SELECT * FROM \`${database}\`.\`${table}\` WHERE \`${column}\` IN (${placeholders}) ORDER BY \`${column}\``,
    uniqueValues,
  );
}

async function readRows(connection, statement, values = []) {
  const [rows] = await connection.query(statement, values);
  return Array.isArray(rows) ? rows : [];
}

function writeAdmissionOutput({ repoRoot, outputPath, value, dependencies }) {
  const writeOutput = dependencies.writeOutput ?? (({ repoRoot: root, outputPath: relativePath, value: output }) => {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    return output;
  });
  return writeOutput({ repoRoot, outputPath, value });
}

function assertIndependentSelectedIdentityRebuild(existing, rebuilt) {
  if (existing?.schemaVersion !== 'item-source-local-npc-admission-proposal-v1'
      || existing?.selectedIdentityHash !== rebuilt.selectedIdentityHash
      || canonicalJson(existing.selectedRows ?? []) !== canonicalJson(rebuilt.selectedRows ?? [])
      || canonicalJson(existing.sourceFreeze ?? {}) !== canonicalJson(rebuilt.sourceFreeze ?? {})) {
    throw new Error('independent Item-source proposal rebuild does not match the frozen selected identities');
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function readJsonFile(filePath, label) {
  return parseJson(fs.readFileSync(filePath), label);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  runLocalNpcAdmissionProposal(parseLocalNpcAdmissionProposalArgs())
    .then((result) => {
      console.log(JSON.stringify({
        output: process.argv.find((argument) => argument.startsWith('--output='))?.slice('--output='.length) ?? null,
        schemaVersion: result.schemaVersion,
        authorizationAllowed: result.authorizationAllowed,
        accepted: result.summary?.accepted ?? result.selection?.summary?.accepted ?? 0,
      }));
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
