import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCategoryRelations } from './category-relation-processor.mjs';

test('buildCategoryRelations emits nodes, assignments, and unmatched diagnostics', () => {
  const categoryRows = [
    {
      id: 1,
      record_key: 'c'.repeat(64),
      landing_source_id: 10,
      landing_source_key: 'wiki.categories',
      landing_content_hash: '1'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Consumables'
    }
  ];

  const itemCategoryRows = [
    {
      id: 101,
      record_key: 'a'.repeat(64),
      top_level: 'Consumables',
      template_title: 'Template:Master Template Consumables',
      section_title: 'Potions',
      group_name: 'Health',
      item_internal_name: 'LesserHealingPotion',
      item_english_name: 'Lesser Healing Potion',
      item_name: 'Lesser Healing',
      parent_item_name: null,
      depth: 0,
      is_group_node: 0,
      landing_source_id: 10,
      landing_source_key: 'wiki.categories',
      landing_content_hash: '1'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Consumables'
    },
    {
      id: 102,
      record_key: 'b'.repeat(64),
      top_level: 'Consumables',
      template_title: 'Template:Master Template Consumables',
      section_title: 'Utility',
      group_name: 'Basics',
      item_internal_name: 'LesserHealingPotion',
      item_english_name: 'Lesser Healing Potion',
      item_name: 'Lesser Healing',
      parent_item_name: null,
      depth: 0,
      is_group_node: 0,
      landing_source_id: 10,
      landing_source_key: 'wiki.categories',
      landing_content_hash: '1'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Consumables'
    },
    {
      id: 104,
      record_key: 'e'.repeat(64),
      top_level: 'Consumables',
      template_title: 'Template:Master Template Consumables',
      section_title: 'Potions',
      group_name: 'Health',
      item_internal_name: 'LesserHealingPotion',
      item_english_name: 'Lesser Healing Potion',
      item_name: 'Lesser Healing',
      parent_item_name: null,
      depth: 0,
      is_group_node: 0,
      landing_source_id: 10,
      landing_source_key: 'wiki.categories',
      landing_content_hash: '1'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Consumables'
    },
    {
      id: 103,
      record_key: 'd'.repeat(64),
      top_level: 'Consumables',
      template_title: 'Template:Master Template Consumables',
      section_title: 'Potions',
      group_name: 'Unknown',
      item_internal_name: null,
      item_english_name: null,
      item_name: 'Unknown Draft',
      parent_item_name: null,
      depth: 0,
      is_group_node: 0,
      landing_source_id: 10,
      landing_source_key: 'wiki.categories',
      landing_content_hash: '1'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Consumables'
    },
    {
      id: 105,
      record_key: 'f'.repeat(64),
      top_level: '***',
      template_title: 'Template:Master Template Consumables',
      section_title: '???',
      group_name: '!!!',
      item_internal_name: 'BrokenKeyItem',
      item_english_name: 'Broken Key Item',
      item_name: '###',
      parent_item_name: null,
      depth: 0,
      is_group_node: 0,
      landing_source_id: 10,
      landing_source_key: 'wiki.categories',
      landing_content_hash: '1'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Consumables'
    },
    {
      id: 106,
      record_key: '0'.repeat(64),
      top_level: 'Weapons',
      template_title: 'Template:Master Template Weapons',
      section_title: '???',
      group_name: 'Swords',
      item_internal_name: 'CopperBroadsword',
      item_english_name: 'Copper Broadsword',
      item_name: 'Copper Broadsword',
      parent_item_name: null,
      depth: 0,
      is_group_node: 0,
      landing_source_id: 11,
      landing_source_key: 'wiki.categories.weapons',
      landing_content_hash: '2'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Weapons'
    }
  ];

  const actual = buildCategoryRelations({ categoryRows, itemCategoryRows });

  assert.ok(actual.categoryNodes.length >= 4);
  const healthGroupNode = actual.categoryNodes.find((row) => row.pathText === 'Consumables > Potions > Health');
  assert.ok(healthGroupNode);
  assert.equal(healthGroupNode.isGroupNode, true);

  assert.equal(actual.itemCategoryAssignments.length, 2);
  assert.equal(actual.summary.unmatchedItems, 3);
  assert.equal(actual.summary.primaryAssignments, 1);
  assert.equal(actual.summary.secondaryAssignments, 1);
  assert.equal(
    actual.itemCategoryAssignments.filter((row) => row.categoryPathText === 'Consumables > Potions > Health > Lesser Healing').length,
    1
  );
  assert.ok(actual.itemCategoryAssignments.every((row) => row.categoryNodeKey.length > 0));
  assert.equal(actual.issues.length, 3);
  assert.ok(actual.issues.some((row) => row.itemName === 'Copper Broadsword'));

  const primaryAssignment = actual.itemCategoryAssignments.find((row) => row.isPrimary === true);
  const secondaryAssignment = actual.itemCategoryAssignments.find((row) => row.isPrimary === false);
  assert.ok(primaryAssignment);
  assert.ok(secondaryAssignment);
  assert.equal(primaryAssignment.categoryPathText, 'Consumables > Potions > Health > Lesser Healing');
  assert.equal(secondaryAssignment.categoryPathText, 'Consumables > Utility > Basics > Lesser Healing');
  assert.equal(primaryAssignment.sourceMaintRecordKey, 'a'.repeat(64));
});
