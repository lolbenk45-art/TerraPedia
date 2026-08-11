import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildBiomePageLookup,
  buildMaintBiomeWikitextPayloads,
  buildNameLookup,
  buildResolvedOnlyCandidates,
  matchBiomeWikitextEntries,
  parseBiomeInfocardEntries,
} from '../audit/biome-wikitext-linkage-dry-run.mjs';
import {
  buildBiomeImportPlan,
  importBiomeDataset,
} from '../import/import-biomes-to-db.mjs';
import {
  applyRows,
  buildBiomeLookupMap,
  buildItemInsertRows,
  buildNpcInsertRows,
} from '../import/import-biome-wikitext-resolved-to-db.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';

const ISOLATED_LOCAL = /^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[0-9a-f]{16}_local$/;
const DEFAULT_INPUT = 'scripts/data/biome/fixtures/biome-t1.sample.json';

export function buildBiomeT1LandingRows({ fixture } = {}) {
  validateFixture(fixture);
  return fixture.biomes.map((biome, index) => {
    const payload = {
      biomeCode: biome.code,
      entityType: 'biome',
      requestedPageTitle: biome.sourcePage,
      pageTitle: biome.sourcePage,
      pageId: 990001 + index,
      revisionTimestamp: biome.sourceRevisionTimestamp,
      fetchedAt: fixture.generatedAt,
      wikitext: biome.wikitext,
      html: null,
    };
    const payloadJson = JSON.stringify(payload);
    return {
      id: 920001 + index,
      dataset_type: 'biomes_raw',
      provider: 'biome-t1.fixture',
      source_page: biome.sourcePage,
      source_key: `biome-t1:${biome.code}`,
      source_revision_timestamp: biome.sourceRevisionTimestamp,
      content_hash: createHash('sha256').update(payloadJson).digest('hex'),
      fetched_at: fixture.generatedAt,
      parsed_at: fixture.generatedAt,
      payload_json: payloadJson,
    };
  });
}

export function seedBiomeFixtureItems({ fixture } = {}) {
  validateFixture(fixture);
  return [...fixture.dependencies.items];
}

export function seedBiomeFixtureNpcs({ fixture } = {}) {
  validateFixture(fixture);
  return [...fixture.dependencies.npcs];
}

export async function runBiomeCanonicalT1Acceptance({
  profile,
  runId,
  repoRoot,
  databases,
  mysql,
  inputPath = DEFAULT_INPUT,
  importBiomeDatasetImpl = importBiomeDataset,
  runMaintSyncImpl = runMaintSync,
  applyRowsImpl = applyRows,
  createConnectionImpl = (options) => loadMysqlModule().createConnection(options),
} = {}) {
  assertIsolatedDatabases({ profile, databases });
  const resolvedInput = path.resolve(repoRoot, inputPath);
  if (!fs.existsSync(resolvedInput)) throw new Error(`biome T1 input is missing: ${resolvedInput}`);
  const fixture = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  validateFixture(fixture);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-biome-t1-${runId}-`));
  const targetOptions = { host: mysql.host, port: mysql.port, user: mysql.username, password: mysql.password };
  const readonlyOptions = { host: mysql.host, port: mysql.port, user: mysql.readonlyUsername, password: mysql.readonlyPassword };

  try {
    const [formalLocal, isolatedLocal] = await Promise.all([
      createConnectionImpl({ ...readonlyOptions, database: 'terria_v1_local' }),
      createConnectionImpl({ ...targetOptions, database: databases.local }),
    ]);
    let dependencySeed;
    let importSummary;
    try {
      await clearIsolatedBiomeDomain(isolatedLocal);
      dependencySeed = {
        itemRows: await copyFixtureRows({
          sourceConnection: formalLocal,
          targetConnection: isolatedLocal,
          sourceTable: 'items',
          targetDatabase: databases.local,
          internalNames: seedBiomeFixtureItems({ fixture }),
        }),
        npcRows: await copyFixtureRows({
          sourceConnection: formalLocal,
          targetConnection: isolatedLocal,
          sourceTable: 'npcs',
          targetDatabase: databases.local,
          internalNames: seedBiomeFixtureNpcs({ fixture }),
        }),
      };
      importSummary = await importBiomeDatasetImpl(isolatedLocal, buildBiomeImportPlan({
        standardizedBiomes: [],
        wikiBiomes: fixture.biomes.map(({ wikitext: _wikitext, ...biome }) => biome),
        itemBiomes: [],
        sourceFiles: { fixture: inputPath },
      }));
    } finally {
      await Promise.all([formalLocal.end(), isolatedLocal.end()]);
    }
    if (dependencySeed.itemRows !== 4 || dependencySeed.npcRows !== 2) {
      throw new Error(`biome T1 dependency closure mismatch: ${JSON.stringify(dependencySeed)}`);
    }

    const maintConnection = await createConnectionImpl({ ...targetOptions, database: databases.maint });
    try {
      await maintConnection.query(`DELETE FROM \`${databases.maint}\`.\`maint_biomes\``);
    } finally {
      await maintConnection.end();
    }
    const maintSync = await runMaintSyncImpl({
      apply: true,
      scopes: ['biomes'],
      ...targetOptions,
      database: databases.maint,
    }, {
      config: { database: { ...targetOptions, username: mysql.username } },
      loadLandingRows: async () => buildBiomeT1LandingRows({ fixture }),
      writeReport: async () => null,
    });

    const [isolatedMaint, isolatedLocalReadback] = await Promise.all([
      createConnectionImpl({ ...targetOptions, database: databases.maint }),
      createConnectionImpl({ ...targetOptions, database: databases.local }),
    ]);
    let candidates;
    let resolvedWrites;
    let readback;
    try {
      const [maintRows] = await isolatedMaint.query(
        `SELECT * FROM \`${databases.maint}\`.\`maint_biomes\` WHERE biome_code IN ('corruption', 'crimson') ORDER BY biome_code`,
      );
      const [itemRows] = await isolatedLocalReadback.query(
        `SELECT id, internal_name, name, name_zh FROM \`${databases.local}\`.\`items\` WHERE status = 1 AND deleted = 0 ORDER BY internal_name`,
      );
      const [npcRows] = await isolatedLocalReadback.query(
        `SELECT id, internal_name, name, name_zh FROM \`${databases.local}\`.\`npcs\` WHERE status = 1 AND deleted = 0 ORDER BY internal_name`,
      );
      const payloads = buildMaintBiomeWikitextPayloads(maintRows);
      const pageLookup = buildBiomePageLookup(fixture.biomes.map((biome) => ({ code: biome.code, pageTitle: biome.sourcePage })));
      const itemLookup = buildNameLookup(itemRows, { entityType: 'item' });
      const npcLookup = buildNameLookup(npcRows, { entityType: 'npc' });
      const matched = payloads.map((payload) => {
        const biome = pageLookup.get(payload.biomeCode) ?? pageLookup.get(payload.pageTitle);
        return matchBiomeWikitextEntries({
          biome,
          entries: parseBiomeInfocardEntries(payload),
          itemLookup,
          npcLookup,
        });
      });
      if (matched.some((result) => result.entries.some((entry) => entry.matchStatus !== 'resolved'))) {
        throw new Error('biome T1 wikitext contains unresolved or ambiguous facts');
      }
      candidates = buildResolvedOnlyCandidates(matched);
      const [biomeRows] = await isolatedLocalReadback.query(
        `SELECT id, code, name_en FROM \`${databases.local}\`.\`biomes\` WHERE code IN ('corruption', 'crimson') ORDER BY code`,
      );
      const biomeByCode = buildBiomeLookupMap(biomeRows);
      const itemByInternalName = new Map(itemRows.map((row) => [String(row.internal_name).toLowerCase(), Number(row.id)]));
      const npcByInternalName = new Map(npcRows.map((row) => [String(row.internal_name).toLowerCase(), Number(row.id)]));
      const resolvedItemRows = buildItemInsertRows({ candidates: candidates.itemBiomeCandidates, biomeByCode, itemByInternalName });
      const resolvedNpcRows = buildNpcInsertRows({ candidates: candidates.npcBiomeCandidates, biomeByCode, npcByInternalName });
      if (resolvedItemRows.skipped.length || resolvedNpcRows.skipped.length) {
        throw new Error('biome T1 resolved candidate lookup skipped a fixture fact');
      }
      resolvedWrites = await applyRowsImpl(isolatedLocalReadback, { itemRows: resolvedItemRows.valid, npcRows: resolvedNpcRows.valid });
      await insertConsumerDecoys(isolatedLocalReadback, { biomeByCode, itemByInternalName, npcByInternalName });
      readback = await readConsumerContract(isolatedLocalReadback, databases.local);
    } finally {
      await Promise.all([isolatedMaint.end(), isolatedLocalReadback.end()]);
    }

    assertBiomeT1Closure({ fixture, importSummary, maintSync, candidates, resolvedWrites, readback });
    return {
      status: 'passed',
      databases,
      input: inputPath,
      dependencySeed,
      importSummary,
      maintSync,
      candidates: {
        itemCount: candidates.itemBiomeCandidates.length,
        npcCount: candidates.npcBiomeCandidates.length,
      },
      resolvedWrites,
      consumerReadback: readback,
      tempReportRoot: path.basename(tempRoot),
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function assertBiomeT1Closure({ fixture, importSummary, maintSync, candidates, resolvedWrites, readback } = {}) {
  validateFixture(fixture);
  const writes = (section) => Number(section?.created ?? 0) + Number(section?.updated ?? 0);
  if (importSummary?.biomes?.input !== 2 || writes(importSummary?.biomes) !== 2 || importSummary?.biomes?.errors?.length
      || importSummary?.biomeRelations?.input !== 2 || writes(importSummary?.biomeRelations) !== 2 || importSummary?.biomeRelations?.errors?.length) {
    throw new Error('biome T1 core import closure mismatch');
  }
  if (maintSync?.rows?.total !== 2 || Number(maintSync?.writes?.inserted ?? 0) + Number(maintSync?.writes?.updated ?? 0) !== 2) {
    throw new Error('biome T1 maint closure mismatch');
  }
  const expectedItemCandidates = new Set(['corruption:Musket', 'corruption:Vilethorn', 'crimson:TheRottedFork', 'crimson:TheUndertaker']);
  const actualItemCandidates = new Set((candidates?.itemBiomeCandidates ?? []).map((row) => `${row.biomeCode}:${row.itemInternalName}`));
  const expectedNpcCandidates = new Set(['corruption:CorruptGoldfish', 'crimson:CrimsonGoldfish']);
  const actualNpcCandidates = new Set((candidates?.npcBiomeCandidates ?? []).map((row) => `${row.biomeCode}:${row.npcInternalName}`));
  if (actualItemCandidates.size !== 4 || [...expectedItemCandidates].some((key) => !actualItemCandidates.has(key))
      || actualNpcCandidates.size !== 2 || [...expectedNpcCandidates].some((key) => !actualNpcCandidates.has(key))) {
    throw new Error('biome T1 resolved candidate closure mismatch');
  }
  for (const [name, expected] of [['biomeResources', 4], ['itemBiomes', 4], ['itemAcquisitionSources', 4], ['npcBiomes', 2]]) {
    if (writes(resolvedWrites?.[name]) !== expected) throw new Error(`biome T1 resolved ${name} closure mismatch`);
  }
  if (JSON.stringify(readback?.biomeCodes) !== JSON.stringify(['corruption', 'crimson'])
      || JSON.stringify(readback?.relationPairs) !== JSON.stringify(['corruption->crimson:counterpart', 'crimson->corruption:counterpart'])
      || JSON.stringify(readback?.itemPairs) !== JSON.stringify([...expectedItemCandidates].sort())
      || JSON.stringify(readback?.resourcePairs) !== JSON.stringify([...expectedItemCandidates].sort())
      || JSON.stringify(readback?.itemBiomePairs) !== JSON.stringify([...expectedItemCandidates].sort())
      || JSON.stringify(readback?.npcPairs) !== JSON.stringify([...expectedNpcCandidates].sort())) {
    throw new Error('biome T1 consumer identity closure mismatch');
  }
  if ((readback?.itemSourceOwnership ?? []).length !== 4 || readback.itemSourceOwnership.some((row) => (
    row.sourceRefType !== 'biome_wikitext'
      || !['terraria.wiki.gg', 'wiki_gg'].includes(row.sourceProvider)
      || Number(row.status) !== 1
      || Number(row.deleted) !== 0
  ))) throw new Error('biome T1 item source ownership mismatch');
  if (Number(readback?.storedDecoyCount) !== 6 || Number(readback?.decoyCount) !== 0) {
    throw new Error('biome T1 consumer decoy filtering mismatch');
  }
}

async function clearIsolatedBiomeDomain(connection) {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const table of ['item_acquisition_sources', 'npc_biomes', 'item_biomes', 'biome_resources', 'biome_relations', 'biomes', 'items', 'npcs']) {
      await connection.query(`DELETE FROM \`${table}\``);
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function copyFixtureRows({ sourceConnection, targetConnection, sourceTable, targetDatabase, internalNames }) {
  if (!ISOLATED_LOCAL.test(targetDatabase ?? '')) throw new Error('biome T1 dependency seed requires an isolated local database');
  if (!Array.isArray(internalNames) || internalNames.length === 0 || new Set(internalNames).size !== internalNames.length) {
    throw new Error(`biome T1 ${sourceTable} dependencies must be unique`);
  }
  const placeholders = internalNames.map(() => '?').join(', ');
  const [rows] = await sourceConnection.query(
    `SELECT * FROM \`terria_v1_local\`.\`${sourceTable}\` WHERE internal_name IN (${placeholders}) AND status = 1 AND deleted = 0`,
    internalNames,
  );
  if (rows.length !== internalNames.length) throw new Error(`biome T1 formal ${sourceTable} dependency closure mismatch`);
  for (const row of rows) {
    const columns = Object.keys(row).sort();
    if (columns.some((column) => !/^[a-z0-9_]+$/i.test(column))) throw new Error(`biome T1 ${sourceTable} column is invalid`);
    await targetConnection.query(
      `INSERT INTO \`${targetDatabase}\`.\`${sourceTable}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => row[column]),
    );
  }
  return rows.length;
}

async function insertConsumerDecoys(connection, { biomeByCode, itemByInternalName, npcByInternalName }) {
  const [deletedBiome] = await connection.query(
    "INSERT INTO biomes (code, name_en, status, deleted) VALUES ('biome_t1_deleted_decoy', 'Biome T1 Deleted Decoy', 1, 1)",
  );
  await connection.query(
    "INSERT INTO biome_relations (biome_id, related_biome_id, relation_type) VALUES (?, ?, 'decoy')",
    [biomeByCode.get('corruption'), Number(deletedBiome.insertId)],
  );
  const [inactiveItem] = await connection.query(
    "INSERT INTO items (internal_name, name, status, deleted) VALUES ('BiomeT1InactiveItemDecoy', 'Biome T1 Inactive Item Decoy', 0, 0)",
  );
  await connection.query(
    "INSERT INTO biome_resources (biome_id, item_id, resource_type, sort_order) VALUES (?, ?, 'decoy', 999)",
    [biomeByCode.get('corruption'), Number(inactiveItem.insertId)],
  );
  await connection.query(
    "INSERT INTO item_biomes (item_id, biome_id, relation_type, sort_order) VALUES (?, ?, 'decoy', 999)",
    [Number(inactiveItem.insertId), biomeByCode.get('corruption')],
  );
  await connection.query(
    `INSERT INTO item_acquisition_sources (item_id, source_type, source_ref_type, source_ref_name, biome_id, source_provider, source_page, sort_order, status, deleted)
     VALUES (?, 'drop', 'biome_wikitext', 'Biome T1 inactive decoy', ?, 'terraria.wiki.gg', 'The Corruption', 999, 0, 0)`,
    [Number(inactiveItem.insertId), biomeByCode.get('corruption')],
  );
  const [inactiveNpc] = await connection.query(
    "INSERT INTO npcs (source_id, internal_name, name, status, deleted) VALUES (990099, 'BiomeT1InactiveNpcDecoy', 'Biome T1 Inactive NPC Decoy', 0, 0)",
  );
  await connection.query(
    `INSERT INTO npc_biomes (npc_id, biome_id, relation_type, spawn_context, source_provider, source_page, sort_order, status, deleted)
     VALUES (?, ?, 'appears_in', 'Biome T1 deleted decoy', 'terraria.wiki.gg', 'The Crimson', 999, 1, 1)`,
    [Number(inactiveNpc.insertId), biomeByCode.get('crimson')],
  );
}

async function readConsumerContract(connection, database) {
  const [biomes] = await connection.query(
    `SELECT code FROM \`${database}\`.\`biomes\` WHERE status = 1 AND deleted = 0 AND code IN ('corruption', 'crimson', 'biome_t1_deleted_decoy') ORDER BY code`,
  );
  const [relations] = await connection.query(
    `SELECT b.code, related.code AS related_code, r.relation_type
       FROM \`${database}\`.\`biome_relations\` r
       JOIN \`${database}\`.\`biomes\` b ON b.id = r.biome_id
       JOIN \`${database}\`.\`biomes\` related ON related.id = r.related_biome_id
      WHERE b.status = 1 AND b.deleted = 0 AND related.status = 1 AND related.deleted = 0
      ORDER BY b.code, related.code`,
  );
  const [itemSources] = await connection.query(
    `SELECT b.code, i.internal_name, s.source_ref_type, s.source_provider, s.status, s.deleted, s.source_ref_name
       FROM \`${database}\`.\`item_acquisition_sources\` s
       JOIN \`${database}\`.\`biomes\` b ON b.id = s.biome_id
       JOIN \`${database}\`.\`items\` i ON i.id = s.item_id
      WHERE b.status = 1 AND b.deleted = 0 AND i.status = 1 AND i.deleted = 0 AND s.status = 1 AND s.deleted = 0
        AND s.source_ref_type = 'biome_wikitext'
        AND s.source_provider IN ('terraria.wiki.gg', 'wiki_gg')
      ORDER BY b.code, i.internal_name`,
  );
  const [npcBiomes] = await connection.query(
    `SELECT b.code, n.internal_name, nb.spawn_context
       FROM \`${database}\`.\`npc_biomes\` nb
       JOIN \`${database}\`.\`biomes\` b ON b.id = nb.biome_id
       JOIN \`${database}\`.\`npcs\` n ON n.id = nb.npc_id
      WHERE b.status = 1 AND b.deleted = 0 AND n.status = 1 AND n.deleted = 0 AND nb.status = 1 AND nb.deleted = 0
      ORDER BY b.code, n.internal_name`,
  );
  const [resources] = await connection.query(
    `SELECT b.code, i.internal_name
       FROM \`${database}\`.\`biome_resources\` r
       JOIN \`${database}\`.\`biomes\` b ON b.id = r.biome_id
       JOIN \`${database}\`.\`items\` i ON i.id = r.item_id
      WHERE b.status = 1 AND b.deleted = 0 AND i.status = 1 AND i.deleted = 0
      ORDER BY b.code, i.internal_name`,
  );
  const [itemBiomes] = await connection.query(
    `SELECT b.code, i.internal_name
       FROM \`${database}\`.\`item_biomes\` ib
       JOIN \`${database}\`.\`biomes\` b ON b.id = ib.biome_id
       JOIN \`${database}\`.\`items\` i ON i.id = ib.item_id
      WHERE b.status = 1 AND b.deleted = 0 AND i.status = 1 AND i.deleted = 0
      ORDER BY b.code, i.internal_name`,
  );
  const [[decoys]] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM \`${database}\`.\`biomes\` WHERE code = 'biome_t1_deleted_decoy')
       + (SELECT COUNT(*) FROM \`${database}\`.\`biome_relations\` WHERE relation_type = 'decoy')
       + (SELECT COUNT(*) FROM \`${database}\`.\`biome_resources\` WHERE resource_type = 'decoy')
       + (SELECT COUNT(*) FROM \`${database}\`.\`item_biomes\` WHERE relation_type = 'decoy')
       + (SELECT COUNT(*) FROM \`${database}\`.\`item_acquisition_sources\` WHERE source_ref_name = 'Biome T1 inactive decoy')
       + (SELECT COUNT(*) FROM \`${database}\`.\`npc_biomes\` WHERE spawn_context = 'Biome T1 deleted decoy') AS stored_count`,
  );
  return {
    biomeCodes: biomes.map((row) => row.code),
    relationPairs: relations.map((row) => `${row.code}->${row.related_code}:${row.relation_type}`),
    itemPairs: itemSources.map((row) => `${row.code}:${row.internal_name}`),
    resourcePairs: resources.map((row) => `${row.code}:${row.internal_name}`),
    itemBiomePairs: itemBiomes.map((row) => `${row.code}:${row.internal_name}`),
    npcPairs: npcBiomes.map((row) => `${row.code}:${row.internal_name}`),
    itemSourceOwnership: itemSources.map((row) => ({ sourceRefType: row.source_ref_type, sourceProvider: row.source_provider, status: Number(row.status), deleted: Number(row.deleted) })),
    storedDecoyCount: Number(decoys?.stored_count ?? 0),
    decoyCount: biomes.filter((row) => row.code === 'biome_t1_deleted_decoy').length
      + itemSources.filter((row) => row.source_ref_name === 'Biome T1 inactive decoy').length
      + relations.filter((row) => row.relation_type === 'decoy').length
      + resources.filter((row) => row.internal_name === 'BiomeT1InactiveItemDecoy').length
      + itemBiomes.filter((row) => row.internal_name === 'BiomeT1InactiveItemDecoy').length
      + npcBiomes.filter((row) => row.spawn_context === 'Biome T1 deleted decoy').length,
  };
}

function assertIsolatedDatabases({ profile, databases }) {
  if (profile !== 't1' || !ISOLATED_LOCAL.test(databases?.local ?? '')) {
    throw new Error('biome T1 acceptance requires an isolated local database');
  }
  const prefix = databases.local.slice(0, -'_local'.length);
  if (databases?.maint !== `${prefix}_maint` || databases?.relation !== `${prefix}_relation`) {
    throw new Error('biome T1 acceptance requires one run-derived isolated three-database set');
  }
}

function validateFixture(fixture) {
  const codes = Array.isArray(fixture?.biomes) ? fixture.biomes.map((row) => row.code) : [];
  if (codes.join('|') !== 'corruption|crimson') throw new Error('biome T1 fixture identities are invalid');
  if (fixture.expected?.biomeRelations !== 2 || fixture.expected?.itemCandidates !== 4 || fixture.expected?.npcCandidates !== 2) {
    throw new Error('biome T1 fixture expected counts are invalid');
  }
}
