#!/usr/bin/env node

import { resolveAdminAuth, resolveBackendApiBase } from '../lib/local-runtime-config.mjs';
import { acHomeArticles } from './ac-home-articles.mjs';

const args = parseArgs(process.argv.slice(2));
const apiBase = trimTrailingSlash(resolveBackendApiBase(args));
const { username, password } = resolveAdminAuth(args);
const dryRun = args['dry-run'] === 'true' || args.dryRun === 'true';
const token = dryRun ? '' : await login();

await validateReferences();

const existingBySlug = dryRun ? new Map() : await loadExistingArticlesBySlug(token);
const results = [];

for (const article of acHomeArticles) {
  const existing = existingBySlug.get(article.slug);
  const payload = {
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    coverImage: article.coverImage ?? null,
    contentHtml: article.contentHtml,
    status: 'PUBLISHED',
  };

  if (dryRun) {
    results.push({ slug: article.slug, action: 'dry-run', id: existing?.id ?? null });
    continue;
  }

  const saved = existing
    ? await api(`/admin/articles/${existing.id}`, {
        method: 'PUT',
        token,
        body: payload,
      })
    : await api('/admin/articles', {
        method: 'POST',
        token,
        body: payload,
        expectStatus: 201,
      });

  const articleId = Number(saved?.id);
  if (!Number.isFinite(articleId) || articleId <= 0) {
    throw new Error(`Admin article response missing id for ${article.slug}`);
  }

  const published = await api(`/admin/articles/${articleId}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'PUBLISHED' },
  });

  const publicArticle = await api(`/articles/slug/${encodeURIComponent(article.slug)}`);
  const publicContent = String(publicArticle?.contentHtml || '');
  if (publicArticle?.status !== 'PUBLISHED') {
    throw new Error(`Public article ${article.slug} is not published`);
  }
  if (!publicContent.includes('class="tp-content-ref"')) {
    throw new Error(`Public article ${article.slug} is missing content references`);
  }
  if (!publicArticle?.coverImage || publicArticle.coverImage !== article.coverImage) {
    throw new Error(`Public article ${article.slug} coverImage mismatch`);
  }

  results.push({
    slug: article.slug,
    action: existing ? 'updated' : 'created',
    id: articleId,
    status: published?.status,
    coverImage: publicArticle.coverImage,
    references: (publicContent.match(/class="tp-content-ref"/g) || []).length,
  });
}

console.log(JSON.stringify({
  apiBase,
  dryRun,
  total: results.length,
  results,
}, null, 2));

async function validateReferences() {
  const refs = [];
  const seen = new Set();

  for (const article of acHomeArticles) {
    for (const match of article.contentHtml.matchAll(/class="tp-content-ref"[^>]*data-tp-ref-type="(item|npc|boss)"[^>]*data-tp-ref-id="(\d+)"/g)) {
      const key = `${match[1]}:${match[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ type: match[1], id: match[2] });
    }
  }

  if (!refs.length) {
    throw new Error('No content references found in AC home article bodies');
  }

  const resolved = await api('/public/content-references/resolve', {
    method: 'POST',
    body: { refs },
  });

  const resolvedKeys = new Set((Array.isArray(resolved) ? resolved : [])
    .filter(item => item?.available !== false)
    .map(item => `${item.type}:${item.id}`));
  const missing = refs.filter(item => !resolvedKeys.has(`${item.type}:${item.id}`));
  if (missing.length) {
    throw new Error(`Unresolved content references: ${missing.map(item => `${item.type}:${item.id}`).join(', ')}`);
  }
}

async function loadExistingArticlesBySlug(authToken) {
  const found = new Map();
  let page = 1;

  while (page <= 50) {
    const payload = await api(`/admin/articles?page=${page}&limit=100&sortBy=id&sortOrder=asc`, {
      token: authToken,
    });
    const rows = Array.isArray(payload) ? payload : [];
    for (const article of rows) {
      const slug = String(article?.slug || '').trim();
      if (slug.startsWith('ac-home-')) {
        found.set(slug, article);
      }
    }
    if (rows.length < 100) break;
    page += 1;
  }

  return found;
}

async function login() {
  const payload = await api('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  const authToken = String(payload?.token || '').trim();
  if (!authToken) {
    throw new Error('Login response missing token');
  }
  return authToken;
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const expectedStatus = options.expectStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(`${options.method || 'GET'} ${path} failed with ${response.status}: ${text.slice(0, 500)}`);
  }
  const payload = text ? JSON.parse(text) : null;
  if (payload?.success === false) {
    throw new Error(`${options.method || 'GET'} ${path} API error: ${payload.message || text.slice(0, 500)}`);
  }
  return payload?.data ?? payload;
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = 'true';
  }
  return out;
}

function trimTrailingSlash(value) {
  let result = String(value || '').trim();
  while (result.endsWith('/')) result = result.slice(0, -1);
  return result;
}
