export function resolveRecipeImportApply(options = {}) {
  if (isTrue(options['dry-run'] ?? options.dryRun)) {
    return false;
  }
  return isTrue(options.apply);
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}
