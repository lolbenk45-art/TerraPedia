import { resolveAdminAuth, resolveBackendApiBase } from '../../lib/local-runtime-config.mjs';

export const DEFAULT_MANAGED_URL_PREFIX = 'http://localhost:9000/terrapedia-images';

export async function createMinioImageUploader(options = {}) {
  const apiBase = trimTrailingSlash(toText(options.apiBase) || resolveBackendApiBase({}, { repoRoot: options.repoRoot }));
  const { username: adminUsername, password: adminPassword } = resolveAdminAuth(
    {
      adminUsername: options.adminUsername,
      adminPassword: options.adminPassword,
    },
    {
      usernameKey: 'adminUsername',
      passwordKey: 'adminPassword',
      repoRoot: options.repoRoot,
    }
  );
  const managedUrlPrefixes = normalizeManagedUrlPrefixes(options.managedUrlPrefixes);
  const uploadCache = options.uploadCache instanceof Map ? options.uploadCache : new Map();
  const userAgent = toText(options.userAgent) || 'TerraPedia-sync/1.0';
  const authHeader = options.authHeader ?? await loginAndBuildAuthHeader(apiBase, adminUsername, adminPassword);

  async function uploadImageUrl(sourceUrl, uploadOptions = {}) {
    const normalizedSourceUrl = toText(sourceUrl);
    if (!normalizedSourceUrl) {
      return null;
    }

    if (uploadCache.has(normalizedSourceUrl)) {
      return uploadCache.get(normalizedSourceUrl);
    }

    if (isManagedUrl(normalizedSourceUrl, managedUrlPrefixes)) {
      uploadCache.set(normalizedSourceUrl, normalizedSourceUrl);
      return normalizedSourceUrl;
    }

    let upstream;
    try {
      upstream = await fetch(normalizedSourceUrl, {
        headers: { 'user-agent': userAgent },
      });
    } catch {
      uploadCache.set(normalizedSourceUrl, null);
      return null;
    }

    if (!upstream.ok) {
      uploadCache.set(normalizedSourceUrl, null);
      return null;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await upstream.arrayBuffer();
    const fileName = buildFileName(normalizedSourceUrl, normalizeUploadOptions(uploadOptions), contentType);
    const formData = new FormData();
    formData.append('file', new File([arrayBuffer], fileName, { type: contentType }));

    let response;
    try {
      response = await fetch(`${apiBase}/files/images`, {
        method: 'POST',
        headers: authHeader,
        body: formData,
      });
    } catch {
      uploadCache.set(normalizedSourceUrl, null);
      return null;
    }

    if (!response.ok) {
      uploadCache.set(normalizedSourceUrl, null);
      return null;
    }

    const payload = await response.json();
    const managedUrl = toText(payload?.data?.url);
    uploadCache.set(normalizedSourceUrl, managedUrl);
    return managedUrl;
  }

  return {
    apiBase,
    authHeader,
    managedUrlPrefixes,
    uploadCache,
    isManagedUrl(value) {
      return isManagedUrl(value, managedUrlPrefixes);
    },
    uploadImageUrl,
  };
}

export function guessExtensionFromUrl(sourceUrl) {
  const text = toText(sourceUrl);
  if (!text) {
    return '.png';
  }
  try {
    const pathname = new URL(text).pathname;
    const fileName = decodeURIComponent(pathname.split('/').pop() || '');
    const index = fileName.lastIndexOf('.');
    return index >= 0 ? fileName.slice(index).toLowerCase() : '.png';
  } catch {
    return '.png';
  }
}

export function isManagedUrl(value, managedUrlPrefixes = [DEFAULT_MANAGED_URL_PREFIX]) {
  const text = toText(value);
  if (!text) {
    return false;
  }
  return normalizeManagedUrlPrefixes(managedUrlPrefixes).some((prefix) => text.startsWith(prefix));
}

export function slugify(value) {
  const text = toText(value) || 'asset';
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

export function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}

export function trimTrailingSlash(value) {
  let text = String(value || '');
  while (text.endsWith('/')) {
    text = text.slice(0, -1);
  }
  return text;
}

function normalizeManagedUrlPrefixes(managedUrlPrefixes) {
  const raw = Array.isArray(managedUrlPrefixes) && managedUrlPrefixes.length
    ? managedUrlPrefixes
    : [DEFAULT_MANAGED_URL_PREFIX];
  return [...new Set(raw.map((value) => trimTrailingSlash(toText(value))).filter(Boolean))];
}

function normalizeUploadOptions(uploadOptions) {
  if (typeof uploadOptions === 'string') {
    return { nameHint: uploadOptions };
  }
  if (!uploadOptions || typeof uploadOptions !== 'object' || Array.isArray(uploadOptions)) {
    return {};
  }
  return uploadOptions;
}

function buildFileName(sourceUrl, uploadOptions, contentType) {
  const explicitFileName = sanitizeFileName(uploadOptions.fileName);
  if (explicitFileName) {
    return explicitFileName.includes('.')
      ? explicitFileName
      : `${explicitFileName}${guessExtensionFromContentType(contentType)}`;
  }

  let rawName = '';
  try {
    rawName = decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop() || '');
  } catch {
    rawName = '';
  }

  const sanitizedRawName = sanitizeFileName(rawName);
  if (sanitizedRawName && sanitizedRawName.includes('.')) {
    return sanitizedRawName;
  }

  const baseName = slugify(uploadOptions.nameHint);
  return `${baseName}${guessExtensionFromContentType(contentType)}`;
}

function sanitizeFileName(value) {
  const text = toText(value);
  if (!text) {
    return '';
  }
  return text
    .replace(/[\\/]+/g, '-')
    .replace(/\?+/g, '')
    .replace(/:+/g, '-');
}

function guessExtensionFromContentType(contentType) {
  const value = String(contentType).split(';')[0].trim().toLowerCase();
  switch (value) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/svg+xml': return '.svg';
    case 'image/avif': return '.avif';
    default: return '.bin';
  }
}

async function loginAndBuildAuthHeader(apiBase, username, password) {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`Failed to login before upload: ${response.status}`);
  }
  const payload = await response.json();
  const token = payload?.data?.token;
  if (!token) {
    throw new Error('Login response does not contain token');
  }
  return { Authorization: `Bearer ${token}` };
}
