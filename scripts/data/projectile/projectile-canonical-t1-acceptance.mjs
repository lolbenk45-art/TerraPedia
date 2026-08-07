import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { importProjectiles } from '../import/import-independent-entities-to-db.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runSync } from '../relation/sync-maint-to-relation.mjs';

const DEFAULT_INPUT = 'scripts/data/projectile/fixtures/projectile-t1.sample.json';
const ISOLATED_LOCAL = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_local$/;
const ISOLATED_MAINT = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_maint$/;

export function buildProjectileT1LandingRows({ fixture } = {}) {
  const records = Array.isArray(fixture?.records) ? fixture.records : [];
  if (fixture?.coverage?.npcProjectiles !== 'not-covered' || records.length !== 2) {
    throw new Error('projectile item-only T1 fixture must contain two records and explicit NPC non-coverage');
  }
  const payload = {
    moduleGeneratedAt: fixture.generatedAt,
    moduleGeneratedFrom: 'projectile-t1.fixture',
    projectiles: records.map((record) => ({
      id: record.id,
      internalName: record.internalName,
      name: record.name,
      damage: record.combat?.damage ?? null,
      knockBack: record.combat?.knockBack ?? null,
      penetrate: record.combat?.penetrate ?? null,
      timeLeft: record.lifecycle?.timeLeft ?? null,
      width: record.dimensions?.width ?? null,
      height: record.dimensions?.height ?? null,
      scale: record.dimensions?.scale ?? null,
      friendly: record.flags?.friendly ?? null,
      hostile: record.flags?.hostile ?? null,
      tileCollide: record.flags?.tileCollide ?? null,
    })),
  };
  const payloadJson = JSON.stringify(payload);
  return [{
    id: 910001,
    dataset_type: 'projectiles_raw',
    provider: 'projectile-t1.fixture',
    source_page: 'Module:Projectileinfo/item-only-t1',
    source_key: 'projectile-t1:item-only',
    source_revision_timestamp: null,
    content_hash: createHash('sha256').update(payloadJson).digest('hex'),
    fetched_at: fixture.generatedAt,
    parsed_at: fixture.generatedAt,
    payload_json: payloadJson,
  }];
}

export async function seedProjectileFixtureItems({
  sourceConnection,
  targetConnection,
  targetDatabase,
  itemInternalNames,
} = {}) {
  if (!ISOLATED_LOCAL.test(targetDatabase ?? '')) {
    throw new Error('projectile T1 item seed requires an isolated local database');
  }
  return {
    itemRows: await copyFixtureRows({
      sourceConnection,
      targetConnection,
      sourceDatabase: 'terria_v1_local',
      sourceTable: 'items',
      targetDatabase,
      targetTable: 'items',
      internalNames: itemInternalNames,
    }),
  };
}

export async function seedProjectileFixtureMaintItems({
  sourceConnection,
  targetConnection,
  targetDatabase,
  itemInternalNames,
} = {}) {
  if (!ISOLATED_MAINT.test(targetDatabase ?? '')) {
    throw new Error('projectile T1 item seed requires an isolated maint database');
  }
  return {
    itemRows: await copyFixtureRows({
      sourceConnection,
      targetConnection,
      sourceDatabase: 'terria_v1_maint',
      sourceTable: 'maint_items',
      targetDatabase,
      targetTable: 'maint_items',
      internalNames: itemInternalNames,
    }),
  };
}

export async function runProjectileCanonicalT1Acceptance({
  profile,
  runId,
  repoRoot,
  databases,
  mysql,
  inputPath = DEFAULT_INPUT,
  importProjectilesImpl = importProjectiles,
  runMaintSyncImpl = runMaintSync,
  runSyncImpl = runSync,
  seedItemsImpl = seedProjectileFixtureItems,
  seedMaintItemsImpl = seedProjectileFixtureMaintItems,
  createConnectionImpl = (options) => loadMysqlModule().createConnection(options),
} = {}) {
  if (profile !== 't1') throw new Error('projectile T1 acceptance requires the T1 profile');
  if (!ISOLATED_LOCAL.test(databases?.local ?? '')) {
    throw new Error('projectile T1 acceptance requires a run-derived isolated local database');
  }
  const prefix = databases.local.slice(0, -'_local'.length);
  if (databases?.maint !== `${prefix}_maint` || databases?.relation !== `${prefix}_relation`) {
    throw new Error('projectile T1 acceptance requires one run-derived isolated three-database set');
  }

  const resolvedInput = path.resolve(repoRoot, inputPath);
  if (!fs.existsSync(resolvedInput)) throw new Error(`projectile T1 input is missing: ${resolvedInput}`);
  const fixture = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  const records = validateFixture(fixture);
  const projectileRecords = records.map(({ itemInternalName: _itemInternalName, ...record }) => record);
  const itemInternalNames = records.map((record) => record.itemInternalName);
  const projectileSourceIds = records.map((record) => Number(record.id));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-projectile-t1-${runId}-`));

  try {
    const localSource = await createConnectionImpl({
      host: mysql.host,
      port: mysql.port,
      user: mysql.readonlyUsername,
      password: mysql.readonlyPassword,
      database: 'terria_v1_local',
    });
    const localTarget = await createConnectionImpl({
      host: mysql.host,
      port: mysql.port,
      user: mysql.username,
      password: mysql.password,
      database: databases.local,
    });
    let dependencySeed;
    const projectileImport = { input: 0, created: 0, updated: 0, skipped: 0, errors: [] };
    try {
      dependencySeed = await seedItemsImpl({
        sourceConnection: localSource,
        targetConnection: localTarget,
        targetDatabase: databases.local,
        itemInternalNames,
      });
      await localTarget.query(
        `DELETE FROM \`${databases.local}\`.\`projectiles\` WHERE source_id IN (${projectileSourceIds.map(() => '?').join(', ')})`,
        projectileSourceIds,
      );
      await importProjectilesImpl(localTarget, projectileRecords, projectileImport);
    } finally {
      await Promise.all([localSource.end(), localTarget.end()]);
    }
    if (dependencySeed.itemRows !== 2) {
      throw new Error(`projectile T1 fixture item closure failed: ${JSON.stringify(dependencySeed)}`);
    }
    if (projectileImport.input !== 2 || projectileImport.created !== 2
        || projectileImport.updated !== 0 || projectileImport.errors.length !== 0) {
      throw new Error(`projectile T1 import mismatch: ${JSON.stringify(projectileImport)}`);
    }

    const maintSource = await createConnectionImpl({
      host: mysql.host,
      port: mysql.port,
      user: mysql.readonlyUsername,
      password: mysql.readonlyPassword,
      database: 'terria_v1_maint',
    });
    const maintTarget = await createConnectionImpl({
      host: mysql.host,
      port: mysql.port,
      user: mysql.username,
      password: mysql.password,
      database: databases.maint,
    });
    let maintDependencySeed;
    try {
      await maintTarget.query(`DELETE FROM \`${databases.maint}\`.\`maint_projectiles\``);
      await maintTarget.query(`DELETE FROM \`${databases.maint}\`.\`maint_items\``);
      maintDependencySeed = await seedMaintItemsImpl({
        sourceConnection: maintSource,
        targetConnection: maintTarget,
        targetDatabase: databases.maint,
        itemInternalNames,
      });
    } finally {
      await Promise.all([maintSource.end(), maintTarget.end()]);
    }
    if (maintDependencySeed.itemRows !== 2) {
      throw new Error(`projectile T1 maint item closure failed: ${JSON.stringify(maintDependencySeed)}`);
    }

    const zhSourceIndexes = {
      projectilesByInternalName: new Map(records.map((record) => [
        record.internalName.toLowerCase(),
        { nameZh: record.nameZh, imageUrl: record.imageUrl },
      ])),
    };
    const maintSync = await runMaintSyncImpl({
      apply: true,
      scopes: ['projectiles'],
      host: mysql.host,
      port: mysql.port,
      user: mysql.username,
      password: mysql.password,
      database: databases.maint,
    }, {
      config: { database: { host: mysql.host, port: mysql.port, username: mysql.username, password: mysql.password } },
      loadLandingRows: async () => buildProjectileT1LandingRows({ fixture }),
      writeReport: async () => null,
      zhSourceIndexes,
    });
    const maintWrites = Number(maintSync?.writes?.inserted ?? 0) + Number(maintSync?.writes?.updated ?? 0);
    if (maintWrites !== 2) {
      throw new Error(`projectile T1 maint mapping mismatch: ${JSON.stringify(maintSync?.writes ?? null)}`);
    }

    const consolidation = await runSyncImpl({
      apply: true,
      createDatabase: false,
      maintDatabase: databases.maint,
      localDatabase: databases.local,
      relationDatabase: databases.relation,
      allowLocalItemImageFallback: false,
      scopes: ['projectile'],
    }, {
      config: { database: { host: mysql.host, port: mysql.port, username: mysql.username, password: mysql.password } },
      writeReports: async () => ({
        auditJsonPath: path.join(tempRoot, 'relation-audit.json'),
        auditMdPath: path.join(tempRoot, 'relation-audit.md'),
        conflictsPath: path.join(tempRoot, 'relation-conflicts.json'),
        unresolvedPath: path.join(tempRoot, 'relation-unresolved.json'),
      }),
    });
    const results = consolidation.results ?? {};
    assertExactConsolidation({ records, results });

    return {
      status: 'passed',
      databases,
      input: inputPath,
      dependencySeed,
      maintDependencySeed,
      projectileImport,
      maintSync,
      consolidation: {
        apply: consolidation.apply,
        relationProjectileCount: results.relationProjectiles.length,
        itemProjectileRelationCount: results.itemProjectileRelations.length,
        projectionProjectileCount: results.projectionProjectiles.length,
        unresolvedFixtureCount: 0,
      },
      coverage: {
        items: { status: 'passed', relationCount: 2 },
        npcProjectiles: { status: 'not-covered', relationCount: 0 },
      },
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function copyFixtureRows({
  sourceConnection,
  targetConnection,
  sourceDatabase,
  sourceTable,
  targetDatabase,
  targetTable,
  internalNames,
}) {
  const names = Array.isArray(internalNames) ? internalNames : [];
  if (names.length !== 2 || new Set(names).size !== 2) {
    throw new Error('projectile T1 item seed requires exactly two unique item identities');
  }
  const placeholders = names.map(() => '?').join(', ');
  const [sourceRows] = await sourceConnection.query(
    `SELECT * FROM \`${sourceDatabase}\`.\`${sourceTable}\` WHERE internal_name IN (${placeholders})`,
    names,
  );
  if (sourceRows.length !== 2) {
    throw new Error(`projectile T1 source item closure failed for ${sourceTable}`);
  }
  for (const row of sourceRows) {
    const columns = Object.keys(row).sort();
    if (columns.some((column) => !/^[a-z0-9_]+$/i.test(column))) {
      throw new Error(`projectile T1 dependency column is invalid for ${sourceTable}`);
    }
    const quoted = columns.map((column) => `\`${column}\``).join(', ');
    const values = columns.map(() => '?').join(', ');
    const updates = columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
    await targetConnection.query(
      `INSERT INTO \`${targetDatabase}\`.\`${targetTable}\` (${quoted}) VALUES (${values}) ON DUPLICATE KEY UPDATE ${updates}`,
      columns.map((column) => row[column]),
    );
  }
  const [rows] = await targetConnection.query(
    `SELECT COUNT(*) AS count FROM \`${targetDatabase}\`.\`${targetTable}\` WHERE internal_name IN (${placeholders})`,
    names,
  );
  return Number(rows[0]?.count ?? 0);
}

function validateFixture(fixture) {
  const records = Array.isArray(fixture?.records) ? fixture.records : [];
  const pairs = records.map((record) => `${record.itemInternalName}->${record.internalName}`);
  if (fixture?.coverage?.npcProjectiles !== 'not-covered'
      || records.length !== 2
      || new Set(records.map((record) => record.id)).size !== 2
      || new Set(pairs).size !== 2
      || pairs.join('|') !== 'WoodenBow->WoodenArrowFriendly|FlamingArrow->FireArrow') {
    throw new Error('projectile item-only T1 fixture contract is invalid');
  }
  return records;
}

function assertExactConsolidation({ records, results }) {
  const expectedProjectileNames = new Set(records.map((record) => record.internalName));
  const relationProjectiles = results.relationProjectiles ?? [];
  const relationProjectileNames = new Set(relationProjectiles.map((row) => row.internalName ?? row.internal_name));
  const projectionProjectiles = results.projectionProjectiles ?? [];
  const projectionProjectileNames = new Set(projectionProjectiles.map((row) => row.internalName ?? row.internal_name));
  const expectedPairs = new Set(records.map((record) => `${record.itemInternalName}->${record.internalName}`));
  const itemProjectileRelations = results.itemProjectileRelations ?? [];
  const actualPairs = new Set(itemProjectileRelations.map((row) => (
    `${row.itemInternalName ?? row.item_internal_name}->${row.projectileInternalName ?? row.projectile_internal_name}`
  )));
  const audits = results.itemProjectileAudits ?? [];
  const promotedAudits = audits.filter((row) => (row.auditStatus ?? row.audit_status) === 'promoted_to_relation');
  const promotedAuditPairs = new Set(promotedAudits
    .map((row) => `${row.itemInternalName ?? row.item_internal_name}->${row.projectileInternalName ?? row.projectile_internal_name}`));
  const unresolved = audits.filter((row) => (
    expectedPairs.has(`${row.itemInternalName ?? row.item_internal_name}->${row.projectileInternalName ?? row.projectile_internal_name}`)
    && (row.auditStatus ?? row.audit_status) !== 'promoted_to_relation'
  ));
  if (relationProjectiles.length !== 2
      || relationProjectileNames.size !== 2
      || [...expectedProjectileNames].some((name) => !relationProjectileNames.has(name))
      || projectionProjectiles.length !== 2
      || projectionProjectileNames.size !== 2
      || [...expectedProjectileNames].some((name) => !projectionProjectileNames.has(name))
      || itemProjectileRelations.length !== 2
      || actualPairs.size !== 2
      || [...expectedPairs].some((pair) => !actualPairs.has(pair))
      || promotedAudits.length !== 2
      || promotedAuditPairs.size !== 2
      || [...expectedPairs].some((pair) => !promotedAuditPairs.has(pair))
      || unresolved.length !== 0
      || (results.npcProjectileRelations ?? []).length !== 0) {
    throw new Error(`projectile T1 fixture consolidation mismatch: ${JSON.stringify({
      relationProjectiles: relationProjectiles.length,
      relationProjectileIdentities: [...relationProjectileNames],
      itemProjectileRelations: itemProjectileRelations.length,
      promotedItemProjectileAudits: promotedAudits.length,
      projectionProjectiles: projectionProjectiles.length,
      projectionProjectileIdentities: [...projectionProjectileNames],
      unresolvedFixture: unresolved.length,
      npcProjectileRelations: results.npcProjectileRelations?.length ?? 0,
    })}`);
  }
}
