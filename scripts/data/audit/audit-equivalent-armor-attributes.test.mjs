import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditEquivalentArmorAttributeRows,
  loadMysqlModule,
  parseArgs
} from './audit-equivalent-armor-attributes.mjs';

test('auditEquivalentArmorAttributeRows flags missing target rows and effect mismatches', () => {
  const result = auditEquivalentArmorAttributeRows({
    pairs: [
      { groupId: 'shadow_ancient_shadow', sourceInternalName: 'ShadowHelmet', targetInternalName: 'AncientShadowHelmet' }
    ],
    items: [
      { sourceId: 100, internalName: 'ShadowHelmet', defense: 6 },
      { sourceId: 956, internalName: 'AncientShadowHelmet', defense: 6 }
    ],
    armorRows: [
      { itemId: 100, itemInternalName: 'ShadowHelmet', defenseValue: 6 }
    ],
    effectRows: [
      { ownerId: 100, itemInternalName: 'ShadowHelmet', statKey: 'crit_chance', classScope: 'all', valueDecimal: 5, unit: 'percent' }
    ]
  });

  assert.deepEqual(result.issues.map((issue) => issue.reason), [
    'missing_target_armor_attribute_row',
    'missing_target_effect_rows'
  ]);
});

test('auditEquivalentArmorAttributeRows flags configured pairs with missing projection items', () => {
  const result = auditEquivalentArmorAttributeRows({
    pairs: [
      { groupId: 'shadow_ancient_shadow', sourceInternalName: 'ShadowHelmet', targetInternalName: 'AncientShadowHelmet' }
    ],
    items: [
      { sourceId: 100, internalName: 'ShadowHelmet', defense: 6 }
    ],
    armorRows: [],
    effectRows: []
  });

  assert.deepEqual(result.issues, [
    {
      groupId: 'shadow_ancient_shadow',
      source: 'ShadowHelmet',
      target: 'AncientShadowHelmet',
      reason: 'missing_target_projection_item'
    }
  ]);
  assert.equal(result.summary.checkedPairs, 0);
  assert.equal(result.summary.skippedPairs, 1);
});

test('auditEquivalentArmorAttributeRows compares projected item defense with armor attribute defense', () => {
  const result = auditEquivalentArmorAttributeRows({
    pairs: [
      { groupId: 'shadow_ancient_shadow', sourceInternalName: 'ShadowHelmet', targetInternalName: 'AncientShadowHelmet' }
    ],
    items: [
      { sourceId: 100, internalName: 'ShadowHelmet', defense: 6 },
      { sourceId: 956, internalName: 'AncientShadowHelmet', defense: 6 }
    ],
    armorRows: [
      { itemId: 100, itemInternalName: 'ShadowHelmet', defenseValue: 6 },
      { itemId: 956, itemInternalName: 'AncientShadowHelmet', defenseValue: 5 }
    ],
    effectRows: []
  });

  assert.deepEqual(result.issues.map((issue) => issue.reason), [
    'defense_value_mismatch',
    'target_item_defense_mismatch'
  ]);
});

test('auditEquivalentArmorAttributeRows accepts matching equivalent rows', () => {
  const result = auditEquivalentArmorAttributeRows({
    pairs: [
      { groupId: 'shadow_ancient_shadow', sourceInternalName: 'ShadowHelmet', targetInternalName: 'AncientShadowHelmet' }
    ],
    items: [
      { sourceId: 100, internalName: 'ShadowHelmet', defense: 6 },
      { sourceId: 956, internalName: 'AncientShadowHelmet', defense: 6 }
    ],
    armorRows: [
      { itemId: 100, itemInternalName: 'ShadowHelmet', defenseValue: 6 },
      { itemId: 956, itemInternalName: 'AncientShadowHelmet', defenseValue: 6 }
    ],
    effectRows: [
      { ownerId: 100, itemInternalName: 'ShadowHelmet', statKey: 'crit_chance', classScope: 'all', valueDecimal: 5, unit: 'percent' },
      { ownerId: 956, itemInternalName: 'AncientShadowHelmet', statKey: 'crit_chance', classScope: 'all', valueDecimal: 5, unit: 'percent' }
    ]
  });

  assert.deepEqual(result.issues, []);
  assert.equal(result.summary.checkedPairs, 1);
});

test('auditEquivalentArmorAttributeRows reports known unconfigured candidates without failing issues', () => {
  const result = auditEquivalentArmorAttributeRows({
    pairs: [],
    items: [
      { sourceId: 90, internalName: 'IronHelmet', defense: 2 },
      { sourceId: 954, internalName: 'AncientIronHelmet', defense: 2 },
      { sourceId: 92, internalName: 'GoldHelmet', defense: 4 },
      { sourceId: 955, internalName: 'AncientGoldHelmet', defense: 4 }
    ],
    armorRows: [
      { itemId: 90, itemInternalName: 'IronHelmet', defenseValue: 2 },
      { itemId: 954, itemInternalName: 'AncientIronHelmet', defenseValue: 2 },
      { itemId: 92, itemInternalName: 'GoldHelmet', defenseValue: 4 },
      { itemId: 955, itemInternalName: 'AncientGoldHelmet', defenseValue: 4 }
    ],
    effectRows: []
  });

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.observations.map((observation) => observation.reason), [
    'no_source_effect_rows',
    'no_source_effect_rows'
  ]);
  assert.deepEqual(result.observations.map((observation) => observation.target), [
    'AncientIronHelmet',
    'AncientGoldHelmet'
  ]);
});

test('loadMysqlModule falls back to an app package resolver when root mysql2 is unavailable', () => {
  const attempts = [];
  const mysqlModule = { createConnection: () => {} };
  const result = loadMysqlModule({
    rootRequire: (specifier) => {
      attempts.push(`root:${specifier}`);
      const error = new Error('missing');
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    },
    fallbackRequireFactory: (packageJsonPath) => {
      attempts.push(`fallback:${packageJsonPath}`);
      return (specifier) => {
        attempts.push(`fallback-require:${specifier}`);
        return mysqlModule;
      };
    }
  });

  assert.equal(result, mysqlModule);
  assert.deepEqual(attempts, [
    'root:mysql2/promise',
    'fallback:/home/lolben/.config/superpowers/worktrees/TerraPedia/main-merge-crafting-graph/data-query-app/package.json',
    'fallback-require:mysql2/promise'
  ]);
});

test('parseArgs exposes relation database and local host guard options', () => {
  assert.deepEqual(
    parseArgs(['--relation-database=terria_v1_relation_test', '--allow-non-local-db=true']),
    {
      relationDatabase: 'terria_v1_relation_test',
      allowNonLocalDb: true
    }
  );
});
