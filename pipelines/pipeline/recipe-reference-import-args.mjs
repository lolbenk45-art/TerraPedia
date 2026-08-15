export function buildRecipeReferenceImportArgs(options = {}, recipeReferencePath) {
  const args = [`--input=${recipeReferencePath}`];
  if (isTrue(options.importDryRun ?? options['import-dry-run'])) {
    args.push('--apply=false');
  }
  return args;
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}
