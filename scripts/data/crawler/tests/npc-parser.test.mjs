import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractNpcHappiness,
  extractNpcLeadSummary,
  extractNpcInfobox,
  extractNpcLoot,
  extractNpcSectionBlocks,
  extractNpcShop,
  extractNpcSpecialForms
} from '../src/domains/npc-parser.mjs';
import { normalizeNpcLootRows } from '../src/domains/npc-loot-parser.mjs';
import { normalizeNpcShopRows } from '../src/domains/npc-shop-normalizer.mjs';

const SAMPLE = `{{npc infobox
| type = NPC
| type2 = Goblin
| environment = Cavern/Valid house
| damage = {{modes|15|22|26}}
| damage2 = Spiky Ball
| idprojectile = 24
}}
'''Goblin Tinkerer''' is a helpful NPC who can reforge items.

{{Lifeform Analyzer note|Bound Goblin}}

== Tips ==
* Tip line

== History ==
{{history|Desktop 1.4.4|Added Rubblemaker.}}

{{NPC shimmered form|Goblin Tinkerer|male}}

== Dialogue ==
* Line one`;

const PAGE_DESCRIPTION_FALLBACK = 'Fallback derived from the page description.';
const NO_INFOBOX_SAMPLE = '';
const UNFINISHED_INFOBOX_SAMPLE = `{{npc infobox
| type = NPC
| type2 = Goblin
| environment = Cavern
| damage = {{modes|1|2|3}}
| damage2 = Spiky Ball

Goblin summary after an unfinished infobox.

== Tips ==
* Tip line`;
const INFBOX_MULTILINE_SAMPLE = `{{npc infobox
| type = NPC
| type2 = Goblin
| environment = Cavern
| damage = {{modes|5|10|15}}
| damage2 = Spiky
 Ball
| idprojectile = 77
}}
Intro text`;

test('extractNpcLeadSummary prefers the first readable paragraph', () => {
  assert.equal(
    extractNpcLeadSummary({ pageDescription: '', revisionText: SAMPLE }),
    'Goblin Tinkerer is a helpful NPC who can reforge items.'
  );
});

const INFBOX_INLINE_CLOSING_SAMPLE = `{{npc infobox
| type = NPC
| type2 = Goblin
| environment = Cavern
| damage = {{modes|8|16|23}}
| damage2 = Spiky Ball
| id projectile = 13}}
More text`;

const INFBOX_WHITESPACE_CLOSE_SAMPLE = `{{npc infobox
| type = NPC
| type2 = Goblin
| environment = Cavern
| damage = {{modes|5|10|15}}
| damage2 = Spiky Ball
| id projectile = 42
  }}
Intro`;

const LINKED_LEAD_SAMPLE = `[[Linked Goblin]] tinkers with gadgets.
== Tips ==
* Tip line`;
const MEDUSA_NOISE_SAMPLE = `[[File:Medusa (demo).gif|frame|Medusa turning a player into stone.]]
{{dablink|Not to be confused with [[Mechdusa]], a secret world seed-exclusive boss.}}

'''Medusa''' is a [[Hardmode]] [[Enemies|enemy]] found near [[Marble Cave]]s, and is a relatively fast-moving melee attacker.
* The player will be unable to move or use items for the duration of the debuff.

{{Lifeform Analyzer note|She}}`;

test('extractNpcLeadSummary prefers revisionText over pageDescription', () => {
  assert.equal(
    extractNpcLeadSummary({
      pageDescription: 'Fallback paragraph from description.',
      revisionText: SAMPLE
    }),
    'Goblin Tinkerer is a helpful NPC who can reforge items.'
  );
});

test('extractNpcLeadSummary falls back to pageDescription when no infobox content exists', () => {
  assert.equal(
    extractNpcLeadSummary({
      pageDescription: PAGE_DESCRIPTION_FALLBACK,
      revisionText: NO_INFOBOX_SAMPLE
    }),
    PAGE_DESCRIPTION_FALLBACK
  );
});

test('extractNpcLeadSummary keeps text that follows an unfinished infobox', () => {
  assert.equal(
    extractNpcLeadSummary({ pageDescription: PAGE_DESCRIPTION_FALLBACK, revisionText: UNFINISHED_INFOBOX_SAMPLE }),
    'Goblin summary after an unfinished infobox.'
  );
});

test('extractNpcLeadSummary keeps linked intro before the first heading', () => {
  assert.equal(
    extractNpcLeadSummary({ pageDescription: '', revisionText: LINKED_LEAD_SAMPLE }),
    '[[Linked Goblin]] tinkers with gadgets.'
  );
});

test('extractNpcLeadSummary skips file and dablink noise blocks before the first readable paragraph', () => {
  assert.equal(
    extractNpcLeadSummary({ pageDescription: '', revisionText: MEDUSA_NOISE_SAMPLE }),
    "Medusa is a [[Hardmode]] [[Enemies|enemy]] found near [[Marble Cave]]s, and is a relatively fast-moving melee attacker."
  );
});

test('extractNpcInfobox returns the first infobox fields as text', () => {
  assert.deepEqual(extractNpcInfobox(SAMPLE), {
    baseDamageText: '{{modes|15|22|26}}',
    buffInflictions: [],
    environment: ['Cavern', 'Valid house'],
    extraDamageText: 'Spiky Ball',
    kind: 'NPC',
    projectileId: '24',
    subtypes: ['Goblin']
  });
});

test('extractNpcSpecialForms returns shimmer and bound-state hints', () => {
  assert.deepEqual(extractNpcSpecialForms(SAMPLE), {
    boundVariantName: 'Bound Goblin',
    shimmerForm: {
      args: ['Goblin Tinkerer', 'male'],
      present: true
    }
  });
});

test('extractNpcInfobox tolerates inline closing braces and field-name whitespace', () => {
  assert.deepEqual(extractNpcInfobox(INFBOX_INLINE_CLOSING_SAMPLE), {
    baseDamageText: '{{modes|8|16|23}}',
    buffInflictions: [],
    environment: ['Cavern'],
    extraDamageText: 'Spiky Ball',
    kind: 'NPC',
    projectileId: '13',
    subtypes: ['Goblin']
  });
});

test('extractNpcInfobox tolerates closing lines that contain only whitespace and braces', () => {
  assert.deepEqual(extractNpcInfobox(INFBOX_WHITESPACE_CLOSE_SAMPLE), {
    baseDamageText: '{{modes|5|10|15}}',
    buffInflictions: [],
    environment: ['Cavern'],
    extraDamageText: 'Spiky Ball',
    kind: 'NPC',
    projectileId: '42',
    subtypes: ['Goblin']
  });
});

test('extractNpcInfobox preserves multi-line values for a field', () => {
  assert.deepEqual(extractNpcInfobox(INFBOX_MULTILINE_SAMPLE), {
    baseDamageText: '{{modes|5|10|15}}',
    buffInflictions: [],
    environment: ['Cavern'],
    extraDamageText: 'Spiky Ball',
    kind: 'NPC',
    projectileId: '77',
    subtypes: ['Goblin']
  });
});

test('extractNpcSectionBlocks captures stable named sections', () => {
  assert.deepEqual(extractNpcSectionBlocks(SAMPLE), {
    dialogue: '* Line one',
    history: '{{history|Desktop 1.4.4|Added Rubblemaker.}}',
    tips: '* Tip line'
  });
});

test('extractNpcSpecialForms ignores pronoun-only lifeform notes', () => {
  assert.deepEqual(extractNpcSpecialForms(MEDUSA_NOISE_SAMPLE), {
    boundVariantName: undefined,
    shimmerForm: {
      args: [],
      present: false
    }
  });
});

test('extractNpcShop keeps item name, valueText, and availability note', () => {
  const sample = '{{shop|{{shop row|Rocket Boots|value=5|Sold after Goblin Army}}}}';
  assert.deepEqual(extractNpcShop(sample), {
    items: [
      {
        name: 'Rocket Boots',
        valueText: '5',
        availabilityNote: 'Sold after Goblin Army'
      }
    ]
  });
});

test('extractNpcInfobox captures infobox debuffs and durations', () => {
  const sample = `{{npc infobox
| type = Enemy
| environment = Marble Cave
| debuff = [[Stoned]]
| debuffduration = {{duration|rawseconds=1-4}}
| debuff2 = Poisoned
| debuffduration2 = 5 seconds
}}`;

  assert.deepEqual(extractNpcInfobox(sample).buffInflictions, [
    {
      buffName: 'Stoned',
      durationText: '{{duration|rawseconds=1-4}}',
      rawBuffText: '[[Stoned]]',
      sourceField: 'debuff',
      durationField: 'debuffduration',
      sourceSection: 'infobox'
    },
    {
      buffName: 'Poisoned',
      durationText: '5 seconds',
      rawBuffText: 'Poisoned',
      sourceField: 'debuff2',
      durationField: 'debuffduration2',
      sourceSection: 'infobox'
    }
  ]);
});

test('extractNpcInfobox ignores inline debuff metadata when naming the debuff', () => {
  const sample = `{{npc infobox
| type = Boss
| debuff = Bleeding | debuffmode = expert
| debuffduration = {{duration|rawseconds=6-10}}
}}`;

  assert.equal(extractNpcInfobox(sample).buffInflictions[0].buffName, 'Bleeding');
});

test('extractNpcInfobox captures debuffs from secondary NPC infoboxes on group pages', () => {
  const sample = [
    '{{npc infobox',
    '| auto = 125',
    '| name = The Twins',
    '}}',
    '|{{npc infobox',
    '| auto = 126',
    '| image = Spazmatism (first form).gif',
    '| debuff = Cursed Inferno',
    '| debuffchance = 68.75%',
    '| debuffduration = {{duration|rawseconds=2-3}}',
    '}}'
  ].join('\n');

  assert.deepEqual(extractNpcInfobox(sample).buffInflictions, [
    {
      buffName: 'Cursed Inferno',
      durationText: '{{duration|rawseconds=2-3}}',
      rawBuffText: 'Cursed Inferno',
      sourceField: 'debuff',
      durationField: 'debuffduration',
      sourceSection: 'infobox',
      sourceInfobox: {
        autoId: '126',
        image: 'Spazmatism (first form).gif',
        name: ''
      }
    }
  ]);
});

test('extractNpcInfobox preserves an incomplete first infobox when a later balanced infobox exists', () => {
  const sample = [
    '{{npc infobox',
    '| auto = 525',
    '| name = Vile Ghoul',
    '| debuff = Cursed Inferno',
    '',
    '{{npc infobox',
    '| auto = 526',
    '| name = Tainted Ghoul',
    '| debuff = Ichor',
    '| debuffduration = 5 seconds',
    '}}'
  ].join('\n');

  assert.deepEqual(extractNpcInfobox(sample).buffInflictions, [
    {
      buffName: 'Cursed Inferno',
      durationText: '',
      rawBuffText: 'Cursed Inferno',
      sourceField: 'debuff',
      durationField: '',
      sourceSection: 'infobox',
      sourceInfobox: {
        autoId: '525',
        image: '',
        name: 'Vile Ghoul'
      }
    },
    {
      buffName: 'Ichor',
      durationText: '5 seconds',
      rawBuffText: 'Ichor',
      sourceField: 'debuff',
      durationField: 'debuffduration',
      sourceSection: 'infobox',
      sourceInfobox: {
        autoId: '526',
        image: '',
        name: 'Tainted Ghoul'
      }
    }
  ]);
});

test('extractNpcShop keeps rows with nested value templates', () => {
  const sample = [
    '{{shop|',
    '{{shop row|Mining Helmet|value={{gc|4}}|Always}}',
    '{{shop row|Valentine Ring|value={{gc|1}}|During [[Valentine\'s Day]]}}',
    '{{shop row|Wiesnbräu|value={{coin|9|95}}|During [[Oktoberfest]]}}',
    '{{shop row|Turkey feather|value={{gc|10}}|During [[Thanksgiving]]}}',
    '{{shop row|Heart Arrow|value={{cc|50}}|During [[Valentine\'s Day]]}}',
    '{{shop row|Festive top hat|value={{gc|1}}|During [[Christmas]]}}',
    '}}'
  ].join('\n');

  assert.deepEqual(extractNpcShop(sample), {
    items: [
      {
        name: 'Mining Helmet',
        valueText: '{{gc|4}}',
        availabilityNote: 'Always'
      },
      {
        name: 'Valentine Ring',
        valueText: '{{gc|1}}',
        availabilityNote: "During [[Valentine's Day]]"
      },
      {
        name: 'Wiesnbräu',
        valueText: '{{coin|9|95}}',
        availabilityNote: 'During [[Oktoberfest]]'
      },
      {
        name: 'Turkey feather',
        valueText: '{{gc|10}}',
        availabilityNote: 'During [[Thanksgiving]]'
      },
      {
        name: 'Heart Arrow',
        valueText: '{{cc|50}}',
        availabilityNote: "During [[Valentine's Day]]"
      },
      {
        name: 'Festive top hat',
        valueText: '{{gc|1}}',
        availabilityNote: 'During [[Christmas]]'
      }
    ]
  });
});

test('normalizeNpcShopRows maps raw shop rows to NPC item relation evidence', () => {
  assert.deepEqual(
    normalizeNpcShopRows(
      [
        {
          item: 'Rocket Boots',
          price: '5 gold',
          condition: 'Sold after Goblin Army',
          sourceSection: 'shop'
        },
        { item: '', price: '1 silver' }
      ],
      { npcInternalName: 'GoblinTinkerer', npcName: 'Goblin Tinkerer' }
    ),
    [
      {
        relationType: 'shop',
        itemName: 'Rocket Boots',
        priceText: '5 gold',
        conditionText: 'Sold after Goblin Army',
        npcInternalName: 'GoblinTinkerer',
        npcName: 'Goblin Tinkerer',
        sourceSection: 'shop',
        sourceRowIndex: 0,
        raw: {
          item: 'Rocket Boots',
          price: '5 gold',
          condition: 'Sold after Goblin Army',
          sourceSection: 'shop'
        }
      }
    ]
  );
});

test('extractNpcLoot parses drop table evidence from NPC page wikitext', () => {
  const sample = [
    '== Drops ==',
    '{| class="terraria drop"',
    '! Item !! Quantity !! Chance !! Condition',
    '|-',
    '| [[Shackle]] || 1 || 2% || Expert Mode',
    '|}'
  ].join('\n');

  assert.deepEqual(extractNpcLoot(sample), {
    items: [
      {
        relationType: 'loot',
        itemName: 'Shackle',
        chanceText: '2%',
        quantityText: '1',
        conditionText: 'Expert Mode',
        npcInternalName: null,
        npcName: null,
        sourceSection: 'drops',
        sourceRowIndex: 0,
        raw: {
          itemName: 'Shackle',
          quantityText: '1',
          chanceText: '2%',
          conditionText: 'Expert Mode',
          sourceSection: 'drops'
        }
      }
    ]
  });
});

test('normalizeNpcLootRows maps raw loot rows to NPC item relation evidence', () => {
  assert.deepEqual(
    normalizeNpcLootRows(
      [{ itemName: 'Shackle', chanceText: '2%', quantityText: '1', conditionText: 'Expert Mode' }],
      { npcInternalName: 'Zombie', npcName: 'Zombie' }
    ),
    [
      {
        relationType: 'loot',
        itemName: 'Shackle',
        chanceText: '2%',
        quantityText: '1',
        conditionText: 'Expert Mode',
        npcInternalName: 'Zombie',
        npcName: 'Zombie',
        sourceSection: 'drops',
        sourceRowIndex: 0,
        raw: {
          itemName: 'Shackle',
          chanceText: '2%',
          quantityText: '1',
          conditionText: 'Expert Mode'
        }
      }
    ]
  );
});

test('extractNpcHappiness marks template presence and preserves notes', () => {
  const sample = '{{living preferences|loves=[[Mechanic]]|likes=[[Underground]]}}';
  assert.deepEqual(extractNpcHappiness(sample), {
    sourceTemplatePresent: true,
    notes: ['loves=[[Mechanic]]', 'likes=[[Underground]]']
  });
});
