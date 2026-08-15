import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRows,
  assertPrimaryDb,
  buildBiomeWikitextResolvedImportPlan,
  buildConnectionConfig,
  buildBiomeLookupMap,
  buildItemInsertRows,
  buildNpcInsertRows,
  parseArgs,
} from './import-biome-wikitext-resolved-to-db.mjs';

test('buildBiomeWikitextResolvedImportPlan uses only resolvedOnly candidates', () => {
  const report = {
    resolvedOnly: {
      itemBiomeCandidates: [
        {
          biomeCode: 'forest',
          itemInternalName: 'TatteredCloth',
          itemName: 'Tattered Cloth',
          relationType: 'drop',
          source: 'From Goblin Scouts',
          note: null,
          sourcePage: 'Forest',
        },
      ],
      npcBiomeCandidates: [
        {
          biomeCode: 'forest',
          npcInternalName: 'GreenSlime',
          npcName: 'Green Slime',
          source: 'During the day',
          note: null,
          sourcePage: 'Forest',
        },
      ],
    },
    results: [
      { entries: [{ matchStatus: 'ambiguous', name: 'Zombie' }] },
    ],
  };

  const plan = buildBiomeWikitextResolvedImportPlan({ report });

  assert.equal(plan.summary.itemCandidates.input, 1);
  assert.equal(plan.summary.npcCandidates.input, 1);
  assert.equal(plan.itemCandidates[0].itemInternalName, 'TatteredCloth');
  assert.equal(plan.npcCandidates[0].npcInternalName, 'GreenSlime');
});

test('buildItemInsertRows resolves biome and item IDs and skips unresolved rows', () => {
  const plan = buildBiomeWikitextResolvedImportPlan({
    report: {
      resolvedOnly: {
        itemBiomeCandidates: [
          {
            biomeCode: 'forest',
            itemInternalName: 'TatteredCloth',
            itemName: 'Tattered Cloth',
            relationType: 'drop',
            source: 'From Goblin Scouts',
            note: null,
            sourcePage: 'Forest',
          },
          {
            biomeCode: 'forest',
            itemInternalName: 'MissingItem',
            itemName: 'Missing Item',
            relationType: 'drop',
            source: 'From Missing',
            note: null,
            sourcePage: 'Forest',
          },
        ],
        npcBiomeCandidates: [],
      },
    },
  });
  const rows = buildItemInsertRows({
    candidates: plan.itemCandidates,
    biomeByCode: new Map([['forest', 10]]),
    itemByInternalName: new Map([['tatteredcloth', 20]]),
  });

  assert.equal(rows.valid.length, 1);
  assert.equal(rows.skipped.length, 1);
  assert.equal(rows.valid[0].biomeId, 10);
  assert.equal(rows.valid[0].itemId, 20);
  assert.equal(rows.valid[0].notes, 'From Goblin Scouts');
  assert.equal(rows.skipped[0].reason, 'missing_item');
});

test('buildBiomeLookupMap resolves maint-style biome aliases from local biome names', () => {
  const biomeByCode = buildBiomeLookupMap([
    { id: 96, code: 'ice', name_en: 'Ice biome' },
    { id: 95, code: 'glowing_mushroom', name_en: 'Glowing Mushroom biome' },
  ]);

  assert.equal(biomeByCode.get('ice'), 96);
  assert.equal(biomeByCode.get('ice_biome'), 96);
  assert.equal(biomeByCode.get('glowing_mushroom'), 95);
  assert.equal(biomeByCode.get('glowing_mushroom_biome'), 95);
});

test('buildNpcInsertRows resolves biome and npc IDs and skips unresolved rows', () => {
  const plan = buildBiomeWikitextResolvedImportPlan({
    report: {
      resolvedOnly: {
        itemBiomeCandidates: [],
        npcBiomeCandidates: [
          {
            biomeCode: 'forest',
            npcInternalName: 'GreenSlime',
            npcName: 'Green Slime',
            source: 'During the day',
            note: null,
            sourcePage: 'Forest',
          },
          {
            biomeCode: 'forest',
            npcInternalName: 'MissingNpc',
            npcName: 'Missing NPC',
            source: 'During the day',
            note: null,
            sourcePage: 'Forest',
          },
        ],
      },
    },
  });
  const rows = buildNpcInsertRows({
    candidates: plan.npcCandidates,
    biomeByCode: new Map([['forest', 10]]),
    npcByInternalName: new Map([['greenslime', 30]]),
  });

  assert.equal(rows.valid.length, 1);
  assert.equal(rows.skipped.length, 1);
  assert.equal(rows.valid[0].npcId, 30);
  assert.equal(rows.valid[0].spawnContext, 'During the day');
  assert.equal(rows.skipped[0].reason, 'missing_npc');
});

test('buildNpcInsertRows normalizes missing spawn context for unique upserts', () => {
  const rows = buildNpcInsertRows({
    candidates: [
      {
        biomeCode: 'forest',
        npcInternalName: 'GreenSlime',
        npcName: 'Green Slime',
        source: null,
        note: null,
        sourcePage: 'Forest',
      },
    ],
    biomeByCode: new Map([['forest', 10]]),
    npcByInternalName: new Map([['greenslime', 30]]),
  });

  assert.equal(rows.valid.length, 1);
  assert.equal(rows.valid[0].spawnContext, '');
});

test('assertPrimaryDb refuses non-primary database unless explicitly allowed', () => {
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_local', false));
  assert.throws(() => assertPrimaryDb('terria_v1_maint', false), /Refusing to write to non-primary database/);
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', true));
});

test('parseArgs defaults to dry-run and parses explicit apply', () => {
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(parseArgs(['--apply=true', '--report=reports/input.json']), {
    apply: 'true',
    report: 'reports/input.json',
  });
});

test('buildConnectionConfig supports local socket and username env alias', () => {
  const config = buildConnectionConfig('terria_v1_local', {
    TERRAPEDIA_DB_SOCKET: '/run/mysqld/mysqld.sock',
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root',
  });

  assert.equal(config.socketPath, '/run/mysqld/mysqld.sock');
  assert.equal(config.user, 'root');
  assert.equal(config.password, 'root');
  assert.equal(config.database, 'terria_v1_local');
  assert.equal(config.host, undefined);
  assert.equal(config.port, undefined);
});

test('applyRows skips unchanged biome wikitext relation rows', async () => {
  const itemRow = biomeItemRow();
  const npcRow = biomeNpcRow();
  const conn = createApplyRowsFakeConnection({
    biomeResourceRows: [dbBiomeResourceRow(itemRow)],
    itemBiomeRows: [dbItemBiomeRow(itemRow)],
    itemAcquisitionRows: [dbItemAcquisitionSourceRow(itemRow)],
    npcBiomeRows: [dbNpcBiomeRow(npcRow)],
  });

  const summary = await applyRows(conn, {
    itemRows: [itemRow],
    npcRows: [npcRow],
  });

  assert.deepEqual(summary, {
    biomeResources: { created: 0, updated: 0 },
    itemBiomes: { created: 0, updated: 0 },
    itemAcquisitionSources: { created: 0, updated: 0 },
    npcBiomes: { created: 0, updated: 0 },
  });
  assert.equal(conn.calls.some((call) => /\bUPDATE\s+biome_resources\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO\s+item_biomes\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bUPDATE\s+item_acquisition_sources\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO\s+npc_biomes\b/i.test(call.sql)), false);
});

test('applyRows updates changed biome wikitext relation rows without broad deletes', async () => {
  const itemRow = biomeItemRow({ notes: 'changed source | changed note', noteOnly: 'changed note', sortOrder: 2 });
  const npcRow = biomeNpcRow({ notes: 'changed note', sortOrder: 2 });
  const conn = createApplyRowsFakeConnection({
    biomeResourceRows: [dbBiomeResourceRow(biomeItemRow())],
    itemBiomeRows: [dbItemBiomeRow(biomeItemRow())],
    itemAcquisitionRows: [dbItemAcquisitionSourceRow(biomeItemRow())],
    npcBiomeRows: [dbNpcBiomeRow(biomeNpcRow())],
  });

  const summary = await applyRows(conn, {
    itemRows: [itemRow],
    npcRows: [npcRow],
  });

  assert.deepEqual(summary, {
    biomeResources: { created: 0, updated: 1 },
    itemBiomes: { created: 0, updated: 1 },
    itemAcquisitionSources: { created: 0, updated: 1 },
    npcBiomes: { created: 0, updated: 1 },
  });
  assert.equal(conn.calls.some((call) => /\bDELETE FROM\b/i.test(call.sql)), false);
  assert.equal(conn.calls.filter((call) => /\bUPDATE\s+biome_resources\b/i.test(call.sql)).length, 1);
  assert.equal(conn.calls.filter((call) => /\bUPDATE\s+item_biomes\b/i.test(call.sql)).length, 1);
  assert.equal(conn.calls.filter((call) => /\bUPDATE\s+item_acquisition_sources\b/i.test(call.sql)).length, 1);
  assert.equal(conn.calls.filter((call) => /\bUPDATE\s+npc_biomes\b/i.test(call.sql)).length, 1);
});

function biomeItemRow(overrides = {}) {
  return {
    biomeId: 10,
    itemId: 20,
    itemName: 'Tattered Cloth',
    relationType: 'drop',
    source: 'From Goblin Scouts',
    notes: 'From Goblin Scouts | rare drop',
    noteOnly: 'rare drop',
    sourcePage: 'Forest',
    sortOrder: 1,
    ...overrides,
  };
}

function biomeNpcRow(overrides = {}) {
  return {
    biomeId: 10,
    npcId: 30,
    npcName: 'Green Slime',
    spawnContext: 'During the day',
    notes: 'common spawn',
    sourcePage: 'Forest',
    sortOrder: 1,
    ...overrides,
  };
}

function dbBiomeResourceRow(row) {
  return {
    id: 100,
    biome_id: row.biomeId,
    item_id: row.itemId,
    resource_name_raw: row.itemName,
    resource_type: row.relationType,
    notes: row.notes,
    sort_order: row.sortOrder,
  };
}

function dbItemBiomeRow(row) {
  return {
    id: 101,
    item_id: row.itemId,
    biome_id: row.biomeId,
    relation_type: row.relationType,
    notes: row.notes,
    sort_order: row.sortOrder,
  };
}

function dbItemAcquisitionSourceRow(row) {
  return {
    id: 102,
    item_id: row.itemId,
    source_type: row.relationType,
    source_ref_type: 'biome_wikitext',
    source_ref_name: row.source,
    biome_id: row.biomeId,
    notes: row.noteOnly,
    source_provider: 'terraria.wiki.gg',
    source_page: row.sourcePage,
    sort_order: row.sortOrder,
  };
}

function dbNpcBiomeRow(row) {
  return {
    id: 103,
    npc_id: row.npcId,
    biome_id: row.biomeId,
    relation_type: 'appears_in',
    spawn_context: row.spawnContext,
    notes: row.notes,
    source_provider: 'terraria.wiki.gg',
    source_page: row.sourcePage,
    sort_order: row.sortOrder,
    status: 1,
    deleted: 0,
  };
}

function createApplyRowsFakeConnection({
  biomeResourceRows = [],
  itemBiomeRows = [],
  itemAcquisitionRows = [],
  npcBiomeRows = [],
} = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/\bFROM\s+biome_resources\b/i.test(sql)) return [biomeResourceRows];
      if (/\bFROM\s+item_biomes\b/i.test(sql)) return [itemBiomeRows];
      if (/\bFROM\s+item_acquisition_sources\b/i.test(sql)) return [itemAcquisitionRows];
      if (/\bFROM\s+npc_biomes\b/i.test(sql)) return [npcBiomeRows];
      return [{ affectedRows: 1, insertId: 200 }];
    },
  };
}
