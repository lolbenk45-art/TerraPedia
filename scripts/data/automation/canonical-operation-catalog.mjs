export const CANONICAL_CUTOVER_OPERATION_IDS = Object.freeze([
  'automation-biomes-l0-bootstrap',
  'canonical-image-sync',
  'canonical-boss-import',
  'canonical-boss-loot-import',
  'canonical-projectile-backfill',
  'canonical-recipe-crawler',
  'canonical-recipe-apply',
  'canonical-shimmer-import',
  'canonical-schema-v56-v58',
  'canonical-item-group-bootstrap',
  'canonical-npc-crawler',
  'canonical-npc-apply',
  'automation-biomes-l1-policy-promotion',
  'automation-biomes-first-l1',
  'automation-biomes-second-l1',
  'automation-biomes-l2-promotion',
  'automation-biomes-scheduler-activation',
]);

export const CANONICAL_OPERATION_DATA_PATHS = Object.freeze({
  'automation-biomes-l0-bootstrap': Object.freeze([
    'reports/authorization/canonical/automation-biomes-l0-bootstrap.input.json',
  ]),
  'canonical-image-sync': Object.freeze(['data/standardized/items.standardized.json']),
  'canonical-boss-import': Object.freeze([
    'data/generated/wiki-bosses.latest.json',
    'data/generated/npc-standardized-map.json',
  ]),
  'canonical-boss-loot-import': Object.freeze([
    'data/wiki-crawler/normalized/boss-loot.bundle.json',
  ]),
  'canonical-projectile-backfill': Object.freeze([
    'data/standardized/projectiles.standardized.json',
  ]),
  'canonical-recipe-crawler': Object.freeze([]),
  'canonical-recipe-apply': Object.freeze(['data/generated/wiki-zh-recipe-pages.latest.json']),
  'canonical-shimmer-import': Object.freeze([
    'data/generated/wiki-shimmer.latest.json',
    'data/generated/shimmer/wiki-shimmer-context.importable.latest.json',
    'data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json',
    'data/generated/shimmer/wiki-shimmer-decraft-rules.importable.latest.json',
    'data/generated/shimmer/wiki-shimmer-entity-transforms.importable.latest.json',
    'data/generated/shimmer/wiki-shimmer-npc-transforms.importable.latest.json',
    'data/generated/shimmer/wiki-shimmer-manifest.latest.json',
  ]),
  'canonical-schema-v56-v58': Object.freeze([]),
  'canonical-item-group-bootstrap': Object.freeze([
    'reports/authorization/canonical/canonical-item-group-bootstrap.input.json',
    'data/generated/recipe-material-reference.json',
    'data/generated/recipe-group-overrides.json',
    'data/generated/item-group-overrides.json',
    'data/standardized/items.standardized.json',
  ]),
  'canonical-npc-crawler': Object.freeze([
    'reports/authorization/canonical/canonical-npc-crawler.targets.json',
  ]),
  'canonical-npc-apply': Object.freeze([
    'reports/authorization/canonical/canonical-npc-apply.input.json',
    'data/standardized/npcs.standardized.json',
  ]),
  'automation-biomes-l1-policy-promotion': Object.freeze([
    'reports/authorization/canonical/automation-biomes-l1-policy-promotion.input.json',
  ]),
  'automation-biomes-first-l1': Object.freeze([
    'reports/authorization/canonical/automation-biomes-first-l1.bundle.json',
  ]),
  'automation-biomes-second-l1': Object.freeze([
    'reports/authorization/canonical/automation-biomes-second-l1.bundle.json',
  ]),
  'automation-biomes-l2-promotion': Object.freeze([
    'reports/authorization/canonical/automation-biomes-l2-promotion.input.json',
  ]),
  'automation-biomes-scheduler-activation': Object.freeze([
    'reports/authorization/canonical/automation-biomes-scheduler-activation.input.json',
  ]),
});

export const CANONICAL_OPERATION_ENTRYPOINTS = Object.freeze({
  'automation-biomes-l0-bootstrap': 'scripts/data/automation/bootstrap-automation-policy.mjs',
  'canonical-image-sync': 'scripts/data/workflow/run-image-sync.mjs',
  'canonical-boss-import': 'scripts/data/import/import-wiki-bosses-to-db.mjs',
  'canonical-boss-loot-import': 'scripts/data/import/import-boss-loot-to-db.mjs',
  'canonical-projectile-backfill': 'scripts/data/backfill/backfill-projectile-zh-and-images.mjs',
  'canonical-recipe-crawler': 'scripts/data/fetch/fetch-wiki-zh-recipe-pages.mjs',
  'canonical-recipe-apply': 'scripts/data/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs',
  'canonical-shimmer-import': 'scripts/data/import/import-wiki-shimmer-to-db.mjs',
  'canonical-schema-v56-v58': 'scripts/data/automation/run-canonical-schema-migration.mjs',
  'canonical-item-group-bootstrap': 'scripts/data/item-groups/item-group-canonical-action.mjs',
  'canonical-npc-crawler': 'scripts/data/npc-canonical/npc-crawler-fact-action.mjs',
  'canonical-npc-apply': null,
  'automation-biomes-l1-policy-promotion': 'scripts/data/automation/run-automation-policy-decision.mjs',
  'automation-biomes-first-l1': 'scripts/data/automation/run-biomes-automation-operation.mjs',
  'automation-biomes-second-l1': 'scripts/data/automation/run-biomes-automation-operation.mjs',
  'automation-biomes-l2-promotion': 'scripts/data/automation/run-automation-policy-decision.mjs',
  'automation-biomes-scheduler-activation': 'scripts/data/automation/run-automation-policy-decision.mjs',
});
