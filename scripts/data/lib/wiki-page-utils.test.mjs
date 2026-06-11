import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyDropSourceRefType,
  extractDropSourcesFromHtml,
  extractNarrativeSources,
  parseRecipeTable
} from './wiki-page-utils.mjs';

test('extractDropSourcesFromHtml expands multi-entity rows', () => {
  const html = `
    <table class="drop">
      <tr><th>Entity</th><th>Qty</th><th>Chance</th></tr>
      <tr>
        <td><a title="King Slime">King Slime</a> / <a title="Eye of Cthulhu">Eye of Cthulhu</a></td>
        <td>1</td>
        <td>25%</td>
      </tr>
    </table>
  `;
  const npcLookup = new Map([
    ['king slime', { boss: true }],
    ['eye of cthulhu', { boss: true }]
  ]);

  const actual = extractDropSourcesFromHtml(html, npcLookup);

  assert.equal(actual.length, 2);
  assert.deepEqual(
    actual.map((entry) => ({
      sourceRefName: entry.sourceRefName,
      sourceRefType: entry.sourceRefType,
      quantityText: entry.quantityText,
      chanceText: entry.chanceText
    })),
    [
      {
        sourceRefName: 'King Slime',
        sourceRefType: 'boss',
        quantityText: '1',
        chanceText: '25%'
      },
      {
        sourceRefName: 'Eye of Cthulhu',
        sourceRefType: 'boss',
        quantityText: '1',
        chanceText: '25%'
      }
    ]
  );
});

test('extractDropSourcesFromHtml falls back to stripped entity text when no linked title exists', () => {
  const html = `
    <table class="drop">
      <tr><th>Entity</th><th>Qty</th><th>Chance</th></tr>
      <tr>
        <td>King Slime</td>
        <td>5</td>
        <td>100%</td>
      </tr>
    </table>
  `;

  const actual = extractDropSourcesFromHtml(html);

  assert.equal(actual.length, 1);
  assert.equal(actual[0].sourceRefName, 'King Slime');
  assert.equal(actual[0].chanceText, '100%');
  assert.equal(actual[0].quantityText, '5');
});

test('extractDropSourcesFromHtml preserves section title for matrix pages', () => {
  const html = `
    <h2><span class="mw-headline" id="Bone_Wand">Bone Wand</span><span class="mw-editsection">[ edit ]</span></h2>
    <table class="drop-noncustom sortable">
      <tr><th>Entity</th><th>Qty</th><th>Rate</th></tr>
      <tr><td><a title="Angry Bones">Angry Bones</a></td><td>1</td><td>0.4%</td></tr>
    </table>
    <h2><span class="mw-headline" id="Hive_Wand">Hive Wand</span><span class="mw-editsection">[ edit ]</span></h2>
    <table class="drop-noncustom sortable">
      <tr><th>Entity</th><th>Qty</th><th>Rate</th></tr>
      <tr><td><a title="Queen Bee">Queen Bee</a></td><td>1</td><td>33%</td></tr>
    </table>
  `;
  const npcLookup = new Map([
    ['angry bones', { boss: false }],
    ['queen bee', { boss: true }]
  ]);

  const actual = extractDropSourcesFromHtml(html, npcLookup);

  assert.deepEqual(
    actual.map((entry) => [entry.sourceRefName, entry.sourceSectionTitle, entry.sourceRowText]),
    [
      ['Angry Bones', 'Bone Wand', 'Angry Bones 1 0.4%'],
      ['Queen Bee', 'Hive Wand', 'Queen Bee 1 33%']
    ]
  );
});

test('extractDropSourcesFromHtml prefers entity image alt names over generic link titles for variants', () => {
  const html = `
    <table class="drop">
      <tr><th>Entity</th><th>Qty</th><th>Chance</th></tr>
      <tr>
        <td>
          <span class="entity-name">
            <span class="npcimg"><img alt="Armed Torch Zombie.gif" src="/images/Armed_Torch_Zombie.gif" /></span>
            <span><a href="/wiki/Zombie" title="Zombie">Zombie</a><div class="note-text">(Armed Torch Zombie)</div></span>
          </span>
        </td>
        <td>5–20</td>
        <td>100%</td>
      </tr>
      <tr>
        <td>
          <span class="entity-name">
            <span class="npcimg"><img alt="Torch Zombie.gif" src="/images/Torch_Zombie.gif" /></span>
            <span><a href="/wiki/Zombie" title="Zombie">Zombie</a><div class="note-text">(Torch Zombie)</div></span>
          </span>
        </td>
        <td>5–20</td>
        <td>100%</td>
      </tr>
    </table>
  `;
  const npcLookup = new Map([
    ['armed torch zombie', { boss: false }],
    ['torch zombie', { boss: false }]
  ]);

  const actual = extractDropSourcesFromHtml(html, npcLookup);

  assert.deepEqual(
    actual.map((entry) => [entry.sourceRefName, entry.sourceRefType, entry.quantityText, entry.chanceText]),
    [
      ['Armed Torch Zombie', 'npc', '5–20', '100%'],
      ['Torch Zombie', 'npc', '5–20', '100%']
    ]
  );
});

test('classifyDropSourceRefType keeps container-like drop table sources out of npc resolution', () => {
  assert.equal(classifyDropSourceRefType('Gold Chest'), 'container');
  assert.equal(classifyDropSourceRefType('Frozen Chest'), 'container');
  assert.equal(classifyDropSourceRefType('Wooden Crate'), 'crate');
  assert.equal(classifyDropSourceRefType('Treasure Bag (Duke Fishron)'), 'treasure_bag');
  assert.equal(classifyDropSourceRefType('Golden Lock Box'), 'container');
  assert.equal(classifyDropSourceRefType('Present'), 'container');
  assert.equal(classifyDropSourceRefType('Mimic', { boss: false }), 'npc');
});

test('extractDropSourcesFromHtml classifies MagicMirror wiki sources without npc pollution', () => {
  const html = `
    <table class="drop">
      <tr><th>Entity</th><th>Qty</th><th>Chance</th></tr>
      <tr><td><a title="Gold Chest">Gold Chest</a></td><td>1</td><td>1/6 (16.67%)</td></tr>
      <tr><td><a title="Frozen Chest">Frozen Chest</a></td><td>1</td><td>1/5 (20%)</td></tr>
      <tr><td><a title="Wooden Crate">Wooden Crate</a></td><td>1</td><td>5%</td></tr>
      <tr><td><a title="Treasure Bag (Duke Fishron)">Treasure Bag (Duke Fishron)</a></td><td>1</td><td>100%</td></tr>
      <tr><td><a title="Mimic">Mimic</a></td><td>1</td><td>16.67%</td></tr>
    </table>
  `;
  const npcLookup = new Map([
    ['mimic', { boss: false }]
  ]);

  const extracted = extractDropSourcesFromHtml(html, npcLookup);

  assert.equal(extracted.find((row) => row.sourceRefName === 'Gold Chest')?.sourceRefType, 'container');
  assert.equal(extracted.find((row) => row.sourceRefName === 'Frozen Chest')?.sourceRefType, 'container');
  assert.equal(extracted.find((row) => row.sourceRefName === 'Wooden Crate')?.sourceRefType, 'crate');
  assert.equal(extracted.find((row) => row.sourceRefName === 'Treasure Bag (Duke Fishron)')?.sourceRefType, 'treasure_bag');
  assert.equal(extracted.find((row) => row.sourceRefName === 'Mimic')?.sourceRefType, 'npc');
});

test('extractNarrativeSources keeps MagicMirror worldgen as world source', () => {
  const actual = extractNarrativeSources(
    ['Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.'],
    'Magic Mirrors'
  );

  assert.ok(actual.some((row) => (
    row.sourceType === 'worldgen'
    && row.sourceRefType === 'world'
    && row.sourceRefName === 'Magic Mirrors worldgen'
  )));
});

test('extractNarrativeSources detects sky fall and natural generation source sentences', () => {
  const actual = extractNarrativeSources(
    [
      'The Fallen Star is an item that randomly falls from the sky at night and disappears at dawn (4:30 AM).',
      'Silt Blocks are a type of soil blocks that generates in the Underground and Cavern layers, appearing more frequently at lower depths.'
    ],
    'Fallen Star'
  );

  assert.deepEqual(
    actual.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefName]),
    [
      ['worldgen', 'world', 'Fallen Star sky fall'],
      ['worldgen', 'world', 'Fallen Star worldgen']
    ]
  );
});

test('extractNarrativeSources detects event grab bag, boss treasure bag, and enemy banner page-level candidates', () => {
  const actual = extractNarrativeSources(
    [
      'The Present is a grab bag item available during the Christmas seasonal event which contains a random Christmas-themed reward.',
      'Treasure Bags are consumable grab bag-like items obtained in Expert Mode and Master Mode as a reward for defeating bosses.',
      'Enemy banners are functional furniture items that can be placed on the underside of blocks and platforms. They are obtained by killing most enemies and a few critters.'
    ],
    'Present'
  );

  assert.deepEqual(
    actual.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefName]),
    [
      ['drop', 'world', 'Christmas seasonal event'],
      ['treasure_bag', 'boss_group', 'defeating bosses'],
      ['drop', 'npc_group', 'killing most enemies and a few critters']
    ]
  );
});

test('extractNarrativeSources detects common wiki acquisition prose for remaining item-source gaps', () => {
  const actual = extractNarrativeSources(
    [
      'Trophies are decorative furniture items which usually have a 1/10 (10%) chance to be dropped from most bosses.',
      'Relics are furniture items dropped by bosses and mini-bosses in Master Mode.',
      "Red's set are vanity developer items that can be obtained rarely (6.25% chance) from Treasure Bags dropped from Hardmode bosses (except Queen Slime's).",
      'Fishing trophies are rewarded randomly by the Angler NPC for completing quests.',
      'The Wooden Crate is a pre-Hardmode crate that can be obtained by fishing in any biome, at any height.',
      "The Carrot is only available to players in the Terraria Collector's Edition, and will automatically appear in the inventory of any newly generated characters.",
      'The Bug Net can be purchased from the Merchant for 25 SC.'
    ],
    'Trophies'
  );

  assert.deepEqual(
    actual.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefName, row.chanceText ?? null]),
    [
      ['drop', 'boss_group', 'most bosses', '1/10 (10%)'],
      ['drop', 'boss_group', 'bosses and mini-bosses', null],
      ['treasure_bag', 'treasure_bag', 'Treasure Bags dropped from Hardmode bosses', '6.25%'],
      ['quest_reward', 'npc', 'Angler', null],
      ['crate', 'world', 'fishing in any biome', null],
      ['unknown', 'world', "Terraria Collector's Edition", null],
      ['shop', 'npc', 'Merchant', null]
    ]
  );
});

test('extractNarrativeSources detects critter, angler, dye trader, event, and world chest prose', () => {
  const actual = extractNarrativeSources(
    [
      'The Goldfish can be caught with any Bug Net to be carried around in the inventory and released later.',
      'The Weather Radio can be received as a 1/34 (2.94%) chance reward for completing a fishing quest for the Angler NPC.',
      'In return, he rewards the player with six vials of one random special exclusive dye per plant.',
      "Defender Medals are obtained in the Old One's Army event, being dropped by the Eternia Crystal at the end of each wave, beginning with the third wave.",
      "The Dead Man's Chest is a naturally-generated Chest rigged with a large variety of traps in order to kill the player upon opening it.",
      'The Garden Gnome is a small furniture item formed when a Gnome touches sunlight.'
    ],
    'Goldfish'
  );

  assert.deepEqual(
    actual.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefName, row.chanceText ?? null]),
    [
      ['unknown', 'world', 'caught with any Bug Net', null],
      ['quest_reward', 'npc', 'Angler', '1/34 (2.94%)'],
      ['quest_reward', 'npc', 'Dye Trader', null],
      ['drop', 'world', "Old One's Army event", null],
      ['worldgen', 'world', 'Goldfish worldgen', null],
      ['unknown', 'npc', 'Gnome sunlight transformation', null]
    ]
  );
});

test('parseRecipeTable normalizes localized recipe group aliases to canonical group names', () => {
  const markup = `
    <table class="terraria cellborder recipes sortable">
      <tr><th class="result">Result</th><th class="ingredients">Ingredients</th><th class="station">[[Crafting station]]</th></tr>
      <tr>
        <td class="result"><span>[[Torch]]</span></td>
        <td class="ingredients">
          <ul>
            <li><span class="i">[[任意木材]]</span><span class="am">3</span></li>
            <li><span class="i">[[Gel]]</span><span class="am">1</span></li>
          </ul>
        </td>
        <td class="station">[[By Hand]]</td>
      </tr>
    </table>
  `;

  const recipes = parseRecipeTable(markup);

  assert.equal(recipes.length, 1);
  assert.deepEqual(
    recipes[0].ingredients.map((ingredient) => ({
      ingredientName: ingredient.ingredientName,
      ingredientGroupType: ingredient.ingredientGroupType,
      quantityText: ingredient.quantityText
    })),
    [
      {
        ingredientName: 'Any Wood',
        ingredientGroupType: 'group',
        quantityText: '3'
      },
      {
        ingredientName: 'Gel',
        ingredientGroupType: 'item',
        quantityText: '1'
      }
    ]
  );
});

test('parseRecipeTable ignores Item IDs metadata links when result cell has a visible item title', () => {
  const markup = `
    <table class="terraria cellborder recipes sortable">
      <tr><th class="result">Result</th><th class="ingredients">Ingredients</th><th class="station">[[Crafting station]]</th></tr>
      <tr>
        <td class="result" data-sort-value="Blue Dungeon Chair">
          <span class="item"><a title="Blue Dungeon Chair">Blue Dungeon Chair</a></span>
          <span class="id"><a title="Item IDs">Internal Item ID</a>: 1396</span>
        </td>
        <td class="ingredients">
          <ul><li><span class="i">[[Blue Brick]]</span><span class="am">4</span></li></ul>
        </td>
        <td class="station">[[Work Bench]]</td>
      </tr>
      <tr>
        <td class="result">
          <span><img alt="Chain Lantern" src="/images/Chain_Lantern.png" /></span>
          <span class="id"><a title="Item IDs">Internal Item ID</a>: 136</span>
        </td>
        <td class="ingredients">
          <ul><li><span class="i">[[Chain]]</span><span class="am">1</span></li><li><span class="i">[[Torch]]</span></li></ul>
        </td>
        <td class="station">[[Work Bench]]</td>
      </tr>
    </table>
  `;

  const recipes = parseRecipeTable(markup);

  assert.deepEqual(
    recipes.map((recipe) => recipe.resultName),
    ['Blue Dungeon Chair', 'Chain Lantern']
  );
});

test('parseRecipeTable expands finite inline ingredient alternatives into recipe variants', () => {
  const markup = `
    <table class="terraria cellborder recipes sortable">
      <tr><th class="result">Result</th><th class="ingredients">Ingredients</th><th class="station">[[Crafting station]]</th></tr>
      <tr>
        <td class="result"><span>[[Axe of Regrowth]]</span></td>
        <td class="ingredients">
          <ul>
            <li><span class="i">[[Staff of Regrowth]]</span></li>
            <li><span class="i">[[Copper Axe]]</span> '''''or''''' <span class="i">[[Tin Axe]]</span></li>
            <li><span class="i">[[Jungle Spores]]</span><span class="am">12</span></li>
          </ul>
        </td>
        <td class="station">[[Work Bench]]</td>
      </tr>
    </table>
  `;

  const recipes = parseRecipeTable(markup);

  assert.equal(recipes.length, 2);
  assert.deepEqual(
    recipes.map((recipe) => recipe.ingredients.map((ingredient) => ingredient.ingredientName)),
    [
      ['Staff of Regrowth', 'Copper Axe', 'Jungle Spores'],
      ['Staff of Regrowth', 'Tin Axe', 'Jungle Spores']
    ]
  );
});

test('parseRecipeTable humanizes file-based version notes into stable scope labels', () => {
  const markup = `
    <table class="terraria cellborder recipes sortable">
      <tr><th class="result">Result</th><th class="ingredients">Ingredients</th><th class="station">[[Crafting station]]</th></tr>
      <tr>
        <td class="result">
          <div class="version-note note-text small">[[File:Desktop only.png|16x12px|Desktop version|link=Desktop version history]]&thinsp;[[File:Console only.png|17x13px|Console version|link=Console version]] only:</div>
          <span>[[Iron Pickaxe]]</span>
        </td>
        <td class="ingredients"><ul><li><span class="i">[[Iron Bar]]</span><span class="am">10</span></li></ul></td>
        <td class="station">[[Iron Anvil]]</td>
      </tr>
    </table>
  `;

  const recipes = parseRecipeTable(markup);

  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].versionScope, 'Desktop version Console version only');
});

test('parseRecipeTable strips version labels and result quantities from result names', () => {
  const markup = `
    <table class="terraria cellborder recipes sortable">
      <tr><th class="result">Result</th><th class="ingredients">Ingredients</th><th class="station">[[Crafting station]]</th></tr>
      <tr>
        <td class="result">
          <div class="version-note note-text small">[[File:Desktop only.png|16x12px|Desktop version|link=Desktop version history]] only:</div>
          <span class="i">[[Blue Torch]]</span><span class="am">10</span>
        </td>
        <td class="ingredients"><ul><li><span class="i">[[Torch]]</span><span class="am">10</span></li><li><span class="i">[[Sapphire]]</span></li></ul></td>
      </tr>
      <tr>
        <td class="result"><span class="i">[[Silk Rope]]</span><span class="am">30</span></td>
        <td class="ingredients"><ul><li><span class="i">[[Silk]]</span></li></ul></td>
      </tr>
    </table>
  `;

  const recipes = parseRecipeTable(markup);

  assert.deepEqual(
    recipes.map((recipe) => [recipe.resultName, recipe.resultQuantity, recipe.versionScope]),
    [
      ['Blue Torch', 10, 'Desktop version only'],
      ['Silk Rope', 30, null]
    ]
  );
});

test('parseRecipeTable keeps combined stations as jointly required instead of alternatives', () => {
  const markup = `
    <table class="terraria cellborder recipes sortable">
      <tr><th class="result">Result</th><th class="ingredients">Ingredients</th><th class="station">[[Crafting station]]</th></tr>
      <tr>
        <td class="result"><span>[[Amber Stone Wall]]</span></td>
        <td class="ingredients"><ul><li><span class="i">[[Amber Stone Block]]</span></li></ul></td>
        <td class="station">[[Work Bench]] and [[Ecto Mist]]</td>
      </tr>
    </table>
  `;

  const recipes = parseRecipeTable(markup);

  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].stations.length, 2);
  assert.deepEqual(
    recipes[0].stations.map((station) => ({
      stationNameRaw: station.stationNameRaw,
      isAlternative: station.isAlternative
    })),
    [
      { stationNameRaw: 'Work Bench', isAlternative: false },
      { stationNameRaw: 'Ecto Mist', isAlternative: false }
    ]
  );
});
