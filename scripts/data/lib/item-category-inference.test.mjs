import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  STANDARDIZED_INFERENCE_MODE,
  inferCategoryFromStandardizedRecord,
  loadMountAllowlist,
} from './item-category-inference.mjs';

function mountCandidate(overrides = {}) {
  return {
    item: {
      internalName: 'DrillContainmentUnit',
      currentCategoryCode: 'MATERIAL',
      stackSize: 1,
      damage: 0,
      defense: 0,
      ...overrides.item,
    },
    itemPage: {
      entityType: 'item',
      itemInternalName: overrides.item?.internalName ?? 'DrillContainmentUnit',
      ...overrides.itemPage,
    },
    mountAllowlist: overrides.mountAllowlist ?? new Set(['DrillContainmentUnit']),
  };
}

test('exports standardized inference mode constant', () => {
  assert.equal(STANDARDIZED_INFERENCE_MODE, 'standardized_inference');
});

test('infers DrillContainmentUnit as high-confidence MOUNT from allowlist evidence', () => {
  const actual = inferCategoryFromStandardizedRecord(mountCandidate());

  assert.deepEqual(actual, {
    categoryCode: 'MOUNT',
    reason: 'standardized_inference:mount_allowlist',
    confidence: 'high',
    source: STANDARDIZED_INFERENCE_MODE,
    evidence: {
      internalName: 'DrillContainmentUnit',
      itemPageMatch: true,
      currentCategoryCode: 'MATERIAL',
      stackSize: 1,
      damage: 0,
      defense: 0,
      rule: 'mount_allowlist',
    },
    reportOnly: false,
  });
});

test('infers RatMountItem as high-confidence MOUNT from mount item suffix evidence', () => {
  const actual = inferCategoryFromStandardizedRecord(
    mountCandidate({
      item: { internalName: 'RatMountItem' },
      mountAllowlist: new Set(),
    })
  );

  assert.equal(actual?.categoryCode, 'MOUNT');
  assert.equal(actual?.reason, 'standardized_inference:mount_internal_suffix');
  assert.equal(actual?.confidence, 'high');
  assert.equal(actual?.evidence.rule, 'mount_internal_suffix');
});

test('infers mount saddles as high-confidence MOUNT from saddle suffix evidence', () => {
  const actual = inferCategoryFromStandardizedRecord(
    mountCandidate({
      item: { internalName: 'RoyalMountSaddle' },
      mountAllowlist: new Set(),
    })
  );

  assert.equal(actual?.categoryCode, 'MOUNT');
  assert.equal(actual?.reason, 'standardized_inference:mount_internal_suffix');
  assert.equal(actual?.evidence.rule, 'mount_internal_suffix');
});

test('does not infer common non-mount items or low-confidence combat/equipment records', () => {
  const falsePositiveCases = [
    { item: { internalName: 'Carrot' } },
    { item: { internalName: 'IceSkates' } },
    { item: { internalName: 'DrillContainmentUnit', stackSize: 99 } },
    { item: { internalName: 'DrillContainmentUnit', damage: 12 } },
    { item: { internalName: 'DrillContainmentUnit', defense: 3 } },
  ];

  for (const fixture of falsePositiveCases) {
    const actual = inferCategoryFromStandardizedRecord(mountCandidate(fixture));
    assert.equal(actual, null, fixture.item.internalName);
  }
});

test('only infers from current MATERIAL category records', () => {
  const actual = inferCategoryFromStandardizedRecord(
    mountCandidate({
      item: {
        currentCategoryCode: 'CONSUMABLE',
      },
    })
  );

  assert.equal(actual, null);
});

test('requires exact case-sensitive item page metadata match', () => {
  assert.equal(
    inferCategoryFromStandardizedRecord(
      mountCandidate({
        itemPage: { itemInternalName: 'drillContainmentUnit' },
      })
    ),
    null
  );

  assert.equal(
    inferCategoryFromStandardizedRecord(
      mountCandidate({
        itemPage: { entityType: 'npc' },
      })
    ),
    null
  );
});

test('supports snake_case database row fields', () => {
  const actual = inferCategoryFromStandardizedRecord({
    item: {
      internal_name: 'DrillContainmentUnit',
      current_category_code: 'MATERIAL',
      stack_size: 1,
      damage: 0,
      defense: 0,
    },
    itemPage: {
      entity_type: 'item',
      item_internal_name: 'DrillContainmentUnit',
    },
    mountAllowlist: new Set(['DrillContainmentUnit']),
  });

  assert.equal(actual?.categoryCode, 'MOUNT');
  assert.equal(actual?.source, STANDARDIZED_INFERENCE_MODE);
});

test('supports standardized categoryCode and database category_code aliases', () => {
  assert.equal(
    inferCategoryFromStandardizedRecord(
      mountCandidate({
        item: {
          categoryCode: 'MATERIAL',
          currentCategoryCode: undefined,
        },
      })
    )?.categoryCode,
    'MOUNT'
  );

  assert.equal(
    inferCategoryFromStandardizedRecord({
      item: {
        internal_name: 'DrillContainmentUnit',
        category_code: 'MATERIAL',
        stack_size: 1,
        damage: 0,
        defense: 0,
      },
      itemPage: {
        entity_type: 'item',
        item_internal_name: 'DrillContainmentUnit',
      },
      mountAllowlist: new Set(['DrillContainmentUnit']),
    })?.categoryCode,
    'MOUNT'
  );
});

test('supports nested standardized stack and stats fields', () => {
  const actual = inferCategoryFromStandardizedRecord({
    item: {
      internalName: 'DrillContainmentUnit',
      categoryCode: 'MATERIAL',
      stack: { stackSize: 1 },
      stats: { damage: 0, defense: 0 },
    },
    itemPage: {
      entityType: 'item',
      itemInternalName: 'DrillContainmentUnit',
    },
    mountAllowlist: new Set(['DrillContainmentUnit']),
  });

  assert.equal(actual?.categoryCode, 'MOUNT');
  assert.equal(actual?.evidence.stackSize, 1);
  assert.equal(actual?.evidence.damage, 0);
  assert.equal(actual?.evidence.defense, 0);
});

test('returns null when required record inputs are absent', () => {
  assert.equal(inferCategoryFromStandardizedRecord(), null);
  assert.equal(inferCategoryFromStandardizedRecord({ item: null, itemPage: null }), null);
  assert.equal(inferCategoryFromStandardizedRecord({ item: {}, itemPage: {} }), null);
});

test('loads mount allowlist from an explicit config path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-allowlist-'));
  const configPath = path.join(tempDir, 'mount-allowlist.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      version: '1.0.0',
      items: ['DrillContainmentUnit', 'RatMountItem'],
    }),
    'utf8'
  );

  const actual = loadMountAllowlist({ configPath });

  assert.equal(actual instanceof Set, true);
  assert.deepEqual([...actual], ['DrillContainmentUnit', 'RatMountItem']);
});

test('loads mount allowlist relative to an explicit repo root', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-allowlist-root-'));
  const configDir = path.join(tempDir, 'data', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'mount-allowlist.json'),
    JSON.stringify({ items: ['WitchBroom'] }),
    'utf8'
  );

  assert.deepEqual([...loadMountAllowlist({ repoRoot: tempDir })], ['WitchBroom']);
});

test('throws descriptive errors for invalid mount allowlist config files', () => {
  const missingPath = path.join(os.tmpdir(), `missing-mount-allowlist-${process.pid}.json`);
  assert.throws(
    () => loadMountAllowlist({ configPath: missingPath }),
    /Mount allowlist config not found/
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-allowlist-invalid-'));
  const invalidJsonPath = path.join(tempDir, 'invalid.json');
  fs.writeFileSync(invalidJsonPath, '{not json', 'utf8');
  assert.throws(
    () => loadMountAllowlist({ configPath: invalidJsonPath }),
    /Invalid mount allowlist JSON/
  );

  const missingItemsPath = path.join(tempDir, 'missing-items.json');
  fs.writeFileSync(missingItemsPath, JSON.stringify({ version: '1.0.0' }), 'utf8');
  assert.throws(
    () => loadMountAllowlist({ configPath: missingItemsPath }),
    /Mount allowlist config must include an items array/
  );

  const nonStringPath = path.join(tempDir, 'non-string.json');
  fs.writeFileSync(nonStringPath, JSON.stringify({ items: ['SlimySaddle', 42] }), 'utf8');
  assert.throws(
    () => loadMountAllowlist({ configPath: nonStringPath }),
    /Mount allowlist item at index 1 must be a string/
  );
});
