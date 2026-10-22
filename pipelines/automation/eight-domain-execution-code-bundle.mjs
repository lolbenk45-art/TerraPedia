import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME_ROOTS = Object.freeze([
  'pipelines',
  'platform/local',
  'scripts/lib',
  'apps/admin-console/package.json',
  'apps/admin-console/pnpm-lock.yaml',
  'services/catalog-api/pom.xml',
]);
const BUNDLE_VERSION = 1;

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function hashJson(value) {
  return hashBytes(Buffer.from(JSON.stringify(value), 'utf8'));
}

function repositoryPaths(repoRoot) {
  const output = execFileSync('git', ['-C', path.resolve(repoRoot), 'ls-files', '--cached', '--others', '--exclude-standard', '--', ...RUNTIME_ROOTS], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return [...new Set(output.split(/\r?\n/).filter(Boolean).map((value) => value.replaceAll('\\', '/')))].sort();
}

function readRuntimeFile(repoRoot, relativePath) {
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('code bundle path must stay inside the execution root');
  }
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`code bundle input must be an ordinary file: ${relativePath}`);
  return fs.readFileSync(target);
}

function assertBundleShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schemaVersion !== BUNDLE_VERSION || value.manifestKind !== 'eight_domain_execution_code_bundle'
      || !Array.isArray(value.files) || !value.files.length || !/^sha256:[a-f0-9]{64}$/.test(value.bundleSha256 ?? '')) {
    throw new Error('execution code bundle manifest identity or shape is invalid');
  }
  const { bundleSha256, ...body } = value;
  if (hashJson(body) !== bundleSha256) throw new Error('execution code bundle content hash drift');
  const paths = value.files.map((entry) => entry.path);
  if (paths.some((entry) => typeof entry !== 'string' || !entry || path.isAbsolute(entry)
      || entry.split('/').includes('..')) || new Set(paths).size !== paths.length
      || [...paths].sort().join('\n') !== paths.join('\n')) {
    throw new Error('execution code bundle file list is invalid');
  }
  for (const entry of value.files) {
    if (!/^sha256:[a-f0-9]{64}$/.test(entry.sha256 ?? '') || !Number.isSafeInteger(entry.byteSize) || entry.byteSize < 0) {
      throw new Error('execution code bundle file evidence is invalid');
    }
  }
  return value;
}

export function buildExecutionCodeBundleManifest({ repoRoot } = {}) {
  const root = path.resolve(String(repoRoot ?? ''));
  if (!repoRoot) throw new Error('execution code bundle repoRoot is required');
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const files = repositoryPaths(root).map((relativePath) => {
    const bytes = readRuntimeFile(root, relativePath);
    return Object.freeze({ path: relativePath, sha256: hashBytes(bytes), byteSize: bytes.length });
  });
  const body = {
    schemaVersion: BUNDLE_VERSION,
    manifestKind: 'eight_domain_execution_code_bundle',
    executionRoot: root,
    baseCommit: commit,
    runtimeRoots: [...RUNTIME_ROOTS],
    files: Object.freeze(files),
  };
  return Object.freeze({ ...body, bundleSha256: hashJson(body) });
}

export function verifyExecutionCodeBundleManifest(value, { repoRoot } = {}) {
  const manifest = assertBundleShape(value);
  const root = path.resolve(String(repoRoot ?? ''));
  if (!repoRoot || manifest.executionRoot !== root) throw new Error('execution code bundle root differs from the active worktree');
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (manifest.baseCommit !== commit || JSON.stringify(manifest.runtimeRoots) !== JSON.stringify(RUNTIME_ROOTS)) {
    throw new Error('execution code bundle base commit or runtime roots drifted');
  }
  const actualPaths = repositoryPaths(root);
  if (actualPaths.join('\n') !== manifest.files.map((entry) => entry.path).join('\n')) {
    throw new Error('execution code bundle file set drifted');
  }
  for (const entry of manifest.files) {
    const bytes = readRuntimeFile(root, entry.path);
    if (hashBytes(bytes) !== entry.sha256 || bytes.length !== entry.byteSize) {
      throw new Error(`execution code bundle content drifted: ${entry.path}`);
    }
  }
  return Object.freeze({ status: 'verified', bundleSha256: manifest.bundleSha256, baseCommit: manifest.baseCommit, fileCount: manifest.files.length });
}
