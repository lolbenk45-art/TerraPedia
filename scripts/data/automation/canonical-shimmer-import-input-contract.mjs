import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import {
  assertRepositoryOrdinaryDirectory,
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import { verifyShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';

export const CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH =
  'reports/authorization/canonical/canonical-shimmer-import.input.json';
export const CANONICAL_SHIMMER_IMPORT_RESULT_PATH =
  'reports/authorization/canonical/canonical-shimmer-import.result.json';
export const CANONICAL_SHIMMER_IMPORT_OPERATION_ID = 'canonical-shimmer-import';
export const SHIMMER_IMPORT_PROVIDER_SCOPE = Object.freeze({
  provider: 'wiki_zh',
  sourcePage: '微光',
  tables: Object.freeze([
    'shimmer_item_transforms',
    'shimmer_decraft_rules',
    'shimmer_entity_transforms',
    'shimmer_npc_transforms',
  ]),
});

const CONTRACT_FIELDS = Object.freeze([
  'schemaVersion',
  'operationId',
  'generationId',
  'manifestPath',
  'manifestSha256',
  'dataBundleSha256',
  'previewSha256',
  'targetFingerprintSha256',
  'providerScope',
]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MANIFEST_FILE_NAME = 'wiki-shimmer-manifest.json';

export function readCanonicalShimmerImportInputContract({
  repoRoot = process.cwd(),
  inputContractPath = CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH,
  verifyGeneration = verifyShimmerGeneration,
} = {}) {
  if (typeof verifyGeneration !== 'function') {
    throw new TypeError('Shimmer generation verifier is required');
  }
  const root = path.resolve(repoRoot);
  const contractPath = resolvePrivateContractPath({ root, inputContractPath });
  assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: contractPath,
    label: 'Shimmer import input contract',
  });
  const stat = fs.lstatSync(contractPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Shimmer import input contract must be a private ordinary JSON file');
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('Shimmer import input contract must be private');
  }

  const bytes = fs.readFileSync(contractPath);
  let contract;
  try {
    contract = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Shimmer import input contract must be valid JSON: ${error.message}`);
  }
  assertCanonicalShimmerImportInputContract(contract);

  const expectedManifestPath = path.join(
    root,
    'data',
    'generated',
    'shimmer',
    'generations',
    contract.generationId,
    MANIFEST_FILE_NAME,
  );
  const suppliedManifestPath = resolveRelativePath(root, contract.manifestPath, 'manifest path');
  if (suppliedManifestPath !== expectedManifestPath) {
    throw new Error('Shimmer import input contract manifest path must name its exact generation');
  }
  const generationRoot = path.join(root, 'data', 'generated', 'shimmer', 'generations');
  assertRepositoryOrdinaryDirectory({
    repoRoot: root,
    filePath: generationRoot,
    label: 'Shimmer import input contract generation root',
  });
  assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: suppliedManifestPath,
    label: 'Shimmer import input contract manifest',
  });
  const realRepoRoot = fs.realpathSync(root);
  const realGenerationRoot = fs.realpathSync(generationRoot);
  if (!isPathInside(realRepoRoot, realGenerationRoot)) {
    throw new Error('Shimmer import input contract generation root must resolve inside the repository');
  }
  const realManifestPath = fs.realpathSync(suppliedManifestPath);
  if (!isPathInside(realGenerationRoot, realManifestPath)) {
    throw new Error('Shimmer import input contract manifest must resolve inside the canonical generation root');
  }
  const verified = verifyGeneration({ manifestPath: suppliedManifestPath });
  if (verified.manifest.generationId !== contract.generationId
      || verified.manifest.manifestSha256 !== contract.manifestSha256
      || verified.manifest.dataBundleSha256 !== contract.dataBundleSha256) {
    throw new Error('Shimmer import input contract generation identity does not match the verified manifest');
  }

  const canonicalContract = Object.freeze({
    ...contract,
    providerScope: Object.freeze({
      ...contract.providerScope,
      tables: Object.freeze([...contract.providerScope.tables]),
    }),
  });

  return Object.freeze({
    ...canonicalContract,
    bytes,
    contract: canonicalContract,
    contractPath,
    relativePath: path.relative(root, contractPath).replaceAll('\\', '/'),
    manifestPath: suppliedManifestPath,
    verified,
  });
}

export function assertCanonicalShimmerImportInputContract(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('Shimmer import input contract must be an object');
  }
  const keys = Object.keys(contract).sort();
  if (keys.length !== CONTRACT_FIELDS.length
      || JSON.stringify(keys) !== JSON.stringify([...CONTRACT_FIELDS].sort())) {
    throw new Error('Shimmer import input contract must contain exactly the required fields');
  }
  if (contract.schemaVersion !== 1) {
    throw new Error('Shimmer import input contract schemaVersion must be 1');
  }
  if (contract.operationId !== CANONICAL_SHIMMER_IMPORT_OPERATION_ID) {
    throw new Error(`Shimmer import input contract operationId must be ${CANONICAL_SHIMMER_IMPORT_OPERATION_ID}`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(contract.generationId ?? ''))) {
    throw new Error('Shimmer import input contract generationId is invalid');
  }
  requireNormalizedRelativePath(contract.manifestPath, 'Shimmer import input contract manifest path');
  if (!String(contract.manifestPath).endsWith(`/${MANIFEST_FILE_NAME}`)
      || !String(contract.manifestPath).startsWith('data/generated/shimmer/generations/')) {
    throw new Error('Shimmer import input contract manifest path is not content addressed');
  }
  for (const field of ['manifestSha256', 'dataBundleSha256', 'previewSha256', 'targetFingerprintSha256']) {
    if (!HASH_PATTERN.test(String(contract[field] ?? ''))) {
      throw new Error(`Shimmer import input contract ${field} is invalid`);
    }
  }
  assertProviderScope(contract.providerScope);
  return true;
}

export function buildCanonicalShimmerImportInputContract({
  generationId,
  manifestPath,
  manifestSha256,
  dataBundleSha256,
  previewSha256,
  targetFingerprintSha256,
  providerScope,
} = {}) {
  const contract = {
    schemaVersion: 1,
    operationId: CANONICAL_SHIMMER_IMPORT_OPERATION_ID,
    generationId,
    manifestPath,
    manifestSha256,
    dataBundleSha256,
    previewSha256,
    targetFingerprintSha256,
    providerScope,
  };
  assertCanonicalShimmerImportInputContract(contract);
  return Object.freeze({
    ...contract,
    providerScope: Object.freeze({
      ...contract.providerScope,
      tables: Object.freeze([...contract.providerScope.tables]),
    }),
  });
}

export function writeCanonicalShimmerImportInputContract({
  repoRoot = process.cwd(),
  inputContract,
  inputContractPath = CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH,
} = {}) {
  const root = path.resolve(repoRoot);
  const contractPath = resolvePrivateContractPath({ root, inputContractPath });
  const contract = inputContract?.contract ?? inputContract;
  assertCanonicalShimmerImportInputContract(contract);
  assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: contractPath,
    label: 'Shimmer import input contract',
    createParent: true,
  });
  const bytes = Buffer.from(`${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  writePrivateJsonWithoutOverwrite(contractPath, bytes, 'Shimmer import input contract');
  return Object.freeze({
    ...contract,
    contract: Object.freeze({
      ...contract,
      providerScope: Object.freeze({
        ...contract.providerScope,
        tables: Object.freeze([...contract.providerScope.tables]),
      }),
    }),
    bytes,
    contractPath,
    relativePath: path.relative(root, contractPath).replaceAll('\\', '/'),
  });
}

export function shimmerImportBindingFromInputContract(contract) {
  assertCanonicalShimmerImportInputContract(contract);
  return Object.freeze({
    operationId: contract.operationId,
    generationId: contract.generationId,
    manifestSha256: contract.manifestSha256,
    dataBundleSha256: contract.dataBundleSha256,
    previewSha256: contract.previewSha256,
    targetFingerprintSha256: contract.targetFingerprintSha256,
    providerScope: contract.providerScope,
  });
}

function resolvePrivateContractPath({ root, inputContractPath }) {
  const supplied = String(inputContractPath ?? '').trim();
  if (!supplied) {
    throw new Error('Shimmer import input contract is required');
  }
  const resolved = path.resolve(root, supplied);
  const relative = path.relative(root, resolved).replaceAll('\\', '/');
  if (relative !== CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH) {
    throw new Error('Shimmer import input contract must use the private canonical path');
  }
  return resolved;
}

function resolveRelativePath(root, relativePath, label) {
  requireNormalizedRelativePath(relativePath, label);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} must remain inside the repository root`);
  }
  return resolved;
}

function requireNormalizedRelativePath(value, label) {
  const text = String(value ?? '').trim();
  if (!text || text.includes('\\') || path.posix.isAbsolute(text)
      || path.posix.normalize(text) !== text
      || text.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  return text;
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`)
    && relative !== '..' && !path.isAbsolute(relative);
}

function assertProviderScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    throw new Error('Shimmer import input contract provider scope is invalid');
  }
  if (JSON.stringify(Object.keys(scope).sort()) !== JSON.stringify(['provider', 'sourcePage', 'tables'])) {
    throw new Error('Shimmer import input contract provider scope must contain exactly provider, sourcePage, and tables');
  }
  if (scope.provider !== SHIMMER_IMPORT_PROVIDER_SCOPE.provider
      || scope.sourcePage !== SHIMMER_IMPORT_PROVIDER_SCOPE.sourcePage
      || JSON.stringify(scope.tables) !== JSON.stringify(SHIMMER_IMPORT_PROVIDER_SCOPE.tables)) {
    throw new Error('Shimmer import input contract provider scope is outside wiki_zh/微光');
  }
}

function writePrivateJsonWithoutOverwrite(outputPath, bytes, label) {
  const temporaryPath = `${outputPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, bytes, { mode: 0o600, flag: 'wx' });
    try {
      fs.linkSync(temporaryPath, outputPath);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error(`${label} already exists and cannot be overwritten`);
      }
      throw error;
    }
    fs.chmodSync(outputPath, 0o600);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}
