export function resolveRecipeImportApply(options = {}) {
  if (isFalse(options.apply)) {
    return false;
  }
  if (isTrue(options['dry-run'] ?? options.dryRun)) {
    return false;
  }
  return true;
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}

function isFalse(value) {
  return value === false || value === 'false' || value === '0' || value === 'no';
}
