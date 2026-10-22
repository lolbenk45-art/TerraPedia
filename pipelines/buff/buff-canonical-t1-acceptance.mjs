import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importBuffs } from '../import/import-independent-entities-to-db.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runSync } from '../relation/sync-maint-to-relation.mjs';
import { assertCurrentBuffSourceReplay } from '../fetch/buff-current-source-replay.mjs';
import { BUFF_NPC_INTERNAL_NAME_ALIASES } from './buff-offline-source.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(moduleDir, 'fixtures', 'buff-t1.sample.json');
const defaultFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const DEFAULT_INPUT = 'pipelines/buff/fixtures/buff-t1.sample.json';
const ISOLATED_LOCAL = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_local$/;
const ISOLATED_MAINT = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_maint$/;
const NPC_ALIASES = new Map(Object.entries(BUFF_NPC_INTERNAL_NAME_ALIASES));

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function hashRows(rows) {
  const values = rows.map((row) => JSON.stringify(canonical(row))).sort();
  return {
    rowCount: rows.length,
    sha256: `sha256:${createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex')}`,
  };
}

function fixtureRecords(fixture = defaultFixture) {
  return fixture.records.map((record) => structuredClone(record));
}

export function buildBuffT1LandingRows({ fixture = defaultFixture, sourceReplay = null, recordsOverride = null, sourceMetadata = null } = {}) {
  const records = recordsOverride
    ? validateFullCapture({ buffs: recordsOverride }).buffs
    : sourceReplay ? validateSourceReplay(sourceReplay) : validateFixture(fixture);
  const sourceSummary = sourceReplay ? buildSourceSummary(sourceReplay) : sourceMetadata;
  const payloadJson = JSON.stringify({ records, ...(sourceSummary ? { sourceCapture: sourceSummary } : {}) });
  const source = sourceReplay ? {
    provider: 'terraria.wiki.gg',
    sourceKind: 'revision_bound_wiki_pages',
    sourceKey: 'buff-current-source-replay:153,70',
    sourceLocator: `Template:GetBuffInfo@${sourceReplay.source.module.revisionId};Module:Iteminfo/data@${sourceReplay.source.itemInfoModule.revisionId}`,
    sourcePage: sourceReplay.source.pages.map((page) => page.pageTitle).join(' / '),
    sourceRevisionTimestamp: sourceReplay.source.module.revisionTimestamp,
    contentHash: createHash('sha256').update(payloadJson).digest('hex'),
    fetchedAt: sourceReplay.generatedAt,
  } : {
    provider: 'buff-t1.fixture',
    sourceKind: 'offline_fixture',
    sourceKey: 'buff-t1:shadowflame-venom',
    sourceLocator: 'buff-t1.sample.json',
    sourcePage: 'Buff T1 offline fixture',
    sourceRevisionTimestamp: null,
    contentHash: createHash('sha256').update(payloadJson).digest('hex'),
    fetchedAt: fixture.generatedAt,
  };
  if (sourceMetadata && !sourceReplay) {
    source.provider = sourceMetadata.provider ?? 'terraria.wiki.gg';
    source.sourceKind = sourceMetadata.sourceKind ?? 'repository_frozen_standardized';
    source.sourceKey = sourceMetadata.sourceKey ?? 'buff-standardized:388';
    source.sourceLocator = sourceMetadata.sourceLocator ?? 'data/standardized/buffs.standardized.json';
    source.sourcePage = sourceMetadata.sourcePage ?? 'data/standardized/buffs.standardized.json';
    source.sourceRevisionTimestamp = sourceMetadata.sourceRevisionTimestamp ?? null;
    source.fetchedAt = sourceMetadata.fetchedAt ?? null;
  }
  return [{
    id: 910003,
    dataset_type: 'buffs_raw',
    provider: source.provider,
    source_kind: source.sourceKind,
    source_key: source.sourceKey,
    source_locator: source.sourceLocator,
    source_page: source.sourcePage,
    source_revision_timestamp: source.sourceRevisionTimestamp,
    content_hash: source.contentHash,
    fetched_at: source.fetchedAt,
    parsed_at: source.fetchedAt,
    payload_json: payloadJson,
    parse_status: 'ok',
    is_current: 1,
  }];
}

export function buildBuffT1InputDescriptor({ sourceReplay = null, fullCapture = null, inputPath = DEFAULT_INPUT } = {}) {
  if (fullCapture) {
    return {
      type: 'repository_frozen_standardized',
      totalBuffs: fullCapture.buffs.length,
      sourceRevisionTimestamp: fullCapture.sourceRevisionTimestamp
        ?? fullCapture.sourceMetadata?.sourceRevisionTimestamp
        ?? null,
    };
  }
  if (sourceReplay) {
    return {
      type: 'current_wiki_source_replay',
      snapshotSha256: sourceReplay.snapshotSha256,
      selectedBuffs: sourceReplay.records.map(({ id, internalName }) => ({ id, internalName })),
    };
  }
  return { type: 'offline_fixture', path: inputPath };
}

function buildSourceSummary(sourceReplay) {
  const descriptor = (value) => ({
    requestedPageTitle: value.requestedPageTitle,
    pageTitle: value.pageTitle,
    pageId: value.pageId,
    revisionId: value.revisionId,
    revisionTimestamp: value.revisionTimestamp,
    rawSha256: value.rawSha256,
  });
  return {
    schemaVersion: sourceReplay.schemaVersion,
    snapshotSha256: sourceReplay.snapshotSha256,
    selectedBuffs: sourceReplay.records.map(({ id, internalName }) => ({ id, internalName })),
    source: {
      provider: sourceReplay.source.provider,
      kind: sourceReplay.source.kind,
      module: descriptor(sourceReplay.source.module),
      itemInfoModule: descriptor(sourceReplay.source.itemInfoModule),
      pages: sourceReplay.source.pages.map(descriptor),
    },
  };
}

export function seedBuffFixtureItems(records = fixtureRecords()) {
  return [...new Set(records.flatMap((record) => record.sourceItems.map((item) => item.internalName)))];
}

export function seedBuffFixtureNpcs(records = fixtureRecords()) {
  return [...new Set(records.flatMap((record) => record.inflictingNpcs.map((npc) => NPC_ALIASES.get(npc.internalName) ?? npc.internalName)))];
}

export async function seedBuffFixtureMaintItems(options = {}) {
  return copyFixtureRows({ ...options, sourceDatabase: 'terria_v1_maint', sourceTable: 'maint_items', targetTable: 'maint_items', expectedCount: options.expectedCount ?? options.internalNames?.length, databasePattern: ISOLATED_MAINT });
}

export async function seedBuffFixtureMaintNpcs(options = {}) {
  return copyFixtureRows({ ...options, sourceDatabase: 'terria_v1_maint', sourceTable: 'maint_npcs', targetTable: 'maint_npcs', expectedCount: options.expectedCount ?? options.internalNames?.length, databasePattern: ISOLATED_MAINT });
}

export async function runBuffCanonicalT1Acceptance({
  profile,
  runId,
  repoRoot,
  databases,
  mysql,
  inputPath = DEFAULT_INPUT,
  sourceReplay = null,
  fullCapture = null,
  dependencySeedEvidence = null,
  redisLogicalDb = null,
  importBuffsImpl = importBuffs,
  runMaintSyncImpl = runMaintSync,
  runSyncImpl = runSync,
  createConnectionImpl = (options) => loadMysqlModule().createConnection(options),
} = {}) {
  assertIsolatedDatabases({ profile, databases });
  if (sourceReplay) assertBuffT1SourceReplayResources({ profile, databases, redisLogicalDb });
  if (fullCapture) assertBuffFullCaptureResources({ profile, databases, redisLogicalDb });
  const resolvedInput = sourceReplay || fullCapture ? null : path.resolve(repoRoot, inputPath);
  if (resolvedInput && !fs.existsSync(resolvedInput)) throw new Error(`buff T1 input is missing: ${resolvedInput}`);
  const input = sourceReplay ?? fullCapture ?? JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  const records = sourceReplay ? validateSourceReplay(input) : fullCapture ? validateFullCapture(input).buffs : validateFixture(input);
  const allowUnresolvedDependencies = Boolean(fullCapture);
  if (allowUnresolvedDependencies && dependencySeedEvidence?.readbackVerified !== true) {
    throw new Error('Buff full-source T1 requires exact dependency seeding evidence before import');
  }
  const itemNames = seedBuffFixtureItems(records);
  const npcNames = seedBuffFixtureNpcs(records);
  const sourceIds = records.map((record) => record.id);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-buff-t1-${runId}-`));
  const targetOptions = { host: mysql.host, port: mysql.port, user: mysql.username, password: mysql.password };
  const readonlyOptions = { host: mysql.host, port: mysql.port, user: mysql.readonlyUsername, password: mysql.readonlyPassword };

  try {
    const localSource = fullCapture ? null : await createConnectionImpl({ ...readonlyOptions, database: 'terria_v1_local' });
    const localTarget = await createConnectionImpl({ ...targetOptions, database: databases.local });
    let dependencySeed;
    let localBuffReadback = [];
    let localBuffSourceItemReadback = [];
    const buffImport = { input: 0, created: 0, updated: 0, skipped: 0, errors: [] };
    const sourceItemRelations = { input: 0, created: 0, updated: 0, errors: [], unmatched: 0, unmatchedSamples: [] };
    try {
      await ensureIsolatedBuffColumns(localTarget);
      await localTarget.query(`DELETE FROM \`${databases.local}\`.\`buff_source_items\``);
      await localTarget.query(`DELETE FROM \`${databases.local}\`.\`buffs\``);
      if (localSource) {
        await localTarget.query(`DELETE FROM \`${databases.local}\`.\`items\``);
        await localTarget.query(`DELETE FROM \`${databases.local}\`.\`npcs\``);
        const itemRows = await copyFixtureRows({ sourceConnection: localSource, targetConnection: localTarget, sourceDatabase: 'terria_v1_local', sourceTable: 'items', targetDatabase: databases.local, targetTable: 'items', internalNames: itemNames, expectedCount: itemNames.length, databasePattern: ISOLATED_LOCAL });
        const npcRows = await copyFixtureRows({ sourceConnection: localSource, targetConnection: localTarget, sourceDatabase: 'terria_v1_local', sourceTable: 'npcs', targetDatabase: databases.local, targetTable: 'npcs', internalNames: npcNames, expectedCount: npcNames.length, databasePattern: ISOLATED_LOCAL });
        dependencySeed = { itemRows, npcRows };
      } else {
        dependencySeed = {
          itemRows: seededDependencyCount(dependencySeedEvidence, databases.local, 'items'),
          npcRows: seededDependencyCount(dependencySeedEvidence, databases.local, 'npcs'),
        };
      }
      const [seededItems] = await localTarget.query(`SELECT id, internal_name, name FROM \`${databases.local}\`.\`items\``);
      const itemLookup = fullCapture
        ? { bySourceId: new Map(seededItems.map((row) => [Number(row.id), { id: Number(row.id), internalName: row.internal_name, name: row.name }])) }
        : { byInternal: new Map(seededItems.map((row) => [row.internal_name, { id: Number(row.id), internalName: row.internal_name, name: row.name }])) };
      const sourceItemLookup = {
        bySourceId: new Map(records.flatMap((record) => record.sourceItems
          .filter((item) => Number.isSafeInteger(Number(item.itemId)) && Number(item.itemId) > 0)
          .map((item) => [Number(item.itemId), item.internalName]))),
        ...(fullCapture ? { requireStableSourceIds: true } : {}),
      };
      await importBuffsImpl(localTarget, records, itemLookup, sourceItemLookup, buffImport, sourceItemRelations);
      [localBuffReadback] = await localTarget.query(`SELECT * FROM \`${databases.local}\`.\`buffs\` ORDER BY source_id`);
      [localBuffSourceItemReadback] = await localTarget.query(`SELECT * FROM \`${databases.local}\`.\`buff_source_items\` ORDER BY buff_id, sort_order, id`);
    } finally {
      await Promise.all([localSource?.end(), localTarget.end()]);
    }
    const expectedItemRelationCount = records.reduce((sum, record) => sum + record.sourceItems.length, 0);
    const expectedNpcRelationCount = records.reduce((sum, record) => sum + record.inflictingNpcs.length, 0);
    const expectedItemDependencyCount = allowUnresolvedDependencies
      ? new Set(records.flatMap((record) => record.sourceItems)
        .filter((item) => item.resolveStatus !== 'unresolved' && Number.isSafeInteger(Number(item.itemId)) && Number(item.itemId) > 0)
        .map((item) => Number(item.itemId))).size
      : itemNames.length;
    const expectedNpcDependencyCount = allowUnresolvedDependencies
      ? new Set(records.flatMap((record) => [...record.inflictingNpcs, ...record.immuneNpcs])
        .filter((npc) => npc.resolveStatus !== 'unresolved' && Number.isSafeInteger(Number(npc.npcId)) && Number(npc.npcId) !== 0)
        .map((npc) => Number(npc.npcId))).size
      : npcNames.length;
    if (dependencySeed.itemRows !== expectedItemDependencyCount || dependencySeed.npcRows !== expectedNpcDependencyCount
      || buffImport.input !== records.length || buffImport.created !== records.length || buffImport.updated !== 0 || buffImport.errors.length !== 0
      || sourceItemRelations.input !== expectedItemRelationCount || (!allowUnresolvedDependencies && sourceItemRelations.unmatched !== 0)
      || localBuffReadback.length !== records.length
      || new Set(localBuffReadback.map((row) => Number(row.source_id))).size !== records.length
      || records.some((record) => !localBuffReadback.some((row) => Number(row.source_id) === Number(record.id) && row.internal_name === record.internalName))) {
      throw new Error(`buff T1 import mismatch: ${JSON.stringify({ buffImport, sourceItemRelations })}`);
    }

    const maintSource = fullCapture ? null : await createConnectionImpl({ ...readonlyOptions, database: 'terria_v1_maint' });
    const maintTarget = await createConnectionImpl({ ...targetOptions, database: databases.maint });
    let maintDependencySeed;
    try {
      await maintTarget.query(`DELETE FROM \`${databases.maint}\`.\`maint_buffs\``);
      if (maintSource) {
        await maintTarget.query(`DELETE FROM \`${databases.maint}\`.\`maint_items\``);
        await maintTarget.query(`DELETE FROM \`${databases.maint}\`.\`maint_npcs\``);
        maintDependencySeed = {
          itemRows: await seedBuffFixtureMaintItems({ sourceConnection: maintSource, targetConnection: maintTarget, targetDatabase: databases.maint, internalNames: itemNames, expectedCount: itemNames.length }),
          npcRows: await seedBuffFixtureMaintNpcs({ sourceConnection: maintSource, targetConnection: maintTarget, targetDatabase: databases.maint, internalNames: npcNames, expectedCount: npcNames.length }),
        };
      } else {
        maintDependencySeed = {
          itemRows: seededDependencyCount(dependencySeedEvidence, databases.maint, 'maint_items'),
          npcRows: seededDependencyCount(dependencySeedEvidence, databases.maint, 'maint_npcs'),
        };
      }
    } finally {
      await Promise.all([maintSource?.end(), maintTarget.end()]);
    }
    if (!allowUnresolvedDependencies && (maintDependencySeed.itemRows !== itemNames.length || maintDependencySeed.npcRows !== npcNames.length)) throw new Error(`buff T1 maint dependency closure failed: ${JSON.stringify(maintDependencySeed)}`);

    const maintSync = await runMaintSyncImpl({ apply: true, scopes: ['buffs'], ...targetOptions, database: databases.maint }, {
      config: { database: { ...targetOptions, username: mysql.username } },
      loadLandingRows: async () => buildBuffT1LandingRows({ fixture: input, sourceReplay, recordsOverride: fullCapture ? records : null, sourceMetadata: fullCapture?.sourceMetadata ?? null }),
      writeReport: async () => null,
    });
    const maintWrites = Number(maintSync?.writes?.inserted ?? 0) + Number(maintSync?.writes?.updated ?? 0);
    if (maintWrites !== records.length) throw new Error(`buff T1 maint mapping mismatch: ${JSON.stringify(maintSync?.writes ?? null)}`);

    const maintReadbackConnection = await createConnectionImpl({ ...targetOptions, database: databases.maint });
    let maintBuffReadback;
    try {
      [maintBuffReadback] = await maintReadbackConnection.query(`SELECT * FROM \`${databases.maint}\`.\`maint_buffs\` ORDER BY source_id`);
    } finally {
      await maintReadbackConnection.end();
    }
    if (maintBuffReadback.length !== records.length
        || records.some((record) => !maintBuffReadback.some((row) => Number(row.source_id) === Number(record.id) && row.internal_name === record.internalName))) {
      throw new Error('Buff maintained table independent readback identity mismatch');
    }

    const consolidation = await runSyncImpl({ apply: true, createDatabase: false, maintDatabase: databases.maint, localDatabase: databases.local, relationDatabase: databases.relation, allowLocalItemImageFallback: false, scopes: ['buff'], ...(fullCapture ? { buffSourceNpcRelationMode: 'source-bound' } : {}) }, {
      config: { database: { ...targetOptions, username: mysql.username } },
      writeReports: async () => ({ auditJsonPath: path.join(tempRoot, 'audit.json'), auditMdPath: path.join(tempRoot, 'audit.md'), conflictsPath: path.join(tempRoot, 'conflicts.json'), unresolvedPath: path.join(tempRoot, 'unresolved.json') }),
    });
    const relationConnection = await createConnectionImpl({ ...targetOptions, database: databases.relation });
    let relationBuffReadback;
    let itemBuffRelationReadback;
    let npcBuffRelationReadback;
    let relationBuffImageReadback;
    let projectionRows;
    try {
      [relationBuffReadback] = await relationConnection.query(`SELECT * FROM \`${databases.relation}\`.\`relation_buffs\` ORDER BY source_id`);
      [itemBuffRelationReadback] = await relationConnection.query(`SELECT * FROM \`${databases.relation}\`.\`item_buff_relations\` ORDER BY record_key`);
      [npcBuffRelationReadback] = await relationConnection.query(`SELECT * FROM \`${databases.relation}\`.\`npc_buff_relations\` ORDER BY record_key`);
      [relationBuffImageReadback] = await relationConnection.query(`SELECT * FROM \`${databases.relation}\`.\`relation_buff_images\` ORDER BY record_key`);
      [projectionRows] = await relationConnection.query(`SELECT * FROM \`${databases.relation}\`.\`projection_buffs\` ORDER BY source_id`);
    } finally {
      await relationConnection.end();
    }
    const isolatedReadbackResults = {
      relationBuffs: relationBuffReadback,
      itemBuffRelations: itemBuffRelationReadback,
      npcBuffRelations: npcBuffRelationReadback,
      projectionBuffs: projectionRows,
    };
    assertExactConsolidation({ records, results: isolatedReadbackResults, includeSourceImmuneFacts: allowUnresolvedDependencies });
    const actualItemBuffRelationCount = itemBuffRelationReadback.length;
    const actualNpcBuffRelations = npcBuffRelationReadback;
    const actualInflictingNpcBuffRelationCount = actualNpcBuffRelations.filter((row) => (row.relationType ?? row.relation_type) === 'inflicts').length;
    const actualImmuneNpcBuffRelationCount = actualNpcBuffRelations.filter((row) => (row.relationType ?? row.relation_type) === 'immune').length;
    assertProjectionReadback(records, projectionRows);
    const readbackRows = {
      'local.buffs': localBuffReadback,
      'local.buff_source_items': localBuffSourceItemReadback,
      'maint.maint_buffs': maintBuffReadback,
      'relation.relation_buffs': relationBuffReadback,
      'relation.item_buff_relations': itemBuffRelationReadback,
      'relation.npc_buff_relations': npcBuffRelationReadback,
      'relation.relation_buff_images': relationBuffImageReadback,
      'relation.projection_buffs': projectionRows,
    };
    const readbackHashes = Object.fromEntries(Object.entries(readbackRows).map(([table, rows]) => [table, hashRows(rows)]));
    return {
      status: 'passed', databases, input: buildBuffT1InputDescriptor({ sourceReplay, fullCapture, inputPath }), dependencySeed, maintDependencySeed, buffImport, sourceItemRelations, maintSync,
      consolidation: {
        apply: consolidation.apply,
        relationBuffCount: relationBuffReadback.length,
        projectionBuffCount: projectionRows.length,
        itemBuffRelationCount: actualItemBuffRelationCount,
        inflictingNpcBuffRelationCount: actualInflictingNpcBuffRelationCount,
        immuneNpcRelationCount: actualImmuneNpcBuffRelationCount,
        npcBuffRelationCount: actualNpcBuffRelations.length,
        relationBuffImageCount: relationBuffImageReadback.length,
        unresolvedFixtureCount: fullCapture ? null : 0,
        unresolvedSourceItemCount: sourceItemRelations.unmatched,
      },
      consumerReadback: projectionRows.map((row) => ({ sourceId: Number(row.source_id), internalName: row.internal_name, sourceItemCount: Number(row.source_item_count), immuneNpcCount: Number(row.immune_npc_count) })),
      readbackHashes,
      apiExpectations: {
        totalBuffs: records.length,
        detailId: Number(localBuffReadback[0]?.id),
        firstBuff: {
          sourceId: Number(localBuffReadback[0]?.source_id),
          internalName: localBuffReadback[0]?.internal_name,
        },
      },
      unresolved: {
        sourceItemRelations: sourceItemRelations.unmatched,
        sourceItemSamples: sourceItemRelations.unmatchedSamples,
        sourceItemFacts: records.reduce((sum, record) => sum + record.sourceItems.filter((item) => item.resolveStatus === 'unresolved').length, 0),
        npcFacts: records.reduce((sum, record) => sum
          + record.inflictingNpcs.filter((npc) => npc.resolveStatus === 'unresolved').length
          + record.immuneNpcs.filter((npc) => npc.resolveStatus === 'unresolved').length, 0),
        relationReadback: {
          itemBuffRelations: actualItemBuffRelationCount,
          inflictingNpcBuffRelations: actualInflictingNpcBuffRelationCount,
          immuneNpcBuffRelations: actualImmuneNpcBuffRelationCount,
        },
        dependencySeed,
        maintDependencySeed,
      },
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function ensureIsolatedBuffColumns(connection) {
  for (const [column, definition] of [
    ['immune_npcs_json', 'LONGTEXT DEFAULT NULL AFTER `source_items_json`'],
    ['source_evidence_json', 'LONGTEXT DEFAULT NULL AFTER `immune_npc_sample_json`'],
  ]) {
    const [rows] = await connection.query('SHOW COLUMNS FROM `buffs` LIKE ?', [column]);
    if (rows.length === 0) await connection.query(`ALTER TABLE \`buffs\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function copyFixtureRows({ sourceConnection, targetConnection, sourceDatabase, sourceTable, targetDatabase, targetTable, internalNames, expectedCount, databasePattern }) {
  if (!databasePattern.test(targetDatabase ?? '')) throw new Error(`buff T1 seed requires an isolated ${targetTable} database`);
  if (internalNames.length !== expectedCount || new Set(internalNames).size !== expectedCount) throw new Error(`buff T1 seed requires ${expectedCount} unique ${targetTable} identities`);
  if (expectedCount === 0) return 0;
  const placeholders = internalNames.map(() => '?').join(', ');
  const [sourceRows] = await sourceConnection.query(`SELECT * FROM \`${sourceDatabase}\`.\`${sourceTable}\` WHERE internal_name IN (${placeholders})`, internalNames);
  if (sourceRows.length !== expectedCount) throw new Error(`buff T1 source closure failed for ${sourceTable}`);
  for (const row of sourceRows) {
    const columns = Object.keys(row).sort();
    if (columns.some((column) => !/^[a-z0-9_]+$/i.test(column))) throw new Error(`buff T1 dependency column is invalid for ${sourceTable}`);
    await targetConnection.query(`INSERT INTO \`${targetDatabase}\`.\`${targetTable}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ')}`, columns.map((column) => row[column]));
  }
  const [[countRow]] = await targetConnection.query(`SELECT COUNT(*) AS count FROM \`${targetDatabase}\`.\`${targetTable}\` WHERE internal_name IN (${placeholders})`, internalNames);
  return Number(countRow?.count ?? 0);
}

function seededDependencyCount(evidence, database, table) {
  if (evidence?.status !== 'verified' || evidence.readbackVerified !== true || !Array.isArray(evidence.dependencies)) {
    throw new Error('Buff exact dependency seed evidence is invalid');
  }
  const matches = evidence.dependencies.filter((entry) => entry.target?.database === database && entry.target?.table === table);
  if (matches.length > 1) throw new Error(`Buff dependency seed contains duplicate target evidence for ${table}`);
  return matches.reduce((sum, entry) => sum + Number(entry.targetRowCount ?? 0), 0);
}

function validateFixture(fixture) {
  const records = Array.isArray(fixture?.records) ? fixture.records : [];
  const identities = records.map((record) => `${record.id}:${record.internalName}`);
  if (identities.join('|') !== '153:ShadowFlame|70:Venom' || records.map((record) => record.sourceItems.length).join(',') !== '4,7' || records.map((record) => record.immuneNpcs.length).join(',') !== '30,26') throw new Error('buff T1 fixture contract is invalid');
  return fixtureRecords(fixture);
}

function validateSourceReplay(sourceReplay) {
  assertCurrentBuffSourceReplay(sourceReplay);
  return sourceReplay.records.map((record) => structuredClone(record));
}

function validateFullCapture(capture) {
  const records = Array.isArray(capture?.buffs) ? capture.buffs : [];
  if (records.length !== 388) throw new Error(`Buff standardized source requires exactly 388 records, received ${records.length}`);
  const identities = records.map((record) => `${record?.id}:${record?.internalName}`);
  if (new Set(identities).size !== 388 || records.some((record) => !Number.isSafeInteger(Number(record?.id)) || !String(record?.internalName ?? '').trim())) {
    throw new Error('Buff standardized source identities are missing or duplicated');
  }
  if (records.some((record) => !Array.isArray(record.sourceItems) || !Array.isArray(record.inflictingNpcs) || !Array.isArray(record.immuneNpcs))) {
    throw new Error('Buff standardized source dependency arrays are required');
  }
  return { ...capture, buffs: records.map((record) => structuredClone(record)) };
}

export function assertBuffT1SourceReplayResources({ profile, databases, redisLogicalDb } = {}) {
  assertIsolatedDatabases({ profile, databases });
  if (Number(redisLogicalDb) !== 18) throw new Error('Buff source replay requires Redis DB18');
  return true;
}

export function assertBuffFullCaptureResources({ profile, databases, redisLogicalDb } = {}) {
  assertIsolatedDatabases({ profile, databases });
  if (Number(redisLogicalDb) !== 7) throw new Error('Buff standardized source requires Redis DB7');
  return true;
}

function assertIsolatedDatabases({ profile, databases }) {
  if (profile !== 't1' || Object.keys(databases ?? {}).sort().join(',') !== 'local,maint,relation'
      || !ISOLATED_LOCAL.test(databases?.local ?? '')) throw new Error('buff T1 acceptance requires a run-derived isolated local database');
  const prefix = databases.local.slice(0, -'_local'.length);
  if (databases.maint !== `${prefix}_maint` || databases.relation !== `${prefix}_relation`) throw new Error('buff T1 acceptance requires one run-derived isolated three-database set');
}

function assertExactConsolidation({ records, results, includeSourceImmuneFacts = false }) {
  const expectedBuffs = new Set(records.map((record) => record.internalName));
  const relationBuffs = results.relationBuffs ?? [];
  const projectionBuffs = results.projectionBuffs ?? [];
  const itemRelations = results.itemBuffRelations ?? [];
  const npcRelations = results.npcBuffRelations ?? [];
  const relationNames = new Set(relationBuffs.map((row) => row.internalName ?? row.internal_name));
  const projectionNames = new Set(projectionBuffs.map((row) => row.internalName ?? row.internal_name));
  const expectedItems = new Set(records.flatMap((record) => record.sourceItems
    .filter((item) => item.resolveStatus !== 'unresolved')
    .map((item) => `${item.internalName}->${record.internalName}`)));
  const actualItems = new Set(itemRelations.map((row) => `${row.itemInternalName ?? row.item_internal_name}->${row.buffInternalName ?? row.buff_internal_name}`));
  const expectedNpcs = new Set(records.flatMap((record) => [
    ...record.inflictingNpcs.filter((npc) => npc.resolveStatus !== 'unresolved').map((npc) => ({ ...npc, relationType: 'inflicts' })),
    ...(includeSourceImmuneFacts ? record.immuneNpcs.filter((npc) => npc.resolveStatus !== 'unresolved').map((npc) => ({ ...npc, relationType: 'immune' })) : []),
  ].map((npc) => includeSourceImmuneFacts
    ? `${Number(npc.npcId)}:${NPC_ALIASES.get(npc.internalName) ?? npc.internalName}->${Number(record.id)}:${record.internalName}:${npc.relationType}`
    : `${NPC_ALIASES.get(npc.internalName) ?? npc.internalName}->${record.internalName}`)));
  const actualNpcs = new Set(npcRelations.map((row) => includeSourceImmuneFacts
    ? `${Number(row.npcSourceId ?? row.npc_source_id)}:${row.npcInternalName ?? row.npc_internal_name}->${Number(row.buffSourceId ?? row.buff_source_id)}:${row.buffInternalName ?? row.buff_internal_name}:${row.relationType ?? row.relation_type}`
    : `${row.npcInternalName ?? row.npc_internal_name}->${row.buffInternalName ?? row.buff_internal_name}`));
  const parentRowsMatch = relationBuffs.length === expectedBuffs.size
    && relationNames.size === expectedBuffs.size
    && [...expectedBuffs].every((name) => relationNames.has(name))
    && projectionBuffs.length === expectedBuffs.size
    && projectionNames.size === expectedBuffs.size
    && [...expectedBuffs].every((name) => projectionNames.has(name));
  const childRowsMatch = itemRelations.length === expectedItems.size
    && actualItems.size === expectedItems.size
    && [...expectedItems].every((pair) => actualItems.has(pair))
    && npcRelations.length === expectedNpcs.size
    && actualNpcs.size === expectedNpcs.size
    && [...expectedNpcs].every((pair) => actualNpcs.has(pair));
  if (!parentRowsMatch || !childRowsMatch) {
    const differences = (expected, actual) => ({
      expectedCount: expected.size,
      actualCount: actual.size,
      missing: [...expected].filter((key) => !actual.has(key)).slice(0, 10),
      extra: [...actual].filter((key) => !expected.has(key)).slice(0, 10),
    });
    throw new Error(`buff T1 exact relation closure mismatch: ${JSON.stringify({
      parent: {
        expectedBuffs: expectedBuffs.size,
        relationBuffs: relationBuffs.length,
        projectionBuffs: projectionBuffs.length,
        parentRowsMatch,
      },
      itemBuffRelations: differences(expectedItems, actualItems),
      npcBuffRelations: differences(expectedNpcs, actualNpcs),
    })}`);
  }
}

function assertProjectionReadback(records, rows) {
  if (rows.length !== records.length || new Set(rows.map((row) => row.internal_name)).size !== records.length) throw new Error('buff T1 projection identity mismatch');
  for (const row of rows) {
    const expected = records.find((record) => Number(record.id) === Number(row.source_id));
    const resolvedSourceItems = expected?.sourceItems.filter((item) => item.resolveStatus !== 'unresolved') ?? [];
    const resolvedInflictingNpcs = expected?.inflictingNpcs.filter((npc) => npc.resolveStatus !== 'unresolved') ?? [];
    if (!expected || row.internal_name !== expected.internalName
      || Number(row.source_item_count) !== resolvedSourceItems.length
      || Number(row.immune_npc_count) !== expected.immuneNpcs.length) throw new Error('buff T1 projection count mismatch');
    const sourceItems = JSON.parse(row.source_items_json);
    const expectedSourceItems = resolvedSourceItems.map((item) => `${Number(item.itemId)}:${item.internalName}`).sort();
    const actualSourceItems = sourceItems.map((item) => `${Number(item.sourceId ?? item.itemId)}:${item.internalName}`).sort();
    if (sourceItems.length !== resolvedSourceItems.length || JSON.stringify(actualSourceItems) !== JSON.stringify(expectedSourceItems)) throw new Error('buff T1 projection payload mismatch: source_items_json');
    const inflictingNpcs = JSON.parse(row.inflicting_npcs_json);
    const expectedNpcNames = resolvedInflictingNpcs.map((npc) => NPC_ALIASES.get(npc.internalName) ?? npc.internalName).sort();
    const actualNpcNames = inflictingNpcs.map((npc) => npc.internalName).sort();
    if (inflictingNpcs.length !== resolvedInflictingNpcs.length || JSON.stringify(actualNpcNames) !== JSON.stringify(expectedNpcNames) || inflictingNpcs.some((npc) => npc.relationType !== 'inflicts')) throw new Error('buff T1 projection payload mismatch: inflicting_npcs_json');
    for (const [column, value] of [['immune_npcs_json', expected.immuneNpcs], ['source_evidence_json', expected.sourceEvidence]]) {
      if (JSON.stringify(JSON.parse(row[column])) !== JSON.stringify(value)) throw new Error(`buff T1 projection payload mismatch: ${column}`);
    }
  }
}

export { fixturePath };
