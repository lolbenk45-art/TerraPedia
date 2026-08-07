import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
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
  seedDependenciesImpl = seedBossFixtureDependencies,
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
    fs.writeFileSync(generatedNpcMap, '{"records":{}}\n', { mode: 0o600 });
    const databaseArgs = [
      `--host=${mysql.host}`,
      `--port=${mysql.port}`,
      `--user=${mysql.username}`,
      `--password=${mysql.password}`,
      `--database=${databases.local}`,
      '--allow-non-primary-db=true',
    ];

    const connection = await createConnectionImpl({
      host: mysql.host,
      port: mysql.port,
      user: mysql.username,
      password: mysql.password,
    });
    let dependencySeed;
    try {
      dependencySeed = await seedDependenciesImpl({
        connection,
        targetDatabase: databases.local,
        npcInternalNames: ['KingSlime', 'EyeofCthulhu'],
        itemInternalNames: ['LesserHealingPotion', 'CorruptSeeds'],
      });
    } finally {
      await connection.end();
    }
    if (dependencySeed.npcRows !== 2 || dependencySeed.itemRows !== 2) {
      throw new Error(`boss T1 fixture dependency closure failed: ${JSON.stringify(dependencySeed)}`);
    }

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

    return {
      status: 'passed',
      databases,
      inputs: { boss: bossInputPath, loot: lootInputPath },
      dependencySeed,
      bossImport: JSON.parse(fs.readFileSync(bossReport, 'utf8')),
      bossLootImport: JSON.parse(fs.readFileSync(lootReport, 'utf8')),
      consolidation: {
        apply: consolidation.apply,
        relationBossCount: consolidation.results?.relationBosses?.length ?? 0,
        bossRewardRelationCount: consolidation.results?.bossItemRewardRelations?.length ?? 0,
      },
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export async function seedBossFixtureDependencies({
  connection,
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
    await connection.query(
      `INSERT IGNORE INTO ${target}.\`${table}\` SELECT * FROM \`terria_v1_local\`.\`${table}\` WHERE internal_name IN (${placeholders})`,
      names,
    );
    const [rows] = await connection.query(
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

function runChild(spawnSyncImpl, repoRoot, scriptPath, args, label) {
  const result = spawnSyncImpl(process.execPath, [path.join(repoRoot, scriptPath), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${String(result.stderr ?? '').trim()}`);
  }
}
