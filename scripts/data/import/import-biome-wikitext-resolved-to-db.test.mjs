import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPrimaryDb,
  buildBiomeWikitextResolvedImportPlan,
  buildConnectionConfig,
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
