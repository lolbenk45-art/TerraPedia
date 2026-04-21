export function buildBackendDataRefreshPlan(options = {}) {
  const itemPageLimit = normalizePositiveInteger(options.itemPageLimit, 100);

  return {
    generatedAt: new Date().toISOString(),
    actions: [
      {
        id: 'wiki-core-refresh',
        runner: 'node',
        args: [
          'scripts/data/workflow/run-wiki-sync.mjs',
          '--mode=apply',
          '--entity=items,npcs,bosses,biomes,categories'
        ]
      },
      {
        id: 'item-pages-refresh',
        runner: 'node',
        args: [
          'scripts/data/workflow/run-wiki-sync.mjs',
          '--mode=apply',
          '--entity=item_pages',
          `--page-limit=${itemPageLimit}`,
          '--with-recipes=true'
        ]
      },
      {
        id: 'recipe-reference-sync',
        runner: 'node',
        args: [
          'scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs'
        ]
      },
      {
        id: 'item-detail-sync',
        runner: 'node',
        args: [
          'scripts/data/pipeline/run-item-detail-sync-pipeline.mjs',
          '--with-boss-loot=true'
        ]
      },
      {
        id: 'town-npc-fetch',
        runner: 'python',
        args: [
          'scripts/data/fetch/fetch-wiki-town-npc-maintenance.py'
        ]
      },
      {
        id: 'town-npc-import',
        runner: 'node',
        args: [
          'scripts/data/import/import-wiki-town-npcs-to-db.mjs',
          '--apply=true'
        ]
      }
    ]
  };
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.trunc(numeric);
}
