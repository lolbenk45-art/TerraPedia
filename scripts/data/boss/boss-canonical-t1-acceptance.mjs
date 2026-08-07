import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runSync } from '../relation/sync-maint-to-relation.mjs';

const DEFAULT_BOSS_INPUT = 'scripts/data/boss/fixtures/boss-t1.sample.json';
const DEFAULT_LOOT_INPUT = 'scripts/data/boss/fixtures/boss-loot-t1.sample.json';
const ISOLATED_LOCAL = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_local$/;

export async function runBossCanonicalT1Acceptance({
  profile,
  runId,
  repoRoot,
  databases,
  mysql,
  bossInputPath = DEFAULT_BOSS_INPUT,
  lootInputPath = DEFAULT_LOOT_INPUT,
  spawnSyncImpl = spawnSync,
  runSyncImpl = runSync,
  runMaintSyncImpl = runMaintSync,
  seedDependenciesImpl = seedBossFixtureDependencies,
  seedMaintDependenciesImpl = seedBossFixtureMaintDependencies,
  createConnectionImpl = (options) => loadMysqlModule().createConnection(options),
} = {}) {
  if (profile !== 't1') throw new Error('boss T1 acceptance requires the T1 profile');
  if (!ISOLATED_LOCAL.test(databases?.local ?? '')) {
    throw new Error('boss T1 acceptance requires a run-derived isolated local database');
  }
  const prefix = databases.local.slice(0, -'_local'.length);
  if (databases?.maint !== `${prefix}_maint` || databases?.relation !== `${prefix}_relation`) {
    throw new Error('boss T1 acceptance requires one run-derived isolated three-database set');
  }
  const bossInput = path.resolve(repoRoot, bossInputPath);
  const lootInput = path.resolve(repoRoot, lootInputPath);
  for (const input of [bossInput, lootInput]) {
    if (!fs.existsSync(input)) throw new Error(`boss T1 input is missing: ${input}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-boss-t1-${runId}-`));
  try {
    const bossReport = path.join(tempRoot, 'boss-import.json');
    const lootReport = path.join(tempRoot, 'boss-loot-import.json');
    const generatedNpcMap = path.join(tempRoot, 'npc-map.json');
    const bossFixture = JSON.parse(fs.readFileSync(bossInput, 'utf8'));
    const lootFixture = JSON.parse(fs.readFileSync(lootInput, 'utf8'));
    const landingRows = buildBossT1LandingRows({ bossFixture, lootFixture });
    fs.writeFileSync(generatedNpcMap, '{"records":{}}\n', { mode: 0o600 });
    const databaseArgs = [
      `--host=${mysql.host}`,
      `--port=${mysql.port}`,
      `--user=${mysql.username}`,
      `--password=${mysql.password}`,
      `--database=${databases.local}`,
      '--allow-non-primary-db=true',
    ];

    const sourceConnection = await createConnectionImpl({
      host: mysql.host,
      port: mysql.port,
      user: mysql.readonlyUsername,
      password: mysql.readonlyPassword,
      database: 'terria_v1_local',
    });
    const targetConnection = await createConnectionImpl({
      host: mysql.host,
      port: mysql.port,
      user: mysql.username,
      password: mysql.password,
      database: databases.local,
    });
    let dependencySeed;
    try {
      dependencySeed = await seedDependenciesImpl({
        sourceConnection,
        targetConnection,
        targetDatabase: databases.local,
        npcInternalNames: ['KingSlime', 'EyeofCthulhu'],
        itemInternalNames: ['LesserHealingPotion', 'CorruptSeeds'],
      });
    } finally {
      await Promise.all([sourceConnection.end(), targetConnection.end()]);
    }
    if (dependencySeed.npcRows !== 2 || dependencySeed.itemRows !== 2) {
      throw new Error(`boss T1 fixture dependency closure failed: ${JSON.stringify(dependencySeed)}`);
    }

    const maintSourceConnection = await createConnectionImpl({
      host: mysql.host,
      port: mysql.port,
      user: mysql.readonlyUsername,
      password: mysql.readonlyPassword,
      database: 'terria_v1_maint',
    });
    const maintTargetConnection = await createConnectionImpl({
      host: mysql.host,
      port: mysql.port,
      user: mysql.username,
      password: mysql.password,
      database: databases.maint,
    });
    let maintDependencySeed;
    try {
      maintDependencySeed = await seedMaintDependenciesImpl({
        sourceConnection: maintSourceConnection,
        targetConnection: maintTargetConnection,
        targetDatabase: databases.maint,
        npcInternalNames: ['KingSlime', 'EyeofCthulhu'],
        itemInternalNames: ['LesserHealingPotion', 'CorruptSeeds'],
      });
      await maintTargetConnection.query('DELETE FROM `maint_bosses`');
    } finally {
      await Promise.all([maintSourceConnection.end(), maintTargetConnection.end()]);
    }
    if (maintDependencySeed.npcRows !== 2 || maintDependencySeed.itemRows !== 2) {
      throw new Error(`boss T1 maint dependency closure failed: ${JSON.stringify(maintDependencySeed)}`);
    }

    const maintSync = await runMaintSyncImpl({
      apply: true,
      scopes: ['bosses'],
      host: mysql.host,
      port: mysql.port,
      user: mysql.username,
      password: mysql.password,
      database: databases.maint,
    }, {
      config: { database: { host: mysql.host, port: mysql.port, username: mysql.username, password: mysql.password } },
      loadLandingRows: async () => landingRows,
    });

    runChild(spawnSyncImpl, repoRoot, 'scripts/data/import/import-wiki-bosses-to-db.mjs', [
      `--input=${bossInput}`,
      '--dry-run=false',
      '--offline=true',
      '--strict=false',
      `--generated-npc-map=${generatedNpcMap}`,
      `--report-json=${bossReport}`,
      ...databaseArgs,
    ], 'boss import');
    runChild(spawnSyncImpl, repoRoot, 'scripts/data/import/import-boss-loot-to-db.mjs', [
      `--bundle=${lootInput}`,
      '--dry-run=false',
      '--regenerate-bundle=false',
      `--report-json=${lootReport}`,
      ...databaseArgs,
    ], 'boss loot import');

    const consolidation = await runSyncImpl({
      apply: true,
      createDatabase: false,
      maintDatabase: databases.maint,
      localDatabase: databases.local,
      relationDatabase: databases.relation,
      allowLocalItemImageFallback: false,
      scopes: ['boss'],
    }, {
      config: { database: { host: mysql.host, port: mysql.port, username: mysql.username, password: mysql.password } },
      writeReports: async () => ({
        auditJsonPath: path.join(tempRoot, 'relation-audit.json'),
        auditMdPath: path.join(tempRoot, 'relation-audit.md'),
        conflictsPath: path.join(tempRoot, 'relation-conflicts.json'),
        unresolvedPath: path.join(tempRoot, 'relation-unresolved.json'),
      }),
    });
    const relationBosses = consolidation.results?.relationBosses ?? [];
    const bossRewards = consolidation.results?.bossItemRewardRelations ?? [];
    if (relationBosses.length !== 2 || bossRewards.length !== 2
      || relationBosses.some((row) => row?.npcMatchStatus !== 'resolved')) {
      throw new Error(`boss T1 fixture consolidation mismatch: ${JSON.stringify({
        relationBosses: relationBosses.length,
        bossRewards: bossRewards.length,
        unresolvedBosses: relationBosses.filter((row) => row?.npcMatchStatus !== 'resolved').length,
      })}`);
    }

    return {
      status: 'passed',
      databases,
      inputs: { boss: bossInputPath, loot: lootInputPath },
      dependencySeed,
      maintDependencySeed,
      maintSync,
      bossImport: JSON.parse(fs.readFileSync(bossReport, 'utf8')),
      bossLootImport: JSON.parse(fs.readFileSync(lootReport, 'utf8')),
      consolidation: {
        apply: consolidation.apply,
        relationBossCount: relationBosses.length,
        bossRewardRelationCount: bossRewards.length,
      },
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function buildBossT1LandingRows({ bossFixture, lootFixture } = {}) {
  const bosses = Array.isArray(bossFixture?.records) ? bossFixture.records : [];
  const lootBosses = Array.isArray(lootFixture?.bosses) ? lootFixture.bosses : [];
  if (bosses.length !== 2 || lootBosses.length !== 2) {
    throw new Error('boss T1 fixtures must contain exactly two bosses and two loot owners');
  }
  const lootNames = new Set(lootBosses.map((entry) => entry.bossName));
  if (bosses.some((entry) => !lootNames.has(entry.titleEn))) {
    throw new Error('boss T1 boss and loot fixtures are not relationship-closed');
  }
  return bosses.map((record, index) => {
    const payloadJson = JSON.stringify(record);
    return {
      id: 900001 + index,
      dataset_type: 'bosses_raw',
      provider: 'boss-t1.fixture',
      source_page: record.pageTitleEn,
      source_key: `boss-t1:${record.titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      source_revision_timestamp: record.revisionTimestamp ?? null,
      content_hash: createHash('sha256').update(payloadJson).digest('hex'),
      fetched_at: bossFixture.generatedAt,
      parsed_at: bossFixture.generatedAt,
      payload_json: payloadJson,
    };
  });
}

export async function seedBossFixtureDependencies({
  sourceConnection,
  targetConnection,
  targetDatabase,
  npcInternalNames,
  itemInternalNames,
} = {}) {
  if (!ISOLATED_LOCAL.test(targetDatabase ?? '')) {
    throw new Error('boss T1 dependency seed requires an isolated local database');
  }
  const target = `\`${targetDatabase}\``;
  const copy = async (table, names) => {
    const placeholders = names.map(() => '?').join(', ');
    const [sourceRows] = await sourceConnection.query(
      `SELECT * FROM \`terria_v1_local\`.\`${table}\` WHERE internal_name IN (${placeholders})`,
      names,
    );
    for (const row of sourceRows) {
      const columns = Object.keys(row).sort();
      if (columns.some((column) => !/^[a-z0-9_]+$/i.test(column))) {
        throw new Error(`boss T1 dependency column is invalid for ${table}`);
      }
      const quoted = columns.map((column) => `\`${column}\``).join(', ');
      const values = columns.map(() => '?').join(', ');
      const updates = columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
      await targetConnection.query(
        `INSERT INTO ${target}.\`${table}\` (${quoted}) VALUES (${values}) ON DUPLICATE KEY UPDATE ${updates}`,
        columns.map((column) => row[column]),
      );
    }
    const [rows] = await targetConnection.query(
      `SELECT COUNT(*) AS count FROM ${target}.\`${table}\` WHERE internal_name IN (${placeholders})`,
      names,
    );
    return Number(rows[0]?.count ?? 0);
  };
  return {
    npcRows: await copy('npcs', npcInternalNames),
    itemRows: await copy('items', itemInternalNames),
  };
}

export async function seedBossFixtureMaintDependencies({
  sourceConnection,
  targetConnection,
  targetDatabase,
  npcInternalNames,
  itemInternalNames,
} = {}) {
  if (!/^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_maint$/.test(targetDatabase ?? '')) {
    throw new Error('boss T1 maint dependency seed requires an isolated maint database');
  }
  const copy = async (table, names) => {
    const placeholders = names.map(() => '?').join(', ');
    const [sourceRows] = await sourceConnection.query(
      `SELECT * FROM \`terria_v1_maint\`.\`${table}\` WHERE internal_name IN (${placeholders})`,
      names,
    );
    for (const row of sourceRows) {
      const columns = Object.keys(row).sort();
      if (columns.some((column) => !/^[a-z0-9_]+$/i.test(column))) {
        throw new Error(`boss T1 maint dependency column is invalid for ${table}`);
      }
      const quoted = columns.map((column) => `\`${column}\``).join(', ');
      const values = columns.map(() => '?').join(', ');
      const updates = columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
      await targetConnection.query(
        `INSERT INTO \`${targetDatabase}\`.\`${table}\` (${quoted}) VALUES (${values}) ON DUPLICATE KEY UPDATE ${updates}`,
        columns.map((column) => row[column]),
      );
    }
    const [rows] = await targetConnection.query(
      `SELECT COUNT(*) AS count FROM \`${targetDatabase}\`.\`${table}\` WHERE internal_name IN (${placeholders})`,
      names,
    );
    return Number(rows[0]?.count ?? 0);
  };
  return {
    npcRows: await copy('maint_npcs', npcInternalNames),
    itemRows: await copy('maint_items', itemInternalNames),
  };
}

function runChild(spawnSyncImpl, repoRoot, scriptPath, args, label) {
  const result = spawnSyncImpl(process.execPath, [path.join(repoRoot, scriptPath), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${String(result.stderr ?? '').trim()}`);
  }
}
