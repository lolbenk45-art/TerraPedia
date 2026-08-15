export function buildBossFetchArgs(options = {}) {
  const args = [];
  pushOption(args, 'output-json', options.outputJson ?? options['output-json']);
  pushOption(args, 'report-json', options.reportJson ?? options['report-json']);
  return args;
}

export function buildBossImportArgs(options = {}) {
  const args = [];
  pushOption(args, 'input', options.input);
  if (!isTrue(options.apply)) {
    args.push('--dry-run=true');
  }
  pushOption(args, 'report-json', options.importReportJson ?? options['import-report-json']);
  return args;
}

export function buildBossLootArgs(options = {}) {
  const args = [];
  if (!isTrue(options.apply)) {
    args.push('--dry-run=true');
  }
  pushOption(args, 'relations', options.relations);
  pushOption(args, 'npcs', options.npcs);
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
