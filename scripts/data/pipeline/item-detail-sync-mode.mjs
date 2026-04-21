export function resolveItemDetailSyncMode(options = {}) {
  const dryRun = isTrue(options['dry-run'] ?? options.dryRun);
  return {
    dryRun,
    skipItemImport: dryRun,
    skipRelationImport: dryRun,
    bossLootDryRun: resolveBossLootDryRun(options, dryRun)
  };
}

function resolveBossLootDryRun(options, fallback) {
  const explicit = options['boss-loot-dry-run'] ?? options.bossLootDryRun;
  if (explicit == null || explicit === '') {
    return fallback;
  }
  return isTrue(explicit);
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}
