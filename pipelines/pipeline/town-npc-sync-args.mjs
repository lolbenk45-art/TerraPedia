export function buildTownNpcFetchArgs(options = {}) {
  const args = [];
  pushOption(args, 'output', options.output);
  pushOption(args, 'source', options.source);
  pushOption(args, 'limit', options.limit);
  pushOption(args, 'delay-ms', options['delay-ms'] ?? options.delayMs);
  return args;
}

export function buildTownNpcImportArgs(options = {}) {
  const args = [];
  pushOption(args, 'input', options.input);
  args.push(`--apply=${isTrue(options.apply) ? 'true' : 'false'}`);
  return args;
}

export function buildTownNpcImageSyncArgs(options = {}) {
  const args = [`--apply=${isTrue(options.apply) ? 'true' : 'false'}`, '--scopes=town_npc_maintenance'];
  pushOption(args, 'input', options.output ?? options.input);
  pushOption(args, 'apiBase', options.apiBase);
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
