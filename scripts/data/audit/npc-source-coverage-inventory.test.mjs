import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildNpcSourceCoverageInventoryReport,
  loadStageCounts,
  parseArgs,
  runNpcSourceCoverageInventory
} from './npc-source-coverage-inventory.mjs';

test('buildNpcSourceCoverageInventoryReport classifies source coverage categories and count fields', () => {
  const standardizedPayload = {
    records: [
      { id: 1, internalName: 'BlueSlime', name: 'Blue Slime', flags: {}, wikiCrawler: { loot: [{ itemName: 'Gel' }] } },
      { id: 2, internalName: 'Guide', name: 'Guide', flags: { friendly: true } },
      { id: 3, internalName: 'BrokenNpc', name: 'Broken NPC', flags: {} },
      { id: 4, internalName: 'MissingNpc', name: 'Missing NPC', flags: {} },
      { id: 5, internalName: 'PresentMimic', name: 'Present Mimic', flags: {} },
      { id: 6, internalName: 'ReverseOnlyNpc', name: 'Reverse Only NPC', flags: {} },
      { id: 7, internalName: 'TownBunny', name: 'Town Bunny', flags: { friendly: true } }
    ]
  };
  const coverageAudit = {
    targets: [
      { pageTitle: 'Blue Slime', resolvedPageTitle: 'Blue Slime', pageId: 1001, missing: false, resolutionStatus: 'resolved', alreadyCrawled: true, standardizedRecords: [{ internalName: 'BlueSlime' }] },
      { pageTitle: 'Guide', resolvedPageTitle: 'Guide', pageId: 1002, missing: false, resolutionStatus: 'resolved', alreadyCrawled: true, standardizedRecords: [{ internalName: 'Guide' }] },
      { pageTitle: 'Broken NPC', resolvedPageTitle: 'Broken NPC', pageId: 1003, missing: false, resolutionStatus: 'parse_failed', alreadyCrawled: true, standardizedRecords: [{ internalName: 'BrokenNpc' }] },
      { pageTitle: 'Missing NPC', resolvedPageTitle: null, pageId: null, missing: true, resolutionStatus: 'missing', alreadyCrawled: false, standardizedRecords: [{ internalName: 'MissingNpc' }] },
      { pageTitle: 'Present Mimic', resolvedPageTitle: 'Present Mimic', pageId: 1005, missing: false, resolutionStatus: 'resolved', alreadyCrawled: false, standardizedRecords: [{ internalName: 'PresentMimic' }] },
      { pageTitle: 'Reverse Only NPC', resolvedPageTitle: 'Reverse Only NPC', pageId: 1006, missing: false, resolutionStatus: 'resolved', alreadyCrawled: false, standardizedRecords: [{ internalName: 'ReverseOnlyNpc' }] },
      { pageTitle: 'Town Bunny', resolvedPageTitle: null, pageId: null, missing: true, resolutionStatus: 'missing', alreadyCrawled: false, standardizedRecords: [{ internalName: 'TownBunny' }] }
    ]
  };
  const coverageTargets = {
    targets: [
      { pageTitle: 'Mimics', alreadyCrawled: true, standardizedRecords: [{ internalName: 'Mimic' }, { internalName: 'PresentMimic' }] }
    ]
  };
  const standardizedMap = {
    records: [
      { internalName: 'BlueSlime', gameId: 1 },
      { internalName: 'Guide', gameId: 2 },
      { internalName: 'BrokenNpc', gameId: 3 },
      { internalName: 'MissingNpc', gameId: 4 },
      { internalName: 'PresentMimic', gameId: 5 },
      { internalName: 'ReverseOnlyNpc', gameId: 6 },
      { internalName: 'TownBunny', gameId: 7 }
    ]
  };
  const stageCounts = new Map([
    ['BlueSlime', {
      maintSourceCount: 1,
      relationLootCount: 1,
      projectionLootCount: 1,
      localLootCount: 1,
      maintSourceRows: [{
        recordKey: 'maint-blue-slime-gel',
        itemInternalName: 'Gel',
        itemName: 'Gel',
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Blue Slime',
        sourceRefInternalName: 'BlueSlime',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '100%',
        quantityText: '1-2',
        conditions: null
      }]
    }],
    ['PresentMimic', { maintSourceCount: 0, relationLootCount: 0, projectionLootCount: 0, localLootCount: 0 }],
    ['ReverseOnlyNpc', { maintSourceCount: 1, relationLootCount: 0, projectionLootCount: 0, localLootCount: 0, itemPageReverseSourceCount: 1 }]
  ]);

  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload,
    coverageAudit,
    coverageTargets,
    standardizedMap,
    stageCounts,
    expectedZeroInternalNames: new Set(['TownBunny'])
  });

  assert.equal(report.auditStatus, 'pass');
  assert.equal(report.summary.totalNpcs, 7);
  assert.deepEqual(report.summary.bySourceCoverageStatus, {
    source_page_present_with_loot: 1,
    source_page_present_no_loot: 1,
    source_page_present_parse_failed: 1,
    source_page_missing: 1,
    group_page_present_variant_not_extracted: 1,
    item_page_reverse_source_only: 1,
    no_source_required_expected_zero: 1
  });

  const byName = new Map(report.npcs.map((row) => [row.npcInternalName, row]));
  assert.equal(byName.get('BlueSlime').sourceCoverageStatus, 'source_page_present_with_loot');
  assert.deepEqual(byName.get('BlueSlime').maintSourceRows, [{
    recordKey: 'maint-blue-slime-gel',
    itemInternalName: 'Gel',
    itemName: 'Gel',
    sourceType: 'drop',
    sourceRefType: 'npc',
    sourceRefName: 'Blue Slime',
    sourceRefInternalName: 'BlueSlime',
    sourceRefResolution: 'exact_internal_name',
    chanceText: '100%',
    quantityText: '1-2',
    conditions: null
  }]);
  assert.equal(byName.get('Guide').sourceCoverageStatus, 'source_page_present_no_loot');
  assert.equal(byName.get('BrokenNpc').sourceCoverageStatus, 'source_page_present_parse_failed');
  assert.equal(byName.get('MissingNpc').sourceCoverageStatus, 'source_page_missing');
  assert.equal(byName.get('PresentMimic').sourceCoverageStatus, 'group_page_present_variant_not_extracted');
  assert.equal(byName.get('ReverseOnlyNpc').sourceCoverageStatus, 'item_page_reverse_source_only');
  assert.equal(byName.get('TownBunny').sourceCoverageStatus, 'no_source_required_expected_zero');

  for (const row of report.npcs) {
    assert.equal(typeof row.standardizedLootCount, 'number');
    assert.equal(typeof row.maintSourceCount, 'number');
    assert.equal(typeof row.relationLootCount, 'number');
    assert.equal(typeof row.projectionLootCount, 'number');
    assert.equal(typeof row.localLootCount, 'number');
  }
});

test('runNpcSourceCoverageInventory returns blocked report when DB is unavailable', async () => {
  const result = await runNpcSourceCoverageInventory(
    { writeReport: false },
    {
      readJson: async (filePath) => {
        if (filePath.endsWith('npcs.standardized.json')) {
          return { records: [{ id: 1, internalName: 'Zombie', name: 'Zombie', flags: {} }] };
        }
        if (filePath.endsWith('coverage-audit.latest.json')) {
          return { targets: [] };
        }
        if (filePath.endsWith('coverage-targets.latest.json')) {
          return { targets: [] };
        }
        if (filePath.endsWith('npc-standardized-map.json')) {
          return { records: [] };
        }
        return {};
      },
      mysqlFactory: {
        createConnection: async () => {
          throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        }
      },
      config: { database: { host: '127.0.0.1', port: 3306, username: 'root', password: 'root' } }
    }
  );

  assert.equal(result.report.auditStatus, 'blocked');
  assert.equal(result.report.evidenceHealth, 'db_unavailable');
  assert.equal(result.report.summary.totalNpcs, 0);
  assert.equal(result.report.error.code, 'ECONNREFUSED');
});

test('runNpcSourceCoverageInventory loads expected-zero contract rows by default', async () => {
  const result = await runNpcSourceCoverageInventory(
    { writeReport: false, dateTag: '2026-05-10-contract-test' },
    {
      readJson: async (filePath) => {
        if (filePath.endsWith('npcs.standardized.json')) {
          return { records: [{ id: 7, internalName: 'TownBunny', name: 'Town Bunny', flags: { friendly: true } }] };
        }
        if (filePath.endsWith('coverage-audit.latest.json')) {
          return {
            targets: [
              {
                pageTitle: 'Town Bunny',
                resolvedPageTitle: null,
                missing: true,
                resolutionStatus: 'missing',
                alreadyCrawled: false,
                standardizedRecords: [{ internalName: 'TownBunny' }]
              }
            ]
          };
        }
        if (filePath.endsWith('coverage-targets.latest.json')) {
          return { targets: [] };
        }
        if (filePath.endsWith('npc-standardized-map.json')) {
          return { records: [{ internalName: 'TownBunny', gameId: 7 }] };
        }
        return {};
      },
      readText: async () => `
| npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt |
| --- | --- | --- | --- | --- | --- |
| TownBunny | friendly | town_npc_no_loot | contract | codex | 2026-05-10 |
`,
      connection: {},
      loadStageCounts: async () => new Map()
    }
  );

  assert.equal(result.report.auditStatus, 'pass');
  assert.equal(result.report.npcs[0].sourceCoverageStatus, 'no_source_required_expected_zero');
});

test('runNpcSourceCoverageInventory reads crawler coverage reports from explicit crawler output root', async () => {
  const crawlerOutputRoot = path.join('data', 'external-wiki-crawler-root');
  const seenPaths = [];
  const result = await runNpcSourceCoverageInventory(
    { writeReport: false, crawlerOutputRoot },
    {
      readJson: async (filePath) => {
        seenPaths.push(filePath);
        if (filePath.endsWith(path.join('external-wiki-crawler-root', 'report', 'npc', 'coverage-audit.latest.json'))) {
          return {
            targets: [
              {
                pageTitle: 'Zombie',
                resolvedPageTitle: 'Zombie',
                missing: false,
                resolutionStatus: 'resolved',
                alreadyCrawled: true,
                standardizedRecords: [{ internalName: 'Zombie' }]
              }
            ]
          };
        }
        if (filePath.endsWith(path.join('external-wiki-crawler-root', 'report', 'npc', 'coverage-targets.latest.json'))) {
          return { targets: [] };
        }
        if (filePath.endsWith(path.join('data', 'standardized', 'npcs.standardized.json'))) {
          return { records: [{ id: 3, internalName: 'Zombie', name: 'Zombie', flags: {} }] };
        }
        if (filePath.endsWith(path.join('data', 'generated', 'npc-standardized-map.json'))) {
          return { records: [{ internalName: 'Zombie', gameId: 3 }] };
        }
        throw new Error(`unexpected read path: ${filePath}`);
      },
      readOptionalJson: async () => null,
      readText: async () => '',
      connection: {},
      loadStageCounts: async () => new Map()
    }
  );

  assert.equal(result.report.auditStatus, 'pass');
  assert.equal(result.report.npcs[0].sourceCoverageStatus, 'source_page_present_no_loot');
  assert.ok(seenPaths.some((filePath) => filePath.endsWith(path.join('external-wiki-crawler-root', 'report', 'npc', 'coverage-audit.latest.json'))));
  assert.ok(seenPaths.every((filePath) => !filePath.endsWith(path.join('data', 'wiki-crawler', 'report', 'npc', 'coverage-audit.latest.json'))));
});

test('parseArgs accepts explicit crawler output root for coverage report reads', () => {
  const parsed = parseArgs(['--crawler-output-root=G:\\ClaudeCode\\TerraPedia-dev\\data\\wiki-crawler']);

  assert.equal(parsed.crawlerOutputRoot, 'G:\\ClaudeCode\\TerraPedia-dev\\data\\wiki-crawler');
});

test('buildNpcSourceCoverageInventoryReport classifies reviewed domain-separated rows outside source gaps', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 14, internalName: 'EaterofWorldsBody', name: 'Eater of Worlds', flags: { boss: true } }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Eater of Worlds',
        resolvedPageTitle: 'Eater of Worlds',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: true,
        standardizedRecords: [{ internalName: 'EaterofWorldsBody' }]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'EaterofWorldsBody', gameId: 14 }] },
    stageCounts: new Map(),
    domainSeparatedInternalNames: new Set(['EaterofWorldsBody'])
  });

  assert.deepEqual(report.summary.bySourceCoverageStatus, {
    no_source_required_domain_separated: 1
  });
  assert.equal(report.npcs[0].sourceCoverageStatus, 'no_source_required_domain_separated');
  assert.equal(report.npcs[0].nextAction, 'verify_domain_separation_contract');
});

test('buildNpcSourceCoverageInventoryReport does not classify shop-only maint evidence as loot coverage', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 22, internalName: 'ArmsDealer', name: 'Arms Dealer', flags: { friendly: true } }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Arms Dealer',
        resolvedPageTitle: 'Arms Dealer',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: true,
        standardizedRecords: [{ internalName: 'ArmsDealer' }]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'ArmsDealer', gameId: 22 }] },
    stageCounts: new Map([[
      'ArmsDealer',
      {
        maintSourceCount: 1,
        relationLootCount: 0,
        projectionLootCount: 0,
        localLootCount: 0,
        maintSourceRows: [{
          recordKey: 'maint-arms-dealer-minishark',
          itemInternalName: 'Minishark',
          itemName: 'Minishark',
          sourceType: 'shop',
          sourceRefType: 'npc',
          sourceRefName: 'Arms Dealer',
          sourceRefInternalName: 'ArmsDealer',
          sourceRefResolution: 'exact_internal_name',
          chanceText: null,
          quantityText: null,
          conditions: null
        }]
      }
    ]])
  });

  assert.equal(report.npcs[0].maintSourceCount, 0);
  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_no_loot');
  assert.equal(report.npcs[0].nextAction, 'review_expected_zero_contract');
});

test('runNpcSourceCoverageInventory trusts bridge standardized loot evidence over stale base standardized data', async () => {
  const result = await runNpcSourceCoverageInventory(
    { writeReport: false, dateTag: '2026-05-11-bridge-standardized-test' },
    {
      readJson: async (filePath) => {
        if (filePath.endsWith(path.join('data', 'standardized', 'npcs.standardized.json'))) {
          return {
            records: [{
              id: 1,
              internalName: 'BlueSlime',
              name: 'Blue Slime',
              flags: {}
            }]
          };
        }
        if (filePath.endsWith(path.join('data', 'generated', 'wiki-crawler-npc-bridge', 'standardized', 'npcs.standardized.json'))) {
          return {
            records: [{
              id: 1,
              internalName: 'BlueSlime',
              name: 'Blue Slime',
              flags: {},
              wikiCrawler: {
                pageTitle: 'Blue Slime',
                loot: [{ itemName: 'Gel' }]
              }
            }]
          };
        }
        if (filePath.endsWith('coverage-audit.latest.json')) {
          return {
            targets: [{
              pageTitle: 'Blue Slime',
              resolvedPageTitle: 'Blue Slime',
              missing: false,
              resolutionStatus: 'resolved',
              alreadyCrawled: true,
              standardizedRecords: [{ internalName: 'BlueSlime' }]
            }]
          };
        }
        if (filePath.endsWith('coverage-targets.latest.json')) {
          return { targets: [] };
        }
        if (filePath.endsWith('npc-standardized-map.json')) {
          return { records: [{ internalName: 'BlueSlime', gameId: 1 }] };
        }
        return {};
      },
      connection: {},
      loadStageCounts: async () => new Map([[
        'BlueSlime',
        {
          maintSourceCount: 0,
          relationLootCount: 0,
          projectionLootCount: 0,
          localLootCount: 0,
          maintSourceRows: []
        }
      ]])
    }
  );

  assert.equal(result.report.npcs[0].standardizedLootCount, 1);
  assert.equal(result.report.npcs[0].sourceCoverageStatus, 'source_page_present_with_loot');
  assert.equal(result.report.npcs[0].nextAction, 'verify_relation_projection_local_counts');
});

test('loadStageCounts scopes local loot counts to npc_drop rows', async () => {
  const capturedSql = [];
  const connection = {
    async query(sql) {
      capturedSql.push(sql);
      if (String(sql).includes('FROM `terria_v1_local`.`npcs` n')) {
        return [[{
          npcInternalName: 'DD2DarkMageT1',
          maintSourceCount: 11,
          relationLootCount: 11,
          projectionLootCount: 11,
          localLootCount: 11,
          itemPageReverseSourceCount: 0
        }]];
      }
      return [[]];
    }
  };

  const counts = await loadStageCounts(connection, {
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local'
  });

  assert.equal(counts.get('DD2DarkMageT1').localLootCount, 11);
  assert.match(capturedSql[0], /l\.drop_source_kind IS NULL OR l\.drop_source_kind = 'npc_drop'/);
});

test('runNpcSourceCoverageInventory parses row table after explanatory contract tables', async () => {
  const result = await runNpcSourceCoverageInventory(
    { writeReport: false, dateTag: '2026-05-10-contract-multitable-test' },
    {
      readJson: async (filePath) => {
        if (filePath.endsWith('npcs.standardized.json')) {
          return { records: [{ id: 7, internalName: 'TownBunny', name: 'Town Bunny', flags: { friendly: true } }] };
        }
        if (filePath.endsWith('coverage-audit.latest.json')) {
          return { targets: [{ missing: true, resolutionStatus: 'missing', standardizedRecords: [{ internalName: 'TownBunny' }] }] };
        }
        return { targets: [], records: [] };
      },
      readText: async () => `
| Field | Required | Notes |
| --- | --- | --- |
| npcInternalName | yes | explanatory row, not a contract row |

| npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt |
| --- | --- | --- | --- | --- | --- |
| TownBunny | friendly | town_npc_no_loot | contract | codex | 2026-05-10 |
`,
      connection: {},
      loadStageCounts: async () => new Map()
    }
  );

  assert.equal(result.report.npcs[0].sourceCoverageStatus, 'no_source_required_expected_zero');
});

test('runNpcSourceCoverageInventory attaches maint source rows by raw canonical npc identity', async () => {
  const queries = [];
  const result = await runNpcSourceCoverageInventory(
    { writeReport: false, dateTag: '2026-05-10-raw-canonical-test' },
    {
      readJson: async (filePath) => {
        if (filePath.endsWith('npcs.standardized.json')) {
          return { records: [{ id: 1, internalName: 'BigMimicCrimson', name: 'Crimson Mimic', flags: {} }] };
        }
        if (filePath.endsWith('coverage-audit.latest.json')) {
          return { targets: [{ pageTitle: 'Mimics', resolvedPageTitle: 'Mimics', missing: false, alreadyCrawled: true, standardizedRecords: [{ internalName: 'BigMimicCrimson' }] }] };
        }
        if (filePath.endsWith('coverage-targets.latest.json')) {
          return { targets: [] };
        }
        if (filePath.endsWith('npc-standardized-map.json')) {
          return { records: [{ internalName: 'BigMimicCrimson', gameId: 473 }] };
        }
        return {};
      },
      connection: {
        query: async (sql) => {
          queries.push(sql);
          if (sql.includes('SELECT internal_name AS npcInternalName')) {
            return [[{
              npcInternalName: 'BigMimicCrimson',
              npcName: 'Crimson Mimic'
            }]];
          }
          if (sql.includes('COUNT(*)')) {
            return [[{
              npcInternalName: 'BigMimicCrimson',
              maintSourceCount: 1,
              relationLootCount: 0,
              projectionLootCount: 0,
              localLootCount: 0,
              itemPageReverseSourceCount: 0
            }]];
          }
          return [[{
            npcInternalName: 'BigMimicCrimson',
            recordKey: 'maint-crimson-mimic-life-drain',
            itemInternalName: 'LifeDrain',
            itemName: 'Life Drain',
            sourceType: 'drop',
            sourceRefType: 'npc',
            sourceRefName: 'Mimics',
            rawJson: JSON.stringify({
              sourceRefInternalName: 'BigMimicCrimson',
              sourceRefResolution: 'section_internal_name',
              chanceText: '20%',
              quantityText: '1'
            })
          }]];
        }
      },
      readText: async () => ''
    }
  );

  assert.equal(queries.length, 3);
  assert.equal(result.report.npcs[0].maintSourceRows[0].sourceRefName, 'Mimics');
  assert.equal(result.report.npcs[0].maintSourceRows[0].sourceRefInternalName, 'BigMimicCrimson');
});

test('buildNpcSourceCoverageInventoryReport keeps unreviewed group-bucket stage loot blocked over stale missing coverage', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 473, internalName: 'BigMimicCrimson', name: 'Crimson Mimic', flags: {} }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Crimson Mimic',
        resolvedPageTitle: null,
        missing: true,
        resolutionStatus: 'missing',
        alreadyCrawled: false,
        standardizedRecords: [{ internalName: 'BigMimicCrimson' }]
      }]
    },
    coverageTargets: {
      targets: [{
        pageTitle: 'Mimics',
        resolvedPageTitle: 'Mimics',
        missing: false,
        alreadyCrawled: true,
        standardizedRecords: [{ internalName: 'Mimic' }, { internalName: 'BigMimicCrimson' }]
      }]
    },
    standardizedMap: { records: [{ internalName: 'BigMimicCrimson', gameId: 473 }] },
    stageCounts: new Map([[
      'BigMimicCrimson',
      {
        maintSourceCount: 8,
        relationLootCount: 8,
        projectionLootCount: 8,
        localLootCount: 8,
        maintSourceRows: [{
          recordKey: 'maint-crimson-mimic-life-drain',
          itemInternalName: 'LifeDrain',
          itemName: 'Life Drain',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Mimics',
          sourceRefInternalName: 'BigMimicCrimson',
          sourceRefResolution: 'section_internal_name',
          chanceText: '20%',
          quantityText: '1',
          conditions: null
        }]
      }
    ]])
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'group_page_present_variant_not_extracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_variant_specific_source');
});

test('buildNpcSourceCoverageInventoryReport does not trust maint rows for another NPC as exact coverage evidence', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 473, internalName: 'BigMimicCrimson', name: 'Crimson Mimic', flags: {} }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Crimson Mimic',
        resolvedPageTitle: null,
        missing: true,
        resolutionStatus: 'missing',
        alreadyCrawled: false,
        standardizedRecords: [{ internalName: 'BigMimicCrimson' }]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'BigMimicCrimson', gameId: 473 }] },
    stageCounts: new Map([[
      'BigMimicCrimson',
      {
        maintSourceCount: 1,
        relationLootCount: 0,
        projectionLootCount: 0,
        localLootCount: 0,
        maintSourceRows: [{
          recordKey: 'wrong-npc-row',
          itemInternalName: 'LifeDrain',
          itemName: 'Life Drain',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Corrupt Mimic',
          sourceRefInternalName: 'BigMimicCorruption',
          sourceRefResolution: 'section_internal_name',
          chanceText: '20%',
          quantityText: '1',
          conditions: null
        }]
      }
    ]])
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_missing');
});

test('buildNpcSourceCoverageInventoryReport keeps stale missing direct coverage as group variant gap when group page is present', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 473, internalName: 'BigMimicCrimson', name: 'Crimson Mimic', flags: {} }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Crimson Mimic',
        resolvedPageTitle: null,
        missing: true,
        resolutionStatus: 'missing',
        alreadyCrawled: false,
        standardizedRecords: [{ internalName: 'BigMimicCrimson' }]
      }]
    },
    coverageTargets: {
      targets: [{
        pageTitle: 'Mimics',
        resolvedPageTitle: 'Mimics',
        missing: false,
        alreadyCrawled: true,
        standardizedRecords: [{ internalName: 'Mimic' }, { internalName: 'BigMimicCrimson' }]
      }]
    },
    standardizedMap: { records: [{ internalName: 'BigMimicCrimson', gameId: 473 }] },
    stageCounts: new Map([[
      'BigMimicCrimson',
      {
        maintSourceCount: 0,
        relationLootCount: 0,
        projectionLootCount: 0,
        localLootCount: 0,
        maintSourceRows: []
      }
    ]])
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'group_page_present_variant_not_extracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_variant_specific_source');
});

test('buildNpcSourceCoverageInventoryReport trusts exact materialized group-page loot when direct page is not crawled', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [
        { id: 296, internalName: 'BlueArmoredBones', name: 'Blue Armored Bones', flags: {} },
        { id: 297, internalName: 'BlueArmoredBonesNoPants', name: 'Blue Armored Bones', flags: {} }
      ]
    },
    coverageAudit: {
      targets: [
        {
          pageTitle: 'Blue Armored Bones',
          resolvedPageTitle: 'Blue Armored Bones',
          missing: false,
          resolutionStatus: 'resolved',
          alreadyCrawled: false,
          standardizedRecords: [{ internalName: 'BlueArmoredBones' }]
        },
        {
          pageTitle: 'Blue Armored Bones',
          resolvedPageTitle: 'Blue Armored Bones',
          missing: false,
          resolutionStatus: 'resolved',
          alreadyCrawled: false,
          standardizedRecords: [{ internalName: 'BlueArmoredBonesNoPants' }]
        }
      ]
    },
    coverageTargets: {
      targets: [{
        pageTitle: 'Blue Armored Bones',
        resolvedPageTitle: 'Blue Armored Bones',
        missing: false,
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'BlueArmoredBones' },
          { internalName: 'BlueArmoredBonesNoPants' }
        ]
      }]
    },
    standardizedMap: {
      records: [
        { internalName: 'BlueArmoredBones', gameId: 296 },
        { internalName: 'BlueArmoredBonesNoPants', gameId: 297 }
      ]
    },
    stageCounts: new Map([
      [
        'BlueArmoredBones',
        {
          maintSourceCount: 1,
          relationLootCount: 1,
          projectionLootCount: 1,
          localLootCount: 1,
          maintSourceRows: [{
            recordKey: 'maint-blue-armored-bones-armor-polish',
            itemInternalName: 'ArmorPolish',
            itemName: 'Armor Polish',
            sourceType: 'drop',
            sourceRefType: 'npc',
            sourceRefName: 'Blue Armored Bones',
            sourceRefInternalName: 'BlueArmoredBones',
            sourceRefResolution: 'exact_internal_name',
            chanceText: '1%',
            quantityText: '1',
            conditions: null
          }]
        }
      ],
      [
        'BlueArmoredBonesNoPants',
        {
          maintSourceCount: 1,
          relationLootCount: 0,
          projectionLootCount: 0,
          localLootCount: 0,
          maintSourceRows: [{
            recordKey: 'maint-blue-armored-bones-row-for-sibling',
            itemInternalName: 'ArmorPolish',
            itemName: 'Armor Polish',
            sourceType: 'drop',
            sourceRefType: 'npc',
            sourceRefName: 'Blue Armored Bones',
            sourceRefInternalName: 'BlueArmoredBones',
            sourceRefResolution: 'exact_internal_name',
            chanceText: '1%',
            quantityText: '1',
            conditions: null
          }]
        }
      ]
    ])
  });

  const byName = new Map(report.npcs.map((row) => [row.npcInternalName, row]));

  assert.equal(byName.get('BlueArmoredBones').standardizedLootCount, 0);
  assert.equal(byName.get('BlueArmoredBones').maintSourceCount, 1);
  assert.equal(byName.get('BlueArmoredBones').sourceCoverageStatus, 'source_page_present_with_loot');
  assert.equal(byName.get('BlueArmoredBones').nextAction, 'verify_relation_projection_local_counts');
  assert.equal(byName.get('BlueArmoredBonesNoPants').maintSourceCount, 0);
  assert.equal(byName.get('BlueArmoredBonesNoPants').sourceCoverageStatus, 'group_page_present_variant_not_extracted');
});

test('buildNpcSourceCoverageInventoryReport trusts exact maint rows before unmatched group-page no-loot evidence', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{
        id: 296,
        internalName: 'BlueArmoredBones',
        name: 'Blue Armored Bones',
        flags: {},
        imageFileTitle: 'Blue Armored Bones.gif',
        wikiCrawler: {
          pageTitle: 'Blue Armored Bones',
          sourceInfoboxes: [{ autoId: '297', image: 'Blue Armored Bones 2.gif' }],
          sourceLootRowsTotal: 6,
          loot: []
        }
      }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Blue Armored Bones',
        resolvedPageTitle: 'Blue Armored Bones',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'BlueArmoredBones' },
          { internalName: 'BlueArmoredBonesNoPants' }
        ]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'BlueArmoredBones', gameId: 296 }] },
    stageCounts: new Map([[
      'BlueArmoredBones',
      {
        maintSourceCount: 1,
        relationLootCount: 1,
        projectionLootCount: 1,
        localLootCount: 1,
        maintSourceRows: [{
          recordKey: 'maint-blue-armored-bones-armor-polish',
          itemInternalName: 'ArmorPolish',
          itemName: 'Armor Polish',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Blue Armored Bones',
          sourceRefInternalName: 'BlueArmoredBones',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '1%',
          quantityText: '1',
          conditions: null
        }]
      }
    ]])
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_with_loot');
});

test('buildNpcSourceCoverageInventoryReport does not trust unreviewed materialized group-page loot as source coverage', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [
        { id: 296, internalName: 'BlueArmoredBones', name: 'Blue Armored Bones', flags: {} }
      ]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Blue Armored Bones',
        resolvedPageTitle: 'Blue Armored Bones',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        standardizedRecords: [{ internalName: 'BlueArmoredBones' }]
      }]
    },
    coverageTargets: {
      targets: [{
        pageTitle: 'Blue Armored Bones',
        resolvedPageTitle: 'Blue Armored Bones',
        missing: false,
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'BlueArmoredBones' },
          { internalName: 'BlueArmoredBonesNoPants' }
        ]
      }]
    },
    standardizedMap: { records: [{ internalName: 'BlueArmoredBones', gameId: 296 }] },
    stageCounts: new Map([[
      'BlueArmoredBones',
      {
        maintSourceCount: 1,
        relationLootCount: 1,
        projectionLootCount: 1,
        localLootCount: 1,
        maintSourceRows: [{
          recordKey: 'maint-blue-armored-bones-unreviewed',
          itemInternalName: 'ArmorPolish',
          itemName: 'Armor Polish',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Blue Armored Bones',
          sourceRefInternalName: 'BlueArmoredBones',
          sourceRefResolution: 'name_fallback',
          chanceText: '1%',
          quantityText: '1',
          conditions: null
        }]
      }
    ]])
  });

  assert.equal(report.npcs[0].maintSourceCount, 0);
  assert.equal(report.npcs[0].sourceCoverageStatus, 'group_page_present_variant_not_extracted');
});

test('buildNpcSourceCoverageInventoryReport uses group coverage records as positive-id fallback candidates', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 618, internalName: 'BloodEelHead', name: 'Blood Eel', flags: {} }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Blood Eel',
        resolvedPageTitle: 'Blood Eel',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        standardizedRecords: [{ internalName: 'BloodEelHead' }]
      }]
    },
    coverageTargets: {
      targets: [{
        pageTitle: 'Blood Eel',
        resolvedPageTitle: 'Blood Eel',
        missing: false,
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'BloodEelHead' },
          { internalName: 'BloodEelBody' },
          { internalName: 'BloodEelTail' }
        ]
      }]
    },
    standardizedMap: { records: [{ internalName: 'BloodEelHead', gameId: 618 }] },
    stageCounts: new Map([[
      'BloodEelHead',
      {
        maintSourceCount: 1,
        relationLootCount: 1,
        projectionLootCount: 1,
        localLootCount: 1,
        maintSourceRows: [{
          recordKey: 'maint-blood-eel-haemorrhaxe',
          itemInternalName: 'BloodHamaxe',
          itemName: 'Haemorrhaxe',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Blood Eel',
          sourceRefInternalName: 'BloodEelHead',
          sourceRefResolution: 'positive_id_fallback',
          chanceText: '12.5%',
          quantityText: '1',
          conditions: null
        }]
      }
    ]])
  });

  assert.equal(report.npcs[0].maintSourceCount, 1);
  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_with_loot');
});

test('buildNpcSourceCoverageInventoryReport trusts reviewed positive-id fallback representative source rows', () => {
  const cases = [
    ['BloodEelHead', 'Blood Eel', ['BloodEelHead', 'BloodEelBody', 'BloodEelTail']],
    ['BoneSerpentHead', 'Bone Serpent', ['BoneSerpentHead', 'BoneSerpentBody', 'BoneSerpentTail']],
    ['DevourerHead', 'Devourer', ['DevourerHead', 'DevourerBody', 'DevourerTail']],
    ['DiggerHead', 'Digger', ['DiggerHead', 'DiggerBody', 'DiggerTail']],
    ['GiantWormHead', 'Giant Worm', ['GiantWormHead', 'GiantWormBody', 'GiantWormTail']],
    ['SeekerHead', 'World Feeder', ['SeekerHead', 'SeekerBody', 'SeekerTail']],
    ['TombCrawlerHead', 'Tomb Crawler', ['TombCrawlerHead', 'TombCrawlerBody', 'TombCrawlerTail']],
    ['WyvernHead', 'Wyvern', ['WyvernHead', 'WyvernBody', 'WyvernTail']],
    ['RustyArmoredBonesAxe', 'Rusty Armored Bones', ['RustyArmoredBonesAxe', 'RustyArmoredBonesFlail', 'RustyArmoredBonesSword']]
  ];

  for (const [npcInternalName, pageTitle, candidateNpcInternalNames] of cases) {
    const report = buildNpcSourceCoverageInventoryReport({
      standardizedPayload: {
        records: [{ id: 1, internalName: npcInternalName, name: pageTitle, flags: {} }]
      },
      coverageAudit: {
        targets: [{
          pageTitle,
          resolvedPageTitle: pageTitle,
          missing: false,
          resolutionStatus: 'resolved',
          alreadyCrawled: false,
          standardizedRecords: [{ internalName: npcInternalName }]
        }]
      },
      coverageTargets: {
        targets: [{
          pageTitle,
          resolvedPageTitle: pageTitle,
          missing: false,
          alreadyCrawled: true,
          standardizedRecords: candidateNpcInternalNames.map((internalName) => ({ internalName }))
        }]
      },
      standardizedMap: { records: [{ internalName: npcInternalName, gameId: 1 }] },
      stageCounts: new Map([[
        npcInternalName,
        {
          maintSourceCount: 1,
          relationLootCount: 0,
          projectionLootCount: 0,
          localLootCount: 0,
          maintSourceRows: [{
            recordKey: `maint-${npcInternalName}`,
            itemInternalName: 'AnyDrop',
            itemName: 'Any Drop',
            sourceType: 'drop',
            sourceRefType: 'npc',
            sourceRefName: pageTitle,
            sourceRefInternalName: npcInternalName,
            sourceRefResolution: 'positive_id_fallback',
            candidateNpcInternalNames,
            chanceText: '1%',
            quantityText: '1',
            conditions: null
          }]
        }
      ]])
    });

    assert.equal(report.npcs[0].maintSourceCount, 1, npcInternalName);
    assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_with_loot', npcInternalName);
  }
});

test('buildNpcSourceCoverageInventoryReport blocks unsafe positive-id fallback variants', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 501, internalName: 'PigronCrimson', name: 'Pigron', flags: {} }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Pigron',
        resolvedPageTitle: 'Pigron',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        standardizedRecords: [{ internalName: 'PigronCrimson' }]
      }]
    },
    coverageTargets: {
      targets: [{
        pageTitle: 'Pigron',
        resolvedPageTitle: 'Pigron',
        missing: false,
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'PigronCorruption' },
          { internalName: 'PigronCrimson' },
          { internalName: 'PigronHallow' }
        ]
      }]
    },
    standardizedMap: { records: [{ internalName: 'PigronCrimson', gameId: 501 }] },
    stageCounts: new Map([[
      'PigronCrimson',
      {
        maintSourceCount: 1,
        relationLootCount: 1,
        projectionLootCount: 1,
        localLootCount: 1,
        maintSourceRows: [{
          recordKey: 'maint-pigron-crimson',
          itemInternalName: 'Bacon',
          itemName: 'Bacon',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Pigron',
          sourceRefInternalName: 'PigronCrimson',
          sourceRefResolution: 'positive_id_fallback',
          candidateNpcInternalNames: ['PigronCorruption', 'PigronCrimson', 'PigronHallow'],
          chanceText: '6.67%',
          quantityText: '1',
          conditions: null
        }]
      }
    ]])
  });

  assert.equal(report.npcs[0].maintSourceCount, 0);
  assert.equal(report.npcs[0].sourceCoverageStatus, 'group_page_present_variant_not_extracted');
});

test('buildNpcSourceCoverageInventoryReport reports maintSourceCount from traceable current-NPC rows', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 1, internalName: 'BigHornetStingy', name: 'Hornet', flags: {} }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Hornet',
        resolvedPageTitle: 'Hornet',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        standardizedRecords: [{ internalName: 'BigHornetStingy' }]
      }]
    },
    coverageTargets: {
      targets: [{
        pageTitle: 'Hornet',
        resolvedPageTitle: 'Hornet',
        missing: false,
        alreadyCrawled: true,
        standardizedRecords: [{ internalName: 'Hornet' }, { internalName: 'BigHornetStingy' }]
      }]
    },
    standardizedMap: { records: [{ internalName: 'BigHornetStingy', gameId: 1 }] },
    stageCounts: new Map([[
      'BigHornetStingy',
      {
        maintSourceCount: 2,
        relationLootCount: 0,
        projectionLootCount: 0,
        localLootCount: 0,
        maintSourceRows: []
      }
    ]])
  });

  assert.equal(report.npcs[0].maintSourceCount, 0);
  assert.equal(report.npcs[0].sourceCoverageStatus, 'group_page_present_variant_not_extracted');
});

test('buildNpcSourceCoverageInventoryReport treats resolved but uncrawled hostile pages as unextracted source gaps', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 4, internalName: 'EyeofCthulhu', name: 'Eye of Cthulhu', flags: { boss: true } }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Eye of Cthulhu',
        resolvedPageTitle: 'Eye of Cthulhu',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        eligibleBatch: true,
        standardizedRecords: [{ internalName: 'EyeofCthulhu' }]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'EyeofCthulhu', gameId: 4 }] },
    stageCounts: new Map([[
      'EyeofCthulhu',
      {
        maintSourceCount: 0,
        relationLootCount: 0,
        projectionLootCount: 0,
        localLootCount: 0,
        maintSourceRows: []
      }
    ]])
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_unextracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_source_page');
});

test('buildNpcSourceCoverageInventoryReport does not let downstream loot mask uncrawled source pages', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 253, internalName: 'Reaper', name: 'Reaper', flags: {} }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Reaper',
        resolvedPageTitle: 'Reaper',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        eligibleBatch: true,
        standardizedRecords: [{ internalName: 'Reaper' }]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'Reaper', gameId: 253 }] },
    stageCounts: new Map([[
      'Reaper',
      {
        maintSourceCount: 1,
        relationLootCount: 1,
        projectionLootCount: 1,
        localLootCount: 1,
        maintSourceRows: [{
          recordKey: 'legacy-reaper-death-sickle',
          itemInternalName: 'DeathSickle',
          itemName: 'Death Sickle',
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Reaper',
          sourceRefInternalName: 'Reaper',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '2.5%',
          quantityText: '1'
        }]
      }
    ]])
  });

  assert.equal(report.npcs[0].standardizedLootCount, 0);
  assert.equal(report.npcs[0].crawlerCoverageStatus, 'eligible_batch');
  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_unextracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_source_page');
});

test('buildNpcSourceCoverageInventoryReport does not let expected-zero contract mask uncrawled source pages', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 9001, internalName: 'ContractedZeroNpc', name: 'Contracted Zero NPC', flags: {} }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Contracted Zero NPC',
        resolvedPageTitle: 'Contracted Zero NPC',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        eligibleBatch: true,
        standardizedRecords: [{ internalName: 'ContractedZeroNpc' }]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'ContractedZeroNpc', gameId: 9001 }] },
    expectedZeroInternalNames: new Set(['ContractedZeroNpc']),
    stageCounts: new Map()
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_unextracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_source_page');
});

test('buildNpcSourceCoverageInventoryReport does not let domain-separated contract mask uncrawled source pages', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 9002, internalName: 'ContractedDomainNpc', name: 'Contracted Domain NPC', flags: { boss: true } }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Contracted Domain NPC',
        resolvedPageTitle: 'Contracted Domain NPC',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        eligibleBatch: true,
        standardizedRecords: [{ internalName: 'ContractedDomainNpc' }]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'ContractedDomainNpc', gameId: 9002 }] },
    domainSeparatedInternalNames: new Set(['ContractedDomainNpc']),
    stageCounts: new Map()
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_unextracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_source_page');
});

test('buildNpcSourceCoverageInventoryReport honors boss reward domain-separated contract even when boss page has loot', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 50, internalName: 'KingSlime', name: 'King Slime', flags: { boss: true }, wikiCrawler: { loot: [{ itemName: 'Slime Gun' }] } }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'King Slime',
        resolvedPageTitle: 'King Slime',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: true,
        standardizedRecords: [{ internalName: 'KingSlime' }]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'KingSlime', gameId: 50 }] },
    domainSeparatedInternalNames: new Set(['KingSlime']),
    stageCounts: new Map([[
      'KingSlime',
      {
        maintSourceCount: 0,
        relationLootCount: 0,
        projectionLootCount: 0,
        localLootCount: 0,
        maintSourceRows: []
      }
    ]])
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'no_source_required_domain_separated');
  assert.equal(report.npcs[0].nextAction, 'verify_domain_separation_contract');
});

test('buildNpcSourceCoverageInventoryReport treats exact no-loot wikiCrawler infobox evidence as source-present no-loot', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [
        {
          id: 689,
          internalName: 'OwlMimic',
          name: 'Owl',
          flags: {},
          imageFileTitle: 'Owl.png',
          wikiCrawler: {
            pageTitle: 'Owl',
            sourceInfoboxes: [
              { autoId: '689', image: 'Owl.png', name: '' }
            ],
            sourceLootRowsTotal: 0,
            loot: []
          }
        }
      ]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Owl',
        resolvedPageTitle: 'Owl',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        eligibleBatch: true,
        standardizedRecords: [
          { internalName: 'Owl' },
          { internalName: 'OwlMimic' }
        ]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'OwlMimic', gameId: 689 }] },
    stageCounts: new Map()
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_no_loot');
  assert.equal(report.npcs[0].nextAction, 'review_expected_zero_contract');
});

test('buildNpcSourceCoverageInventoryReport rejects no-loot infobox evidence when auto id conflicts with the target variant', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [
        {
          id: 569,
          internalName: 'DD2WitherBeastT3',
          name: 'Wither Beast',
          flags: {},
          imageFileTitle: 'Wither Beast.gif',
          wikiCrawler: {
            pageTitle: 'Wither Beast',
            sourceInfoboxes: [
              { autoId: '568', image: 'Wither Beast.gif', name: '' }
            ],
            loot: []
          }
        }
      ]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Wither Beast',
        resolvedPageTitle: 'Wither Beast',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'DD2WitherBeastT2' },
          { internalName: 'DD2WitherBeastT3' }
        ]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'DD2WitherBeastT3', gameId: 569 }] },
    stageCounts: new Map()
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'group_page_present_variant_not_extracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_variant_specific_source');
});

test('buildNpcSourceCoverageInventoryReport keeps group page no-loot variants blocked without exact infobox evidence', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [
        {
          id: 349,
          internalName: 'NutcrackerSpinning',
          name: 'Nutcracker',
          flags: {},
          imageFileTitle: 'Nutcracker 2.gif',
          wikiCrawler: {
            pageTitle: 'Nutcracker',
            sourceInfoboxes: [],
            loot: []
          }
        }
      ]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Nutcracker',
        resolvedPageTitle: 'Nutcracker',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'Nutcracker' },
          { internalName: 'NutcrackerSpinning' }
        ]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'NutcrackerSpinning', gameId: 349 }] },
    stageCounts: new Map()
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'group_page_present_variant_not_extracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_variant_specific_source');
});

test('buildNpcSourceCoverageInventoryReport does not treat filtered group-page loot as exact no-loot evidence', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [
        {
          id: 349,
          internalName: 'NutcrackerSpinning',
          name: 'Nutcracker',
          flags: {},
          imageFileTitle: 'Nutcracker 2.gif',
          wikiCrawler: {
            pageTitle: 'Nutcracker',
            sourceInfoboxes: [
              { autoId: '349', image: 'Nutcracker 2.gif', name: '' }
            ],
            sourceLootRowsTotal: 1,
            loot: []
          }
        }
      ]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Nutcracker',
        resolvedPageTitle: 'Nutcracker',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'Nutcracker' },
          { internalName: 'NutcrackerSpinning' }
        ]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'NutcrackerSpinning', gameId: 349 }] },
    stageCounts: new Map()
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'group_page_present_variant_not_extracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_variant_specific_source');
});

test('buildNpcSourceCoverageInventoryReport requires raw source loot total before exact no-loot evidence', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [
        {
          id: 349,
          internalName: 'NutcrackerSpinning',
          name: 'Nutcracker',
          flags: {},
          imageFileTitle: 'Nutcracker 2.gif',
          wikiCrawler: {
            pageTitle: 'Nutcracker',
            sourceInfoboxes: [
              { autoId: '349', image: 'Nutcracker 2.gif', name: '' }
            ],
            loot: []
          }
        }
      ]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Nutcracker',
        resolvedPageTitle: 'Nutcracker',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'Nutcracker' },
          { internalName: 'NutcrackerSpinning' }
        ]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'NutcrackerSpinning', gameId: 349 }] },
    stageCounts: new Map()
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'group_page_present_variant_not_extracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_variant_specific_source');
});

test('buildNpcSourceCoverageInventoryReport classifies reviewed positive-page no-direct item loot separately from expected-zero', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [
        {
          id: 322,
          internalName: 'SkeletonTopHat',
          name: 'Skeleton',
          flags: {},
          imageFileTitle: 'Top Hat Skeleton.gif',
          wikiCrawler: {
            pageTitle: 'Skeleton',
            sourceLootRowsTotal: 6,
            sourceInfoboxes: [
              { autoId: '322', image: 'Top Hat Skeleton.gif', name: '' }
            ],
            loot: []
          }
        }
      ]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Skeleton',
        resolvedPageTitle: 'Skeleton',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: true,
        standardizedRecords: [
          { internalName: 'Skeleton' },
          { internalName: 'SkeletonTopHat' }
        ]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'SkeletonTopHat', gameId: 322 }] },
    stageCounts: new Map(),
    noDirectItemLootInternalNames: new Set(['SkeletonTopHat'])
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_no_direct_item_loot');
  assert.equal(report.npcs[0].nextAction, 'verify_no_direct_item_loot_contract');
  assert.equal(report.summary.bySourceCoverageStatus.source_page_present_no_direct_item_loot, 1);
  assert.equal(report.summary.bySourceCoverageStatus.no_source_required_expected_zero, undefined);
});

test('buildNpcSourceCoverageInventoryReport does not treat resolved but uncrawled friendly pages as no-loot evidence', () => {
  const report = buildNpcSourceCoverageInventoryReport({
    standardizedPayload: {
      records: [{ id: 453, internalName: 'SkeletonMerchant', name: 'Skeleton Merchant', flags: { friendly: true } }]
    },
    coverageAudit: {
      targets: [{
        pageTitle: 'Skeleton Merchant',
        resolvedPageTitle: 'Skeleton Merchant',
        missing: false,
        resolutionStatus: 'resolved',
        alreadyCrawled: false,
        eligibleBatch: true,
        standardizedRecords: [{ internalName: 'SkeletonMerchant' }]
      }]
    },
    coverageTargets: {},
    standardizedMap: { records: [{ internalName: 'SkeletonMerchant', gameId: 453 }] },
    stageCounts: new Map([[
      'SkeletonMerchant',
      {
        maintSourceCount: 0,
        relationLootCount: 0,
        projectionLootCount: 0,
        localLootCount: 0,
        maintSourceRows: []
      }
    ]])
  });

  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_unextracted');
  assert.equal(report.npcs[0].nextAction, 'crawl_or_extract_source_page');
});
