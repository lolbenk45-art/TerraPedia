import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAnyItemGroupSourceAudit,
  classifyItemGroupSource,
  extractAnyGroupNames,
  normalizeGroupKey,
} from './audit-any-item-group-sources.mjs';

test('classifyItemGroupSource separates generated, legacy override, central override, and unknown sources', () => {
  assert.equal(
    classifyItemGroupSource({
      sourceKind: 'generated_recipe_reference',
      sourceProvider: 'wiki_gg',
      sourceUrls: ['https://terraria.wiki.gg/wiki/Alternative_crafting_ingredients'],
    }),
    'source-backed',
  );
  assert.equal(
    classifyItemGroupSource({
      sourceKind: 'recipe_group_override',
      sourceFile: 'data/generated/recipe-group-overrides.json',
    }),
    'derived-from-source',
  );
  assert.equal(
    classifyItemGroupSource({
      sourceKind: 'manual_wiki_source',
      sourceProvider: 'wiki_gg',
      sourcePage: 'https://terraria.wiki.gg/wiki/Pylons',
    }),
    'source-backed',
  );
  assert.equal(classifyItemGroupSource({ sourceKind: 'local_override' }), 'local-only');
  assert.equal(classifyItemGroupSource({}), 'unknown');
});

test('buildAnyItemGroupSourceAudit reports duplicate groups, unresolved members, and consumer-only references', () => {
  const audit = buildAnyItemGroupSourceAudit({
    generatedAt: '2026-05-01T00:00:00.000Z',
    groupSources: [
      {
        sourceFile: 'data/generated/recipe-material-reference.json',
        sourceKind: 'generated_recipe_reference',
        defaultDomains: ['recipe'],
        root: {
          sourceType: 'wiki_gg_live_english_recipes',
          sourceUrls: ['https://terraria.wiki.gg/wiki/Alternative_crafting_ingredients'],
          groups: [
            {
              canonicalName: 'Any Wood',
              displayNameEn: 'Any Wood',
              members: [{ internalName: 'Wood' }],
            },
          ],
        },
      },
      {
        sourceFile: 'data/generated/recipe-group-overrides.json',
        sourceKind: 'recipe_group_override',
        defaultDomains: ['recipe'],
        root: {
          groups: [
            {
              canonicalName: 'Any Wood',
              displayNameEn: 'Any Wood',
              members: [{ name: 'Wood' }, { nameZh: '缺少英文名' }],
            },
          ],
        },
      },
      {
        sourceFile: 'data/generated/item-group-overrides.json',
        sourceKind: 'manual_wiki_source',
        defaultDomains: ['npc_shop'],
        root: {
          groups: [
            {
              canonicalName: 'Any Pylon',
              displayNameEn: 'Any Pylon',
              displayNameZh: '任意晶塔',
              domains: ['npc_shop', 'shimmer'],
              sourceProvider: 'wiki_gg',
              sourcePage: 'https://terraria.wiki.gg/wiki/Pylons',
              members: [{ internalName: 'TeleportationPylonPurity' }],
            },
          ],
        },
      },
    ],
    consumerReferences: [
      { consumer: 'npc_shop', canonicalName: 'Any Pylon', sourceFile: 'data/generated/npc-item-relations.bundle.json' },
      { consumer: 'shimmer', canonicalName: 'Any Torch', sourceFile: 'data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json' },
    ],
  });

  assert.equal(normalizeGroupKey(' Any   Wood '), 'any wood');
  assert.equal(audit.summary.totalGroups, 3);
  assert.equal(audit.summary.uniqueGroupKeys, 2);
  assert.equal(audit.summary.byClassification['source-backed'], 2);
  assert.equal(audit.summary.byClassification['derived-from-source'], 1);
  assert.equal(audit.summary.duplicateGroupKeys, 1);
  assert.equal(audit.summary.unresolvedMemberReferences, 1);
  assert.equal(audit.summary.consumerOnlyReferences, 1);

  assert.deepEqual(audit.duplicates.map((entry) => entry.canonicalName), ['Any Wood']);
  assert.equal(audit.groups.find((group) => group.canonicalName === 'Any Pylon').classification, 'source-backed');
  assert.deepEqual(
    audit.consumerOnlyReferences,
    [
      {
        canonicalName: 'Any Torch',
        consumers: ['shimmer'],
        sourceFiles: ['data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json'],
      },
    ],
  );
});

test('extractAnyGroupNames prefers exact structured JSON names over broad wikitext matches', () => {
  assert.deepEqual(
    extractAnyGroupNames(JSON.stringify({
      records: [
        { inputNameEn: 'Recorded Music Boxes' },
        { inputNameEn: 'Any Pylon' },
        { note: 'Any Pylon and Recorded Music Boxes appear again in raw text' },
      ],
    })),
    ['Any Pylon', 'Recorded Music Boxes'],
  );
});
