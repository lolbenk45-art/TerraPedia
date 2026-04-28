import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRelationTableCatalogMarkdown,
  getRelationTableDefinitions
} from './relation-table-catalog.mjs';

test('buildRelationTableCatalogMarkdown documents kept and deprecated relation tables', () => {
  const markdown = buildRelationTableCatalogMarkdown({
    generatedAt: '2026-04-26T00:00:00Z',
    tables: [
      {
        tableName: 'item_npc_shop_relations',
        rows: 293,
        status: 'kept',
        layer: 'fact',
        purpose: 'Formal NPC shop facts with structured conditions.',
        source: 'maint_item_sources',
        primaryKeys: ['record_key', 'source_fact_key'],
        notes: 'Canonical shop relation table.'
      },
      {
        tableName: 'item_npc_shop_candidates',
        rows: 293,
        status: 'removed',
        layer: 'deprecated',
        purpose: 'Legacy candidate mirror of NPC shop relations.',
        source: 'maint_item_sources',
        primaryKeys: ['record_key', 'source_fact_key'],
        notes: 'Removed because it duplicated the formal relation with lower signal.'
      }
    ]
  });

  assert.match(markdown, /# Relation Table Catalog/);
  assert.match(markdown, /item_npc_shop_relations/);
  assert.match(markdown, /status: kept/);
  assert.match(markdown, /item_npc_shop_candidates/);
  assert.match(markdown, /status: removed/);
});

test('getRelationTableDefinitions documents npc projectile audits', () => {
  const table = getRelationTableDefinitions()
    .find((entry) => entry.tableName === 'npc_projectile_audits');

  assert.ok(table);
  assert.equal(table.status, 'kept');
  assert.equal(table.layer, 'audit');
  assert.match(table.purpose, /NPC-to-projectile/);
  assert.ok(table.primaryKeys.includes('npc_internal_name'));
});
