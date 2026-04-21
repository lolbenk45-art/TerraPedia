export function buildIndependentEntityFetchArgs() {
  return [
    '--mode=apply',
    '--entity=buffs,projectiles,armor_sets'
  ];
}

export function buildIndependentEntityImportArgs(options = {}) {
  return isTrue(options.apply) ? [] : ['--dry-run=true'];
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}
