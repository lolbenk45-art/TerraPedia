import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractRecipeCategoryPagesFromHomeHtml,
  parseRecipeGroupsFromHtml,
  parseRecipePageRecipesFromHtml
} from './generate-recipe-material-reference.mjs';

test('extractRecipeCategoryPagesFromHomeHtml pairs TOC labels with live recipe source pages', () => {
  const html = `
    <ul>
      <li class="toclevel-2 tocsection-1"><a href="#Heavy_Assembler"><span class="tocnumber">1.18</span> <span class="toctext">Heavy Assembler</span></a></li>
      <li class="toclevel-2 tocsection-1"><a href="#Work_Bench"><span class="tocnumber">1.40</span> <span class="toctext">Work Bench</span></a></li>
    </ul>
    <div data-ajax-source-page="Recipes/Heavy Assembler"></div>
    <div data-ajax-source-page="Recipes/Work Bench"></div>
  `;

  const pages = extractRecipeCategoryPagesFromHomeHtml(html);

  assert.equal(pages.length, 2);
  assert.equal(pages[0].displayCategoryName, 'Heavy Assembler');
  assert.equal(pages[0].pageTitle, 'Recipes/Heavy Assembler');
  assert.equal(pages[0].pageSlug, 'Heavy_Assembler');
  assert.equal(pages[1].displayCategoryName, 'Work Bench');
  assert.equal(pages[1].pageTitle, 'Recipes/Work Bench');
});

test('parseRecipeGroupsFromHtml extracts English group members and filters Item IDs links', () => {
  const itemLookup = createItemLookup([
    { internalName: 'IronBar', name: 'Iron Bar', nameZh: '铁锭' },
    { internalName: 'LeadBar', name: 'Lead Bar', nameZh: '铅锭' }
  ]);
  const html = `
    <h3><span class="mw-headline">Any Iron Bar</span></h3>
    <div class="terraria">
      <div class="itemlist">
        <ul>
          <li><a title="Iron Bar">Iron Bar</a></li>
          <li><a title="Lead Bar">Lead Bar</a></li>
          <li><a title="Item IDs">Item IDs</a></li>
        </ul>
      </div>
    </div>
  `;

  const groups = parseRecipeGroupsFromHtml(html, itemLookup);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].canonicalName, 'Any Iron Bar');
  assert.equal(groups[0].displayNameEn, 'Any Iron Bar');
  assert.equal(groups[0].displayNameZh, '任何铁锭');
  assert.deepEqual(
    groups[0].members.map((member) => member.internalName),
    ['IronBar', 'LeadBar']
  );
});

test('parseRecipePageRecipesFromHtml parses caption stations, version rows, and finite alternatives', () => {
  const itemLookup = createItemLookup([
    { internalName: 'HeavyAssembler', name: 'Heavy Assembler', nameZh: '重型装配台' },
    { internalName: 'EctoMist', name: 'Ecto Mist', nameZh: '灵雾' },
    { internalName: 'Chest', name: 'Chest', nameZh: '箱子' },
    { internalName: 'Wood', name: 'Wood', nameZh: '木材' },
    { internalName: 'IronBar', name: 'Iron Bar', nameZh: '铁锭' },
    { internalName: 'LeadBar', name: 'Lead Bar', nameZh: '铅锭' },
    { internalName: 'BoneWelder', name: 'Bone Welder', nameZh: '骨头焊机' },
    { internalName: 'Bookcase', name: 'Bookcase', nameZh: '书架' },
    { internalName: 'FossilPickaxe', name: 'Fossil Pickaxe', nameZh: '化石镐' },
    { internalName: 'SturdyFossil', name: 'Sturdy Fossil', nameZh: '坚固化石' }
  ]);

  const html = `
    <table class="terraria cellborder recipes sortable" data-totalrows="2">
      <caption><span class="i"><a title="Heavy Assembler">Heavy Assembler</a></span></caption>
      <tbody>
        <tr><th class="result">Result</th><th class="ingredients">Ingredients</th></tr>
        <tr data-rowid="1">
          <td class="result"><span class="i"><a title="Chest">Chest</a></span></td>
          <td class="ingredients">
            <ul>
              <li><span class="i"><a title="Wood">Wood</a></span><span class="am">8</span></li>
              <li><span class="i"><a title="Iron Bar">Iron Bar</a></span> or <span class="i"><a title="Lead Bar">Lead Bar</a></span><span class="am">2</span></li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>
    <table class="terraria cellborder recipes sortable" data-totalrows="1">
      <caption><span class="i"><a title="Heavy Assembler">Heavy Assembler</a></span> and <span class="i"><a title="Ecto Mist">Ecto Mist</a></span> (Desktop, Console and Mobile versions)</caption>
      <tbody>
        <tr><th class="result">Result</th><th class="ingredients">Ingredients</th></tr>
        <tr data-rowid="2">
          <td class="result">
            <div class="version-note note-text small">Desktop, Console and Mobile versions only:</div>
            <span class="i"><a title="Fossil Pickaxe">Fossil Pickaxe</a></span>
          </td>
          <td class="ingredients">
            <ul>
              <li><span class="i"><a title="Sturdy Fossil">Sturdy Fossil</a></span><span class="am">8</span></li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>
  `;

  const pageResult = parseRecipePageRecipesFromHtml(html, itemLookup, {
    pageTitle: 'Recipes/Heavy Assembler',
    pageSlug: 'Heavy_Assembler',
    displayCategoryName: 'Heavy Assembler',
    pageUrl: 'https://terraria.wiki.gg/wiki/Recipes/Heavy_Assembler'
  }, {
    sourceRevisionTimestamp: '2025-01-01T00:00:00',
    sourceContextRevisionId: 123,
    sourceFetchedAt: '2026-04-08T00:00:00Z'
  });

  assert.equal(pageResult.pageStats.recipeTableCount, 2);
  assert.equal(pageResult.pageStats.rawRecipeRows, 2);
  assert.equal(pageResult.pageStats.importKeyRecipeRows, 3);
  assert.equal(pageResult.pageStats.uniqueResultItems, 2);
  assert.equal(pageResult.pageStats.alternativeIngredientExpansions, 1);
  assert.equal(pageResult.pageStats.versionScopedRows, 1);
  assert.deepEqual(pageResult.pageStats.tableCaptions, [
    'Heavy Assembler',
    'Heavy Assembler and Ecto Mist'
  ]);

  const chestRecipes = pageResult.recipes.filter((recipe) => recipe.resultInternalName === 'Chest');
  assert.equal(chestRecipes.length, 2);
  assert.deepEqual(
    chestRecipes.map((recipe) => recipe.ingredients.map((ingredient) => ingredient.ingredientName).sort()).sort(),
    [
      ['Iron Bar', 'Wood'],
      ['Lead Bar', 'Wood']
    ]
  );
  const fossilPickaxeRecipe = pageResult.recipes.find((recipe) => recipe.resultInternalName === 'FossilPickaxe');
  assert.ok(fossilPickaxeRecipe);
  assert.equal(fossilPickaxeRecipe.versionScope, 'Desktop version Console version Mobile version only');
  assert.equal(fossilPickaxeRecipe.sourcePage, 'Recipes/Heavy Assembler');
  assert.equal(fossilPickaxeRecipe.stations.length, 2);
  assert.deepEqual(
    fossilPickaxeRecipe.stations.map((station) => ({
      stationNameRaw: station.stationNameRaw,
      isAlternative: station.isAlternative
    })),
    [
      { stationNameRaw: '重型装配台', isAlternative: false },
      { stationNameRaw: '灵雾', isAlternative: false }
    ]
  );
});

function createItemLookup(items) {
  const byName = new Map();
  for (const item of items) {
    for (const value of [item.internalName, item.name, item.nameZh]) {
      const key = String(value ?? '').trim().toLowerCase();
      if (key && !byName.has(key)) {
        byName.set(key, item);
      }
    }
  }
  return { byName };
}
