import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_MINIO_BUCKET = 'terrapedia-images';
const DEFAULT_MINIO_OBJECT_PREFIX = 'items';
const DEFAULT_MANAGED_IMAGE_OBJECT_PREFIXES = ['items', 'npcs', 'projectiles', 'buffs', 'bosses'];

export const DEFAULT_MANAGED_IMAGE_URL_PREFIXES = [
  'http://localhost:9000/terrapedia-images/items/',
  'http://127.0.0.1:9000/terrapedia-images/items/',
  'http://localhost:9000/terrapedia-images/npcs/',
  'http://127.0.0.1:9000/terrapedia-images/npcs/',
  'http://localhost:9000/terrapedia-images/projectiles/',
  'http://127.0.0.1:9000/terrapedia-images/projectiles/',
  'http://localhost:9000/terrapedia-images/buffs/',
  'http://127.0.0.1:9000/terrapedia-images/buffs/',
  'http://localhost:9000/terrapedia-images/bosses/',
  'http://127.0.0.1:9000/terrapedia-images/bosses/'
];

export function resolveManagedImageUrlPrefixes(options = {}) {
  const env = options.env ?? process.env;
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const config = readLocalStackMinioConfig(repoRoot);
  const bucket = trimObjectPath(firstText(
    options.bucket,
    env.TERRAPEDIA_MINIO_BUCKET,
    config.bucket,
    DEFAULT_MINIO_BUCKET
  ));
  const objectPrefixes = resolveObjectPrefixes(options, env, config);
  const prefixes = new Set();

  for (const prefix of splitPrefixList(firstText(options.prefixes, env.TERRAPEDIA_MANAGED_IMAGE_URL_PREFIXES))) {
    const normalized = normalizePrefix(prefix);
    if (normalized) {
      prefixes.add(normalized);
    }
  }

  for (const objectPrefix of objectPrefixes) {
    addManagedMinioPrefix(prefixes, firstText(
      options.publicEndpoint,
      env.TERRAPEDIA_MINIO_PUBLIC_ENDPOINT,
      config.publicEndpoint
    ), bucket, objectPrefix);
    addManagedMinioPrefix(prefixes, firstText(
      options.endpoint,
      env.TERRAPEDIA_MINIO_ENDPOINT,
      config.endpoint
    ), bucket, objectPrefix);
  }

  const credentialsEndpoint = deriveEndpointFromCredentialsFile(firstText(
    options.credentialsFile,
    env.TERRAPEDIA_MINIO_CREDENTIALS_FILE,
    config.credentialsFile
  ), repoRoot);
  for (const objectPrefix of objectPrefixes) {
    addManagedMinioPrefix(prefixes, credentialsEndpoint, bucket, objectPrefix);
  }

  return [...prefixes];
}

function resolveObjectPrefixes(options, env, config) {
  const explicit = splitPrefixList(firstText(
    options.objectPrefixes,
    options.managedImageObjectPrefixes,
    env.TERRAPEDIA_MANAGED_IMAGE_OBJECT_PREFIXES,
    config.managedImageObjectPrefixes
  ))
    .map(trimObjectPath)
    .filter(Boolean);
  if (explicit.length > 0) {
    return [...new Set(explicit)];
  }
  const single = trimObjectPath(firstText(
    options.objectPrefix,
    env.TERRAPEDIA_MINIO_OBJECT_PREFIX,
    config.objectPrefix,
    DEFAULT_MINIO_OBJECT_PREFIX
  ));
  return [...new Set([...DEFAULT_MANAGED_IMAGE_OBJECT_PREFIXES, ...(single ? [single] : [])])];
}

export function normalizeManagedImageUrlPrefixes(prefixes) {
  const raw = Array.isArray(prefixes) ? prefixes : [];
  return [...new Set(raw.map(normalizePrefix).filter(Boolean))];
}

export function isManagedImageUrl(value, prefixes) {
  const candidate = parseHttpUrl(value);
  if (!candidate) {
    return false;
  }
  return normalizeManagedImageUrlPrefixes(prefixes).some((prefix) => {
    const trusted = parseHttpUrl(prefix);
    return trusted != null
      && sameOrigin(candidate, trusted)
      && startsWithPath(candidate.pathname, trusted.pathname);
  });
}

function normalizePrefix(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  const parsed = parseConfiguredHttpUrl(text, { allowProtocolRelative: false });
  if (!parsed) {
    return null;
  }
  const pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
  return `${parsed.protocol}//${parsed.host}${pathname}`;
}

function addManagedMinioPrefix(prefixes, endpoint, bucket, objectPrefix) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!normalizedEndpoint || !bucket) {
    return;
  }
  const parts = [bucket];
  if (objectPrefix) {
    parts.push(objectPrefix);
  }
  prefixes.add(`${normalizedEndpoint}/${parts.join('/')}/`);
}

function deriveEndpointFromCredentialsFile(credentialsFile, repoRoot) {
  for (const root of candidateRepoRoots(repoRoot)) {
    const filePath = resolvePath(credentialsFile, root);
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return deriveS3Endpoint(payload.url);
    } catch {
      return null;
    }
  }
  return null;
}

function deriveS3Endpoint(consoleUrl) {
  const url = parseHttpUrl(consoleUrl);
  if (!url) {
    return null;
  }
  const port = url.port ? Number(url.port) : null;
  const s3Port = port === 9001 ? 9000 : port;
  return `${url.protocol}//${url.hostname}${s3Port ? `:${s3Port}` : ''}`;
}

function readLocalStackMinioConfig(repoRoot) {
  for (const root of candidateRepoRoots(repoRoot)) {
    for (const candidate of [
      path.join(root, 'scripts', 'dev', 'config', 'local-stack.config.json'),
      path.join(root, 'scripts', 'dev', 'local-stack.config.json')
    ]) {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      try {
        const config = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        return config?.minio && typeof config.minio === 'object' ? config.minio : {};
      } catch {
        return {};
      }
    }
  }
  return {};
}

function candidateRepoRoots(repoRoot) {
  const roots = [];
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

function resolvePath(value, repoRoot) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  return path.isAbsolute(text) ? text : path.resolve(repoRoot, text);
}

function normalizeEndpoint(endpoint) {
  const text = toText(endpoint);
  if (!text) {
    return null;
  }
  const parsed = parseConfiguredHttpUrl(text, { allowProtocolRelative: true });
  if (!parsed) {
    return null;
  }
  const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  return `${parsed.protocol}//${parsed.host}${pathname}`;
}

function trimObjectPath(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  const normalized = text.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalized.length ? normalized : null;
}

function splitPrefixList(value) {
  const text = toText(value);
  if (!text) {
    return [];
  }
  return text.split(/[,\n;]/).map((entry) => entry.trim()).filter(Boolean);
}

function firstText(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function trimTrailingSlash(value) {
  let result = String(value).trim();
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

function parseHttpUrl(value) {
  const text = toText(value);
  if (!text || text.startsWith('//')) {
    return null;
  }
  try {
    const url = new URL(text);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }
    if (url.username || url.password || url.search || url.hash || !url.hostname) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function parseConfiguredHttpUrl(value, { allowProtocolRelative = false } = {}) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  if (text.startsWith('//')) {
    return allowProtocolRelative ? parseHttpUrl(`https:${text}`) : null;
  }
  if (text.includes('://')) {
    return parseHttpUrl(text);
  }
  return parseHttpUrl(`http://${trimTrailingSlash(text)}`);
}

function sameOrigin(left, right) {
  if (!left || !right) {
    return false;
  }
  return left.protocol.toLowerCase() === right.protocol.toLowerCase()
    && left.hostname.toLowerCase() === right.hostname.toLowerCase()
    && normalizePort(left) === normalizePort(right);
}

function normalizePort(url) {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol.toLowerCase() === 'https:' ? 443 : 80;
}

function startsWithPath(value, prefix) {
  return value != null && prefix != null && value.startsWith(prefix);
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}
