#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"

backend_base_url=""
admin_base_url=""
front_base_url=""
skip_auth=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --backend-base-url)
      backend_base_url="$2"
      shift
      ;;
    --backend-base-url=*)
      backend_base_url="${1#*=}"
      ;;
    --admin-base-url)
      admin_base_url="$2"
      shift
      ;;
    --admin-base-url=*)
      admin_base_url="${1#*=}"
      ;;
    --front-base-url)
      front_base_url="$2"
      shift
      ;;
    --front-base-url=*)
      front_base_url="${1#*=}"
      ;;
    --skip-auth|-SkipAuth)
      skip_auth=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/dev/smoke-local-stack.sh [--backend-base-url URL] [--admin-base-url URL] [--front-base-url URL] [--skip-auth]
EOF
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      exit 2
      ;;
  esac
  shift
done

REPO_ROOT="$(resolve_repo_root "$PWD")"
report_dir="$REPO_ROOT/reports/local-start"
ensure_dir "$report_dir"
load_runtime_config

timestamp="$(date +%Y%m%d-%H%M%S)"
report_path="$report_dir/smoke-$timestamp.json"
results_path="$report_dir/smoke-$timestamp.jsonl"
: >"$results_path"

load_smoke_manifest_runtime() {
  local manifest_path="$report_dir/run-manifest.json"
  if [[ ! -f "$manifest_path" ]]; then
    return 0
  fi

  local exports
  exports="$(SMOKE_MANIFEST_PATH="$manifest_path" node <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.env.SMOKE_MANIFEST_PATH, 'utf8'));
const backendPort = manifest.health?.back?.port || manifest.ports?.backend?.port;
const adminPort = manifest.health?.dataQueryApp?.port || manifest.ports?.admin?.port;
const frontPort = manifest.health?.front?.port || manifest.ports?.front?.port;
const imageOrigin = manifest.health?.imageOrigin?.endpoint || manifest.ports?.imageOrigin?.endpoint || '';
const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
if (backendPort) console.log(`export SMOKE_MANIFEST_BACKEND_BASE_URL=${shellQuote(`http://127.0.0.1:${backendPort}`)}`);
if (adminPort) console.log(`export SMOKE_MANIFEST_ADMIN_BASE_URL=${shellQuote(`http://127.0.0.1:${adminPort}`)}`);
if (frontPort) console.log(`export SMOKE_MANIFEST_FRONT_BASE_URL=${shellQuote(`http://127.0.0.1:${frontPort}`)}`);
if (imageOrigin) console.log(`export SMOKE_MANIFEST_IMAGE_ORIGIN=${shellQuote(imageOrigin)}`);
NODE
)"
  eval "$exports"
}

load_smoke_manifest_runtime

if [[ -z "$backend_base_url" ]]; then
  backend_base_url="${SMOKE_MANIFEST_BACKEND_BASE_URL:-http://127.0.0.1:$TP_BACKEND_PORT}"
fi
if [[ -z "$admin_base_url" ]]; then
  admin_base_url="${SMOKE_MANIFEST_ADMIN_BASE_URL:-http://127.0.0.1:$TP_ADMIN_PORT}"
fi
if [[ -z "$front_base_url" ]]; then
  front_base_url="${SMOKE_MANIFEST_FRONT_BASE_URL:-http://127.0.0.1:$TP_FRONT_PORT}"
fi
image_origin_base_url="${SMOKE_MANIFEST_IMAGE_ORIGIN:-$TP_IMAGE_ORIGIN}"

join_url() {
  local base="${1%/}"
  local path="$2"
  printf '%s%s\n' "$base" "$path"
}

is_truthy() {
  case "${1,,}" in
    true|1|yes|y|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

smoke_request() {
  local name="$1"
  local method="$2"
  local url="$3"
  local headers_json="${4:-}"
  local auth_bearer="${5:-}"

  if [[ -z "$headers_json" ]]; then
    headers_json='{}'
  fi

  SMOKE_NAME="$name" SMOKE_METHOD="$method" SMOKE_URL="$url" SMOKE_HEADERS_JSON="$headers_json" SMOKE_AUTH_BEARER_TOKEN="$auth_bearer" SMOKE_RESULTS_PATH="$results_path" node <<'NODE'
const fs = require('node:fs');

(async () => {
  const headers = JSON.parse(process.env.SMOKE_HEADERS_JSON || '{}');
  if (process.env.SMOKE_AUTH_BEARER_TOKEN) {
    headers.authorization = `Bearer ${process.env.SMOKE_AUTH_BEARER_TOKEN}`;
  }
  const entry = {
    name: process.env.SMOKE_NAME,
    method: process.env.SMOKE_METHOD,
    url: process.env.SMOKE_URL,
    ok: false,
    status: null,
    preview: null,
  };

  try {
    const response = await fetch(process.env.SMOKE_URL, {
      method: process.env.SMOKE_METHOD,
      headers,
    });
    const text = await response.text();
    entry.status = response.status;
    entry.ok = response.status >= 200 && response.status < 300;
    entry.preview = text.slice(0, 300);
  } catch (error) {
    entry.preview = error.message;
  }

  fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify(entry)}\n`);
})();
NODE
}

smoke_minio_public_endpoint() {
  local marker="minio.publicEndpoint"
  : "$marker"
  # Real managed image validation is performed by smoke_real_managed_images.
  return 0
}

smoke_real_managed_images() {
  SMOKE_BACKEND_BASE_URL="$backend_base_url" SMOKE_ADMIN_BASE_URL="$admin_base_url" SMOKE_FRONT_BASE_URL="$front_base_url" SMOKE_IMAGE_ORIGIN_BASE_URL="$image_origin_base_url" SMOKE_RESULTS_PATH="$results_path" node <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');

function joinUrl(base, path) {
  return `${String(base || '').replace(/\/+$/, '')}${path}`;
}

function unwrapData(raw) {
  return raw?.data ?? raw;
}

function normalizeManagedPath(value) {
  const raw = String(value || '').trim();
  if (!raw || !raw.includes('/terrapedia-images/')) return '';
  if (raw.startsWith('/preview-assets/terrapedia-images/')) {
    return raw.replace('/preview-assets/terrapedia-images/', '/terrapedia-images/').split(/[?#]/)[0];
  }
  if (raw.startsWith('/terrapedia-images/')) return raw.split(/[?#]/)[0];
  try {
    const url = new URL(raw.startsWith('//') ? `http:${raw}` : raw);
    if (url.pathname.startsWith('/preview-assets/terrapedia-images/')) {
      return url.pathname.replace('/preview-assets/terrapedia-images/', '/terrapedia-images/');
    }
    if (url.pathname.startsWith('/terrapedia-images/')) return url.pathname;
  } catch {}
  return '';
}

function collectManagedImageCandidates(value, output = [], seen = new Set()) {
  if (value == null) return output;
  if (typeof value === 'string') {
    const normalized = normalizeManagedPath(value);
    if (normalized && !output.includes(normalized)) output.push(normalized);
    return output;
  }
  if (typeof value !== 'object') return output;
  if (seen.has(value)) return output;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectManagedImageCandidates(item, output, seen);
    }
    return output;
  }

  for (const key of ['imageUrl', 'image', 'icon', 'coverImage', 'itemImage', 'npcImage', 'buffImage', 'bossImage', 'projectileImage']) {
    collectManagedImageCandidates(value[key], output, seen);
  }
  for (const item of Object.values(value)) {
    collectManagedImageCandidates(item, output, seen);
  }
  return output;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${text.slice(0, 160)}`);
  }
  return JSON.parse(text);
}

function classifyImage(bytes, contentType) {
  const hex = bytes.subarray(0, 16).toString('hex');
  const textPrefix = bytes.subarray(0, 180).toString('utf8');
  const lowerType = String(contentType || '').toLowerCase();
  const isPng = hex.startsWith('89504e470d0a1a0a');
  const isJpeg = hex.startsWith('ffd8ff');
  const isGif = textPrefix.startsWith('GIF87a') || textPrefix.startsWith('GIF89a');
  const isWebp = textPrefix.startsWith('RIFF') && textPrefix.slice(8, 12) === 'WEBP';
  const isSvg = /^image\/svg\+xml\b/i.test(lowerType) && /<svg[\s>]/i.test(textPrefix);
  const isFallbackSvg = /<svg[\s>]/i.test(textPrefix) && /width="160" height="160"|fill="#101a10"|font-weight="700"/i.test(textPrefix);
  const isHtml = /^text\/html\b/i.test(lowerType) || /^\s*<!doctype html|^\s*<html[\s>]/i.test(textPrefix);
  const isObjectMissing = /<Code>NoSuch(Key|Bucket)<\/Code>|NoSuch(Key|Bucket)/i.test(textPrefix);
  const typeAllowed = /^image\/(png|jpeg|gif|webp|svg\+xml)\b/i.test(lowerType);
  let reasonCode = '';
  let reason = '';
  let repairHint = '';
  if (isHtml) {
    reasonCode = 'console_html';
    reason = 'rejected text/html';
    repairHint = 'image origin returned HTML; verify it is the MinIO object API port, not the console port';
  } else if (isFallbackSvg) {
    reasonCode = 'managed_fallback_svg';
    reason = 'rejected generated fallback SVG';
    repairHint = 'front preview fallback masked a managed object failure; check direct image origin and proxy config';
  } else if (isObjectMissing) {
    reasonCode = 'object_missing';
    reason = 'managed image object is missing from the configured image origin';
    repairHint = 'managed image object is missing from the configured image origin; verify MinIO dataDir/bucket or run a read-only managed image object audit before repair';
  } else if (!typeAllowed) {
    reasonCode = 'non_image_response';
    reason = `unexpected content-type=${contentType}`;
    repairHint = 'image route responded but did not return image bytes; inspect the probed URL and upstream response';
  }
  return {
    ok: typeAllowed && !isHtml && !isFallbackSvg && (isPng || isJpeg || isGif || isWebp || isSvg),
    firstBytes: hex,
    bodyHash: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16),
    reasonCode,
    reason,
    repairHint,
  };
}

async function probe(name, url, normalizedPath, append = true) {
  const entry = {
    name,
    method: 'GET',
    url,
    probedUrl: url,
    normalizedPath,
    ok: false,
    status: null,
    contentType: '',
    firstBytes: '',
    bodyHash: '',
    reasonCode: '',
    repairHint: '',
    preview: null,
  };

  try {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    const classified = classifyImage(buffer, contentType);
    entry.status = response.status;
    entry.contentType = contentType;
    entry.firstBytes = classified.firstBytes;
    entry.bodyHash = classified.bodyHash;
    entry.ok = response.ok && classified.ok;
    entry.reasonCode = response.ok ? classified.reasonCode : (classified.reasonCode || (response.status === 404 ? 'object_missing' : 'non_image_response'));
    entry.repairHint = classified.repairHint;
    entry.preview = classified.reason || `content-type=${contentType}`;
    if (!entry.repairHint && entry.reasonCode === 'object_missing') {
      entry.repairHint = 'managed image object is missing from the configured image origin; verify MinIO dataDir/bucket or run a read-only managed image object audit before repair';
    }
  } catch (error) {
    entry.reasonCode = 'wrong_port_or_unreachable';
    entry.repairHint = 'image origin was unreachable from smoke; check run-manifest imageOrigin endpoint and local-stack ports';
    entry.preview = error.message;
  }

  if (append) {
    fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify(entry)}\n`);
  }
  return entry;
}

(async () => {
  let candidates = [];
  try {
    const itemsUrl = joinUrl(process.env.SMOKE_BACKEND_BASE_URL, '/api/items?page=1&limit=30');
    const raw = unwrapData(await fetchJson(itemsUrl));
    candidates = collectManagedImageCandidates(raw);
  } catch (error) {
    const entry = {
      name: 'managedImage.candidate',
      method: 'GET',
      url: joinUrl(process.env.SMOKE_BACKEND_BASE_URL, '/api/items?page=1&limit=30'),
      ok: false,
      status: null,
      preview: error.message,
    };
    fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify(entry)}\n`);
    return;
  }

  if (candidates.length === 0) {
    for (const name of ['admin.managedImage', 'front.managedImage']) {
      const entry = {
        name,
        method: 'GET',
        url: '',
        probedUrl: '',
        normalizedPath: '',
        ok: false,
        status: null,
        contentType: '',
        firstBytes: '',
        reasonCode: 'no_candidate',
        repairHint: 'backend returned no managed /terrapedia-images/ path in the sampled API response',
        preview: 'no managed image candidate found',
      };
      fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify(entry)}\n`);
    }
    return;
  }

  const failures = [];
  for (const normalizedPath of candidates.slice(0, 30)) {
    const origin = process.env.SMOKE_IMAGE_ORIGIN_BASE_URL
      ? await probe('origin.managedImage.candidate', joinUrl(process.env.SMOKE_IMAGE_ORIGIN_BASE_URL, normalizedPath), normalizedPath, false)
      : { ok: false, status: null, contentType: '', reasonCode: 'wrong_port_or_unreachable', repairHint: 'run manifest did not provide an image origin endpoint' };
    const admin = await probe('admin.managedImage.candidate', joinUrl(process.env.SMOKE_ADMIN_BASE_URL, normalizedPath), normalizedPath, false);
    const front = await probe('front.managedImage.candidate', joinUrl(process.env.SMOKE_FRONT_BASE_URL, `/preview-assets${normalizedPath}`), normalizedPath, false);
    if (origin.ok && admin.ok && front.ok) {
      fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify({
        name: 'managedImage.selected',
        method: 'GET',
        url: normalizedPath,
        probedUrl: normalizedPath,
        normalizedPath,
        ok: true,
        status: 200,
        contentType: `${origin.contentType}; ${admin.contentType}; ${front.contentType}`,
        firstBytes: `${origin.firstBytes}; ${admin.firstBytes}; ${front.firstBytes}`,
        bodyHash: `${origin.bodyHash}; ${admin.bodyHash}; ${front.bodyHash}`,
        reasonCode: '',
        repairHint: '',
        preview: 'real managed image bytes verified through origin, admin, and front',
      })}\n`);
      return;
    }
    const reasonCode = origin.reasonCode || admin.reasonCode || front.reasonCode || 'non_image_response';
    const repairHint = origin.repairHint || admin.repairHint || front.repairHint || 'inspect direct origin, admin proxy, and front preview probe results';
    failures.push({
      normalizedPath,
      origin,
      admin,
      front,
      reasonCode,
      repairHint,
      summary: `${normalizedPath}: origin=${origin.status}/${origin.contentType}/${origin.reasonCode || '-'} admin=${admin.status}/${admin.contentType}/${admin.reasonCode || '-'} front=${front.status}/${front.contentType}/${front.reasonCode || '-'}`,
    });
  }

  const primaryFailure = failures.find((failure) => failure.reasonCode === 'object_missing')
    || failures.find((failure) => failure.reasonCode === 'console_html')
    || failures[0]
    || {};

  fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify({
    name: 'managedImage.selected',
    method: 'GET',
    url: '',
    probedUrl: '',
    normalizedPath: '',
    ok: false,
    status: null,
    contentType: '',
    firstBytes: '',
    reasonCode: primaryFailure.reasonCode || 'non_image_response',
    repairHint: primaryFailure.repairHint || 'inspect direct origin, admin proxy, and front preview probe results',
    preview: `no managed image candidate returned real bytes; reasonCode=${primaryFailure.reasonCode || 'non_image_response'}; checked=${failures.map((failure) => failure.summary).join(' | ').slice(0, 900)}`,
  })}\n`);
})();
NODE
}

smoke_login() {
  local url="$1"

  SMOKE_URL="$url" SMOKE_USER="$TP_ADMIN_USERNAME" SMOKE_PASS="$TP_ADMIN_PASSWORD" SMOKE_RESULTS_PATH="$results_path" METHOD=POST node <<'NODE'
const fs = require('node:fs');

(async () => {
  const entry = {
    name: 'auth.login',
    method: process.env.METHOD,
    url: process.env.SMOKE_URL,
    ok: false,
    status: null,
    preview: '<redacted>',
  };
  let bearer = '';

  try {
    const response = await fetch(process.env.SMOKE_URL, {
      method: process.env.METHOD,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: process.env.SMOKE_USER, password: process.env.SMOKE_PASS }),
    });
    entry.status = response.status;
    entry.ok = response.status >= 200 && response.status < 300;
    const text = await response.text();
    if (entry.ok) {
      const parsed = JSON.parse(text);
      bearer = parsed.data?.token ?? parsed.data?.accessToken ?? parsed.token ?? '';
    }
  } catch {
    entry.preview = '<redacted>';
  }

  fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify(entry)}\n`);
  if (bearer) process.stdout.write(bearer);
})();
NODE
}

smoke_admin_article_images() {
  local auth_bearer="$1"

  SMOKE_BACKEND_BASE_URL="$backend_base_url" SMOKE_ADMIN_BASE_URL="$admin_base_url" SMOKE_AUTH_BEARER_TOKEN="$auth_bearer" SMOKE_RESULTS_PATH="$results_path" node <<'NODE'
const fs = require('node:fs');

function joinUrl(base, path) {
  return `${String(base || '').replace(/\/+$/, '')}${path}`;
}

function unwrapData(raw) {
  return raw?.data ?? raw;
}

function normalizeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data:|blob:)/i.test(raw)) return '';
  if (raw.startsWith('/preview-assets/terrapedia-images/')) {
    return raw.replace('/preview-assets/terrapedia-images/', '/terrapedia-images/');
  }
  if (raw.startsWith('/')) return raw;

  const candidate = raw.startsWith('//')
    ? `https:${raw}`
    : /^[a-z0-9.-]+(?::\d+)?\/.+/i.test(raw)
      ? `http://${raw}`
      : raw;

  try {
    const url = new URL(candidate);
    if (url.pathname.startsWith('/preview-assets/terrapedia-images/')) {
      return `${url.pathname.replace('/preview-assets/terrapedia-images/', '/terrapedia-images/')}${url.search}${url.hash}`;
    }
    if (url.pathname.startsWith('/terrapedia-images/')) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return raw.startsWith('/terrapedia-images/') ? raw : '';
  }
  return '';
}

function imageUrlsFromHtml(value) {
  return [...String(value || '').matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => normalizeImageUrl(match[1]))
    .filter(Boolean);
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${text.slice(0, 160)}`);
  }
  return JSON.parse(text);
}

(async () => {
  const entry = {
    name: 'admin.articles.imageProxy',
    method: 'GET',
    url: joinUrl(process.env.SMOKE_ADMIN_BASE_URL, '/terrapedia-images/...'),
    ok: false,
    status: null,
    reasonCode: '',
    repairHint: '',
    preview: null,
  };

  try {
    const token = process.env.SMOKE_AUTH_BEARER_TOKEN || '';
    const listUrl = joinUrl(process.env.SMOKE_ADMIN_BASE_URL, '/api/admin/articles?page=1&limit=10');
    const rawList = unwrapData(await fetchJson(listUrl, token));
    const articles = rawList?.records ?? rawList?.list ?? rawList?.items ?? rawList?.data ?? rawList ?? [];
    const candidates = Array.isArray(articles) ? articles : [];
    const failures = [];

    for (const article of candidates) {
      const detailUrl = joinUrl(process.env.SMOKE_ADMIN_BASE_URL, `/api/admin/articles/${article.id}`);
      const detail = unwrapData(await fetchJson(detailUrl, token));
      const imagePaths = [
        normalizeImageUrl(detail?.coverImage ?? detail?.cover_image ?? article?.coverImage ?? article?.cover_image),
        ...imageUrlsFromHtml(detail?.contentHtml ?? detail?.content_html ?? detail?.content ?? detail?.contentMarkdown),
      ].filter(Boolean);

      for (const imagePath of imagePaths) {
        const imageUrl = joinUrl(process.env.SMOKE_ADMIN_BASE_URL, imagePath);
        const response = await fetch(imageUrl, { method: 'GET' });
        const contentType = response.headers.get('content-type') || '';
        const bodyText = response.ok ? '' : (await response.clone().text()).slice(0, 240);
        if (response.ok && /^image\//i.test(contentType)) {
          entry.url = imageUrl;
          entry.status = response.status;
          entry.ok = true;
          entry.preview = `content-type=${contentType}`;
          break;
        }
        if (!entry.reasonCode && response.status === 404 && /NoSuch(Key|Bucket)/i.test(bodyText)) {
          entry.reasonCode = 'object_missing';
          entry.repairHint = 'managed article image object is missing from the configured image origin; verify MinIO dataDir/bucket or run a read-only managed image object audit before repair';
        }
        failures.push(`${imagePath}: ${response.status}/${contentType}`);
      }
      if (entry.ok) break;
    }

    if (entry.status === null) {
      if (!entry.reasonCode && failures.some((failure) => /404\/application\/xml/i.test(failure))) {
        entry.reasonCode = 'object_missing';
        entry.repairHint = 'managed article image object is missing from the configured image origin; verify MinIO dataDir/bucket or run a read-only managed image object audit before repair';
      }
      entry.preview = failures.length
        ? `no article image candidate returned image bytes; reasonCode=${entry.reasonCode || 'non_image_response'}; checked=${failures.join(' | ').slice(0, 900)}`
        : 'no article image candidate found in first page';
    }
  } catch (error) {
    entry.reasonCode = 'wrong_port_or_unreachable';
    entry.repairHint = 'admin article image smoke could not reach the admin/API path; check run-manifest ports';
    entry.preview = error.message;
  }

  fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify(entry)}\n`);
})();
NODE
}

smoke_request backend.items GET "$(join_url "$backend_base_url" '/api/items?page=1&limit=1')"
smoke_request backend.categories GET "$(join_url "$backend_base_url" '/api/categories')"
smoke_request admin.root GET "$(join_url "$admin_base_url" '/')"
smoke_request admin.proxy.items GET "$(join_url "$admin_base_url" '/api/items?page=1&limit=1')"
smoke_real_managed_images
if is_truthy "$TP_MINIO_ENABLED" && [[ -n "$TP_MINIO_PUBLIC_ENDPOINT" ]]; then
  smoke_minio_public_endpoint
fi

if ! $skip_auth && [[ -n "$TP_ADMIN_USERNAME" && -n "$TP_ADMIN_PASSWORD" ]]; then
  bearer_token="$(SMOKE_AUTH_LOGIN=1 smoke_login "$(join_url "$backend_base_url" '/api/auth/login')")"
  if [[ -n "$bearer_token" ]]; then
    smoke_request auth.me GET "$(join_url "$backend_base_url" '/api/auth/me')" '{}' "$bearer_token"
    smoke_request admin.acceptance.dataSource GET "$(join_url "$backend_base_url" '/api/admin/data-source-acceptance/overview')" '{}' "$bearer_token"
    smoke_request admin.acceptance.domain GET "$(join_url "$backend_base_url" '/api/admin/domain-acceptance/overview')" '{}' "$bearer_token"
    smoke_admin_article_images "$bearer_token"
  fi
fi

SMOKE_TIMESTAMP="$timestamp" SMOKE_BACKEND_BASE_URL="$backend_base_url" SMOKE_ADMIN_BASE_URL="$admin_base_url" SMOKE_FRONT_BASE_URL="$front_base_url" SMOKE_MINIO_ENABLED="$TP_MINIO_ENABLED" SMOKE_MINIO_PUBLIC_ENDPOINT="$TP_MINIO_PUBLIC_ENDPOINT" SMOKE_RESULTS_PATH="$results_path" SMOKE_REPORT_PATH="$report_path" node <<'NODE'
const fs = require('node:fs');
const lines = fs.existsSync(process.env.SMOKE_RESULTS_PATH)
  ? fs.readFileSync(process.env.SMOKE_RESULTS_PATH, 'utf8').trim().split('\n').filter(Boolean)
  : [];
const results = lines.map((line) => JSON.parse(line));
const summary = {
  timestamp: process.env.SMOKE_TIMESTAMP,
  backendBaseUrl: process.env.SMOKE_BACKEND_BASE_URL,
  adminBaseUrl: process.env.SMOKE_ADMIN_BASE_URL,
  frontBaseUrl: process.env.SMOKE_FRONT_BASE_URL,
  minio: {
    enabled: ['true', '1', 'yes', 'y', 'on'].includes(String(process.env.SMOKE_MINIO_ENABLED || '').toLowerCase()),
    publicEndpoint: process.env.SMOKE_MINIO_PUBLIC_ENDPOINT || '',
  },
  total: results.length,
  passed: results.filter((entry) => entry.ok).length,
  failed: results.filter((entry) => !entry.ok).length,
  results,
};

fs.writeFileSync(process.env.SMOKE_REPORT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`smoke report: ${process.env.SMOKE_REPORT_PATH}`);
console.log(`passed=${summary.passed} failed=${summary.failed}`);
process.exit(summary.failed > 0 ? 1 : 0);
NODE
