import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot, resolveSharedDataRoot } from '../../pipelines/lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CONSTANTS_PATH = path.resolve(__dirname, '..', 'config', 'project.constants.json');
let cachedConstants = null;

export function getProjectConstants({ constantsPath = DEFAULT_CONSTANTS_PATH } = {}) {
  const resolvedConstantsPath = path.resolve(constantsPath);
  if (cachedConstants?.path === resolvedConstantsPath) {
    return cachedConstants.value;
  }

  let value;
  try {
    value = JSON.parse(fs.readFileSync(resolvedConstantsPath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to load project constants from ${resolvedConstantsPath}: ${error.message}`);
  }
  validateConstants(value, resolvedConstantsPath);
  cachedConstants = { path: resolvedConstantsPath, value };
  return value;
}

export function resolveProjectConstantPath(key, {
  repoRoot = getProjectRoot(),
  suffix = [],
  constants = getProjectConstants()
} = {}) {
  const relativePath = readConstant(constants, key);
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error(`Project constant ${key} must be a non-empty relative path`);
  }
  return resolveConfiguredPath(path.join(relativePath, ...normalizeSuffix(suffix)), { repoRoot });
}

export function resolveSharedDataConstantPath(key, {
  suffix = [],
  constants = getProjectConstants()
} = {}) {
  const relativePath = readConstant(constants, key);
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error(`Project constant ${key} must be a non-empty relative shared-data path`);
  }
  const sharedRoot = resolveSharedDataRoot();
  const resolved = path.resolve(sharedRoot, relativePath, ...normalizeSuffix(suffix));
  if (!isWithinRoot(path.resolve(sharedRoot), resolved)) {
    throw new Error(`Resolved path escapes outside shared-data root: ${resolved}`);
  }
  return resolved;
}

export function resolveConfiguredPath(candidate, {
  repoRoot = getProjectRoot(),
  allowExternal = false
} = {}) {
  const normalizedRoot = path.resolve(repoRoot);
  const resolvedCandidate = path.resolve(normalizedRoot, String(candidate ?? ''));
  if (!allowExternal && !isWithinRoot(normalizedRoot, resolvedCandidate)) {
    throw new Error(`Resolved path escapes outside repository root: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
}

export function resolveExternalConstantPath(key, {
  suffix = [],
  constants = getProjectConstants(),
  env = process.env
} = {}) {
  const configured = readConstant(constants, key);
  if (typeof configured !== 'string' || !configured.trim()) {
    throw new Error(`Project constant ${key} must be a non-empty external default path`);
  }
  const expandHome = (candidate) => String(candidate).startsWith('~/')
    ? path.join(os.homedir(), String(candidate).slice(2))
    : String(candidate);
  const value = expandHome(configured);
  const envName = key === 'externalDefaults.minioDataDir' ? 'TERRAPEDIA_MINIO_DATA_DIR' : null;
  const selected = envName && String(env[envName] ?? '').trim()
    ? expandHome(String(env[envName]).trim())
    : value;
  const resolvedBase = path.resolve(selected);
  const resolved = path.resolve(resolvedBase, ...normalizeSuffix(suffix));
  if (!isWithinRoot(resolvedBase, resolved)) {
    throw new Error(`Resolved path escapes outside external root: ${resolved}`);
  }
  return resolved;
}

function readConstant(root, key) {
  return String(key).split('.').reduce((current, segment) => current?.[segment], root);
}

function normalizeSuffix(suffix) {
  if (suffix == null) {
    return [];
  }
  if (!Array.isArray(suffix)) {
    throw new TypeError('Project constant suffix must be an array');
  }
  return suffix.map((segment) => String(segment));
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function validateConstants(value, constantsPath) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Project constants at ${constantsPath} must be a JSON object`);
  }
  if (value.project?.id !== 'terrapedia') {
    throw new Error(`Project constants at ${constantsPath} must declare project.id=terrapedia`);
  }
  for (const key of ['pipelines', 'reports', 'docs']) {
    if (typeof value.roots?.[key] !== 'string' || !value.roots[key].trim()) {
      throw new Error(`Project constants at ${constantsPath} is missing roots.${key}`);
    }
  }
}
