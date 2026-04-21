export function buildShimmerImportArgs(options = {}) {
  const args = [`--apply=${isTrue(options.apply) ? 'true' : 'false'}`];
  pushOption(args, 'input', options.input);
  pushOption(args, 'raw', options.raw);
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
