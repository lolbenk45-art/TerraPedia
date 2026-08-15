import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemsWithoutActiveSourcesReport,
  parseAuditItemsWithoutActiveSourcesArgs
} from './audit-items-without-active-sources.mjs';

function item(overrides = {}) {
  return {
    id: 1,
    internal_name: 'IronPickaxe',
    name: 'Iron Pickaxe',
    ...overrides
  };
}

test('parseAuditItemsWithoutActiveSourcesArgs rejects mutation flags', () => {
  assert.throws(
    () => parseAuditItemsWithoutActiveSourcesArgs(['--apply=true']),
    /read-only audit refuses mutation flag/
  );
  assert.throws(
    () => parseAuditItemsWithoutActiveSourcesArgs(['--sync=true']),
    /read-only audit refuses mutation flag/
  );
});

test('buildItemsWithoutActiveSourcesReport assigns one primary bucket per item', () => {
  const report = buildItemsWithoutActiveSourcesReport({
    generatedAt: '2026-06-11T00:00:00.000Z',
    items: [
      item({ id: 1, internal_name: 'HasLocal', name: 'Has Local' }),
      item({ id: 2, internal_name: 'RawOnly', name: 'Raw Only' }),
      item({ id: 3, internal_name: 'MaintOnly', name: 'Maint Only' }),
      item({ id: 4, internal_name: 'RecipeOnly', name: 'Recipe Only' }),
      item({ id: 5, internal_name: 'BiomeOnly', name: 'Biome Only' }),
      item({ id: 6, internal_name: 'NpcOnly', name: 'Npc Only' }),
      item({ id: 7, internal_name: 'Nothing', name: 'Nothing' }),
      item({ id: 8, internal_name: 'Exempt', name: 'Exempt' })
    ],
    activeSourceCounts: new Map([[1, 2]]),
    rawSourceInternalNames: new Set(['RawOnly']),
    maintSourceCounts: new Map([[3, 1]]),
    relationFactCounts: new Map([[3, 1]]),
    recipeItemIds: new Set([4]),
    biomeEvidenceItemIds: new Set([5]),
    npcRelationItemIds: new Set([6]),
    exemptions: new Map([[8, { rule: 'starter_tool_builtin', reportPath: 'data/reports/exemptions.md' }]])
  });

  assert.deepEqual(report.rows.map((row) => row.primaryBucket), [
    'local_source_already_present',
    'raw_source_chain_gap',
    'publication_chain_gap',
    'recipe_chain_covered',
    'biome_evidence_only',
    'npc_relation_chain_gap',
    'unclassified_no_source_evidence',
    'explicit_no_source_exemption'
  ]);
  assert.equal(new Set(report.rows.map((row) => row.itemId)).size, 8);
  assert.equal(report.summary.itemsWithoutActiveSources, 7);
  assert.equal(report.summary.unclassifiedNoSourceEvidence, 1);
  assert.equal(report.summary.exemptedNoSourceRequired, 1);
});

test('buildItemsWithoutActiveSourcesReport never exempts an item with evidence', () => {
  const report = buildItemsWithoutActiveSourcesReport({
    generatedAt: '2026-06-11T00:00:00.000Z',
    items: [item({ id: 9, internal_name: 'RecipeExempt', name: 'Recipe Exempt' })],
    recipeItemIds: new Set([9]),
    exemptions: new Map([[9, { rule: 'bad_exemption', reportPath: 'bad.md' }]])
  });

  assert.equal(report.rows[0].primaryBucket, 'recipe_chain_covered');
  assert.equal(report.rows[0].exemptionStatus, 'ignored_due_to_existing_evidence');
});

test('buildItemsWithoutActiveSourcesReport preserves item category fields for downstream lane breakdowns', () => {
  const report = buildItemsWithoutActiveSourcesReport({
    generatedAt: '2026-06-11T00:00:00.000Z',
    items: [
      item({
        id: 10,
        internal_name: 'BlueSlimeBanner',
        name: 'Blue Slime Banner',
        category_id: 5,
        category_code: 'FURNITURE',
        category_name: '家具'
      })
    ]
  });

  assert.equal(report.rows[0].categoryId, 5);
  assert.equal(report.rows[0].categoryCode, 'FURNITURE');
  assert.equal(report.rows[0].categoryName, '家具');
});
