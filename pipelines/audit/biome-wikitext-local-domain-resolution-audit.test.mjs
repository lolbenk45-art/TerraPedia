import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditBiomeWikitextLocalDomainResolution,
  buildConnectionConfig,
  classifyDomainRecommendation,
  createMysqlEvidenceLoader,
  parseArgs,
  validateLocalDomainAuditReport,
  writeLocalDomainAuditReport
} from './biome-wikitext-local-domain-resolution-audit.mjs';

function unresolvedReportFixture() {
  return {
    entity: 'biome_wikitext_unresolved_report',
    generatedAt: '2026-06-02T04:00:00.000Z',
    sourceReportPath: '/tmp/source.json',
    sourceGeneratedAt: '2026-06-02T03:51:10.835Z',
    summary: { total: 4, item: { missing: 3, ambiguous: 0 }, npc: { missing: 0, ambiguous: 1 }, byReviewCategory: {} },
    rows: [
      { index: 1, rowKey: 'forest:item:missing:ninja_armor:1', biomeCode: 'forest', pageTitle: 'Forest', matchType: 'item', matchStatus: 'missing', section: 'Unique Drops', source: 'From the King Slime', name: 'Ninja armor', note: null, candidateMatches: [], reviewCategory: 'item_collection_or_set', needsUserDecision: true },
      { index: 2, rowKey: 'underworld:item:missing:treasure_bag:2', biomeCode: 'underworld', pageTitle: 'The Underworld', matchType: 'item', matchStatus: 'missing', section: 'Unique Drops', source: 'From Wall of Flesh', name: 'Treasure Bag', note: '(drops the Demon Heart in Expert Mode)', candidateMatches: [], reviewCategory: 'generic_item_name_needs_context', needsUserDecision: true },
      { index: 3, rowKey: 'snow:item:missing:snow_armor:3', biomeCode: 'snow', pageTitle: 'Snow biome', matchType: 'item', matchStatus: 'missing', section: 'Unique Drops', source: 'From Frozen Zombies', name: 'Snow armor', note: '(1/30 chance for each piece)', candidateMatches: [], reviewCategory: 'item_collection_or_set', needsUserDecision: true },
      { index: 4, rowKey: 'forest:npc:ambiguous:zombie:4', biomeCode: 'forest', pageTitle: 'Forest', matchType: 'npc', matchStatus: 'ambiguous', section: 'Characters', source: 'During the night', name: 'Zombie', note: null, candidateMatches: [{ entityType: 'npc', id: 3, internalName: 'Zombie', name: 'Zombie', nameZh: '僵尸' }, { entityType: 'npc', id: 430, internalName: 'BigZombie', name: 'Zombie', nameZh: '僵尸' }], reviewCategory: 'ambiguous_variant_group_needs_user_decision', needsUserDecision: true }
    ]
  };
}

function fakeDbEvidence(row) {
  if (row.name === 'Ninja armor') {
    return {
      itemExact: [],
      itemLike: [],
      npcExact: [],
      npcLike: [],
      armorSetCandidates: [{ id: 96, sourceKey: 'ArmorSetBonus.Ninja', textKey: 'ArmorSetBonus.Ninja', setCount: 1, uniqueItemCount: 3, items: ['NinjaHood', 'NinjaShirt', 'NinjaPants'] }],
      bossLootCandidates: []
    };
  }
  if (row.name === 'Snow armor') {
    return {
      itemExact: [],
      itemLike: [],
      npcExact: [],
      npcLike: [],
      armorSetCandidates: [{ id: 111, sourceKey: 'ArmorSetBonus.Snow', textKey: 'ArmorSetBonus.Snow', setCount: 8, uniqueItemCount: 6, items: ['EskimoHood', 'EskimoCoat', 'EskimoPants', 'PinkEskimoHood'] }],
      bossLootCandidates: []
    };
  }
  if (row.name === 'Treasure Bag') {
    return {
      itemExact: [],
      itemLike: [{ id: 3318, internalName: 'BossBag14', name: 'Treasure Bag' }],
      npcExact: [],
      npcLike: [],
      armorSetCandidates: [],
      bossLootCandidates: [{ bossInternalName: 'WallofFlesh', dropSourceKind: 'treasure_bag', lootRows: 10, sampleItems: ['DemonHeart', 'Pwnhammer'] }]
    };
  }
  return {
    itemExact: [],
    itemLike: [],
    npcExact: [{ id: 3, internalName: 'Zombie', name: 'Zombie' }, { id: 430, internalName: 'BigZombie', name: 'Zombie' }],
    npcLike: [],
    armorSetCandidates: [],
    bossLootCandidates: []
  };
}

test('auditBiomeWikitextLocalDomainResolution preserves 42-style row evidence and classifies domain recommendations', async () => {
  const report = await auditBiomeWikitextLocalDomainResolution({
    unresolvedReport: unresolvedReportFixture(),
    loadEvidenceForRow: async (row) => fakeDbEvidence(row),
    generatedAt: '2026-06-02T05:00:00.000Z'
  });

  assert.equal(report.entity, 'biome_wikitext_local_domain_resolution_audit');
  assert.equal(report.generatedAt, '2026-06-02T05:00:00.000Z');
  assert.equal(report.summary.total, 4);
  assert.deepEqual(report.rows.map((row) => row.inputIndex), [1, 2, 3, 4]);
  assert.deepEqual(report.rows.map((row) => row.recommendation), [
    'evidence_armor_set_single_candidate',
    'evidence_boss_treasure_bag_projection',
    'evidence_armor_set_variant_needs_decision',
    'ambiguous_npc_variant_needs_decision'
  ]);
  assert.equal(report.rows[3].original.section, 'Characters');
  assert.equal(report.rows[3].original.candidateMatches.length, 2);
  assert.equal(report.rows[0].armorSetCandidates[0].items.length, 3);
  assert.equal(report.rows[1].bossLootCandidates[0].dropSourceKind, 'treasure_bag');
  assert.equal(validateLocalDomainAuditReport(report).valid, true);
});

test('classifyDomainRecommendation selects domain-specific next actions without deciding final mappings', () => {
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'item', name: 'Ninja armor' }, evidence: { armorSetCandidates: [{ setCount: 1 }], bossLootCandidates: [] } }), 'evidence_armor_set_single_candidate');
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'item', name: 'Snow armor' }, evidence: { armorSetCandidates: [{ setCount: 8 }], bossLootCandidates: [] } }), 'evidence_armor_set_variant_needs_decision');
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'item', name: 'Treasure Bag' }, evidence: { armorSetCandidates: [], bossLootCandidates: [{ lootRows: 10 }] } }), 'evidence_boss_treasure_bag_projection');
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'npc', matchStatus: 'ambiguous', name: 'Zombie' }, evidence: { npcExact: [{}, {}] } }), 'ambiguous_npc_variant_needs_decision');
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'npc', matchStatus: 'missing', name: 'Cloud Slime' }, evidence: { npcExact: [], npcLike: [] } }), 'missing_local_entity_needs_backfill');
});

test('parseArgs requires input report and rejects unknown options', () => {
  assert.throws(() => parseArgs([]), /--input is required/);
  assert.throws(() => parseArgs(['--input=a.json', '--bad=true']), /Unknown option: --bad/);
  assert.deepEqual(parseArgs(['--input=a.json', '--output=b.json']), { input: 'a.json', output: 'b.json' });
});

test('buildConnectionConfig uses local DB defaults and refuses non-local DB names', () => {
  assert.deepEqual(buildConnectionConfig({
    TERRAPEDIA_DB_SOCKET: '/run/mysqld/mysqld.sock',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root'
  }), {
    socketPath: '/run/mysqld/mysqld.sock',
    user: 'root',
    password: 'root',
    database: 'terria_v1_local'
  });
  assert.deepEqual(buildConnectionConfig({
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root'
  }), {
    host: '127.0.0.1',
    port: 13306,
    user: 'root',
    password: 'root',
    database: 'terria_v1_local'
  });
  assert.throws(() => buildConnectionConfig({ TERRAPEDIA_DB_NAME: 'prod' }), /Refusing non-local database/);
});

test('createMysqlEvidenceLoader only issues SELECT queries and returns normalized evidence', async () => {
  const captured = [];
  const connection = {
    async execute(sql, params) {
      captured.push({ sql, params });
      assert.match(sql.trim(), /^SELECT\b/i);
      if (sql.includes('`terria_v1_local`.`npc_loot_entries`')) return [[{ boss_internal_name: 'WallofFlesh', drop_source_kind: 'treasure_bag', loot_rows: 10, sample_items: 'DemonHeart|Pwnhammer' }]];
      if (sql.includes('`terria_v1_local`.`armor_sets`')) return [[{ id: 96, source_key: 'ArmorSetBonus.Ninja', text_key: 'ArmorSetBonus.Ninja', set_count: 1, unique_item_count: 3, items: 'NinjaHood|NinjaShirt|NinjaPants' }]];
      if (sql.includes('`terria_v1_local`.`npcs`')) return [[{ id: 3, internal_name: 'Zombie', name: 'Zombie', name_zh: '僵尸' }]];
      if (sql.includes('`terria_v1_local`.`items`')) return [[{ id: 1, internal_name: 'NinjaHood', name: 'Ninja Hood', name_zh: '忍者兜帽' }]];
      return [[]];
    }
  };
  const loader = createMysqlEvidenceLoader({ connection });

  const armorEvidence = await loader({
    matchType: 'item',
    matchStatus: 'missing',
    name: 'Ninja armor',
    source: 'From Wall of Flesh',
    reviewCategory: 'item_collection_or_set'
  });
  const treasureBagEvidence = await loader({
    matchType: 'item',
    matchStatus: 'missing',
    name: 'Treasure Bag',
    source: 'From Wall of Flesh',
    reviewCategory: 'generic_item_name_needs_context'
  });
  const npcEvidence = await loader({
    matchType: 'npc',
    matchStatus: 'ambiguous',
    name: 'Zombie',
    source: 'During the night',
    reviewCategory: 'ambiguous_variant_group_needs_user_decision'
  });

  assert.ok(captured.length >= 4);
  assert.ok(captured.every(({ sql }) => /^SELECT\b/i.test(sql.trim())));
  for (const tableName of ['items', 'npcs', 'armor_sets', 'armor_set_items', 'npc_loot_entries']) {
    assert.ok(captured.some(({ sql }) => sql.includes(`\`terria_v1_local\`.\`${tableName}\``)), `${tableName} query should be schema-qualified`);
  }
  assert.equal(armorEvidence.itemExact.length, 1);
  assert.equal(armorEvidence.armorSetCandidates[0].items.length, 3);
  assert.equal(treasureBagEvidence.bossLootCandidates[0].dropSourceKind, 'treasure_bag');
  assert.equal(npcEvidence.npcExactMatches, undefined);
  assert.equal(npcEvidence.npcExact[0].internalName, 'Zombie');
});

test('validateLocalDomainAuditReport rejects missing original evidence and invalid recommendations', async () => {
  const report = await auditBiomeWikitextLocalDomainResolution({
    unresolvedReport: unresolvedReportFixture(),
    loadEvidenceForRow: async (row) => fakeDbEvidence(row),
    generatedAt: '2026-06-02T05:00:00.000Z'
  });
  delete report.generatedAt;
  delete report.sourceReportPath;
  delete report.sourceGeneratedAt;
  delete report.summary.byRecommendation;
  report.rows[0].inputIndex = '1';
  delete report.rows[1].original.rowKey;
  delete report.rows[3].original.candidateMatches;
  report.rows[0].recommendation = 'made_up';

  const result = validateLocalDomainAuditReport(report);

  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /missing generatedAt/);
  assert.match(result.issues.join('\n'), /missing sourceReportPath/);
  assert.match(result.issues.join('\n'), /missing sourceGeneratedAt/);
  assert.match(result.issues.join('\n'), /missing summary.byRecommendation/);
  assert.match(result.issues.join('\n'), /invalid inputIndex/);
  assert.match(result.issues.join('\n'), /missing original.rowKey/);
  assert.match(result.issues.join('\n'), /missing original.candidateMatches/);
  assert.match(result.issues.join('\n'), /unsupported recommendation/);
});

test('writeLocalDomainAuditReport writes JSON using injected read-only evidence loader', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biome-local-domain-audit-'));
  const inputPath = path.join(dir, 'unresolved.json');
  const outputPath = path.join(dir, 'audit.json');
  fs.writeFileSync(inputPath, `${JSON.stringify(unresolvedReportFixture())}\n`, 'utf8');

  const result = await writeLocalDomainAuditReport({
    inputPath,
    outputPath,
    loadEvidenceForRow: async (row) => fakeDbEvidence(row)
  });
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(result.outputPath, outputPath);
  assert.equal(output.summary.total, 4);
  assert.equal(output.rows[2].recommendation, 'evidence_armor_set_variant_needs_decision');
});

test('script source has no SQL write, network/process module, crawler/fetch/import/backfill/load script, or apply path', () => {
  const source = fs.readFileSync(new URL('./biome-wikitext-local-domain-resolution-audit.mjs', import.meta.url), 'utf8');
  const forbiddenPatterns = [
    /^\s*(INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|ALTER)\b/im,
    /CREATE\s+TABLE/i,
    /--apply/,
    /node:child_process/,
    /node:https/,
    /node:http/,
    /fetch\(/,
    /scripts\/data\/(crawler|fetch|import|backfill|load)/i
  ];
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern);
  }
});
