import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('manual item description backfill updates only when description differs', () => {
  const source = read('scripts/data/sync/backfill-item-page-descriptions.mjs');

  assert.match(
    source,
    /UPDATE items[\s\S]*SET description = \?[\s\S]*WHERE id = \?[\s\S]*\(\s*description IS NULL[\s\S]*TRIM\(description\) <> TRIM\(\?\)[\s\S]*\)/,
  );
});

test('entity zh description backfill keeps database-side difference guards', () => {
  const source = read('scripts/data/sync/backfill-entity-zh-descriptions.mjs');

  assert.match(source, /UPDATE boss_groups[\s\S]*NOT \(notes <=> \?\)/);
  assert.match(source, /UPDATE biomes[\s\S]*NOT \(description <=> \?\)/);
  assert.match(source, /UPDATE items[\s\S]*NOT \(description_zh <=> \?\)/);
  assert.match(source, /UPDATE world_contexts[\s\S]*NOT \(description <=> \?\)/);
});

test('manual missing item image backfills update only when image differs', () => {
  for (const relativePath of [
    'scripts/data/backfill/backfill-missing-item-images.mjs',
    'scripts/data/backfill/backfill-missing-item-images-from-standardized-and-wiki.mjs',
  ]) {
    const source = read(relativePath);
    assert.match(
      source,
      /UPDATE items SET image = \?, updated_at = NOW\(\)[\s\S]*WHERE id = \?[\s\S]*\(\s*image IS NULL[\s\S]*TRIM\(image\) <> TRIM\(\?\)[\s\S]*\)/,
      relativePath,
    );
  }
});

test('manual zh name and npc category backfills keep a database-side difference guard', () => {
  const expectations = [
    [
      'scripts/data/backfill/backfill-missing-item-zh-names.mjs',
      /UPDATE items SET name_zh = \?, updated_at = NOW\(\)[\s\S]*WHERE id = \?[\s\S]*\(\s*name_zh IS NULL[\s\S]*TRIM\(name_zh\) <> TRIM\(\?\)[\s\S]*\)/,
    ],
    [
      'scripts/data/backfill/backfill-npc-zh-names-from-generated.mjs',
      /UPDATE npcs[\s\S]*SET name_zh = \?[\s\S]*WHERE id = \?[\s\S]*\(\s*NOT \(name_zh <=> \?\)[\s\S]*OR NOT \(sub_name_zh <=> \?\)[\s\S]*\)/,
    ],
    [
      'scripts/data/backfill/backfill-npc-categories.mjs',
      /UPDATE npcs[\s\S]*SET category_id = \?[\s\S]*WHERE id = \?[\s\S]*NOT \(category_id <=> \?\)/,
    ],
  ];

  for (const [relativePath, pattern] of expectations) {
    assert.match(read(relativePath), pattern, relativePath);
  }
});

test('category seed upserts avoid touching unchanged category rows', () => {
  for (const relativePath of [
    'scripts/data/backfill/backfill-missing-standardized-items.mjs',
    'scripts/data/backfill/backfill-item-periods-from-wiki.mjs',
    'scripts/data/sync/sync-item-rarity-period-to-primary-db.mjs',
  ]) {
    const source = read(relativePath);
    assert.match(source, /updated_at = IF\(/, relativePath);
    assert.doesNotMatch(source, /deleted = VALUES\(deleted\),\s*updated_at = NOW\(\)/, relativePath);
  }
});

test('manual image migration and disable scripts keep update-time difference guards', () => {
  const migration = read('scripts/data/sync/migrate-existing-image-urls-to-current-minio.mjs');
  assert.match(migration, /UPDATE items SET image = \?[\s\S]*NOT \(image <=> \?\)/);
  assert.match(migration, /UPDATE buffs SET image_path = \?[\s\S]*NOT \(image_path <=> \?\)/);
  assert.match(migration, /UPDATE biomes SET icon_url = \?[\s\S]*NOT \(icon_url <=> \?\)/);
  assert.match(migration, /UPDATE armor_sets[\s\S]*SET male_images = \?[\s\S]*NOT \(male_images <=> \?\)/);

  const bossImages = read('scripts/data/sync/localize-boss-images-to-minio.mjs');
  assert.match(bossImages, /UPDATE boss_groups SET image_url = \?[\s\S]*NOT \(image_url <=> \?\)/);

  const disableExtra = read('scripts/data/sync/disable-extra-items-not-in-standardized.mjs');
  assert.match(disableExtra, /UPDATE items SET status = 0[\s\S]*status <> 0/);

  const bilingual = read('scripts/data/sync/sync-item-bilingual-fields.mjs');
  assert.match(bilingual, /UPDATE items[\s\S]*NOT \(name <=> \?\)[\s\S]*NOT \(tooltip_zh <=> \?\)/);
});

test('manual and pipeline backfills keep primary database apply guards', () => {
  for (const relativePath of [
    'scripts/data/backfill/backfill-item-categories-from-standardized.mjs',
    'scripts/data/backfill/backfill-recipe-zh-display-names.mjs',
  ]) {
    const source = read(relativePath);
    assert.match(source, /import \{ assertPrimaryDb \} from '\.\.\/lib\/base-domain-primary-db-guard\.mjs';/, relativePath);
    assert.match(source, /allowNonPrimaryDb\s*=/, relativePath);
    assert.match(source, /assertPrimaryDb\(db\.database,\s*apply,\s*allowNonPrimaryDb\);/, relativePath);
  }
});

test('pipeline recipe zh display-name backfill keeps database-side difference guards', () => {
  const source = read('scripts/data/backfill/backfill-recipe-zh-display-names.mjs');

  assert.match(source, /UPDATE recipe_ingredients[\s\S]*ingredient_name_raw <> CASE ingredient_name_raw/);
  assert.match(source, /UPDATE crafting_stations cs[\s\S]*cs.name_zh = i.name_zh[\s\S]*\(cs.name_zh IS NULL OR TRIM\(cs.name_zh\) = ''\)/);
  assert.match(source, /UPDATE crafting_stations[\s\S]*name_en IN \(\$\{stationInListSql\}\)[\s\S]*TRIM\(name_zh\) <> CASE name_en/);
  assert.match(source, /UPDATE recipe_ingredients ri[\s\S]*TRIM\(ri\.ingredient_name_raw\) <> TRIM\(i\.name_zh\)/);
  assert.match(source, /UPDATE recipe_stations rs[\s\S]*TRIM\(rs\.station_name_raw\) <> COALESCE/);
  assert.match(source, /UPDATE recipe_stations rs[\s\S]*TRIM\(rs\.station_name_raw\) <> CASE/);
});

test('manual item category backfill updates only missing item categories', () => {
  const source = read('scripts/data/backfill/backfill-item-categories-from-standardized.mjs');

  assert.match(
    source,
    /UPDATE items SET category_id = \?, updated_at = NOW\(\) WHERE id = \? AND \(category_id IS NULL OR category_id = 0\)/,
  );
});

test('recipe provider consolidation updates only analyzed status-change ids', () => {
  const source = read('scripts/data/sync/consolidate-recipe-provider-priority.mjs');

  assert.match(source, /await updateRecipeStatus\(conn, analysis\.activateIds, 1\);/);
  assert.match(source, /await updateRecipeStatus\(conn, analysis\.deactivateIds, 0\);/);
  assert.match(source, /WHERE id IN \(\$\{makePlaceholders\(chunk\.length\)\}\)[\s\S]*AND deleted = 0/);
  assert.doesNotMatch(source, /UPDATE recipes[\s\S]*SET status = \?[\s\S]*WHERE deleted = 0`/);
});
