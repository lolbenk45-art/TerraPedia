import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..');
const configCache = new Map();

export function getRepoRoot() {
  return DEFAULT_REPO_ROOT;
}

export function loadLocalStackConfig(repoRoot = DEFAULT_REPO_ROOT) {
  const normalizedRepoRoot = path.resolve(repoRoot);
  if (configCache.has(normalizedRepoRoot)) {
    return configCache.get(normalizedRepoRoot);
  }

  const configPath = resolveLocalStackConfigPath(normalizedRepoRoot);
  if (!configPath) {
    configCache.set(normalizedRepoRoot, {});
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    configCache.set(normalizedRepoRoot, parsed);
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse ${configPath}: ${error.message}`);
  }
}

export function resolveAdminAuth(rawOptions = {}, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? DEFAULT_REPO_ROOT);
  const config = loadLocalStackConfig(repoRoot);
  const usernameKey = options.usernameKey ?? 'username';
  const passwordKey = options.passwordKey ?? 'password';
  const requiredPassword = options.requiredPassword ?? true;
  const configAdmin = getConfigValue(config, ['auth', 'admin']) ?? {};
  const username = firstText(
    rawOptions[usernameKey],
    process.env.TERRAPEDIA_ADMIN_USERNAME,
    configAdmin.username,
    options.fallbackUsername ?? 'admin'
  );
  const password = firstText(
    rawOptions[passwordKey],
    process.env.TERRAPEDIA_ADMIN_PASSWORD,
    configAdmin.password
  );

  if (requiredPassword && !password) {
    const configPath = resolveLocalStackConfigPath(repoRoot) ?? path.join(repoRoot, 'scripts', 'dev', 'config', 'local-stack.config.json');
    throw new Error(
      `Missing admin password. Set --${passwordKey}=..., TERRAPEDIA_ADMIN_PASSWORD, or auth.admin.password in ${configPath}.`
    );
  }

  return { username, password };
}

export function resolveBackendApiBase(rawOptions = {}, options = {}) {
  const explicit = firstText(
    rawOptions.apiBase,
    rawOptions['api-base'],
    process.env.TERRAPEDIA_API_BASE
  );
  if (explicit) {
    return trimTrailingSlash(explicit);
  }

  const repoRoot = path.resolve(options.repoRoot ?? DEFAULT_REPO_ROOT);
  const config = loadLocalStackConfig(repoRoot);
  const backendConfig = getConfigValue(config, ['backend']) ?? {};
  const host = firstText(
    backendConfig.host,
    process.env.TERRAPEDIA_BACKEND_HOST,
    '127.0.0.1'
  );
  const port = Number(
    backendConfig.port
    ?? process.env.TERRAPEDIA_BACKEND_PORT
    ?? 18088
  );

  return `http://${host}:${Number.isFinite(port) ? port : 18088}/api`;
}

function getConfigValue(root, segments) {
  let current = root;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = current[segment];
  }
  return current ?? null;
}

function resolveLocalStackConfigPath(repoRoot) {
  for (const root of candidateRepoRoots(repoRoot)) {
    const candidates = [
      path.join(root, 'scripts', 'dev', 'config', 'local-stack.config.json'),
      path.join(root, 'scripts', 'dev', 'local-stack.config.json'),
    ];
    const resolved = candidates.find((candidate) => fs.existsSync(candidate));
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function candidateRepoRoots(repoRoot) {
  const roots = [];
  const primaryWorktreeRoot = resolvePrimaryWorktreeRoot(repoRoot);
  if (primaryWorktreeRoot) {
    roots.push(primaryWorktreeRoot);
  }
  let current = path.resolve(repoRoot);
  while (true) {
    roots.push(current);
    const worktreeMarker = path.join(current, '.worktrees');
    if (fs.existsSync(worktreeMarker) && fs.statSync(worktreeMarker).isDirectory()) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return [...new Set(roots)];
}

function resolvePrimaryWorktreeRoot(repoRoot) {
  const gitFilePath = path.join(path.resolve(repoRoot), '.git');
  if (!fs.existsSync(gitFilePath) || fs.statSync(gitFilePath).isDirectory()) {
    return null;
  }
  const content = fs.readFileSync(gitFilePath, 'utf8').trim();
  const match = content.match(/^gitdir:\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const gitDir = path.resolve(repoRoot, match[1].trim());
  const worktreesIndex = gitDir.split(path.sep).lastIndexOf('worktrees');
  if (worktreesIndex <= 0) {
    return null;
  }
  const commonGitDir = gitDir.split(path.sep).slice(0, worktreesIndex).join(path.sep) || path.sep;
  const primaryRoot = path.dirname(commonGitDir);
  return fs.existsSync(path.join(primaryRoot, '.git')) ? primaryRoot : null;
}

function firstText(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return '';
}

function toText(value) {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

function trimTrailingSlash(value) {
  let result = String(value).trim();
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}
