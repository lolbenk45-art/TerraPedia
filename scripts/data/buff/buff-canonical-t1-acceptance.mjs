import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importBuffs } from '../import/import-independent-entities-to-db.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runSync } from '../relation/sync-maint-to-relation.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(moduleDir, 'fixtures', 'buff-t1.sample.json');
const defaultFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const DEFAULT_INPUT = 'scripts/data/buff/fixtures/buff-t1.sample.json';
const ISOLATED_LOCAL = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_local$/;
const ISOLATED_MAINT = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_maint$/;
const NPC_ALIASES = new Map([['SandPoacher', 'DesertScorpionWalk']]);

function fixtureRecords(fixture = defaultFixture) {
  return fixture.records.map((record) => structuredClone(record));
}

export function buildBuffT1LandingRows({ fixture = defaultFixture } = {}) {
  const records = validateFixture(fixture);
  const payloadJson = JSON.stringify({ records });
  return [{
    id: 910003,
    dataset_type: 'buffs_raw',
    provider: 'buff-t1.fixture',
    source_kind: 'offline_fixture',
    source_key: 'buff-t1:shadowflame-venom',
    source_locator: 'buff-t1.sample.json',
    source_page: 'Buff T1 offline fixture',
    source_revision_timestamp: null,
    content_hash: createHash('sha256').update(payloadJson).digest('hex'),
    fetched_at: fixture.generatedAt,
    parsed_at: fixture.generatedAt,
    payload_json: payloadJson,
    parse_status: 'ok',
    is_current: 1,
  }];
}

export function seedBuffFixtureItems(records = fixtureRecords()) {
  return records.flatMap((record) => record.sourceItems.map((item) => item.internalName));
}

export function seedBuffFixtureNpcs(records = fixtureRecords()) {
  return records.flatMap((record) => record.inflictingNpcs.map((npc) => NPC_ALIASES.get(npc.internalName) ?? npc.internalName));
}

export async function seedBuffFixtureMaintItems(options = {}) {
  return copyFixtureRows({ ...options, sourceDatabase: 'terria_v1_maint', sourceTable: 'maint_items', targetTable: 'maint_items', expectedCount: 11, databasePattern: ISOLATED_MAINT });
}

export async function seedBuffFixtureMaintNpcs(options = {}) {
  return copyFixtureRows({ ...options, sourceDatabase: 'terria_v1_maint', sourceTable: 'maint_npcs', targetTable: 'maint_npcs', expectedCount: 4, databasePattern: ISOLATED_MAINT });
}

export async function runBuffCanonicalT1Acceptance({
  profile,
  runId,
  repoRoot,
  databases,
  mysql,
  inputPath = DEFAULT_INPUT,
  importBuffsImpl = importBuffs,
  runMaintSyncImpl = runMaintSync,
  runSyncImpl = runSync,
  createConnectionImpl = (options) => loadMysqlModule().createConnection(options),
} = {}) {
  assertIsolatedDatabases({ profile, databases });
  const resolvedInput = path.resolve(repoRoot, inputPath);
  if (!fs.existsSync(resolvedInput)) throw new Error(`buff T1 input is missing: ${resolvedInput}`);
  const fixture = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  const records = validateFixture(fixture);
  const itemNames = seedBuffFixtureItems(records);
  const npcNames = seedBuffFixtureNpcs(records);
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
      const itemRows = await copyFixtureRows({ sourceConnection: localSource, targetConnection: localTarget, sourceDatabase: 'terria_v1_local', sourceTable: 'items', targetDatabase: databases.local, targetTable: 'items', internalNames: itemNames, expectedCount: 11, databasePattern: ISOLATED_LOCAL });
      const npcRows = await copyFixtureRows({ sourceConnection: localSource, targetConnection: localTarget, sourceDatabase: 'terria_v1_local', sourceTable: 'npcs', targetDatabase: databases.local, targetTable: 'npcs', internalNames: npcNames, expectedCount: 4, databasePattern: ISOLATED_LOCAL });
      dependencySeed = { itemRows, npcRows };
      const [seededItems] = await localTarget.query(`SELECT id, internal_name, name FROM \`${databases.local}\`.\`items\` WHERE internal_name IN (${itemNames.map(() => '?').join(', ')})`, itemNames);
      const itemLookup = { byInternal: new Map(seededItems.map((row) => [row.internal_name, { id: Number(row.id), internalName: row.internal_name, name: row.name }])) };
      const sourceItemLookup = { bySourceId: new Map(records.flatMap((record) => record.sourceItems.map((item) => [Number(item.itemId), item.internalName]))) };
      await importBuffsImpl(localTarget, records, itemLookup, sourceItemLookup, buffImport, sourceItemRelations);
    } finally {
      await Promise.all([localSource.end(), localTarget.end()]);
    }
    if (dependencySeed.itemRows !== 11 || dependencySeed.npcRows !== 4) throw new Error(`buff T1 dependency closure failed: ${JSON.stringify(dependencySeed)}`);
    if (buffImport.input !== 2 || buffImport.created !== 2 || buffImport.updated !== 0 || buffImport.errors.length !== 0 || sourceItemRelations.input !== 11 || sourceItemRelations.unmatched !== 0) {
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
        itemRows: await seedBuffFixtureMaintItems({ sourceConnection: maintSource, targetConnection: maintTarget, targetDatabase: databases.maint, internalNames: itemNames }),
        npcRows: await seedBuffFixtureMaintNpcs({ sourceConnection: maintSource, targetConnection: maintTarget, targetDatabase: databases.maint, internalNames: npcNames }),
      };
    } finally {
      await Promise.all([maintSource.end(), maintTarget.end()]);
    }
    if (maintDependencySeed.itemRows !== 11 || maintDependencySeed.npcRows !== 4) throw new Error(`buff T1 maint dependency closure failed: ${JSON.stringify(maintDependencySeed)}`);

    const maintSync = await runMaintSyncImpl({ apply: true, scopes: ['buffs'], ...targetOptions, database: databases.maint }, {
      config: { database: { ...targetOptions, username: mysql.username } },
      loadLandingRows: async () => buildBuffT1LandingRows({ fixture }),
      writeReport: async () => null,
    });
    const maintWrites = Number(maintSync?.writes?.inserted ?? 0) + Number(maintSync?.writes?.updated ?? 0);
    if (maintWrites !== 2) throw new Error(`buff T1 maint mapping mismatch: ${JSON.stringify(maintSync?.writes ?? null)}`);

    const consolidation = await runSyncImpl({ apply: true, createDatabase: false, maintDatabase: databases.maint, localDatabase: databases.local, relationDatabase: databases.relation, allowLocalItemImageFallback: false, scopes: ['buff'] }, {
      config: { database: { ...targetOptions, username: mysql.username } },
      writeReports: async () => ({ auditJsonPath: path.join(tempRoot, 'audit.json'), auditMdPath: path.join(tempRoot, 'audit.md'), conflictsPath: path.join(tempRoot, 'conflicts.json'), unresolvedPath: path.join(tempRoot, 'unresolved.json') }),
    });
    assertExactConsolidation({ records, results: consolidation.results ?? {} });

    const relationConnection = await createConnectionImpl({ ...targetOptions, database: databases.relation });
    let projectionRows;
    try {
      [projectionRows] = await relationConnection.query(`SELECT source_id, internal_name, source_item_count, immune_npc_count, source_items_json, inflicting_npcs_json, immune_npcs_json, source_evidence_json FROM \`${databases.relation}\`.\`projection_buffs\` WHERE source_id IN (${sourceIds.map(() => '?').join(', ')}) ORDER BY source_id`, sourceIds);
    } finally {
      await relationConnection.end();
    }
    assertProjectionReadback(records, projectionRows);
    return {
      status: 'passed', databases, input: inputPath, dependencySeed, maintDependencySeed, buffImport, sourceItemRelations, maintSync,
      consolidation: { apply: consolidation.apply, relationBuffCount: 2, projectionBuffCount: 2, itemBuffRelationCount: 11, inflictingNpcBuffRelationCount: 4, immuneNpcRelationCount: 0, unresolvedFixtureCount: 0 },
      consumerReadback: projectionRows.map((row) => ({ sourceId: Number(row.source_id), internalName: row.internal_name, sourceItemCount: Number(row.source_item_count), immuneNpcCount: Number(row.immune_npc_count) })),
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

function validateFixture(fixture) {
  const records = Array.isArray(fixture?.records) ? fixture.records : [];
  const identities = records.map((record) => `${record.id}:${record.internalName}`);
  if (identities.join('|') !== '153:ShadowFlame|70:Venom' || records.map((record) => record.sourceItems.length).join(',') !== '4,7' || records.map((record) => record.immuneNpcs.length).join(',') !== '30,26') throw new Error('buff T1 fixture contract is invalid');
  return fixtureRecords(fixture);
}

function assertIsolatedDatabases({ profile, databases }) {
  if (profile !== 't1' || !ISOLATED_LOCAL.test(databases?.local ?? '')) throw new Error('buff T1 acceptance requires a run-derived isolated local database');
  const prefix = databases.local.slice(0, -'_local'.length);
  if (databases.maint !== `${prefix}_maint` || databases.relation !== `${prefix}_relation`) throw new Error('buff T1 acceptance requires one run-derived isolated three-database set');
}

function assertExactConsolidation({ records, results }) {
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
  if (relationBuffs.length !== 2 || relationNames.size !== 2 || [...expectedBuffs].some((name) => !relationNames.has(name)) || projectionBuffs.length !== 2 || projectionNames.size !== 2 || [...expectedBuffs].some((name) => !projectionNames.has(name)) || itemRelations.length !== 11 || actualItems.size !== 11 || [...expectedItems].some((pair) => !actualItems.has(pair)) || npcRelations.length !== 4 || actualNpcs.size !== 4 || [...expectedNpcs].some((pair) => !actualNpcs.has(pair))) throw new Error('buff T1 exact relation closure mismatch');
}

function assertProjectionReadback(records, rows) {
  if (rows.length !== 2 || new Set(rows.map((row) => row.internal_name)).size !== 2) throw new Error('buff T1 projection identity mismatch');
  for (const row of rows) {
    const expected = records.find((record) => Number(record.id) === Number(row.source_id));
    if (!expected || row.internal_name !== expected.internalName || Number(row.source_item_count) !== expected.sourceItems.length || Number(row.immune_npc_count) !== expected.immuneNpcs.length) throw new Error('buff T1 projection count mismatch');
    const sourceItems = JSON.parse(row.source_items_json);
    const expectedSourceItems = expected.sourceItems.map((item) => `${Number(item.itemId)}:${item.internalName}`).sort();
    const actualSourceItems = sourceItems.map((item) => `${Number(item.sourceId ?? item.itemId)}:${item.internalName}`).sort();
    if (sourceItems.length !== expected.sourceItems.length || JSON.stringify(actualSourceItems) !== JSON.stringify(expectedSourceItems)) throw new Error('buff T1 projection payload mismatch: source_items_json');
    const inflictingNpcs = JSON.parse(row.inflicting_npcs_json);
    const expectedNpcNames = expected.inflictingNpcs.map((npc) => NPC_ALIASES.get(npc.internalName) ?? npc.internalName).sort();
    const actualNpcNames = inflictingNpcs.map((npc) => npc.internalName).sort();
    if (inflictingNpcs.length !== expected.inflictingNpcs.length || JSON.stringify(actualNpcNames) !== JSON.stringify(expectedNpcNames) || inflictingNpcs.some((npc) => npc.relationType !== 'inflicts')) throw new Error('buff T1 projection payload mismatch: inflicting_npcs_json');
    for (const [column, value] of [['immune_npcs_json', expected.immuneNpcs], ['source_evidence_json', expected.sourceEvidence]]) {
      if (JSON.stringify(JSON.parse(row[column])) !== JSON.stringify(value)) throw new Error(`buff T1 projection payload mismatch: ${column}`);
    }
  }
}

export { fixturePath };
