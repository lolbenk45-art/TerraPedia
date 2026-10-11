#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIMESTAMP_FIELDS = ['generatedAt', 'checkedAt', 'createdAt', 'authorizedAt'];
const DOMAIN_IDS = new Set([
  'items',
  'npcs',
  'projectiles',
  'armor_sets',
  'buffs',
  'audio',
  'bosses',
  'shimmer',
]);

const INVENTORY_MODES = new Set(['recursive', 'git-untracked']);
const CLASSIFICATIONS = new Set(['consumed', 'historical-exception', 'baseline']);
const ENTRY_FIELDS = new Set([
  'sourceRoot',
  'relativePath',
  'absolutePath',
  'sha256',
  'bytes',
  'mode',
  'symlink',
  'domain',
  'role',
  'category',
  'generationTime',
  'classification',
  'consumed',
  'historicalException',
  'reusableFor',
  'forbiddenUses',
]);
const CATALOG_FIELDS = new Set([
  'schemaVersion',
  'catalogKind',
  'inventoryMode',
  'sourceRoot',
  'generatedAt',
  'entryCount',
  'classificationCounts',
  'categoryCounts',
  'entries',
  'catalogSha256',
]);

export function buildAutomationEvidenceCatalog({ sourceRoot, expectedCount = null, gitUntrackedOnly = false } = {}) {
  const root = requireDirectory(sourceRoot, 'sourceRoot');
  const rootFd = openBoundCatalogDirectory(root);
  let rootIdentity;
  try {
    const rootStat = fs.fstatSync(rootFd);
    assertTrustedCatalogDirectoryStat(rootStat, 'sourceRoot');
    rootIdentity = { dev: rootStat.dev, ino: rootStat.ino };
  } finally {
    fs.closeSync(rootFd);
  }
  const inventoryMode = gitUntrackedOnly ? 'git-untracked' : 'recursive';
  const files = enumerateStableCatalogFiles(root, inventoryMode);
  if (expectedCount != null && files.length !== Number(expectedCount)) {
    throw new Error(`evidence count mismatch: expected ${expectedCount}, found ${files.length}`);
  }

  const entries = files.map((absolutePath) => buildEntry(root, absolutePath));
  assertSameCatalogFileSet(
    files,
    enumerateCatalogFiles(root, inventoryMode),
    'source inventory changed while catalog entries were being built',
  );
  assertCatalogDirectoryIdentity(root, rootIdentity);
  const counts = countClassifications(entries);
  const catalog = {
    schemaVersion: 1,
    catalogKind: 'automation-evidence-catalog',
    inventoryMode,
    sourceRoot: root,
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    classificationCounts: counts,
    categoryCounts: countCategories(entries),
    entries,
  };
  catalog.catalogSha256 = hashJson({ ...catalog, catalogSha256: undefined });
  return catalog;
}

export function verifyAutomationEvidenceCatalog(catalog, { sourceRoot = null, expectedCount = null } = {}) {
  if (!catalog || catalog.catalogKind !== 'automation-evidence-catalog') {
    throw new Error('invalid automation evidence catalog');
  }
  assertKnownKeys(catalog, CATALOG_FIELDS, 'catalog');
  if (catalog.schemaVersion !== 1) throw new Error('unsupported automation evidence catalog schemaVersion');
  if (!INVENTORY_MODES.has(catalog.inventoryMode)) {
    throw new Error('catalog inventoryMode is required and invalid');
  }
  requireTimestamp(catalog.generatedAt, 'catalog generatedAt');
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  if (!Number.isSafeInteger(catalog.entryCount) || catalog.entryCount !== entries.length) {
    throw new Error('catalog entry count is inconsistent');
  }
  if (expectedCount != null && entries.length !== Number(expectedCount)) {
    throw new Error(`catalog count mismatch: expected ${expectedCount}, found ${entries.length}`);
  }
  const expectedRoot = requireDirectory(sourceRoot == null ? catalog.sourceRoot : sourceRoot, 'sourceRoot');
  if (path.resolve(catalog.sourceRoot) !== expectedRoot) throw new Error('catalog sourceRoot mismatch');
  const recomputedHash = hashJson({ ...catalog, catalogSha256: undefined });
  if (catalog.catalogSha256 !== recomputedHash) throw new Error('catalog self-hash mismatch');
  const expectedFiles = enumerateStableCatalogFiles(expectedRoot, catalog.inventoryMode);
  const catalogFiles = entries.map((entry) => path.resolve(expectedRoot, normalizeRelativeCatalogPath(entry?.relativePath, 'catalog entry relativePath')));
  assertSameCatalogFileSet(expectedFiles, catalogFiles, 'catalog inventory does not match the complete source enumeration');
  assertCatalogFileOrder(expectedFiles, catalogFiles);
  assertCatalogCounts(catalog, entries);
  const sourceRootFd = openBoundCatalogDirectory(expectedRoot);
  try {
    assertTrustedCatalogDirectoryStat(fs.fstatSync(sourceRootFd), 'catalog sourceRoot');
    const rootIdentity = fs.fstatSync(sourceRootFd);
    const seenPaths = new Set();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry || typeof entry !== 'object') throw new Error('catalog entry must be an object');
      assertKnownKeys(entry, ENTRY_FIELDS, 'catalog entry');
      const relativePath = normalizeRelativeCatalogPath(entry.relativePath, 'catalog entry relativePath');
      if (seenPaths.has(relativePath)) throw new Error(`duplicate catalog path: ${relativePath}`);
      seenPaths.add(relativePath);
      const absolutePath = path.resolve(expectedRoot, relativePath);
      assertContained(expectedRoot, absolutePath, 'catalog entry path');
      if (path.resolve(entry.sourceRoot ?? '') !== expectedRoot) {
        throw new Error(`catalog entry sourceRoot mismatch: ${relativePath}`);
      }
      if (path.resolve(entry.absolutePath ?? '') !== absolutePath) {
        throw new Error(`catalog entry absolutePath mismatch: ${relativePath}`);
      }
      const { bytes, stat } = readTrustedCatalogFile(expectedRoot, relativePath);
      assertTrustedCatalogFileStat(stat, `catalog source: ${relativePath}`);
      const expectedEntry = buildEntry(expectedRoot, absolutePath);
      assertCatalogEntryMetadata(entry, expectedEntry, relativePath);
    }
    assertSameCatalogFileSet(
      expectedFiles,
      enumerateCatalogFiles(expectedRoot, catalog.inventoryMode),
      'source inventory changed during catalog verification',
    );
    assertCatalogDirectoryIdentity(expectedRoot, rootIdentity);
  } finally {
    fs.closeSync(sourceRootFd);
  }
  return true;
}

export function writeAutomationEvidenceCatalog(outputPath, catalog, {
  outputRoot,
  repositoryRoot = process.cwd(),
} = {}) {
  const sourceRoot = requireDirectory(catalog?.sourceRoot, 'catalog sourceRoot');
  const repository = requireDirectory(repositoryRoot, 'repositoryRoot');
  const root = requireDirectory(outputRoot, 'explicit output root');
  const target = path.resolve(requireText(outputPath, 'outputPath'));
  assertContained(root, target, 'catalog output path');
  if (path.dirname(target) !== root) {
    throw new Error('catalog output must be a direct file under the explicit output root');
  }
  if (pathsOverlap(sourceRoot, root) || pathsOverlap(sourceRoot, target)
      || physicalPathsOverlap(sourceRoot, root) || physicalPathsOverlap(sourceRoot, target)) {
    throw new Error('catalog output root must be separate from the read-only source root');
  }
  assertCatalogOutputRoot(repository, root);
  const sourceIdentity = directoryIdentityAtPath(sourceRoot);
  const outputIdentity = directoryIdentityAtPath(root);
  verifyAutomationEvidenceCatalog(catalog, { sourceRoot });
  return writePrivateCatalogNoOverwrite({
    sourceRoot,
    sourceIdentity,
    outputRoot: root,
    outputIdentity,
    outputPath: target,
    catalog,
  });
}

function writePrivateCatalogNoOverwrite({ sourceRoot, sourceIdentity, outputRoot, outputIdentity, outputPath, catalog }) {
  assertSecureCatalogPublicationSupported();
  const directoryFd = openBoundCatalogOutputDirectory(outputRoot);
  let temporaryFd = null;
  let temporaryPath = null;
  try {
    assertPrivateCatalogOutputDirectory(directoryFd);
    assertCatalogDirectoryIdentity(outputRoot, outputIdentity);
    assertCatalogDirectoryIdentity(sourceRoot, sourceIdentity);
    const directoryPath = descriptorDirectoryPathFor(directoryFd);
    const outputName = path.basename(outputPath);
    ({ temporaryFd, temporaryPath } = createBoundCatalogTemporaryFile({ directoryPath, outputName }));
    const bytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    fs.writeFileSync(temporaryFd, bytes);
    fs.fchmodSync(temporaryFd, 0o600);
    const staged = fs.fstatSync(temporaryFd);
    assertPrivateCatalogFileFd(staged);
    const stagedIdentity = { dev: staged.dev, ino: staged.ino };
    fs.fsyncSync(temporaryFd);
    fs.closeSync(temporaryFd);
    temporaryFd = null;
    const destinationPath = path.join(directoryPath, outputName);
    assertCatalogDirectoryIdentity(outputRoot, outputIdentity);
    fs.linkSync(temporaryPath, destinationPath);
    assertPublishedCatalogOutput({ destinationPath, stagedIdentity, byteLength: bytes.length });
    assertCatalogDirectoryIdentity(outputRoot, outputIdentity);
    assertCatalogDirectoryIdentity(sourceRoot, sourceIdentity);
    fs.unlinkSync(temporaryPath);
    temporaryPath = null;
    fs.fsyncSync(directoryFd);
    // The catalog is now published. Re-read every source entry after that
    // irreversible publication point so an in-place source mutation cannot be
    // reported as a successful catalog write merely because the root directory
    // inode stayed stable.
    verifyAutomationEvidenceCatalog(catalog, { sourceRoot });
    assertCatalogDirectoryIdentity(sourceRoot, sourceIdentity);
    assertCatalogDirectoryIdentity(outputRoot, outputIdentity);
    assertPublishedCatalogOutput({ destinationPath, stagedIdentity, byteLength: bytes.length });
    return outputPath;
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`refusing to overwrite catalog: ${outputPath}`, { cause: error });
    }
    throw error;
  } finally {
    if (temporaryFd != null) fs.closeSync(temporaryFd);
    if (temporaryPath != null) {
      try { fs.unlinkSync(temporaryPath); } catch {}
    }
    fs.closeSync(directoryFd);
  }
}

function assertPublishedCatalogOutput({ destinationPath, stagedIdentity, byteLength }) {
  let destinationFd = null;
  try {
    destinationFd = fs.openSync(destinationPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const destination = fs.fstatSync(destinationFd);
    assertPrivateCatalogFileFd(destination);
    if (!sameCatalogIdentity(stagedIdentity, destination) || destination.size !== byteLength) {
      throw new Error('catalog output identity or byte length changed during publication');
    }
    const destinationPathStat = fs.lstatSync(destinationPath);
    if (destinationPathStat.isSymbolicLink() || !sameCatalogIdentity(destination, destinationPathStat)) {
      throw new Error('catalog output identity changed or is unavailable');
    }
  } catch (error) {
    if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
      throw new Error('catalog output identity changed or is unavailable', { cause: error });
    }
    throw error;
  } finally {
    if (destinationFd != null) fs.closeSync(destinationFd);
  }
}

function assertSecureCatalogPublicationSupported() {
  if (process.platform !== 'linux'
      || typeof process.getuid !== 'function'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || !fs.existsSync('/proc/self/fd')) {
    throw new Error('secure catalog publication is unavailable on this platform');
  }
}

function openBoundCatalogOutputDirectory(outputRoot) {
  const target = path.resolve(outputRoot);
  const filesystemRoot = path.parse(target).root;
  let directoryFd = openBoundCatalogDirectoryAtPath(filesystemRoot);
  try {
    for (const segment of path.relative(filesystemRoot, target).split(path.sep).filter(Boolean)) {
      const childFd = openBoundCatalogDirectoryAtPath(path.join(descriptorDirectoryPathFor(directoryFd), segment));
      fs.closeSync(directoryFd);
      directoryFd = childFd;
    }
    return directoryFd;
  } catch (error) {
    fs.closeSync(directoryFd);
    if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
      throw new Error('catalog output root must be an existing canonical ordinary directory', { cause: error });
    }
    throw error;
  }
}

function openBoundCatalogDirectoryAtPath(directoryPath) {
  return fs.openSync(
    directoryPath,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
}

function descriptorDirectoryPathFor(directoryFd) {
  return `/proc/self/fd/${directoryFd}`;
}

function createBoundCatalogTemporaryFile({ directoryPath, outputName }) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_EXCL
    | fs.constants.O_NOFOLLOW;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const temporaryPath = path.join(
      directoryPath,
      `.${outputName}.${crypto.randomBytes(16).toString('hex')}.tmp`,
    );
    try {
      return {
        temporaryPath,
        temporaryFd: fs.openSync(temporaryPath, flags, 0o600),
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('unable to reserve a secure catalog temporary file');
}

function assertPrivateCatalogOutputDirectory(directoryFd) {
  const stat = fs.fstatSync(directoryFd);
  if (!stat.isDirectory()
      || Number(stat.uid) !== Number(process.getuid())
      || (stat.mode & 0o022) !== 0) {
    throw new Error('catalog output root must be an owner-only writable directory');
  }
}

function assertPrivateCatalogFileFd(fileFd) {
  const stat = typeof fileFd === 'number' ? fs.fstatSync(fileFd) : fileFd;
  if (!stat.isFile() || stat.isSymbolicLink()
      || Number(stat.uid) !== Number(process.getuid())
      || (stat.mode & 0o7777) !== 0o600) {
    throw new Error('catalog output must be an ordinary private 0600 file');
  }
}

function assertCatalogOutputRoot(repositoryRoot, outputRoot) {
  const privateRoot = path.resolve(repositoryRoot, '.local', 'tmp');
  const relative = path.relative(privateRoot, path.resolve(outputRoot));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('catalog output root must remain under the repository .local/tmp private temporary root');
  }
  assertCanonicalDirectoryAndAncestors(path.resolve(outputRoot), 'catalog output root');
  assertTrustedCatalogDescendantAncestors(repositoryRoot, outputRoot, 'catalog output root');
  const outputFd = openBoundCatalogDirectory(path.resolve(outputRoot));
  try {
    assertTrustedCatalogDirectoryStat(fs.fstatSync(outputFd), 'catalog output root');
  } finally {
    fs.closeSync(outputFd);
  }
}

function assertTrustedCatalogDescendantAncestors(repositoryRoot, targetPath, label) {
  const root = path.resolve(repositoryRoot);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must remain inside the repository root`);
  }
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      throw new Error(`${label} ancestor is unavailable`, { cause: error });
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || Number(stat.uid) !== Number(process.getuid())
        || (stat.mode & 0o022) !== 0) {
      throw new Error(`${label} has an unsafe owner or writable ancestor`);
    }
  }
}

function buildEntry(root, absolutePath) {
  const relativePath = normalizeRelativeCatalogPath(
    path.relative(root, path.resolve(absolutePath)),
    'catalog source path',
  );
  const { bytes, stat } = readTrustedCatalogFile(root, relativePath);
  const classification = classify(relativePath);
  const timestamp = readContentTimestamp(bytes, relativePath);
  return {
    sourceRoot: root,
    relativePath,
    absolutePath,
    sha256: sha256Bytes(bytes),
    bytes: bytes.length,
    mode: '0600',
    symlink: false,
    domain: classification.domain,
    role: classification.role,
    category: classification.category,
    generationTime: timestamp,
    classification: classification.classification,
    consumed: classification.classification === 'consumed',
    historicalException: classification.classification === 'historical-exception',
    reusableFor: classification.reusableFor,
    forbiddenUses: classification.forbiddenUses,
  };
}

function enumerateStableCatalogFiles(root, inventoryMode) {
  const first = enumerateCatalogFiles(root, inventoryMode);
  const second = enumerateCatalogFiles(root, inventoryMode);
  assertSameCatalogFileSet(first, second, 'source inventory changed during enumeration');
  return first;
}

function enumerateCatalogFiles(root, inventoryMode) {
  if (!INVENTORY_MODES.has(inventoryMode)) throw new Error(`unsupported catalog inventory mode: ${inventoryMode}`);
  return inventoryMode === 'git-untracked' ? listGitUntrackedFiles(root) : listFiles(root);
}

function assertSameCatalogFileSet(expected, actual, message) {
  const left = expected.map((filePath) => path.resolve(filePath)).sort();
  const right = actual.map((filePath) => path.resolve(filePath)).sort();
  if (left.length !== right.length || left.some((filePath, index) => filePath !== right[index])) {
    throw new Error(message);
  }
}

function assertCatalogFileOrder(expected, actual) {
  const left = expected.map((filePath) => path.resolve(filePath));
  const right = actual.map((filePath) => path.resolve(filePath));
  if (left.length !== right.length || left.some((filePath, index) => filePath !== right[index])) {
    throw new Error('catalog entry order does not match the deterministic source inventory');
  }
}

function assertCatalogCounts(catalog, entries) {
  const expectedClassificationCounts = countClassifications(entries);
  const expectedCategoryCounts = countCategories(entries);
  if (!sameJsonValue(catalog.classificationCounts, expectedClassificationCounts)) {
    throw new Error('catalog classification counts do not match the source inventory');
  }
  if (!sameJsonValue(catalog.categoryCounts, expectedCategoryCounts)) {
    throw new Error('catalog category counts do not match the source inventory');
  }
}

function assertCatalogEntryMetadata(entry, expected, relativePath) {
  for (const field of [
    'sourceRoot',
    'relativePath',
    'absolutePath',
    'sha256',
    'bytes',
    'mode',
    'symlink',
    'domain',
    'role',
    'category',
    'classification',
    'consumed',
    'historicalException',
    'reusableFor',
    'forbiddenUses',
  ]) {
    if (!sameJsonValue(entry[field], expected[field])) {
      throw new Error(`catalog entry ${field} does not match source metadata: ${relativePath}`);
    }
  }
  assertGenerationTime(entry.generationTime, relativePath);
  if (!sameJsonValue(entry.generationTime, expected.generationTime)) {
    throw new Error(`catalog entry generationTime does not match source metadata: ${relativePath}`);
  }
  if (entry.domain !== 'global' && !DOMAIN_IDS.has(entry.domain)) {
    throw new Error(`catalog entry domain is invalid: ${relativePath}`);
  }
  if (!CLASSIFICATIONS.has(entry.classification)) {
    throw new Error(`catalog entry classification is invalid: ${relativePath}`);
  }
  if (!Array.isArray(entry.reusableFor) || entry.reusableFor.length === 0
      || entry.reusableFor.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error(`catalog entry reusableFor is required: ${relativePath}`);
  }
  if (!Array.isArray(entry.forbiddenUses) || entry.forbiddenUses.length === 0
      || entry.forbiddenUses.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error(`catalog entry forbiddenUses is required: ${relativePath}`);
  }
}

function assertGenerationTime(value, relativePath) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !['content', 'unavailable'].includes(value.source)) {
    throw new Error(`catalog entry generationTime is invalid: ${relativePath}`);
  }
  if (value.source === 'unavailable') {
    if (value.field !== null || value.value !== null) {
      throw new Error(`catalog entry unavailable generationTime must be explicit: ${relativePath}`);
    }
    return;
  }
  if (!TIMESTAMP_FIELDS.includes(value.field) || typeof value.value !== 'string'
      || !Number.isFinite(Date.parse(value.value))) {
    throw new Error(`catalog entry content generationTime is invalid: ${relativePath}`);
  }
}

function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value ?? {})) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown metadata field: ${key}`);
  }
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function listFiles(root) {
  const output = [];
  const pending = [];
  const rootFd = openBoundCatalogDirectory(root);
  pending.push({ directoryPath: root, directoryFd: rootFd });
  try {
    while (pending.length > 0) {
      const { directoryPath, directoryFd } = pending.pop();
      try {
        assertTrustedCatalogDirectoryStat(fs.fstatSync(directoryFd), 'catalog source directory');
        const descriptorPath = descriptorDirectoryPathFor(directoryFd);
        const entries = fs.readdirSync(descriptorPath, { withFileTypes: true })
          .sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          const absolutePath = path.join(directoryPath, entry.name);
          const descriptorChildPath = path.join(descriptorPath, entry.name);
          let stat = fs.lstatSync(descriptorChildPath);
          if (stat.isSymbolicLink()) {
            throw new Error(`symlink is not allowed in evidence root: ${absolutePath}`);
          }
          if (stat.isDirectory()) {
            const childFd = fs.openSync(
              descriptorChildPath,
              fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
            );
            const opened = fs.fstatSync(childFd);
            if (!sameCatalogIdentity(stat, opened)) {
              fs.closeSync(childFd);
              throw new Error(`catalog source directory identity changed or is unavailable: ${absolutePath}`);
            }
            assertTrustedCatalogDirectoryStat(opened, 'catalog source directory');
            pending.push({ directoryPath: absolutePath, directoryFd: childFd });
          } else if (stat.isFile()) {
            output.push(absolutePath);
          } else {
            throw new Error(`unsupported source entry: ${absolutePath}`);
          }
        }
      } finally {
        fs.closeSync(directoryFd);
      }
    }
  } catch (error) {
    for (const pendingDirectory of pending) {
      try { fs.closeSync(pendingDirectory.directoryFd); } catch {}
    }
    throw error;
  }
  return output.sort((a, b) => a.localeCompare(b));
}

function listGitUntrackedFiles(root) {
  let output;
  try {
    output = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`unable to read untracked evidence files: ${error.message}`);
  }
  return output.split('\0')
    .filter(Boolean)
    .map((relativePath) => {
      const normalized = normalizeRelativeCatalogPath(relativePath, 'untracked evidence path');
      const absolutePath = path.resolve(root, normalized);
      assertContained(root, absolutePath, 'untracked evidence path');
      // Open and validate every Git result here.  A symlink must fail closed;
      // filtering it would make the inventory silently incomplete.
      readTrustedCatalogFile(root, normalized);
      return absolutePath;
    })
    .sort((a, b) => a.localeCompare(b));
}

function classify(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized === 'v2-preflight-readback.json') {
    return baselineClassification('v2-preflight-readback');
  }
  if (normalized.startsWith('reports/audit/')) return baselineClassification('audit-report');
  if (normalized.startsWith('reports/relation/')) return baselineClassification('relation-report');
  if (normalized.startsWith('reports/authorization/canonical/l1-historical-source-hash-disposition/')) {
    const segments = normalized.split('/');
    const domain = segments[4];
    if (!DOMAIN_IDS.has(domain)) {
      throw new Error(`unrecognized historical disposition domain: ${relativePath}`);
    }
    return {
      domain,
      role: roleFromPath(normalized),
      classification: 'historical-exception',
      category: 'historical-source-hash-disposition',
      reusableFor: ['historical-source-hash-disposition-review'],
      forbiddenUses: ['new-source-payload', 'scheduler-authorization', 'database-import', 'hash-exception-replay'],
    };
  }
  if (normalized.startsWith('reports/authorization/canonical/automation-')) {
    const match = normalized.match(/automation-([a-z][a-z-]*)-l2-promotion(?:[./-]|\/)/);
    const candidateDomain = match ? match[1].replaceAll('-', '_') : null;
    if (!candidateDomain || !DOMAIN_IDS.has(candidateDomain)) {
      throw new Error(`unrecognized automation evidence domain: ${relativePath}`);
    }
    const domain = candidateDomain;
    return {
      domain,
      role: roleFromPath(normalized),
      classification: 'consumed',
      category: 'eight-domain-l2-automation-evidence',
      reusableFor: ['historical-policy-lineage', 'read-only-acceptance-context'],
      forbiddenUses: ['new-source-payload', 'scheduler-authorization', 'database-import', 'packet-replay', 'identity-reuse'],
    };
  }
  throw new Error(`unclassified retained evidence path: ${relativePath}`);
}

function baselineClassification(role) {
  const category = role === 'audit-report'
    ? 'audit-reports'
    : role === 'relation-report'
      ? 'relation-reports'
      : 'v2-preflight-readback';
  return {
    domain: 'global',
    role,
    category,
    classification: 'baseline',
    reusableFor: ['read-only-baseline-context', 'plan-acceptance-reference'],
    forbiddenUses: ['business-data-payload', 'scheduler-authorization', 'database-import', 'identity-reuse'],
  };
}

function roleFromPath(relativePath) {
  const base = path.posix.basename(relativePath);
  if (base === 'disposition.json') return 'disposition';
  if (base === 'proposal.json') return 'proposal';
  if (base === 'readiness.json') return 'proposal-input';
  if (base.endsWith('.result.json.commit.json')) return 'commit-marker';
  for (const role of ['execution-manifest', 'owner-input', 'policy-rows', 'server-fingerprint', 'input', 'packet', 'request', 'result']) {
    if (base.includes(`.${role}.json`) || base.endsWith(`-${role}.json`)) return role;
  }
  return 'evidence-artifact';
}

function readContentTimestamp(bytes, relativePath) {
  if (!relativePath.toLowerCase().endsWith('.json')) {
    return { field: null, value: null, source: 'unavailable' };
  }
  try {
    const payload = JSON.parse(bytes.toString('utf8'));
    const found = findTimestamp(payload);
    return found ?? { field: null, value: null, source: 'unavailable' };
  } catch {
    return { field: null, value: null, source: 'unavailable' };
  }
}

function findTimestamp(value) {
  if (!value || typeof value !== 'object') return null;
  for (const field of TIMESTAMP_FIELDS) {
    if (typeof value[field] === 'string' && value[field].trim()) {
      return { field, value: value[field], source: 'content' };
    }
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findTimestamp(child);
      if (found) return found;
    }
    return null;
  }
  for (const child of Object.values(value)) {
    const found = findTimestamp(child);
    if (found) return found;
  }
  return null;
}

function countClassifications(entries) {
  return entries.reduce((counts, entry) => {
    counts[entry.classification] = (counts[entry.classification] ?? 0) + 1;
    return counts;
  }, { consumed: 0, 'historical-exception': 0, baseline: 0 });
}

function countCategories(entries) {
  return entries.reduce((counts, entry) => {
    counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    return counts;
  }, {});
}

function hashJson(value) {
  return `sha256:${crypto.createHash('sha256').update(`${JSON.stringify(value)}\n`).digest('hex')}`;
}

function sha256Bytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function requireDirectory(value, label) {
  assertSecureCatalogPlatform();
  const resolved = path.resolve(requireText(value, label));
  assertCanonicalDirectoryAndAncestors(resolved, label);
  const stat = fs.lstatSync(resolved);
  assertTrustedCatalogDirectoryStat(stat, label);
  return resolved;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function assertContained(root, candidate, label) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes source root`);
  }
}

function pathsOverlap(leftPath, rightPath) {
  return isSameOrDescendant(leftPath, rightPath) || isSameOrDescendant(rightPath, leftPath);
}

function isSameOrDescendant(candidatePath, ancestorPath) {
  const relative = path.relative(path.resolve(ancestorPath), path.resolve(candidatePath));
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertSecureCatalogPlatform() {
  if (process.platform !== 'linux'
      || typeof process.getuid !== 'function'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || !fs.existsSync('/proc/self/fd')) {
    throw new Error('secure automation evidence catalog access is unavailable on this platform');
  }
}

function assertCanonicalDirectoryAndAncestors(directoryPath, label) {
  const target = path.resolve(directoryPath);
  const filesystemRoot = path.parse(target).root;
  let current = filesystemRoot;
  const rootStat = fs.lstatSync(filesystemRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`${label} has an unsafe filesystem-root ancestor`);
  }
  for (const segment of path.relative(filesystemRoot, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      throw new Error(`${label} must be an existing canonical ordinary directory`, { cause: error });
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`${label} has a symbolic-link or non-directory ancestor`);
    }
    let real;
    try {
      real = fs.realpathSync(current);
    } catch (error) {
      throw new Error(`${label} ancestor cannot be canonicalized`, { cause: error });
    }
    if (path.resolve(real) !== current) {
      throw new Error(`${label} has a non-canonical ancestor`);
    }
  }
}

function assertTrustedCatalogDirectoryStat(stat, label) {
  if (!stat?.isDirectory?.() || stat.isSymbolicLink?.()) {
    throw new Error(`${label} must be an ordinary directory`);
  }
  if (Number(stat.uid) !== Number(process.getuid()) || (stat.mode & 0o022) !== 0) {
    throw new Error(`${label} must be owned by the automation service UID and not group/other writable`);
  }
}

function assertTrustedCatalogFileStat(stat, label) {
  if (!stat?.isFile?.() || stat.isSymbolicLink?.()) {
    throw new Error(`${label} must be an ordinary file`);
  }
  if (Number(stat.uid) !== Number(process.getuid())) {
    throw new Error(`${label} must be owned by the automation service UID`);
  }
  if ((stat.mode & 0o7777) !== 0o600) {
    throw new Error(`${label} must be mode 0600`);
  }
}

function openBoundCatalogDirectory(directoryPath) {
  const target = path.resolve(directoryPath);
  const filesystemRoot = path.parse(target).root;
  let directoryFd = fs.openSync(
    filesystemRoot,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    for (const segment of path.relative(filesystemRoot, target).split(path.sep).filter(Boolean)) {
      const childPath = path.join(descriptorDirectoryPathFor(directoryFd), segment);
      const childFd = fs.openSync(
        childPath,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
      );
      fs.closeSync(directoryFd);
      directoryFd = childFd;
    }
    return directoryFd;
  } catch (error) {
    fs.closeSync(directoryFd);
    throw catalogPathError(error, 'catalog directory identity changed or is unavailable');
  }
}

function readTrustedCatalogFile(root, relativePath) {
  const normalized = normalizeRelativeCatalogPath(relativePath, 'catalog source path');
  let rootFd = openBoundCatalogDirectory(root);
  let directoryFd = rootFd;
  let fileFd = null;
  try {
    const segments = normalized.split('/');
    for (const segment of segments.slice(0, -1)) {
      const childPath = path.join(descriptorDirectoryPathFor(directoryFd), segment);
      const childFd = fs.openSync(
        childPath,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
      );
      const childStat = fs.fstatSync(childFd);
      assertTrustedCatalogDirectoryStat(childStat, 'catalog source ancestor');
      fs.closeSync(directoryFd);
      if (directoryFd === rootFd) rootFd = null;
      directoryFd = childFd;
    }
    const filePath = path.join(descriptorDirectoryPathFor(directoryFd), segments.at(-1));
    fileFd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(fileFd);
    assertTrustedCatalogFileStat(before, 'catalog source');
    const bytes = fs.readFileSync(fileFd);
    const after = fs.fstatSync(fileFd);
    if (!sameCatalogIdentity(before, after) || after.size !== bytes.length) {
      throw new Error('catalog source file identity changed or is unavailable');
    }
    assertTrustedCatalogFileStat(after, 'catalog source');
    const destination = fs.lstatSync(filePath);
    if (!sameCatalogIdentity(before, destination) || destination.isSymbolicLink()) {
      throw new Error('catalog source file identity changed or is unavailable');
    }
    return Object.freeze({ bytes, stat: after, relativePath: normalized });
  } catch (error) {
    throw catalogPathError(error, 'catalog source file identity changed or is unavailable');
  } finally {
    if (fileFd != null) fs.closeSync(fileFd);
    if (directoryFd != null) fs.closeSync(directoryFd);
    if (rootFd != null && rootFd !== directoryFd) fs.closeSync(rootFd);
  }
}

function normalizeRelativeCatalogPath(value, label) {
  const text = requireText(value, label).replaceAll('\\', '/');
  if (text.startsWith('/') || path.posix.isAbsolute(text) || text.includes('\0')) {
    throw new Error(`${label} must be a relative path`);
  }
  const normalized = path.posix.normalize(text);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')
      || normalized.includes('/../') || normalized.includes('//')) {
    throw new Error(`${label} must remain inside the source root`);
  }
  return normalized;
}

function sameCatalogIdentity(left, right) {
  return left != null && right != null && left.dev === right.dev && left.ino === right.ino;
}

function directoryIdentityAtPath(directoryPath) {
  const directoryFd = openBoundCatalogDirectory(directoryPath);
  try {
    const stat = fs.fstatSync(directoryFd);
    assertTrustedCatalogDirectoryStat(stat, 'catalog directory');
    return Object.freeze({ dev: stat.dev, ino: stat.ino });
  } finally {
    fs.closeSync(directoryFd);
  }
}

function assertCatalogDirectoryIdentity(directoryPath, expectedIdentity) {
  const current = directoryIdentityAtPath(directoryPath);
  if (!sameCatalogIdentity(current, expectedIdentity)) {
    throw new Error('catalog directory identity changed or is unavailable');
  }
}

function physicalPathsOverlap(leftPath, rightPath) {
  let left;
  let right;
  try {
    left = canonicalizePossiblyMissingPath(leftPath);
    right = canonicalizePossiblyMissingPath(rightPath);
  } catch (error) {
    throw new Error('catalog source/output path cannot be canonicalized', { cause: error });
  }
  return isSameOrDescendant(left, right) || isSameOrDescendant(right, left);
}

function canonicalizePossiblyMissingPath(candidatePath) {
  const target = path.resolve(candidatePath);
  try {
    return path.resolve(fs.realpathSync(target));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const parent = path.resolve(fs.realpathSync(path.dirname(target)));
    return path.join(parent, path.basename(target));
  }
}

function catalogPathError(error, fallback) {
  if (error?.code === 'ELOOP') {
    return new Error(`${fallback}; symbolic-link path is not allowed`, { cause: error });
  }
  if (['ENOENT', 'ENOTDIR'].includes(error?.code)) {
    return new Error(fallback, { cause: error });
  }
  return error;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((token) => token.startsWith('--')).map((token) => {
    const [key, ...rest] = token.slice(2).split('=');
    return [key, rest.length === 0 ? 'true' : rest.join('=')];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const catalog = buildAutomationEvidenceCatalog({
      sourceRoot: args['source-root'],
      expectedCount: args['expected-count'] == null ? null : Number(args['expected-count']),
      gitUntrackedOnly: args['git-untracked-only'] === 'true',
    });
    verifyAutomationEvidenceCatalog(catalog, { expectedCount: catalog.entryCount });
    const outputPath = writeAutomationEvidenceCatalog(args.output, catalog, {
      outputRoot: args['output-root'],
    });
    process.stdout.write(`${JSON.stringify({ outputPath, entryCount: catalog.entryCount, classificationCounts: catalog.classificationCounts, categoryCounts: catalog.categoryCounts })}\n`);
  } catch (error) {
    process.stderr.write(`automation evidence catalog failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
