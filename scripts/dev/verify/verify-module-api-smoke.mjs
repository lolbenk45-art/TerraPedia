#!/usr/bin/env node

import { resolveAdminAuth } from '../../lib/local-runtime-config.mjs';

const args = parseArgs(process.argv.slice(2));
const apiBase = trimTrailingSlash(args.apiBase || 'http://127.0.0.1:8888/api');
const { username, password } = resolveAdminAuth(args);
const minioEnabled = String(args.minioEnabled ?? process.env.TERRAPEDIA_MINIO_ENABLED ?? 'false').toLowerCase() === 'true';

const token = await login();
const armorSetId = await resolveFirstEntityId('/admin/armor-sets?page=1&limit=1', token);
const checks = [
  { name: 'auth.login', path: '/auth/login', method: 'POST', auth: false, body: { username, password }, expectStatus: 200 },
  { name: 'items.list', path: '/items?page=1&limit=3', method: 'GET', auth: false, expectStatus: 200 },
  { name: 'items.material', path: '/items?categoryId=108&page=1&limit=3', method: 'GET', auth: false, expectStatus: 200 },
  { name: 'items.detail', path: '/items/1', method: 'GET', auth: false, expectStatus: 200 },
  { name: 'items.aggregate', path: '/public/items/1/aggregate', method: 'GET', auth: false, expectStatus: 200 },
  { name: 'categories.tree', path: '/categories', method: 'GET', auth: false, expectStatus: 200 },
  { name: 'admin.buffs.list', path: '/admin/buffs?page=1&limit=1', method: 'GET', auth: true, expectStatus: 200 },
  { name: 'admin.buffs.detail', path: '/admin/buffs/1', method: 'GET', auth: true, expectStatus: 200 },
  { name: 'admin.biomes.list', path: '/admin/biomes?page=1&limit=1', method: 'GET', auth: true, expectStatus: 200 },
  { name: 'admin.biomes.detail', path: '/admin/biomes/1', method: 'GET', auth: true, expectStatus: 200 },
  { name: 'admin.npcs.list', path: '/admin/npcs?page=1&limit=1', method: 'GET', auth: true, expectStatus: 200 },
  { name: 'admin.npcs.detail', path: '/admin/npcs/1', method: 'GET', auth: true, expectStatus: 200 },
  { name: 'admin.projectiles.list', path: '/admin/projectiles?page=1&limit=2', method: 'GET', auth: true, expectStatus: 200 },
  { name: 'admin.projectiles.detail', path: '/admin/projectiles/2', method: 'GET', auth: true, expectStatus: 200 },
  { name: 'admin.armorSets.list', path: '/admin/armor-sets?page=1&limit=1', method: 'GET', auth: true, expectStatus: 200 },
  ...(armorSetId ? [{ name: 'admin.armorSets.detail', path: `/admin/armor-sets/${armorSetId}`, method: 'GET', auth: true, expectStatus: 200 }] : []),
  ...(minioEnabled ? [{ name: 'admin.storage.sync.dryRun', path: '/admin/storage/wiki-images/sync', method: 'POST', auth: true, expectStatus: 200, body: { limit: 1, force: false, includeItemImages: false, includeBuffs: false, includeBiomes: false } }] : []),
];
const results = [];

for (const check of checks) {
  const headers = { 'content-type': 'application/json' };
  if (check.auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBase}${check.path}`, {
    method: check.method,
    headers,
    body: check.body ? JSON.stringify(check.body) : undefined,
  });
  const text = await response.text();
  results.push({
    name: check.name,
    status: response.status,
    ok: response.status === check.expectStatus,
    preview: text.slice(0, 400),
  });
}

const summary = {
  apiBase,
  total: results.length,
  passed: results.filter((entry) => entry.ok).length,
  failed: results.filter((entry) => !entry.ok).length,
  results,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.failed > 0 ? 1 : 0);

async function login() {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }
  const payload = await response.json();
  const token = payload?.data?.token;
  if (!token) {
    throw new Error('Login response missing token');
  }
  return token;
}

async function resolveFirstEntityId(listPath, token) {
  const response = await fetch(`${apiBase}${listPath}`, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    return null;
  }
  const payload = await response.json();
  const first = Array.isArray(payload?.data) ? payload.data[0] : null;
  const id = Number(first?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
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
  let result = value;
  while (result.endsWith('/')) result = result.slice(0, -1);
  return result;
}
