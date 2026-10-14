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

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(moduleDir, 'fixtures', 'buff-t1.sample.json');
const defaultFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const DEFAULT_INPUT = 'pipelines/buff/fixtures/buff-t1.sample.json';
const ISOLATED_LOCAL = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_local$/;
const ISOLATED_MAINT = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_maint$/;
const NPC_ALIASES = new Map([['SandPoacher', 'DesertScorpionWalk']]);

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
  } : sourceMetadata ? {
    provider: sourceMetadata.provider ?? 'terraria.wiki.gg',
    sourceKind: 'full_wiki_capture',
    sourceKey: 'buff-full-recrawl:400',
    sourceLocator: `${sourceMetadata.sourcePage ?? 'Template:GetBuffInfo'}@${sourceMetadata.sourceRevisionTimestamp ?? 'unknown'}`,
    sourcePage: sourceMetadata.sourcePage ?? 'Template:GetBuffInfo',
    sourceRevisionTimestamp: sourceMetadata.sourceRevisionTimestamp ?? null,
    contentHash: createHash('sha256').update(payloadJson).digest('hex'),
    fetchedAt: sourceMetadata.fetchedAt ?? null,
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
      type: 'full_wiki_capture',
      totalBuffs: fullCapture.buffs.length,
      sourceRevisionTimestamp: fullCapture.sourceRevisionTimestamp ?? null,
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
  return copyFixtureRows({ ...options, sourceDatabase: 'terria_v1_maint', sourceTable: 'maint_items', targetTable: 'maint_items', displayColumn: 'english_name', expectedCount: options.expectedCount ?? options.internalNames?.length, databasePattern: ISOLATED_MAINT });
}

export async function seedBuffFixtureMaintNpcs(options = {}) {
  return copyFixtureRows({ ...options, sourceDatabase: 'terria_v1_maint', sourceTable: 'maint_npcs', targetTable: 'maint_npcs', displayColumn: 'english_name', expectedCount: options.expectedCount ?? options.internalNames?.length, databasePattern: ISOLATED_MAINT });
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
  const itemNames = seedBuffFixtureItems(records);
  const npcNames = seedBuffFixtureNpcs(records);
  const itemIdentityRows = uniqueDependencyIdentities(records.flatMap((record) => record.sourceItems));
  const npcIdentityRows = uniqueDependencyIdentities(records.flatMap((record) => record.inflictingNpcs).map((npc) => ({
    ...npc,
    internalName: NPC_ALIASES.get(npc.internalName) ?? npc.internalName,
  })));
  const sourceIds = records.map((record) => record.id);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-buff-t1-${runId}-`));
  const targetOptions = { host: mysql.host, port: mysql.port, user: mysql.username, password: mysql.password };
  const readonlyOptions = { host: mysql.host, port: mysql.port, user: mysql.readonlyUsername, password: mysql.readonlyPassword };

  try {
    const [localSource, localTarget] = await Promise.all([
      createConnectionImpl({ ...readonlyOptions, database: 'terria_v1_local' }),
      createConnectionImpl({ ...targetOptions, database: databases.local }),
    ]);
    let dependencySeed;
    const buffImport = { input: 0, created: 0, updated: 0, skipped: 0, errors: [] };
    const sourceItemRelations = { input: 0, created: 0, updated: 0, errors: [], unmatched: 0, unmatchedSamples: [] };
    try {
      await ensureIsolatedBuffColumns(localTarget);
      await localTarget.query(`DELETE FROM \`${databases.local}\`.\`buff_source_items\``);
      await localTarget.query(`DELETE FROM \`${databases.local}\`.\`buffs\``);
      await localTarget.query(`DELETE FROM \`${databases.local}\`.\`items\``);
      await localTarget.query(`DELETE FROM \`${databases.local}\`.\`npcs\``);
      const itemRows = await copyFixtureRows({ sourceConnection: localSource, targetConnection: localTarget, sourceDatabase: 'terria_v1_local', sourceTable: 'items', targetDatabase: databases.local, targetTable: 'items', internalNames: itemNames, identityRows: fullCapture ? itemIdentityRows : null, expectedCount: itemNames.length, allowMissing: allowUnresolvedDependencies, databasePattern: ISOLATED_LOCAL });
      const npcRows = await copyFixtureRows({ sourceConnection: localSource, targetConnection: localTarget, sourceDatabase: 'terria_v1_local', sourceTable: 'npcs', targetDatabase: databases.local, targetTable: 'npcs', internalNames: npcNames, identityRows: fullCapture ? npcIdentityRows : null, expectedCount: npcNames.length, allowMissing: allowUnresolvedDependencies, databasePattern: ISOLATED_LOCAL });
      dependencySeed = { itemRows, npcRows };
      const [seededItems] = await localTarget.query(`SELECT id, internal_name, name FROM \`${databases.local}\`.\`items\``);
      const itemLookup = { byInternal: buildDependencyLookup(seededItems, itemIdentityRows) };
      const sourceItemLookup = { bySourceId: new Map(records.flatMap((record) => record.sourceItems.map((item) => [Number(item.itemId), item.internalName]))) };
      await importBuffsImpl(localTarget, records, itemLookup, sourceItemLookup, buffImport, sourceItemRelations);
    } finally {
      await Promise.all([localSource.end(), localTarget.end()]);
    }
    const expectedItemRelationCount = records.reduce((sum, record) => sum + record.sourceItems.length, 0);
    const expectedNpcRelationCount = records.reduce((sum, record) => sum + record.inflictingNpcs.length, 0);
    if ((!allowUnresolvedDependencies && (dependencySeed.itemRows !== itemNames.length || dependencySeed.npcRows !== npcNames.length))
      || buffImport.input !== records.length || buffImport.created !== records.length || buffImport.updated !== 0 || buffImport.errors.length !== 0
      || sourceItemRelations.input !== expectedItemRelationCount || (!allowUnresolvedDependencies && sourceItemRelations.unmatched !== 0)) {
      throw new Error(`buff T1 import mismatch: ${JSON.stringify({ buffImport, sourceItemRelations })}`);
    }

    const [maintSource, maintTarget] = await Promise.all([
      createConnectionImpl({ ...readonlyOptions, database: 'terria_v1_maint' }),
      createConnectionImpl({ ...targetOptions, database: databases.maint }),
    ]);
    let maintDependencySeed;
    try {
      await maintTarget.query(`DELETE FROM \`${databases.maint}\`.\`maint_buffs\``);
      await maintTarget.query(`DELETE FROM \`${databases.maint}\`.\`maint_items\``);
      await maintTarget.query(`DELETE FROM \`${databases.maint}\`.\`maint_npcs\``);
      maintDependencySeed = {
        itemRows: await seedBuffFixtureMaintItems({ sourceConnection: maintSource, targetConnection: maintTarget, targetDatabase: databases.maint, internalNames: itemNames, identityRows: fullCapture ? itemIdentityRows : null, expectedCount: itemNames.length, allowMissing: allowUnresolvedDependencies }),
        npcRows: await seedBuffFixtureMaintNpcs({ sourceConnection: maintSource, targetConnection: maintTarget, targetDatabase: databases.maint, internalNames: npcNames, identityRows: fullCapture ? npcIdentityRows : null, expectedCount: npcNames.length, allowMissing: allowUnresolvedDependencies }),
      };
    } finally {
      await Promise.all([maintSource.end(), maintTarget.end()]);
    }
    if (!allowUnresolvedDependencies && (maintDependencySeed.itemRows !== itemNames.length || maintDependencySeed.npcRows !== npcNames.length)) throw new Error(`buff T1 maint dependency closure failed: ${JSON.stringify(maintDependencySeed)}`);

    const maintSync = await runMaintSyncImpl({ apply: true, scopes: ['buffs'], ...targetOptions, database: databases.maint }, {
      config: { database: { ...targetOptions, username: mysql.username } },
      loadLandingRows: async () => buildBuffT1LandingRows({ fixture: input, sourceReplay, recordsOverride: fullCapture ? records : null, sourceMetadata: fullCapture ? buildFullCaptureSourceSummary(input) : null }),
      writeReport: async () => null,
    });
    const maintWrites = Number(maintSync?.writes?.inserted ?? 0) + Number(maintSync?.writes?.updated ?? 0);
    if (maintWrites !== records.length) throw new Error(`buff T1 maint mapping mismatch: ${JSON.stringify(maintSync?.writes ?? null)}`);

    const consolidation = await runSyncImpl({ apply: true, createDatabase: false, maintDatabase: databases.maint, localDatabase: databases.local, relationDatabase: databases.relation, allowLocalItemImageFallback: false, scopes: ['buff'] }, {
      config: { database: { ...targetOptions, username: mysql.username } },
      writeReports: async () => ({ auditJsonPath: path.join(tempRoot, 'audit.json'), auditMdPath: path.join(tempRoot, 'audit.md'), conflictsPath: path.join(tempRoot, 'conflicts.json'), unresolvedPath: path.join(tempRoot, 'unresolved.json') }),
    });
    assertExactConsolidation({ records, results: consolidation.results ?? {}, allowUnresolvedDependencies });
    const actualItemBuffRelationCount = (consolidation.results?.itemBuffRelations ?? []).length;
    const actualInflictingNpcBuffRelationCount = (consolidation.results?.npcBuffRelations ?? []).length;

    const relationConnection = await createConnectionImpl({ ...targetOptions, database: databases.relation });
    let projectionRows;
    try {
      [projectionRows] = await relationConnection.query(`SELECT source_id, internal_name, source_item_count, immune_npc_count, source_items_json, inflicting_npcs_json, immune_npcs_json, source_evidence_json FROM \`${databases.relation}\`.\`projection_buffs\` WHERE source_id IN (${sourceIds.map(() => '?').join(', ')}) ORDER BY source_id`, sourceIds);
    } finally {
      await relationConnection.end();
    }
    assertProjectionReadback(records, projectionRows, { allowUnresolvedDependencies });
    return {
      status: 'passed', databases, input: buildBuffT1InputDescriptor({ sourceReplay, fullCapture, inputPath }), dependencySeed, maintDependencySeed, buffImport, sourceItemRelations, maintSync,
      consolidation: {
        apply: consolidation.apply,
        relationBuffCount: records.length,
        projectionBuffCount: records.length,
        itemBuffRelationCount: actualItemBuffRelationCount,
        inflictingNpcBuffRelationCount: actualInflictingNpcBuffRelationCount,
        immuneNpcRelationCount: 0,
        unresolvedFixtureCount: sourceReplay ? 0 : 0,
      },
      consumerReadback: projectionRows.map((row) => ({ sourceId: Number(row.source_id), internalName: row.internal_name, sourceItemCount: Number(row.source_item_count), immuneNpcCount: Number(row.immune_npc_count) })),
      unresolved: {
        sourceItemRelations: sourceItemRelations.unmatched,
        sourceItemSamples: sourceItemRelations.unmatchedSamples,
        relationReadback: {
          itemBuffRelations: actualItemBuffRelationCount,
          inflictingNpcBuffRelations: actualInflictingNpcBuffRelationCount,
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

async function copyFixtureRows({ sourceConnection, targetConnection, sourceDatabase, sourceTable, targetDatabase, targetTable, internalNames, identityRows = null, expectedCount, allowMissing = false, displayColumn = 'name', databasePattern }) {
  if (!databasePattern.test(targetDatabase ?? '')) throw new Error(`buff T1 seed requires an isolated ${targetTable} database`);
  if (internalNames.length !== expectedCount || new Set(internalNames).size !== expectedCount) throw new Error(`buff T1 seed requires ${expectedCount} unique ${targetTable} identities`);
  if (expectedCount === 0) return 0;
  const identities = Array.isArray(identityRows) && identityRows.length > 0
    ? identityRows
    : internalNames.map((internalName) => ({ internalName }));
  const internalValues = identities.map((row) => String(row.internalName ?? '').trim()).filter(Boolean);
  const displayValues = identities.map((row) => String(row.name ?? '').trim()).filter(Boolean);
  const internalPlaceholders = internalValues.map(() => '?').join(', ');
  const displayPlaceholders = displayValues.map(() => '?').join(', ');
  const predicates = [];
  const params = [];
  if (internalValues.length > 0) {
    predicates.push(`LOWER(internal_name) IN (${internalPlaceholders})`);
    params.push(...internalValues.map((value) => value.toLowerCase()));
  }
  if (displayValues.length > 0) {
    if (!/^[a-z0-9_]+$/i.test(displayColumn)) throw new Error(`buff T1 dependency display column is invalid: ${displayColumn}`);
    predicates.push(`\`${displayColumn}\` IN (${displayPlaceholders})`);
    params.push(...displayValues);
  }
  const [sourceRows] = await sourceConnection.query(`SELECT * FROM \`${sourceDatabase}\`.\`${sourceTable}\` WHERE ${predicates.join(' OR ')}`, params);
  const uniqueRows = [...new Map(sourceRows.map((row) => [String(row.id), row])).values()];
  if (!allowMissing && uniqueRows.length !== expectedCount) throw new Error(`buff T1 source closure failed for ${sourceTable}: expected=${expectedCount} actual=${uniqueRows.length}`);
  for (const row of uniqueRows) {
    const columns = Object.keys(row).sort();
    if (columns.some((column) => !/^[a-z0-9_]+$/i.test(column))) throw new Error(`buff T1 dependency column is invalid for ${sourceTable}`);
    await targetConnection.query(`INSERT INTO \`${targetDatabase}\`.\`${targetTable}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ')}`, columns.map((column) => row[column]));
  }
  const [[countRow]] = await targetConnection.query(`SELECT COUNT(*) AS count FROM \`${targetDatabase}\`.\`${targetTable}\` WHERE id IN (${uniqueRows.map(() => '?').join(', ')})`, uniqueRows.map((row) => row.id));
  return Number(countRow?.count ?? 0);
}

function uniqueDependencyIdentities(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const internalName = String(row?.internalName ?? '').trim();
    if (!internalName) continue;
    const key = internalName.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, {
      internalName,
      name: String(row?.name ?? '').trim() || null,
    });
  }
  return [...byKey.values()];
}

function buildDependencyLookup(rows, identities) {
  const result = new Map();
  const normalizedRows = rows.map((row) => ({ id: Number(row.id), internalName: row.internal_name, name: row.name }));
  for (const row of normalizedRows) result.set(row.internalName, row);
  for (const identity of identities) {
    const matches = normalizedRows.filter((row) => row.internalName?.toLowerCase() === identity.internalName.toLowerCase()
      || (identity.name && row.name === identity.name));
    if (matches.length === 1) result.set(identity.internalName, matches[0]);
  }
  return result;
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
  if (records.length !== 400) throw new Error(`Buff full capture requires exactly 400 records, received ${records.length}`);
  const identities = records.map((record) => `${record?.id}:${record?.internalName}`);
  if (new Set(identities).size !== 400 || records.some((record) => !Number.isSafeInteger(Number(record?.id)) || !String(record?.internalName ?? '').trim())) {
    throw new Error('Buff full capture identities are missing or duplicated');
  }
  if (records.some((record) => !Array.isArray(record.sourceItems) || !Array.isArray(record.inflictingNpcs) || !Array.isArray(record.immuneNpcs))) {
    throw new Error('Buff full capture dependency arrays are required');
  }
  return { ...capture, buffs: records.map((record) => structuredClone(record)) };
}

function buildFullCaptureSourceSummary(capture) {
  return {
    schemaVersion: 'buff-full-recrawl/v1',
    provider: 'terraria.wiki.gg',
    sourceRevisionTimestamp: toMysqlDateTime(capture.sourceRevisionTimestamp),
    sourcePage: capture.sourcePageTitle ?? 'Template:GetBuffInfo',
    fetchedAt: toMysqlDateTime(capture.fetchedAt),
    totalBuffs: capture.buffs.length,
  };
}

function toMysqlDateTime(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function assertBuffT1SourceReplayResources({ profile, databases, redisLogicalDb } = {}) {
  assertIsolatedDatabases({ profile, databases });
  if (Number(redisLogicalDb) !== 18) throw new Error('Buff source replay requires Redis DB18');
  return true;
}

export function assertBuffFullCaptureResources({ profile, databases, redisLogicalDb } = {}) {
  assertIsolatedDatabases({ profile, databases });
  if (Number(redisLogicalDb) !== 22) throw new Error('Buff full capture requires Redis DB22');
  return true;
}

function assertIsolatedDatabases({ profile, databases }) {
  if (profile !== 't1' || Object.keys(databases ?? {}).sort().join(',') !== 'local,maint,relation'
      || !ISOLATED_LOCAL.test(databases?.local ?? '')) throw new Error('buff T1 acceptance requires a run-derived isolated local database');
  const prefix = databases.local.slice(0, -'_local'.length);
  if (databases.maint !== `${prefix}_maint` || databases.relation !== `${prefix}_relation`) throw new Error('buff T1 acceptance requires one run-derived isolated three-database set');
}

function assertExactConsolidation({ records, results, allowUnresolvedDependencies = false }) {
  const expectedBuffs = new Set(records.map((record) => record.internalName));
  const relationBuffs = results.relationBuffs ?? [];
  const projectionBuffs = results.projectionBuffs ?? [];
  const itemRelations = results.itemBuffRelations ?? [];
  const npcRelations = results.npcBuffRelations ?? [];
  const relationNames = new Set(relationBuffs.map((row) => row.internalName ?? row.internal_name));
  const projectionNames = new Set(projectionBuffs.map((row) => row.internalName ?? row.internal_name));
  const expectedItems = new Set(records.flatMap((record) => record.sourceItems.map((item) => `${item.internalName}->${record.internalName}`)));
  const actualItems = new Set(itemRelations.map((row) => `${row.itemInternalName ?? row.item_internal_name}->${row.buffInternalName ?? row.buff_internal_name}`));
  const expectedNpcs = new Set(records.flatMap((record) => record.inflictingNpcs.map((npc) => `${NPC_ALIASES.get(npc.internalName) ?? npc.internalName}->${record.internalName}`)));
  const actualNpcs = new Set(npcRelations.map((row) => `${row.npcInternalName ?? row.npc_internal_name}->${row.buffInternalName ?? row.buff_internal_name}`));
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
  if (!parentRowsMatch || (!allowUnresolvedDependencies && !childRowsMatch)) throw new Error('buff T1 exact relation closure mismatch');
}

function assertProjectionReadback(records, rows, { allowUnresolvedDependencies = false } = {}) {
  if (rows.length !== records.length || new Set(rows.map((row) => row.internal_name)).size !== records.length) throw new Error('buff T1 projection identity mismatch');
  for (const row of rows) {
    const expected = records.find((record) => Number(record.id) === Number(row.source_id));
    if (!expected || row.internal_name !== expected.internalName) throw new Error('buff T1 projection count mismatch');
    if ((!allowUnresolvedDependencies
      && (Number(row.source_item_count) !== expected.sourceItems.length || Number(row.immune_npc_count) !== expected.immuneNpcs.length))
      || (allowUnresolvedDependencies
        && (Number(row.source_item_count) < 0 || Number(row.source_item_count) > expected.sourceItems.length
          || Number(row.immune_npc_count) < 0 || Number(row.immune_npc_count) > expected.immuneNpcs.length))) {
      throw new Error('buff T1 projection count mismatch');
    }
    const sourceItems = JSON.parse(row.source_items_json);
    const expectedSourceItems = expected.sourceItems.map((item) => `${Number(item.itemId)}:${item.internalName}`).sort();
    const actualSourceItems = sourceItems.map((item) => `${Number(item.sourceId ?? item.itemId)}:${item.internalName}`).sort();
    if ((!allowUnresolvedDependencies && sourceItems.length !== expected.sourceItems.length)
      || (!allowUnresolvedDependencies && JSON.stringify(actualSourceItems) !== JSON.stringify(expectedSourceItems))) throw new Error('buff T1 projection payload mismatch: source_items_json');
    const inflictingNpcs = JSON.parse(row.inflicting_npcs_json);
    const expectedNpcNames = expected.inflictingNpcs.map((npc) => NPC_ALIASES.get(npc.internalName) ?? npc.internalName).sort();
    const actualNpcNames = inflictingNpcs.map((npc) => npc.internalName).sort();
    if ((!allowUnresolvedDependencies && inflictingNpcs.length !== expected.inflictingNpcs.length)
      || (!allowUnresolvedDependencies && JSON.stringify(actualNpcNames) !== JSON.stringify(expectedNpcNames))
      || inflictingNpcs.some((npc) => npc.relationType !== 'inflicts')) throw new Error('buff T1 projection payload mismatch: inflicting_npcs_json');
    for (const [column, value] of [['immune_npcs_json', expected.immuneNpcs], ['source_evidence_json', expected.sourceEvidence]]) {
      if (JSON.stringify(JSON.parse(row[column])) !== JSON.stringify(value)) throw new Error(`buff T1 projection payload mismatch: ${column}`);
    }
  }
}

export { fixturePath };
