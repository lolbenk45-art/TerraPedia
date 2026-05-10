import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNpcSourceCoverageInventoryReport,
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

test('buildNpcSourceCoverageInventoryReport trusts exact stage loot evidence over stale missing coverage', () => {
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

  assert.equal(report.npcs[0].sourceCoverageStatus, 'source_page_present_with_loot');
  assert.equal(report.npcs[0].nextAction, 'verify_relation_projection_local_counts');
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
