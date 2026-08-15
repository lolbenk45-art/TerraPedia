const DEFAULT_SUPPORT_SCOPES = 'items,npcs,projectiles,buffs';

export function buildLocalizationArgs(options = {}) {
  return buildScopedApplyArgs(options, DEFAULT_SUPPORT_SCOPES);
}

export function buildImageSyncArgs(options = {}) {
  const args = buildScopedApplyArgs(options, DEFAULT_SUPPORT_SCOPES);
  pushOption(args, 'apiBase', options.apiBase);
  return args;
}

export function buildCategorySyncArgs(options = {}) {
  const args = [`--apply=${isTrue(options.apply) ? 'true' : 'false'}`];
  pushOption(args, 'report', options.report);
  pushOption(args, 'itemPagesDir', options.itemPagesDir);
  return args;
}

function buildScopedApplyArgs(options, fallbackScopes) {
  const args = [`--apply=${isTrue(options.apply) ? 'true' : 'false'}`];
  args.push(`--scopes=${normalizeScopes(options.scopes, fallbackScopes)}`);
  return args;
}

function normalizeScopes(value, fallbackScopes) {
  const raw = value == null || value === '' ? fallbackScopes : value;
  return String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(',');
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
