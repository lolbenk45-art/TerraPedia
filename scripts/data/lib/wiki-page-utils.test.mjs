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
