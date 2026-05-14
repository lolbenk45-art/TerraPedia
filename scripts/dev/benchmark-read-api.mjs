#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const baseline = {
  item_recipe_tree: { avgMs: 733.95, p95Ms: 806.39 },
  items_list_100: { avgMs: 153.29 },
  items_list_20: { avgMs: 140.83 },
  items_suggestions: { avgMs: 35.35 },
  categories_items: { avgMs: 30.63 },
  public_item_aggregate_all: { avgMs: 27.56 },
  statistics_overview: { avgMs: 20.70 },
  item_recipes: { avgMs: 15.54 },
  public_item_aggregate_images: { avgMs: 3.47 },
  item_detail: { avgMs: 1.57 },
  admin_crafting_stations: { avgMs: 2446.82, p95Ms: 2644.70 },
  admin_item_recipe_tree: { avgMs: 745.59 },
  admin_recipe_groups: { avgMs: 414.53 },
  admin_npcs: { avgMs: 317.30 },
  admin_statistics_overview: { avgMs: 48.62 },
  admin_articles: { avgMs: 10.60 },
  admin_shimmer_overview: { avgMs: 5.80 },
};

const tiers = {
  P0: [
    'Public items list/detail/suggestions/category tree',
    'Public item aggregate',
    'Public and admin recipe tree',
    'Admin crafting stations',
  ],
  P1: [
    'Admin recipe groups',
    'Admin NPC list',
    'Statistics overview endpoints',
    'Recipe list endpoints',
  ],
  P2: [
    'Admin articles',
    'Admin shimmer overview',
  ],
};

const optimizationNotes = [
  'CategoryManagementService now serves cached category/path snapshots for item list, detail, and suggestions.',
  'ItemService reuses cached category path maps instead of rebuilding paths per request.',
  'RecipeTreeService caches grouped tree responses and recipe-group reference data with explicit invalidation on admin writes.',
  'AdminRecipeGroupController caches merged group snapshots and invalidates the recipe-tree cache after writes.',
  'AdminNpcController batches category, boss-group, and relation-count lookups and caches supplement JSON snapshots.',
  'AdminCraftingStationController now builds a timed read snapshot and performs one-pass station-to-recipe aggregation instead of repeated scans.',
];

const residualRisks = [
  'Current cold numbers are first-hit measurements inside this benchmark session, not a full JVM/process cold boot.',
  'The live runtime is non-standard: Redis is actually on 6379 while local-stack config still points to 6380.',
  'Items list and aggregate endpoints are now the warm-path hotspots; further gains likely require SQL/index or payload trimming work.',
  'Timed in-memory caches reduce latency sharply, but write paths must keep invalidation coverage accurate as admin modules expand.',
];

function parseArgs(argv) {
  const options = {
    apiBase: undefined,
    configPath: 'scripts/dev/config/local-stack.config.json',
    outputDir: 'reports',
    publicSamples: 12,
    adminSamples: 10,
    warmupCount: 1,
    benchmarkItemId: 1,
    printFixtureReport: false,
  };
  const assign = (key, value) => {
    if (key === 'apiBase') options.apiBase = value;
    if (key === 'configPath') options.configPath = value;
    if (key === 'outputDir') options.outputDir = value;
    if (key === 'publicSamples') options.publicSamples = Number.parseInt(value, 10);
    if (key === 'adminSamples') options.adminSamples = Number.parseInt(value, 10);
    if (key === 'warmupCount') options.warmupCount = Number.parseInt(value, 10);
    if (key === 'benchmarkItemId') options.benchmarkItemId = Number.parseInt(value, 10);
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [rawKey, rawValue] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const key = rawKey.toLowerCase();
    if (key === '--api-base' || key === '-apibase') assign('apiBase', rawValue ?? argv[++index]);
    else if (key === '--config-path' || key === '-configpath') assign('configPath', rawValue ?? argv[++index]);
    else if (key === '--output-dir' || key === '-outputdir') assign('outputDir', rawValue ?? argv[++index]);
    else if (key === '--public-samples' || key === '-publicsamples') assign('publicSamples', rawValue ?? argv[++index]);
    else if (key === '--admin-samples' || key === '-adminsamples') assign('adminSamples', rawValue ?? argv[++index]);
    else if (key === '--warmup-count' || key === '-warmupcount') assign('warmupCount', rawValue ?? argv[++index]);
    else if (key === '--benchmark-item-id' || key === '-benchmarkitemid') assign('benchmarkItemId', rawValue ?? argv[++index]);
    else if (key === '--print-fixture-report') options.printFixtureReport = true;
    else if (key === '--help' || key === '-h' || key === '/?') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/dev/benchmark-read-api.mjs [options]

Options:
  --api-base <url>          API base. Default: config backend port + /api.
  --config-path <path>      Local stack config path.
  --output-dir <path>       Report output directory. Default: reports.
  --public-samples <n>      Public endpoint sample count.
  --admin-samples <n>       Admin endpoint sample count.
  --warmup-count <n>        Warmup request count.
  --benchmark-item-id <id>  Item id used by item endpoints.`);
}

function readConfig(configPath) {
  const resolved = path.resolve(repoRoot, configPath);
  if (!fs.existsSync(resolved)) throw new Error(`Missing config file: ${configPath}`);
  return { resolved, data: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function reportDateIso() {
  const date = new Date();
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.trunc(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')} ${sign}${hh}:${mm}`;
}

function endpoints(itemId, publicSamples, adminSamples) {
  return [
    { key: 'item_recipe_tree', tier: 'P0', kind: 'public', path: `/items/${itemId}/recipe-tree?maxDepth=3`, samples: publicSamples },
    { key: 'items_list_100', tier: 'P0', kind: 'public', path: '/items?page=1&limit=100', samples: publicSamples },
    { key: 'items_list_20', tier: 'P0', kind: 'public', path: '/items?page=1&limit=20', samples: publicSamples },
    { key: 'items_suggestions', tier: 'P0', kind: 'public', path: '/items/suggestions?keyword=sword&limit=10', samples: publicSamples },
    { key: 'categories_items', tier: 'P0', kind: 'public', path: '/categories/items', samples: publicSamples },
    { key: 'public_item_aggregate_all', tier: 'P0', kind: 'public', path: `/public/items/${itemId}/aggregate?include=images,sources,recipes`, samples: publicSamples },
    { key: 'statistics_overview', tier: 'P1', kind: 'public', path: '/statistics/overview', samples: publicSamples },
    { key: 'item_recipes', tier: 'P1', kind: 'public', path: `/items/${itemId}/recipes`, samples: publicSamples },
    { key: 'public_item_aggregate_images', tier: 'P0', kind: 'public', path: `/public/items/${itemId}/aggregate?include=images`, samples: publicSamples },
    { key: 'item_detail', tier: 'P0', kind: 'public', path: `/items/${itemId}`, samples: publicSamples },
    { key: 'admin_crafting_stations', tier: 'P0', kind: 'admin', path: '/admin/crafting-stations?page=1&limit=20', samples: adminSamples },
    { key: 'admin_item_recipe_tree', tier: 'P0', kind: 'admin', path: `/admin/items/${itemId}/recipe-tree?maxDepth=3`, samples: adminSamples },
    { key: 'admin_recipe_groups', tier: 'P1', kind: 'admin', path: '/admin/recipe-groups', samples: adminSamples },
    { key: 'admin_npcs', tier: 'P1', kind: 'admin', path: '/admin/npcs?page=1&limit=20', samples: adminSamples },
    { key: 'admin_statistics_overview', tier: 'P1', kind: 'admin', path: '/statistics/admin/overview', samples: adminSamples },
    { key: 'admin_articles', tier: 'P2', kind: 'admin', path: '/admin/articles?page=1&limit=20', samples: adminSamples },
    { key: 'admin_shimmer_overview', tier: 'P2', kind: 'admin', path: '/admin/shimmer/overview', samples: adminSamples },
  ];
}

async function timedRequest(uri, headers = {}) {
  const start = performance.now();
  const response = await fetch(uri, { headers });
  const body = await response.text();
  const elapsedMs = performance.now() - start;
  if (!response.ok) {
    throw new Error(`Request failed: ${uri} status=${response.status} body=${body.slice(0, 400)}`);
  }
  return { elapsedMs: Number(elapsedMs.toFixed(2)), statusCode: response.status };
}

async function getAdminToken(apiBase, username, password) {
  if (password == null || String(password).trim() === '') {
    throw new Error('Missing admin password in local stack config.');
  }
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Admin login failed: status=${response.status} body=${body}`);
  }
  const parsed = JSON.parse(body);
  if (!parsed?.data?.token) throw new Error('Admin login succeeded but token was missing.');
  return String(parsed.data.token);
}

function percentile95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(Math.ceil(sorted.length * 0.95) - 1, 0);
  return sorted[index] ?? 0;
}

function round(value) {
  return Number(value.toFixed(2));
}

async function benchmarkEndpoint(apiBase, endpoint, headers, warmupCount) {
  const cold = await timedRequest(`${apiBase}${endpoint.path}`, headers);
  for (let index = 0; index < warmupCount; index += 1) {
    await timedRequest(`${apiBase}${endpoint.path}`, headers);
  }
  const samples = [];
  for (let index = 0; index < endpoint.samples; index += 1) {
    samples.push(await timedRequest(`${apiBase}${endpoint.path}`, headers));
  }
  return buildResult(endpoint, cold, samples);
}

function buildResult(endpoint, cold, samples) {
  const sampleValues = samples.map((entry) => entry.elapsedMs);
  const sortedValues = [...sampleValues].sort((a, b) => a - b);
  const baselineEntry = baseline[endpoint.key] ?? {};
  const avgMs = round(sampleValues.reduce((sum, value) => sum + value, 0) / Math.max(sampleValues.length, 1));
  const deltaAvgMs = baselineEntry.avgMs == null ? null : round(avgMs - baselineEntry.avgMs);
  const deltaAvgPct = baselineEntry.avgMs == null ? null : round(((avgMs - baselineEntry.avgMs) / baselineEntry.avgMs) * 100);
  const statusCounts = new Map();
  for (const sample of samples) statusCounts.set(sample.statusCode, (statusCounts.get(sample.statusCode) ?? 0) + 1);
  return {
    key: endpoint.key,
    tier: endpoint.tier,
    kind: endpoint.kind,
    path: endpoint.path,
    samples: endpoint.samples,
    baseline: {
      avgMs: baselineEntry.avgMs ?? null,
      p95Ms: baselineEntry.p95Ms ?? null,
    },
    cold: {
      elapsedMs: round(cold.elapsedMs),
      statusCode: cold.statusCode,
    },
    stats: {
      avgMs,
      medianMs: round(sortedValues[Math.floor(sortedValues.length / 2)] ?? 0),
      minMs: round(sortedValues[0] ?? 0),
      maxMs: round(sortedValues.at(-1) ?? 0),
      p95Ms: round(percentile95(sampleValues)),
      deltaAvgMs,
      deltaAvgPct,
      statusCodes: [...statusCounts.entries()].sort(([a], [b]) => a - b).map(([code, count]) => `${code}x${count}`),
      rawMs: sampleValues,
    },
  };
}

function getActualRedisPort() {
  for (const port of [6379, 6380]) {
    try {
      execFileSync('bash', ['-lc', `ss -ltn "( sport = :${port} )" | grep -q LISTEN`], { stdio: 'ignore' });
      return port;
    } catch {
      // Keep this best-effort; benchmark should not depend on ss availability.
    }
  }
  return null;
}

function buildPayload({ apiBase, configPath, config, results }) {
  const apiUrl = new URL(apiBase);
  const redisConfiguredPort = config.redis?.port == null ? null : Number(config.redis.port);
  const redisActualPort = getActualRedisPort();
  const environment = {
    apiBase,
    reportGeneratedAt: reportDateIso(),
    configPath,
    backendPort: Number(apiUrl.port),
    redisConfiguredPort,
    redisActualPort,
    runtimeNote: redisActualPort && redisConfiguredPort && redisActualPort !== redisConfiguredPort
      ? `Observed runtime differs from config: Redis is listening on ${redisActualPort} while local-stack config points to ${redisConfiguredPort}.`
      : 'Runtime ports match the current local-stack config.',
  };
  return {
    environment,
    tiers,
    optimizationNotes,
    residualRisks,
    summary: {
      totalEndpoints: results.length,
      improvedAvgCount: results.filter((entry) => entry.baseline.avgMs && entry.stats.avgMs < entry.baseline.avgMs).length,
      regressedAvgCount: results.filter((entry) => entry.baseline.avgMs && entry.stats.avgMs > entry.baseline.avgMs).length,
      topHotspots: [...results].sort((a, b) => b.stats.avgMs - a.stats.avgMs).slice(0, 5).map((entry) => entry.key),
    },
    results,
  };
}

function buildMarkdownReport(payload) {
  const lines = [
    '# API Read Performance Report',
    '',
    `- Generated at: ${payload.environment.reportGeneratedAt}`,
    `- API base: ${payload.environment.apiBase}`,
    `- Runtime note: ${payload.environment.runtimeNote}`,
    '',
    '## Importance Tiers',
  ];
  for (const tierName of ['P0', 'P1', 'P2']) {
    lines.push('', `### ${tierName}`);
    for (const item of payload.tiers[tierName]) lines.push(`- ${item}`);
  }
  lines.push('', '## Implemented Optimizations');
  for (const note of payload.optimizationNotes) lines.push(`- ${note}`);
  lines.push('', '## Benchmark Summary', '');
  lines.push('| Endpoint | Tier | Cold ms | Avg ms | P95 ms | Baseline avg ms | Delta avg ms | Delta avg % |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const result of payload.results) {
    lines.push(`| ${result.key} | ${result.tier} | ${result.cold.elapsedMs.toFixed(2)} | ${result.stats.avgMs.toFixed(2)} | ${result.stats.p95Ms.toFixed(2)} | ${formatNullable(result.baseline.avgMs)} | ${formatNullable(result.stats.deltaAvgMs)} | ${formatNullable(result.stats.deltaAvgPct, '%')} |`);
  }
  lines.push('', '## Decisions');
  lines.push('- Keep snapshot-style in-memory caching for high-fanout read endpoints that repeatedly merge DB rows and JSON supplements.');
  lines.push('- Treat recipe-tree and crafting-station responses as P0 because they dominate admin and public read latency.');
  lines.push('- Leave low-cost endpoints in P2 without extra complexity unless their scope grows.');
  lines.push('', '## Residual Risks');
  for (const risk of payload.residualRisks) lines.push(`- ${risk}`);
  lines.push('', '## Validation');
  lines.push('- `mvn -DskipTests compile`');
  lines.push('- `node scripts/dev/benchmark-read-api.mjs`');
  return `${lines.join('\n')}\n`;
}

function formatNullable(value, suffix = '') {
  return value == null ? '-' : `${Number(value).toFixed(2)}${suffix}`;
}

function fixturePayload() {
  const eps = endpoints(1, 2, 2);
  const results = eps.map((endpoint, index) => buildResult(
    endpoint,
    { elapsedMs: 10 + index, statusCode: 200 },
    [
      { elapsedMs: 8 + index, statusCode: 200 },
      { elapsedMs: 12 + index, statusCode: 200 },
    ],
  ));
  return buildPayload({
    apiBase: 'http://127.0.0.1:18088/api',
    configPath: path.join(repoRoot, 'scripts/dev/config/local-stack.config.json'),
    config: { redis: { port: 6380 } },
    results,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.printFixtureReport) {
    console.log(JSON.stringify(fixturePayload(), null, 2));
    return;
  }

  const { resolved: configPath, data: config } = readConfig(options.configPath);
  const backendPort = config.backend?.port ?? 18088;
  const apiBase = (options.apiBase ?? `http://127.0.0.1:${backendPort}/api`).replace(/\/+$/, '');
  const reportTimestamp = timestamp();
  const outputDir = path.resolve(repoRoot, options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const adminToken = await getAdminToken(apiBase, config.auth?.admin?.username, config.auth?.admin?.password);
  const results = [];
  for (const endpoint of endpoints(options.benchmarkItemId, options.publicSamples, options.adminSamples)) {
    const headers = endpoint.kind === 'admin' ? { authorization: `Bearer ${adminToken}` } : {};
    results.push(await benchmarkEndpoint(apiBase, endpoint, headers, options.warmupCount));
  }

  const payload = buildPayload({ apiBase, configPath, config, results });
  const jsonPath = path.join(outputDir, `api-read-perf-${reportTimestamp}.json`);
  const mdPath = path.join(outputDir, `api-read-perf-${reportTimestamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, buildMarkdownReport(payload), 'utf8');
  console.log(`JSON: ${jsonPath}`);
  console.log(`MD: ${mdPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
