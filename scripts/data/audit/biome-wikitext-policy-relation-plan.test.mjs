import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBiomeWikitextPolicyRelationPlan,
  classifyPolicyAction,
  parseArgs,
  validatePolicyRelationPlanReport,
  writePolicyRelationPlanReport
} from './biome-wikitext-policy-relation-plan.mjs';

function localDomainReportFixture() {
  return {
    entity: 'biome_wikitext_local_domain_resolution_audit',
    generatedAt: '2026-06-02T06:00:00.000Z',
    sourceReportPath: '/tmp/unresolved.json',
    summary: {
      total: 8,
      byRecommendation: {
        evidence_boss_treasure_bag_projection: 1,
        evidence_armor_set_variant_needs_decision: 1,
        ambiguous_npc_variant_needs_decision: 1,
        missing_local_entity_needs_backfill: 5
      }
    },
    rows: [
      localDomainRow(1, 'item', 'missing', 'Treasure Bag', 'The Underworld', 'From Wall of Flesh', 'evidence_boss_treasure_bag_projection', {
        bossLootCandidates: [{ bossInternalName: 'WallofFlesh', dropSourceKind: 'treasure_bag', lootRows: 10, sampleItems: ['DemonHeart'] }]
      }),
      localDomainRow(2, 'item', 'missing', 'Ninja armor', 'Forest', 'From the King Slime', 'evidence_armor_set_variant_needs_decision', {
        armorSetCandidates: [{ id: 96, sourceKey: 'ArmorSetBonus.Ninja', items: ['NinjaHood', 'NinjaShirt', 'NinjaPants'] }]
      }),
      localDomainRow(3, 'npc', 'ambiguous', 'Zombie', 'Forest', 'During the night', 'ambiguous_npc_variant_needs_decision', {
        npcExactMatches: [{ id: 3, internalName: 'Zombie' }, { id: 430, internalName: 'BigZombie' }]
      }),
      localDomainRow(4, 'npc', 'missing', 'Blue Dragonfly', 'Forest', 'Critters', 'missing_local_entity_needs_backfill'),
      localDomainRow(5, 'npc', 'missing', 'Cloud Slime', 'Forest', 'During the day', 'missing_local_entity_needs_backfill'),
      localDomainRow(6, 'item', 'missing', 'Mummy set', 'Desert', 'From Mummies', 'missing_local_entity_needs_backfill'),
      localDomainRow(7, 'item', 'missing', 'Obsidian furniture', 'The Underworld', 'From terrain', 'missing_local_entity_needs_backfill'),
      localDomainRow(8, 'item', 'missing', 'Shiren Hat', 'The Underworld', 'From Fire Imps', 'missing_local_entity_needs_backfill')
    ]
  };
}

function missingEvidenceReportFixture() {
  return {
    entity: 'biome_wikitext_missing_local_evidence_audit',
    generatedAt: '2026-06-02T07:00:00.000Z',
    sourceReportPath: '/tmp/local-domain.json',
    summary: {
      total: 5,
      byRecommendation: {
        normalized_internal_name_candidate: 1,
        weak_npc_family_candidate_needs_decision: 1,
        component_item_set_candidate: 1,
        item_family_candidate: 1,
        still_missing_after_local_evidence_audit: 1
      }
    },
    rows: [
      missingEvidenceRow(4, 'npc', 'Blue Dragonfly', 'Forest', 'Critters', 'normalized_internal_name_candidate', {
        normalizedNpcCandidates: [{ id: 596, internalName: 'BlueDragonfly' }],
        familyNpcCandidates: [{ id: 596, internalName: 'BlueDragonfly' }, { id: 599, internalName: 'RedDragonfly' }]
      }),
      missingEvidenceRow(5, 'npc', 'Cloud Slime', 'Forest', 'During the day', 'weak_npc_family_candidate_needs_decision', {
        familyNpcCandidates: [{ id: 1, internalName: 'BlueSlime' }]
      }),
      missingEvidenceRow(6, 'item', 'Mummy set', 'Desert', 'From Mummies', 'component_item_set_candidate', {
        componentItemCandidates: [{ id: 870, internalName: 'MummyMask' }, { id: 871, internalName: 'MummyShirt' }, { id: 872, internalName: 'MummyPants' }]
      }),
      missingEvidenceRow(7, 'item', 'Obsidian furniture', 'The Underworld', 'From terrain', 'item_family_candidate', {
        familyItemCandidates: [{ id: 1458, internalName: 'ObsidianDoor' }, { id: 1460, internalName: 'ObsidianTable' }]
      }),
      missingEvidenceRow(8, 'item', 'Shiren Hat', 'The Underworld', 'From Fire Imps', 'still_missing_after_local_evidence_audit')
    ]
  };
}

function localDomainRow(inputIndex, matchType, matchStatus, name, pageTitle, source, recommendation, evidence = {}) {
  return {
    inputIndex,
    original: {
      index: inputIndex,
      rowKey: `${pageTitle}:${matchType}:${matchStatus}:${name}:${inputIndex}`,
      biomeCode: pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      pageTitle,
      matchType,
      matchStatus,
      section: matchType === 'npc' ? 'Characters' : 'Unique Drops',
      source,
      name,
      note: null,
      candidateMatches: [],
      reviewCategory: matchStatus === 'ambiguous' ? 'ambiguous_variant_group_needs_user_decision' : 'local_missing_or_collection_gap',
      needsUserDecision: true
    },
    itemExactMatches: evidence.itemExactMatches ?? [],
    itemLikeMatches: evidence.itemLikeMatches ?? [],
    npcExactMatches: evidence.npcExactMatches ?? [],
    npcLikeMatches: evidence.npcLikeMatches ?? [],
    armorSetCandidates: evidence.armorSetCandidates ?? [],
    bossLootCandidates: evidence.bossLootCandidates ?? [],
    recommendation,
    evidenceOnly: true,
    needsUserDecision: true
  };
}

function missingEvidenceRow(inputIndex, matchType, name, pageTitle, source, recommendation, evidence = {}) {
  return {
    inputIndex,
    original: {
      index: inputIndex,
      rowKey: `${pageTitle}:${matchType}:missing:${name}:${inputIndex}`,
      biomeCode: pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      pageTitle,
      matchType,
      matchStatus: 'missing',
      section: 'Characters',
      source,
      name,
      note: null,
      candidateMatches: [],
      reviewCategory: 'local_missing_or_collection_gap',
      needsUserDecision: true
    },
    normalizedName: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    normalizedNpcCandidates: evidence.normalizedNpcCandidates ?? [],
    familyNpcCandidates: evidence.familyNpcCandidates ?? [],
    componentItemCandidates: evidence.componentItemCandidates ?? [],
    familyItemCandidates: evidence.familyItemCandidates ?? [],
    recommendation,
    evidenceOnly: true,
    needsUserDecision: true
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('buildBiomeWikitextPolicyRelationPlan classifies every unresolved row without write actions', () => {
  const report = buildBiomeWikitextPolicyRelationPlan({
    localDomainReport: localDomainReportFixture(),
    missingEvidenceReport: missingEvidenceReportFixture(),
    generatedAt: '2026-06-02T08:00:00.000Z',
    sourceReportPaths: {
      localDomain: '/tmp/local-domain.json',
      missingEvidence: '/tmp/missing-evidence.json'
    }
  });

  assert.equal(report.entity, 'biome_wikitext_policy_relation_plan');
  assert.equal(report.generatedAt, '2026-06-02T08:00:00.000Z');
  assert.equal(report.summary.total, 8);
  assert.deepEqual(report.rows.map((row) => row.inputIndex), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(report.rows.map((row) => row.policyAction), [
    'boss_treasure_bag_projection_only',
    'armor_set_relation_schema_needed',
    'ambiguous_npc_variant_policy_needed',
    'normalized_npc_candidate_policy_needed',
    'weak_npc_family_backfill_clue_only',
    'item_set_component_collection_schema_needed',
    'item_family_collection_schema_needed',
    'still_missing_entity_evidence_needed'
  ]);
  assert.deepEqual(report.summary.byPolicyAction, {
    boss_treasure_bag_projection_only: 1,
    armor_set_relation_schema_needed: 1,
    ambiguous_npc_variant_policy_needed: 1,
    normalized_npc_candidate_policy_needed: 1,
    weak_npc_family_backfill_clue_only: 1,
    item_set_component_collection_schema_needed: 1,
    item_family_collection_schema_needed: 1,
    still_missing_entity_evidence_needed: 1
  });
  assert.ok(report.rows.every((row) => row.evidenceOnly === true));
  assert.ok(report.rows.every((row) => row.needsUserDecision === true));
  assert.ok(report.rows.every((row) => row.dbWriteAction === 'none'));
  assert.ok(report.rows.every((row) => row.resolvedMapping === null));
  assert.equal(report.rows[0].targetSurface, 'boss_detail_loot_projection');
  assert.equal(report.rows[0].nextDecision, 'Keep Treasure Bag out of item_biomes; decide later only if a biome-boss context table is approved.');
  assert.equal(report.rows[1].targetSurface, 'biome_armor_sets');
  assert.equal(report.rows[5].targetSurface, 'biome_item_collections');
  assert.equal(validatePolicyRelationPlanReport(report).valid, true);
});

test('classifyPolicyAction maps local and missing evidence to conservative next actions', () => {
  assert.equal(classifyPolicyAction({ localDomainRow: { recommendation: 'evidence_boss_treasure_bag_projection' } }).policyAction, 'boss_treasure_bag_projection_only');
  assert.equal(classifyPolicyAction({ localDomainRow: { recommendation: 'evidence_armor_set_variant_needs_decision' } }).policyAction, 'armor_set_relation_schema_needed');
  assert.equal(classifyPolicyAction({ localDomainRow: { recommendation: 'ambiguous_npc_variant_needs_decision' } }).policyAction, 'ambiguous_npc_variant_policy_needed');
  assert.equal(classifyPolicyAction({ localDomainRow: { recommendation: 'missing_local_entity_needs_backfill' }, missingEvidenceRow: { recommendation: 'normalized_internal_name_candidate' } }).policyAction, 'normalized_npc_candidate_policy_needed');
  assert.equal(classifyPolicyAction({ localDomainRow: { recommendation: 'missing_local_entity_needs_backfill' }, missingEvidenceRow: { recommendation: 'weak_npc_family_candidate_needs_decision' } }).policyAction, 'weak_npc_family_backfill_clue_only');
  assert.equal(classifyPolicyAction({ localDomainRow: { recommendation: 'missing_local_entity_needs_backfill' }, missingEvidenceRow: { recommendation: 'component_item_set_candidate' } }).policyAction, 'item_set_component_collection_schema_needed');
  assert.equal(classifyPolicyAction({ localDomainRow: { recommendation: 'missing_local_entity_needs_backfill' }, missingEvidenceRow: { recommendation: 'item_family_candidate' } }).policyAction, 'item_family_collection_schema_needed');
  assert.equal(classifyPolicyAction({ localDomainRow: { recommendation: 'missing_local_entity_needs_backfill' }, missingEvidenceRow: { recommendation: 'still_missing_after_local_evidence_audit' } }).policyAction, 'still_missing_entity_evidence_needed');
});

test('parseArgs requires input reports and rejects apply/import-style options', () => {
  assert.throws(() => parseArgs([]), /--local-domain is required/);
  assert.throws(() => parseArgs(['--local-domain=a.json']), /--missing-evidence is required/);
  assert.throws(() => parseArgs(['--local-domain=a.json', '--missing-evidence=b.json', '--apply=true']), /Unknown option: --apply/);
  assert.deepEqual(parseArgs(['--local-domain=a.json', '--missing-evidence=b.json', '--output=c.json']), {
    localDomain: 'a.json',
    missingEvidence: 'b.json',
    output: 'c.json'
  });
});

test('buildBiomeWikitextPolicyRelationPlan rejects unsafe input merge contracts', () => {
  const localDomainReport = localDomainReportFixture();
  const missingEvidenceReport = missingEvidenceReportFixture();

  assert.throws(() => buildBiomeWikitextPolicyRelationPlan({
    localDomainReport: { ...localDomainReport, rows: [...localDomainReport.rows, clone(localDomainReport.rows[0])] },
    missingEvidenceReport
  }), /duplicate local-domain inputIndex 1/);

  assert.throws(() => buildBiomeWikitextPolicyRelationPlan({
    localDomainReport,
    missingEvidenceReport: { ...missingEvidenceReport, rows: [...missingEvidenceReport.rows, clone(missingEvidenceReport.rows[0])] }
  }), /duplicate missing-evidence inputIndex 4/);

  assert.throws(() => buildBiomeWikitextPolicyRelationPlan({
    localDomainReport,
    missingEvidenceReport: { ...missingEvidenceReport, rows: [...missingEvidenceReport.rows, missingEvidenceRow(99, 'npc', 'Extra Slime', 'Forest', 'Critters', 'weak_npc_family_candidate_needs_decision')] }
  }), /missing-evidence row 99 has no matching local-domain row/);

  const mismatched = clone(missingEvidenceReport);
  mismatched.rows[0].original.rowKey = 'wrong-row-key';
  assert.throws(() => buildBiomeWikitextPolicyRelationPlan({
    localDomainReport,
    missingEvidenceReport: mismatched
  }), /rowKey mismatch for inputIndex 4/);
});

test('validatePolicyRelationPlanReport rejects malformed rows and accidental write plans', () => {
  const report = buildBiomeWikitextPolicyRelationPlan({
    localDomainReport: localDomainReportFixture(),
    missingEvidenceReport: missingEvidenceReportFixture()
  });
  report.rows[0].dbWriteAction = 'insert';
  report.rows[1].resolvedMapping = { itemId: 1 };
  report.rows[2].needsUserDecision = false;
  report.rows[3].policyAction = 'made_up';
  report.rows[4].resolvedItemId = 596;
  report.rows[5].aliasMap = { 'Mummy set': ['MummyMask'] };
  report.rows[6].targetTable = 'item_biomes';
  report.rows[7].sql = 'INSERT INTO item_biomes';
  report.importPlan = [{ table: 'npc_biomes' }];
  report.apply = true;

  const result = validatePolicyRelationPlanReport(report);

  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /dbWriteAction must be none/);
  assert.match(result.issues.join('\n'), /resolvedMapping must be null/);
  assert.match(result.issues.join('\n'), /not marked for user decision/);
  assert.match(result.issues.join('\n'), /unsupported policyAction/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field importPlan/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field apply/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field rows\[4\]\.resolvedItemId/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field rows\[5\]\.aliasMap/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field rows\[6\]\.targetTable/);
  assert.match(result.issues.join('\n'), /forbidden write-intent field rows\[7\]\.sql/);
});

test('writePolicyRelationPlanReport writes JSON from existing reports only', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biome-policy-plan-'));
  const localDomainPath = path.join(dir, 'local-domain.json');
  const missingEvidencePath = path.join(dir, 'missing-evidence.json');
  const outputPath = path.join(dir, 'policy-plan.json');
  fs.writeFileSync(localDomainPath, `${JSON.stringify(localDomainReportFixture())}\n`, 'utf8');
  fs.writeFileSync(missingEvidencePath, `${JSON.stringify(missingEvidenceReportFixture())}\n`, 'utf8');

  const result = await writePolicyRelationPlanReport({
    localDomainPath,
    missingEvidencePath,
    outputPath,
    generatedAt: '2026-06-02T08:00:00.000Z'
  });
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(result.outputPath, outputPath);
  assert.equal(output.sourceReportPaths.localDomain, localDomainPath);
  assert.equal(output.sourceReportPaths.missingEvidence, missingEvidencePath);
  assert.equal(output.summary.total, 8);
  assert.equal(output.summary.dbWriteActions.none, 8);
});

test('script source has no DB, SQL write, network/process module, crawler/fetch/import/backfill/load script, or apply path', () => {
  const source = fs.readFileSync(new URL('./biome-wikitext-policy-relation-plan.mjs', import.meta.url), 'utf8');
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
    /scripts\/data\/(crawler|fetch|import|backfill|load)/i
  ];
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern);
  }
});
