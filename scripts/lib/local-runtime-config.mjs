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
  const candidates = [
    path.join(repoRoot, 'scripts', 'dev', 'config', 'local-stack.config.json'),
    path.join(repoRoot, 'scripts', 'dev', 'local-stack.config.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
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
