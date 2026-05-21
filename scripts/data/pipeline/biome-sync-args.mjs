export function shouldRunBiomeImport(options = {}) {
  return isTrue(options.apply);
}

export function buildBiomeImportArgs(options = {}) {
  const args = [];
  if (isTrue(options.apply)) {
    args.push('--apply=true');
  }
  pushOption(args, 'wiki-biomes-file', options.wikiBiomesFile ?? options['wiki-biomes-file']);
  return args;
}

function pushOption(args, key, value) {
  if (value == null || value === '') {
    return;
  }
  args.push(`--${key}=${value}`);
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}
