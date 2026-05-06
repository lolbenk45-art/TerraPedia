import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FALLBACK_PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

let cachedProjectRoot = null;

export function getProjectRoot() {
  if (cachedProjectRoot) {
    return cachedProjectRoot;
  }

  const envRoot = normalizeDirectory(process.env.WORKTREE_ROOT || process.env.TERRAPEDIA_PROJECT_ROOT);
  if (envRoot) {
    cachedProjectRoot = envRoot;
    return cachedProjectRoot;
  }

  const cwdRoot = findRepositoryRoot(process.cwd());
  if (cwdRoot) {
    cachedProjectRoot = cwdRoot;
    return cachedProjectRoot;
  }

  const gitRoot = resolveGitTopLevel();
  if (gitRoot) {
    cachedProjectRoot = gitRoot;
    return cachedProjectRoot;
  }

  cachedProjectRoot = FALLBACK_PROJECT_ROOT;
  return cachedProjectRoot;
}

export function resolveProjectPath(...segments) {
  return path.join(getProjectRoot(), ...segments);
}

export function resolveSharedDataRoot(...segments) {
  const configuredRoot = normalizeDirectory(
    process.env.TERRAPEDIA_SHARED_DATA_ROOT ??
    process.env.TERRAPEDIA_SOURCE_DATA_DIR
  );
  if (configuredRoot) {
    return path.join(configuredRoot, ...segments);
  }

  const projectRoot = getProjectRoot();
  const workspaceRoot = deriveWorkspaceRoot(projectRoot);
  return path.join(workspaceRoot, 'data', 'terraPedia', ...segments);
}

function resolveGitTopLevel() {
  try {
    const stdout = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return normalizeDirectory(stdout);
  } catch {
    return findRepositoryRoot(FALLBACK_PROJECT_ROOT);
  }
}

function findRepositoryRoot(startDirectory) {
  let current = normalizeDirectory(startDirectory);
  while (current) {
    if (isRepositoryRoot(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
  return null;
}

function deriveWorkspaceRoot(projectRoot) {
  const normalizedProjectRoot = normalizeDirectory(projectRoot);
  if (!normalizedProjectRoot) {
    return path.dirname(FALLBACK_PROJECT_ROOT);
  }

  const worktreeContainer = path.dirname(normalizedProjectRoot);
  if (path.basename(worktreeContainer) === '.worktrees') {
    return path.dirname(path.dirname(path.dirname(normalizedProjectRoot)));
  }

  return path.dirname(normalizedProjectRoot);
}

function isRepositoryRoot(directory) {
  if (!directory) {
    return false;
  }
  return (
    fs.existsSync(path.join(directory, '.git')) &&
    fs.existsSync(path.join(directory, 'scripts')) &&
    fs.existsSync(path.join(directory, 'project-plan'))
  );
}

function normalizeDirectory(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }
  return path.resolve(normalized);
}
