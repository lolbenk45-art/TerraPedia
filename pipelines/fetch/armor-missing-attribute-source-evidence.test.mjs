import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArmorMissingAttributeSourceEvidence,
  ARMOR_MISSING_ATTRIBUTE_TARGETS,
} from './armor-missing-attribute-source-evidence.mjs';

function iteminfoPayload() {
  return {
    pageTitle: 'Module:Iteminfo/data',
    pageId: 18021,
    revisionId: 1023241,
    revisionTimestamp: '2026-08-22T03:26:22Z',
    wikitext: `return { ["data"] = [=====[${JSON.stringify({
      954: { internalName: 'AncientIronHelmet', name: 'Ancient Iron Helmet', defense: 2, headSlot: 72 },
      5524: { internalName: 'ChlorophyteVisor', name: 'Chlorophyte Visor', defense: 2, headSlot: 283 },
      5588: { internalName: 'UpgradedMiningHead', name: 'Prospector Helmet', defense: 10, headSlot: 285 },
      5591: { internalName: 'UpgradedFishingHead', name: 'Captain Hat', defense: 10, headSlot: 286 },
    })}]=====] }`,
  };
}

function page(itemId, internalName, itemPageTitle, body) {
  return {
    itemSourceId: itemId,
    internalName,
    requestedPageTitle: itemPageTitle,
    payload: {
      pageTitle: itemPageTitle,
      pageId: 70000 + itemId,
      revisionId: 200000 + itemId,
      revisionTimestamp: '2026-10-05T00:00:00Z',
      wikitext: `{{item infobox\n| auto = ${itemId}\n}}\n${body}`,
      html: `<p>${itemPageTitle}</p>`,
    },
  };
}

test('missing Armor attribute evidence separates item facts from set-owned effects', () => {
  const result = buildArmorMissingAttributeSourceEvidence({
    armorOverview: {
      pageTitle: 'Armor',
      pageId: 9405,
      revisionId: 1032721,
      revisionTimestamp: '2026-10-02T01:42:32Z',
      wikitext: `
|-
| [[File:Prospector armor.png]]
| {{item|mode=text|wrap=y|Prospector armor}}
| style="text-align:center" | 10
| style="text-align:center" | 12
| style="text-align:center" | 11
| style="text-align:center" | 33
| class="small" |
* +20% [[mining speed]]
* '''Set Bonus:''' +10% mining speed (+30% total)
* '''Effect:''' Helmet piece emits light
`,
    },
    iteminfo: iteminfoPayload(),
    itemPages: [
      page(5588, 'UpgradedMiningHead', 'Prospector Helmet', "'''Prospector armor'''")
    ],
    targetIds: [5588],
  });

  assert.equal(result.schemaVersion, 'armor-missing-attribute-source-evidence/v1');
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.records[0].identity, {
    itemSourceId: 5588,
    internalName: 'UpgradedMiningHead',
    itemName: 'Prospector Helmet',
    slotGroup: 'head',
    defenseValue: 10,
  });
  assert.deepEqual(result.records[0].itemScopedFacts, [{
    statKey: 'miningSpeed', valueDecimal: 20, unit: 'percent', operation: 'add',
  }]);
  assert.deepEqual(result.records[0].setOwnedFacts, [
    '+10% mining speed (+30% total)',
    'Helmet piece emits light',
  ]);
});

test('missing Armor attribute evidence rejects an Iteminfo identity or slot mismatch', () => {
  assert.throws(() => buildArmorMissingAttributeSourceEvidence({
    armorOverview: {
      pageTitle: 'Armor', pageId: 9405, revisionId: 1032721,
      revisionTimestamp: '2026-10-02T01:42:32Z',
      wikitext: '|-\n| {{item|mode=text|wrap=y|Prospector armor}}\n| style="text-align:center" | 10\n| style="text-align:center" | 12\n| style="text-align:center" | 11\n| style="text-align:center" | 33\n| class="small" |\n* +20% [[mining speed]]',
    },
    iteminfo: iteminfoPayload(),
    itemPages: [page(5588, 'WrongName', 'Prospector Helmet', "'''Prospector armor'''")],
    targetIds: [5588],
  }), /identity|internalName|slot/i);
});

test('missing Armor attribute evidence does not assign other Chlorophyte variants to the Visor', () => {
  const result = buildArmorMissingAttributeSourceEvidence({
    armorOverview: {
      pageTitle: 'Armor', pageId: 9405, revisionId: 1032721,
      revisionTimestamp: '2026-10-02T01:42:32Z',
      wikitext: `
|-
| [[File:Chlorophyte armor.png]]
| {{item|mode=text|wrap=y|Chlorophyte armor}}
| '''Summon:''' 2<br/>'''Magic:''' 7<br/>'''Ranged:''' 13<br/>'''Melee:''' 20
| 18
| 13
| 38
| class="small" |
* +5% damage
* '''Chlorophyte Visor:''' +16% summon damage, +1 minion capacity
** '''Set Bonus:''' +2 minion capacity (+3 total)
* '''Chlorophyte Headgear:''' +16% magic damage
* '''Set Bonus:''' Causes a leaf crystal to permanently appear
`,
    },
    iteminfo: iteminfoPayload(),
    itemPages: [page(5524, 'ChlorophyteVisor', 'Chlorophyte Visor', "{{item infobox\n| auto = 5524\n}}")],
    targetIds: [5524],
  });

  assert.deepEqual(result.records[0].setOwnedFacts, [
    '+5% damage',
    '+2 minion capacity (+3 total)',
    'Causes a leaf crystal to permanently appear',
  ]);
});

test('target list remains the nine currently missing attribute owners', () => {
  assert.deepEqual(ARMOR_MISSING_ATTRIBUTE_TARGETS.map(target => target.itemSourceId),
    [954, 955, 5524, 5588, 5589, 5590, 5591, 5592, 5593]);
});
