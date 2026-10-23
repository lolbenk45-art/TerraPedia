import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PC_VERSION_UPDATE_MAPPING_RULES,
  mapPcVersionBulletin
} from './pc-version-update-mapping.mjs';
import { buildPcVersionIdentityCatalog } from './pc-version-update-identity-catalog.mjs';

function rule(id, alias, target) {
  return {
    id,
    aliases: [alias],
    target: {
      domain: 'items',
      entityType: 'item',
      stableIdentity: { kind: 'item_internal_name', value: target.internalName },
      displayName: target.displayName,
      impactFields: target.impactFields ?? ['stats.damage']
    }
  };
}

test('production mappings are explicit and empty until reviewed source evidence exists', () => {
  assert.deepEqual(PC_VERSION_UPDATE_MAPPING_RULES, []);
  const result = mapPcVersionBulletin({
    sectionTitle: 'Content Changes & Additions',
    text: "Last Prism's laser now fades out if used without enough mana."
  });
  assert.equal(result.mappingStatus, 'unmapped');
  assert.deepEqual(result.targets, []);
});

test('maps a unique Wiki link through the identity catalog without guessing impact fields', () => {
  const catalog = buildPcVersionIdentityCatalog({
    items: { generatedAt: '2026-06-04T00:00:00Z', records: [{ itemInternalName: 'LastPrism', itemName: 'Last Prism', pageTitle: 'Last Prism' }] }
  });
  const result = mapPcVersionBulletin({
    sectionTitle: 'Content Changes & Additions',
    rawText: '[[Last Prism]] now fades out when mana is low.',
    text: 'Last Prism now fades out when mana is low.',
    catalog
  });
  assert.equal(result.mappingStatus, 'mapped');
  assert.equal(result.impactStatus, 'unspecified_by_release_note');
  assert.deepEqual(result.targets[0].impactFields, []);
  assert.equal(result.targets[0].stableIdentity.value, 'LastPrism');
});

test('does not map an ambiguous Wiki link or a prose-only same-name mention', () => {
  const catalog = buildPcVersionIdentityCatalog({
    items: { records: [{ itemInternalName: 'KingSlime', itemName: 'King Slime', pageTitle: 'King Slime' }] },
    bosses: { records: [{ pageTitleEn: 'King Slime', titleEn: 'King Slime' }] }
  });
  const linked = mapPcVersionBulletin({ sectionTitle: 'Bug Fixes', rawText: 'Fixed [[King Slime]] behavior.', text: 'Fixed King Slime behavior.', catalog });
  assert.equal(linked.mappingStatus, 'unmapped');
  assert.equal(linked.mappingReason, 'ambiguous-wiki-title');
  const prose = mapPcVersionBulletin({ sectionTitle: 'Bug Fixes', text: 'Fixed King Slime behavior.', catalog });
  assert.equal(prose.mappingStatus, 'unmapped');
  assert.deepEqual(prose.targets, []);
});

test('ignores wiki links inside references, comments, and nowiki source text', () => {
  const catalog = buildPcVersionIdentityCatalog({
    items: { records: [{ itemInternalName: 'LastPrism', itemName: 'Last Prism', pageTitle: 'Last Prism' }] }
  });
  for (const rawText of [
    'Fixed the collision logic.<ref>Related: [[Last Prism]].</ref>',
    'Fixed the collision logic.<!-- [[Last Prism]] -->',
    'Fixed the collision logic. <nowiki>[[Last Prism]]</nowiki>'
  ]) {
    const result = mapPcVersionBulletin({ sectionTitle: 'Bug Fixes', rawText, text: 'Fixed the collision logic.', catalog });
    assert.equal(result.mappingStatus, 'unmapped');
    assert.deepEqual(result.targets, []);
  }
});

test('maps an exact reviewed alias to a stable internal identity and declared impact fields', () => {
  const result = mapPcVersionBulletin({
    sectionTitle: 'Content Changes & Additions',
    text: "Last Prism's laser now fades out if used without enough mana.",
    rules: [rule('last-prism-mana-use', 'Last Prism', {
      internalName: 'LastPrism',
      displayName: 'Last Prism',
      impactFields: ['stats.manaUse']
    })]
  });

  assert.equal(result.mappingStatus, 'mapped');
  assert.deepEqual(result.targets, [{
    domain: 'items',
    entityType: 'item',
    stableIdentity: { kind: 'item_internal_name', value: 'LastPrism' },
    displayName: 'Last Prism',
    impactFields: ['stats.manaUse'],
    mappingRuleIds: ['last-prism-mana-use'],
    matchedAliases: ['Last Prism']
  }]);
});

test('accepts only aliases explicitly provided by injected reviewed rules', () => {
  const result = mapPcVersionBulletin({
    sectionTitle: 'Bug Fixes',
    text: 'Fixed Acorn Slingshot collapsing the universe on hit.',
    rules: [rule('acorn-sling-shot', 'Oak Sling', {
      internalName: 'AcornSlingshot',
      displayName: 'Acorn Slingshot'
    })]
  });

  assert.equal(result.mappingStatus, 'unmapped');
  assert.deepEqual(result.targets, []);
});

test('maps a reviewed alternate name only when it appears in the rule aliases', () => {
  const result = mapPcVersionBulletin({
    sectionTitle: 'Bug Fixes',
    text: 'Fixed Rainbow Crystal Staff behavior.',
    rules: [rule('last-prism-alias', 'Rainbow Crystal Staff', {
      internalName: 'LastPrism',
      displayName: 'Last Prism',
      impactFields: ['stats.manaUse']
    })]
  });

  assert.equal(result.mappingStatus, 'mapped');
  assert.equal(result.targets[0].stableIdentity.value, 'LastPrism');
  assert.deepEqual(result.targets[0].matchedAliases, ['Rainbow Crystal Staff']);
});

test('one bulletin may map to multiple independently identified targets', () => {
  const result = mapPcVersionBulletin({
    sectionTitle: 'Bug Fixes',
    text: 'Fixed Acorn Slingshot and Mana Regeneration Band interactions.',
    rules: [
      rule('acorn-slingshot', 'Acorn Slingshot', {
        internalName: 'AcornSlingshot',
        displayName: 'Acorn Slingshot',
        impactFields: ['stats.damage']
      }),
      rule('mana-regeneration-band', 'Mana Regeneration Band', {
        internalName: 'ManaRegenerationBand',
        displayName: 'Mana Regeneration Band',
        impactFields: ['stats.manaRegen']
      })
    ]
  });

  assert.equal(result.mappingStatus, 'mapped');
  assert.deepEqual(result.targets.map((target) => target.stableIdentity.value), [
    'AcornSlingshot', 'ManaRegenerationBand'
  ]);
});

test('ambiguous aliases map nothing rather than choosing one target', () => {
  const result = mapPcVersionBulletin({
    sectionTitle: 'Bug Fixes',
    text: 'Fixed duplicate Alias behavior.',
    rules: [
      rule('first-alias', 'Alias', { internalName: 'FirstItem', displayName: 'First' }),
      rule('second-alias', 'Alias', { internalName: 'SecondItem', displayName: 'Second' })
    ]
  });

  assert.equal(result.mappingStatus, 'unmapped');
  assert.equal(result.mappingReason, 'ambiguous-alias');
  assert.deepEqual(result.targets, []);
});

test('generic and unknown bulletin text remains visible without a target', () => {
  for (const text of ['Fixed a certain exploit.', 'Fixed an issue.', 'Hopefully fixed something.']) {
    const result = mapPcVersionBulletin({ sectionTitle: 'Bug Fixes', text });
    assert.equal(result.mappingStatus, 'unmapped');
    assert.deepEqual(result.targets, []);
  }
});

test('rejects invalid injected rules instead of emitting unstable targets', () => {
  assert.throws(() => mapPcVersionBulletin({
    sectionTitle: 'Bug Fixes',
    text: 'Fixed an issue.',
    rules: [{ id: 'bad', aliases: ['issue'], target: { domain: 'items' } }]
  }), /stable identity|impact fields/i);
});
