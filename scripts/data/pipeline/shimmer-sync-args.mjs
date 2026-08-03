export function buildShimmerImportArgs(options = {}) {
  const bundleManifest = requireContentAddressedManifest(resolveBundleManifest(options));
  if (isTrue(options.apply)) {
    throw new Error('direct apply is not available through the shimmer sync pipeline');
  }
  return [
    '--apply=false',
    `--bundle-manifest=${bundleManifest}`
  ];
}

function resolveBundleManifest(options) {
  const camelCaseValue = String(options?.bundleManifest ?? '').trim();
  const kebabCaseValue = String(options?.['bundle-manifest'] ?? '').trim();
  if (camelCaseValue && kebabCaseValue && camelCaseValue !== kebabCaseValue) {
    throw new Error('conflicting bundle manifest options are not allowed');
  }
  return camelCaseValue || kebabCaseValue;
}

function requireContentAddressedManifest(value) {
  const manifest = String(value ?? '').trim().replaceAll('\\', '/');
  if (!manifest) throw new Error('bundleManifest is required');
  if (manifest.includes('latest')
      || !/^data\/generated\/shimmer\/generations\/[a-f0-9]{64}\/wiki-shimmer-manifest\.json$/.test(manifest)) {
    throw new Error('bundleManifest must name a content-addressed generation manifest');
  }
  return manifest;
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}
