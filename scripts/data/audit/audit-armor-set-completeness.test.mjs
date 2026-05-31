import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArmorSetCompletenessReport,
  normalizeArmorLabel
} from './audit-armor-set-completeness.mjs';

const items = [
  item(4873, 'HallowedHood', 'Hallowed Hood'),
  item(4899, 'AncientHallowedHood', 'Ancient Hallowed Hood'),
  item(558, 'HallowedHelmet', 'Hallowed Helmet'),
  item(4898, 'AncientHallowedHelmet', 'Ancient Hallowed Helmet'),
  item(551, 'HallowedPlateMail', 'Hallowed Plate Mail'),
  item(552, 'HallowedGreaves', 'Hallowed Greaves'),
  item(4900, 'AncientHallowedPlateMail', 'Ancient Hallowed Plate Mail'),
  item(4901, 'AncientHallowedGreaves', 'Ancient Hallowed Greaves'),
  item(5660, 'HallowedCrown', 'Hallowed Crown'),
  item(371, 'CobaltHat', 'Cobalt Hat'),
  item(372, 'CobaltHelmet', 'Cobalt Helmet'),
  item(373, 'CobaltMask', 'Cobalt Mask'),
  item(374, 'CobaltBreastplate', 'Cobalt Breastplate'),
  item(375, 'CobaltLeggings', 'Cobalt Leggings'),
  item(376, 'MythrilHood', 'Mythril Hood'),
  item(377, 'MythrilHelmet', 'Mythril Helmet'),
  item(378, 'MythrilHat', 'Mythril Hat'),
  item(379, 'MythrilGreaves', 'Mythril Greaves'),
  item(400, 'AdamantiteHeadgear', 'Adamantite Headgear'),
  item(401, 'AdamantiteHelmet', 'Adamantite Helmet'),
  item(402, 'AdamantiteMask', 'Adamantite Mask'),
  item(403, 'AdamantiteLeggings', 'Adamantite Leggings'),
  item(733, 'RichMahoganyHelmet', 'Rich Mahogany Helmet'),
  item(734, 'RichMahoganyBreastplate', 'Rich Mahogany Breastplate'),
  item(735, 'RichMahoganyGreaves', 'Rich Mahogany Greaves')
];

test('normalizes armor labels for page and definition comparison', () => {
  assert.equal(normalizeArmorLabel('Ancient Hallowed Hood'), 'ancient hallowed hood');
  assert.equal(normalizeArmorLabel('Hallowed armor'), 'hallowed');
});

test('flags Hallowed split definition, missing page variant mapping, and unexpected nearby armor item', () => {
  const report = buildArmorSetCompletenessReport({
    wikiArmorSets: [{
      pageTitle: 'Hallowed armor',
      nameZh: '神圣盔甲',
      itemNames: ['Hallowed Helmet', 'Hallowed Plate Mail', 'Hallowed Greaves'],
      effectText: [
        'Hallowed Hood: +10% summon damage',
        'Hallowed Helmet: +15% ranged damage'
      ].join('\n'),
      interchangeableSetTitles: ['Ancient Hallowed armor']
    }],
    armorSets: [
      armorDefinition('ArmorSetBonus.Hallowed', [[558, 551, 552], [4898, 4900, 4901]]),
      armorDefinition('ArmorSetBonus.HallowedSummoner', [[4873, 551, 552], [4899, 4900, 4901]])
    ],
    definitionMap: {
      records: {
        1: {
          armorSetId: 1,
          name: '神圣盔甲',
          status: 'placeholder',
          itemIds: [558, 551, 552],
          definition: { textKey: 'ArmorSetBonus.Hallowed' }
        }
      }
    },
    items,
    itemPages: []
  });

  assertIssue(report, 'Hallowed armor', 'split_definition_not_mapped', {
    missingTextKeys: ['ArmorSetBonus.HallowedSummoner']
  });
  assertIssue(report, 'Hallowed armor', 'page_variant_label_missing_from_definition', {
    labels: ['Hallowed Hood']
  });
  assertIssue(report, 'Hallowed armor', 'definition_variant_missing_from_page_labels', {
    labels: ['Ancient Hallowed Helmet', 'Ancient Hallowed Hood']
  });
  assertIssue(report, 'Hallowed armor', 'unexpected_nearby_armor_item', {
    itemInternalNames: ['HallowedCrown']
  });
});

test('flags split placeholder risks for Cobalt, Mythril, and Adamantite families', () => {
  const report = buildArmorSetCompletenessReport({
    wikiArmorSets: [
      wikiSplitRow('Cobalt armor', 'Cobalt Hat\nCobalt Mask\nCobalt Helmet'),
      wikiSplitRow('Mythril armor', 'Mythril Hood\nMythril Hat\nMythril Helmet'),
      wikiSplitRow('Adamantite armor', 'Adamantite Headgear\nAdamantite Mask\nAdamantite Helmet')
    ],
    armorSets: [
      armorDefinition('ArmorSetBonus.CobaltCaster', [[0, 371, 374]]),
      armorDefinition('ArmorSetBonus.CobaltMelee', [[0, 372, 374]]),
      armorDefinition('ArmorSetBonus.CobaltRanged', [[0, 373, 374]]),
      armorDefinition('ArmorSetBonus.MythrilCaster', [[0, 376, 379]]),
      armorDefinition('ArmorSetBonus.MythrilMelee', [[0, 377, 379]]),
      armorDefinition('ArmorSetBonus.MythrilRanged', [[0, 378, 379]]),
      armorDefinition('ArmorSetBonus.AdamantiteCaster', [[0, 400, 403]]),
      armorDefinition('ArmorSetBonus.AdamantiteMelee', [[0, 401, 403]]),
      armorDefinition('ArmorSetBonus.AdamantiteRanged', [[0, 402, 403]])
    ],
    definitionMap: {
      records: {
        1: placeholderMap('Cobalt armor', 'ArmorSetBonus.CobaltCaster'),
        2: placeholderMap('Mythril armor', 'ArmorSetBonus.MythrilCaster'),
        3: placeholderMap('Adamantite armor', 'ArmorSetBonus.AdamantiteCaster')
      }
    },
    items,
    itemPages: []
  });

  for (const pageTitle of ['Cobalt armor', 'Mythril armor', 'Adamantite armor']) {
    assertIssue(report, pageTitle, 'split_definition_not_mapped');
    assertIssue(report, pageTitle, 'page_variant_label_missing_from_definition');
  }
});

test('flags interchangeable families that are present on the page but not collapsed in definitions', () => {
  const report = buildArmorSetCompletenessReport({
    wikiArmorSets: [{
      pageTitle: 'Hallowed armor',
      effectText: 'Every piece is interchangeable with Ancient Hallowed armor\nHallowed Hood\nAncient Hallowed Hood',
      interchangeableSetTitles: ['Ancient Hallowed armor']
    }],
    armorSets: [
      armorDefinition('ArmorSetBonus.HallowedSummoner', [[4873, 551, 552]]),
      armorDefinition('ArmorSetBonus.AncientHallowedSummoner', [[4899, 4900, 4901]])
    ],
    definitionMap: {
      records: {
        1: {
          armorSetId: 1,
          name: 'Hallowed armor',
          status: 'mapped',
          definition: { textKey: 'ArmorSetBonus.HallowedSummoner' }
        }
      }
    },
    items,
    itemPages: []
  });

  assertIssue(report, 'Hallowed armor', 'interchangeable_family_not_collapsed', {
    interchangeableSetTitles: ['Ancient Hallowed armor'],
    missingTextKeys: ['ArmorSetBonus.AncientHallowedSummoner']
  });
});

test('does not flag page-owned mapped armor pieces as unexpected nearby items', () => {
  const report = buildArmorSetCompletenessReport({
    wikiArmorSets: [{
      pageTitle: 'Rich Mahogany armor',
      nameZh: '红木盔甲',
      effectText: 'Set bonus: +1 defense',
      interchangeableSetTitles: []
    }],
    armorSets: [
      armorDefinition('ArmorSetBonus.Wood', [[733, 734, 735]])
    ],
    definitionMap: {
      records: {
        1: {
          armorSetId: 1,
          name: '红木盔甲',
          internalCode: '红木盔甲',
          status: 'mapped',
          itemIds: [733, 734, 735],
          definition: { textKey: 'ArmorSetBonus.Wood' }
        }
      }
    },
    items,
    itemPages: []
  });

  assert.equal(
    report.issues.some((issue) => issue.pageTitle === 'Rich Mahogany armor' && issue.code === 'unexpected_nearby_armor_item'),
    false
  );
});

function assertIssue(report, pageTitle, code, expected = {}) {
  const issue = report.issues.find((candidate) => candidate.pageTitle === pageTitle && candidate.code === code);
  assert.ok(issue, `expected ${code} for ${pageTitle}`);
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(issue[key], value);
  }
}

function item(id, internalName, name) {
  return { id, internalName, name };
}

function armorDefinition(textKey, sets) {
  return {
    textKey,
    benefitExpression: `ArmorSetBonuses.Benefits.${textKey.split('.').at(-1)}`,
    sets,
    uniqueItemIds: [...new Set(sets.flat())]
  };
}

function wikiSplitRow(pageTitle, effectText) {
  return { pageTitle, effectText, interchangeableSetTitles: [] };
}

function placeholderMap(name, textKey) {
  return {
    armorSetId: name,
    name,
    status: 'placeholder',
    definition: { textKey }
  };
}
