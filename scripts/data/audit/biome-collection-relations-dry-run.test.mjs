import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBiomeCollectionRelationsDryRun,
  classifyCollectionCandidate,
  parseArgs,
  validateBiomeCollectionRelationsDryRun,
  writeBiomeCollectionRelationsDryRun
} from './biome-collection-relations-dry-run.mjs';

function policyReportFixture() {
  return {
    entity: 'biome_wikitext_policy_relation_plan',
    generatedAt: '2026-06-02T08:00:00.000Z',
    sourceReportPaths: { localDomain: '/tmp/local-domain.json', missingEvidence: '/tmp/missing-evidence.json' },
    summary: {
      total: 42,
      byPolicyAction: {
        boss_treasure_bag_projection_only: 2,
        armor_set_relation_schema_needed: 2,
        item_set_component_collection_schema_needed: 2,
        item_family_collection_schema_needed: 1,
        ambiguous_npc_variant_policy_needed: 14,
        normalized_npc_candidate_policy_needed: 3,
        weak_npc_family_backfill_clue_only: 16,
        still_missing_entity_evidence_needed: 2
      },
      dbWriteActions: { none: 42 }
    },
    rows: [
      policyRow(35, 'Treasure Bag', 'The Underworld', 'From Wall of Flesh', 'boss_treasure_bag_projection_only', 'boss_detail_loot_projection', {
        bossLootCandidates: [{ bossInternalName: 'WallofFlesh', dropSourceKind: 'treasure_bag' }]
      }),
      policyRow(22, 'Ninja armor', 'Forest', 'From the King Slime', 'armor_set_relation_schema_needed', 'biome_armor_sets', {
        armorSetCandidates: [{ id: 96, sourceKey: 'ArmorSetBonus.Ninja', textKey: 'ArmorSetBonus.Ninja', items: ['NinjaHood', 'NinjaShirt', 'NinjaPants'] }]
      }),
      policyRow(40, 'Snow armor', 'Snow biome', 'From Frozen Zombies', 'armor_set_relation_schema_needed', 'biome_armor_sets', {
        armorSetCandidates: [{ id: 111, sourceKey: 'ArmorSetBonus.Snow', textKey: 'ArmorSetBonus.Snow', items: ['EskimoHood', 'EskimoCoat', 'EskimoPants'] }]
      }),
      policyRow(3, 'Zombie', 'Forest', 'During the night', 'ambiguous_npc_variant_policy_needed', 'npc_biomes_policy_gate', {
        npcExactMatches: [{ id: 3, internalName: 'Zombie' }, { id: 430, internalName: 'BigZombie' }]
      }),
      policyRow(25, 'Mummy set', 'Desert', 'From Mummies', 'item_set_component_collection_schema_needed', 'biome_item_collections', {
        componentItemCandidates: [{ id: 870, internalName: 'MummyMask' }, { id: 871, internalName: 'MummyShirt' }, { id: 872, internalName: 'MummyPants' }]
      }),
      policyRow(41, "Pedguin's set", 'Snow biome', 'From Corrupt Penguins and Vicious Penguins', 'item_set_component_collection_schema_needed', 'biome_item_collections', {
        componentItemCandidates: [{ id: 5001, internalName: 'PedguinHat' }, { id: 5002, internalName: 'PedguinShirt' }, { id: 5003, internalName: 'PedguinPants' }]
      }),
      policyRow(36, 'Obsidian furniture', 'The Underworld', 'From terrain', 'item_family_collection_schema_needed', 'biome_item_collections', {
        familyItemCandidates: [{ id: 1458, internalName: 'ObsidianDoor' }, { id: 1460, internalName: 'ObsidianTable' }]
      })
    ]
  };
}

function policyRow(inputIndex, name, pageTitle, source, policyAction, targetSurface, evidence) {
  const matchType = name.includes('Treasure') || name.includes('armor') || name.includes('set') || name.includes('furniture') ? 'item' : 'npc';
  return {
    inputIndex,
    original: {
      index: inputIndex,
      rowKey: `${pageTitle}:${matchType}:missing:${name}:${inputIndex}`,
      biomeCode: pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      pageTitle,
      matchType,
      matchStatus: 'missing',
      section: matchType === 'item' ? 'Unique Drops' : 'Characters',
      source,
      name,
      note: null,
      candidateMatches: [],
      reviewCategory: 'fixture',
      needsUserDecision: true
    },
    sourceRecommendations: { localDomain: null, missingEvidence: null },
    policyAction,
    targetSurface,
    nextDecision: 'fixture decision',
    evidence: {
      itemExactMatches: [],
      itemLikeMatches: [],
      npcExactMatches: [],
      npcLikeMatches: [],
      armorSetCandidates: [],
      bossLootCandidates: [],
      normalizedNpcCandidates: [],
      familyNpcCandidates: [],
      componentItemCandidates: [],
      familyItemCandidates: [],
      ...evidence
    },
    dbWriteAction: 'none',
    resolvedMapping: null,
    evidenceOnly: true,
    needsUserDecision: true
  };
}

test('buildBiomeCollectionRelationsDryRun emits only armor and item collection candidates', () => {
  const report = buildBiomeCollectionRelationsDryRun({
    policyReport: policyReportFixture(),
    generatedAt: '2026-06-03T01:00:00.000Z',
    sourceReportPath: '/tmp/policy.json'
  });

  assert.equal(report.entity, 'biome_collection_relations_dry_run');
  assert.equal(report.generatedAt, '2026-06-03T01:00:00.000Z');
  assert.equal(report.sourceReportPath, '/tmp/policy.json');
  assert.equal(report.summary.total, 5);
  assert.deepEqual(report.rows.map((row) => row.inputIndex), [22, 25, 36, 40, 41]);
  assert.deepEqual(report.rows.map((row) => row.wikiName), ['Ninja armor', 'Mummy set', 'Obsidian furniture', 'Snow armor', "Pedguin's set"]);
  assert.deepEqual(report.summary.byCandidateCategory, {
    armor_set_relation_candidate: 2,
    item_set_collection_candidate: 2,
    item_family_collection_candidate: 1
  });
  assert.equal(report.summary.dbWriteActions.none, 5);
  assert.ok(report.rows.every((row) => row.evidenceOnly === true));
  assert.ok(report.rows.every((row) => row.needsUserDecision === true));
  assert.ok(report.rows.every((row) => row.schemaRequired === true));
  assert.ok(report.rows.every((row) => row.dbWriteAction === 'none'));
  assert.ok(report.rows.every((row) => row.resolvedMapping === null));
  assert.equal(report.rows[0].futureSurface, 'biome_armor_sets');
  assert.equal(report.rows[0].candidateKey, 'armor_set_candidate:ninja_armor');
  assert.equal(report.rows[0].memberEvidence.armorSetCandidates.length, 1);
  assert.equal(report.rows[1].futureSurface, 'biome_item_collections');
  assert.equal(report.rows[1].candidateKey, 'item_collection:mummy_set');
  assert.equal(report.rows[1].memberEvidence.componentItemCandidates.length, 3);
  assert.equal(report.rows[2].candidateKey, 'item_collection:obsidian_furniture');
  assert.equal(report.rows[2].memberEvidence.familyItemCandidates.length, 2);
  assert.deepEqual(report.excludedPolicyActions, {
    boss_treasure_bag_projection_only: 1,
    ambiguous_npc_variant_policy_needed: 1
  });
  assert.equal(validateBiomeCollectionRelationsDryRun(report).valid, true);
});

test('buildBiomeCollectionRelationsDryRun validates the upstream policy report contract', () => {
  const wrongEntity = policyReportFixture();
  wrongEntity.entity = 'made_up';
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: wrongEntity }), /wrong policy report entity/);

  const wrongTotal = policyReportFixture();
  wrongTotal.summary.total = 7;
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: wrongTotal }), /policy report summary.total expected 42/);

  const wrongCount = policyReportFixture();
  wrongCount.summary.byPolicyAction.armor_set_relation_schema_needed = 3;
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: wrongCount }), /policy action armor_set_relation_schema_needed expected 2/);

  const writeAction = policyReportFixture();
  writeAction.summary.dbWriteActions.none = 41;
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: writeAction }), /policy report dbWriteActions.none expected 42/);

  const unsafeSourceRow = policyReportFixture();
  unsafeSourceRow.rows[0].resolvedMapping = { itemId: 1 };
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: unsafeSourceRow }), /policy row 35 resolvedMapping must be null/);
});

test('buildBiomeCollectionRelationsDryRun enforces the five-row identity allowlist', () => {
  const missingAllowed = policyReportFixture();
  missingAllowed.rows = missingAllowed.rows.filter((row) => row.inputIndex !== 41);
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: missingAllowed }), /missing allowlisted collection row 41/);

  const extraAllowedAction = policyReportFixture();
  extraAllowedAction.rows.push(policyRow(99, 'Extra furniture', 'Forest', 'From terrain', 'item_family_collection_schema_needed', 'biome_item_collections', {
    familyItemCandidates: [{ id: 99, internalName: 'ExtraChair' }]
  }));
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: extraAllowedAction }), /unexpected collection policy row 99/);

  const wrongName = policyReportFixture();
  wrongName.rows.find((row) => row.inputIndex === 25).original.name = 'Mummy vanity';
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: wrongName }), /allowlisted row 25 name mismatch/);
});

test('buildBiomeCollectionRelationsDryRun rejects missing category-specific member evidence', () => {
  const missingArmorEvidence = policyReportFixture();
  missingArmorEvidence.rows.find((row) => row.inputIndex === 22).evidence.armorSetCandidates = [];
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: missingArmorEvidence }), /row 22 missing armorSetCandidates evidence/);

  const missingComponentEvidence = policyReportFixture();
  missingComponentEvidence.rows.find((row) => row.inputIndex === 25).evidence.componentItemCandidates = [];
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: missingComponentEvidence }), /row 25 missing componentItemCandidates evidence/);

  const missingFamilyEvidence = policyReportFixture();
  missingFamilyEvidence.rows.find((row) => row.inputIndex === 36).evidence.familyItemCandidates = [];
  assert.throws(() => buildBiomeCollectionRelationsDryRun({ policyReport: missingFamilyEvidence }), /row 36 missing familyItemCandidates evidence/);
});

test('classifyCollectionCandidate maps policy rows to explicit future surfaces', () => {
  const rows = policyReportFixture().rows;
  assert.equal(classifyCollectionCandidate(rows[1]).candidateCategory, 'armor_set_relation_candidate');
  assert.equal(classifyCollectionCandidate(rows[4]).candidateCategory, 'item_set_collection_candidate');
  assert.equal(classifyCollectionCandidate(rows[6]).candidateCategory, 'item_family_collection_candidate');
  assert.equal(classifyCollectionCandidate(rows[0]), null);
  assert.equal(classifyCollectionCandidate(rows[3]), null);
});

test('parseArgs requires input and rejects apply-style options', () => {
  assert.throws(() => parseArgs([]), /--input is required/);
  assert.throws(() => parseArgs(['--input=a.json', '--apply=true']), /Unknown option: --apply/);
  assert.deepEqual(parseArgs(['--input=a.json', '--output=b.json']), { input: 'a.json', output: 'b.json' });
});

test('validateBiomeCollectionRelationsDryRun rejects write-intent and direct relation payloads', () => {
  const report = buildBiomeCollectionRelationsDryRun({ policyReport: policyReportFixture() });
  report.rows[0].dbWriteAction = 'insert';
  report.rows[1].futureSurface = 'item_biomes';
  report.rows[2].resolvedMapping = { itemId: 870 };
  report.rows[3].itemBiomePayload = { itemId: 1, biomeId: 1 };
  report.rows[4].targetTable = 'biome_relations';
  report.apply = true;
  report.sql = 'INSERT INTO biome_armor_sets';
  report.rows[0].itemIds = [1, 2, 3];
  report.rows[1].relationPayload = { armorSetId: 96 };

  const result = validateBiomeCollectionRelationsDryRun(report);

  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /dbWriteAction must be none/);
  assert.match(result.issues.join('\n'), /forbidden futureSurface item_biomes/);
  assert.match(result.issues.join('\n'), /resolvedMapping must be null/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field rows\[3\]\.itemBiomePayload/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field rows\[4\]\.targetTable/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field apply/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field sql/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field rows\[0\]\.itemIds/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field rows\[1\]\.relationPayload/);
});

test('writeBiomeCollectionRelationsDryRun writes JSON report only', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biome-collection-dry-run-'));
  const inputPath = path.join(dir, 'policy.json');
  const outputPath = path.join(dir, 'collections.json');
  fs.writeFileSync(inputPath, `${JSON.stringify(policyReportFixture())}\n`, 'utf8');

  const result = await writeBiomeCollectionRelationsDryRun({
    inputPath,
    outputPath,
    generatedAt: '2026-06-03T01:00:00.000Z'
  });
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(result.outputPath, outputPath);
  assert.equal(output.sourceReportPath, inputPath);
  assert.equal(output.summary.total, 5);
  assert.equal(output.summary.byCandidateCategory.armor_set_relation_candidate, 2);
});

test('script source has no DB, SQL write, network/process module, crawler/fetch/import/backfill/load script, or apply path', () => {
  const source = fs.readFileSync(new URL('./biome-collection-relations-dry-run.mjs', import.meta.url), 'utf8');
  const forbiddenPatterns = [
    /\bmysql2\b/i,
    /\bcreateConnection\b/i,
    /\bexecute\s*\(/i,
    /^\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|ALTER|CREATE)\b/im,
    /--apply/,
    /node:child_process/,
    /node:https/,
    /node:http/,
    /fetch\(/,
    /scripts\/data\/(crawler|fetch|import|backfill|load)/i,
    /data\/generated\/item-group-overrides\.json/
  ];
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern);
  }
});
