const OFFICIAL_CHECK_MODES = new Set(['always', 'never']);

export function resolveOfficialCheckMode(rawOptions = {}) {
  const mode = String(
    rawOptions['official-check-mode']
      ?? rawOptions.officialCheckMode
      ?? 'never'
  ).trim().toLowerCase();
  return OFFICIAL_CHECK_MODES.has(mode) ? mode : 'never';
}
