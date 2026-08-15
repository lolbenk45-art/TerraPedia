import { CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH } from '../automation/canonical-shimmer-import-input-contract.mjs';

export function buildShimmerImportArgs(options = {}) {
  if (options?.bundleManifest != null || options?.['bundle-manifest'] != null) {
    throw new Error('direct bundle manifest input is forbidden for the shimmer sync preview');
  }
  const inputContract = requireCanonicalInputContract(resolveInputContract(options));
  if (isTrue(options.apply)) {
    throw new Error('direct apply is not available through the shimmer sync pipeline');
  }
  return [
    '--apply=false',
    `--input-contract=${inputContract}`
  ];
}

function resolveInputContract(options) {
  const camelCaseValue = String(options?.inputContract ?? '').trim();
  const kebabCaseValue = String(options?.['input-contract'] ?? '').trim();
  if (camelCaseValue && kebabCaseValue && camelCaseValue !== kebabCaseValue) {
    throw new Error('conflicting input contract options are not allowed');
  }
  return camelCaseValue || kebabCaseValue;
}

function requireCanonicalInputContract(value) {
  const inputContract = String(value ?? '').trim().replaceAll('\\', '/');
  if (!inputContract) throw new Error('inputContract is required');
  if (inputContract !== CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH) {
    throw new Error('shimmer sync preview requires the canonical input contract');
  }
  return inputContract;
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}
