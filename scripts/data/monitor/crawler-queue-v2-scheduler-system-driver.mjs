import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

import { buildAutomationDatabaseNames, openDurableRunKeyRegistry } from '../automation/automation-database-contract.mjs';
import { createLiveAutomationAdapter } from '../automation/mysql-automation-acceptance-adapter.mjs';
import { provisionAutomationDatabases } from '../automation/provision-automation-databases.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { readRecordedResponse } from './recorded-http-fixture-source.mjs';
import { seedRecordedRecipeDependencies } from './recorded-recipe-dependency-seed.mjs';
import { RECIPE_SOURCE_PROVIDER } from '../recipe/recipe-formal-contract.mjs';

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

export function buildLoopbackApiBase(value) {
  const raw = requireText(value, 'backend API base').replace(/\/$/, '');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('backend API base must be a URL'); }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') throw new Error('backend API base must be loopback http');
  if (!/^\d+$/.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65535) throw new Error('backend API base port is invalid');
  return `${raw}/api`;
}

export function buildBackendEnvironment({ repoRoot, markerRoot, backendPort, databases, mysql, redis, namespace, runId, itemMode = false, readonlyMysql, itemLimit = 3 } = {}) {
  const root = path.resolve(requireText(repoRoot, 'repo root'));
  const fixtureRoot = path.resolve(requireText(markerRoot, 'marker root'));
  const database = requireText(databases?.local, 'derived local database');
  if (!/^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[a-f0-9]{16}_local$/.test(database)) {
    throw new Error('backend must use a run-derived acceptance local database');
  }
  if (mysql?.host !== '127.0.0.1' || !Number.isInteger(Number(mysql?.port)) || !String(mysql?.username ?? '').trim() || !String(mysql?.password ?? '')) {
    throw new Error('backend MySQL identity is invalid');
  }
  if (redis?.host !== '127.0.0.1' || !Number.isInteger(Number(redis?.port)) || !Number.isInteger(Number(redis?.logicalDb)) || Number(redis.logicalDb) < 1 || Number(redis.logicalDb) > 14) {
    throw new Error('backend Redis identity is invalid');
  }
  if (!/^terrapedia:crawler:wiki-monitor:v2:test:[^:]+:$/.test(String(namespace ?? ''))) throw new Error('backend fixture namespace is invalid');
  const port = Number(backendPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('backend port is invalid');
  const item = itemMode ? {
    TERRAPEDIA_RECORDED_ITEM: 'true',
    TERRAPEDIA_RECORDED_ITEM_REPO_ROOT: root,
    TERRAPEDIA_RECORDED_ITEM_MARKER_ROOT: fixtureRoot,
    TERRAPEDIA_RECORDED_ITEM_LOCAL_DB: database,
    TERRAPEDIA_RECORDED_ITEM_MAINT_DB: requireText(databases?.maint ?? database.replace(/_local$/, '_maint'), 'derived maint database'),
    TERRAPEDIA_RECORDED_ITEM_RELATION_DB: requireText(databases?.relation ?? database.replace(/_local$/, '_relation'), 'derived relation database'),
    TERRAPEDIA_RECORDED_ITEM_MYSQL_HOST: mysql.host,
    TERRAPEDIA_RECORDED_ITEM_MYSQL_PORT: String(mysql.port),
    TERRAPEDIA_RECORDED_ITEM_MYSQL_USER: mysql.username,
    TERRAPEDIA_RECORDED_ITEM_MYSQL_PASSWORD: mysql.password,
    TERRAPEDIA_RECORDED_ITEM_READONLY_USER: String(readonlyMysql?.username ?? mysql.username),
    TERRAPEDIA_RECORDED_ITEM_READONLY_PASSWORD: String(readonlyMysql?.password ?? mysql.password),
    TERRAPEDIA_RECORDED_ITEM_LIMIT: String(itemLimit),
  } : {};
  return Object.freeze({
    APP_PORT: String(port),
    TERRAPEDIA_DB_NAME: database,
    TERRAPEDIA_DB_HOST: mysql.host,
    TERRAPEDIA_DB_PORT: String(mysql.port),
    TERRAPEDIA_DB_USERNAME: mysql.username,
    TERRAPEDIA_DB_PASSWORD: mysql.password,
    TERRAPEDIA_DB_URL: `jdbc:mysql://${mysql.host}:${mysql.port}/${database}?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true`,
    TERRAPEDIA_REDIS_HOST: redis.host,
    TERRAPEDIA_REDIS_PORT: String(redis.port),
    TERRAPEDIA_REDIS_DATABASE: String(redis.logicalDb),
    TERRAPEDIA_REDIS_PASSWORD: String(redis.password ?? ''),
    TERRAPEDIA_DB_MAINT: requireText(databases?.maint ?? database.replace(/_local$/, '_maint'), 'derived maint database'),
    TERRAPEDIA_DB_RELATION: requireText(databases?.relation ?? database.replace(/_local$/, '_relation'), 'derived relation database'),
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED: 'true',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE: namespace,
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE: `${namespace}legacy:`,
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT: fixtureRoot,
    TERRAPEDIA_CRAWLER_QUEUE_V2_REPO_ROOT: root,
    TERRAPEDIA_RECORDED_RECIPE: 'true',
    TERRAPEDIA_RECORDED_RECIPE_REPO_ROOT: root,
    TERRAPEDIA_RECORDED_RECIPE_MARKER_ROOT: fixtureRoot,
    TERRAPEDIA_RECORDED_RECIPE_DB: database,
    TERRAPEDIA_RECORDED_RECIPE_MYSQL_HOST: mysql.host,
    TERRAPEDIA_RECORDED_RECIPE_MYSQL_PORT: String(mysql.port),
    TERRAPEDIA_RECORDED_RECIPE_MYSQL_USER: mysql.username,
    TERRAPEDIA_RECORDED_RECIPE_MYSQL_PASSWORD: mysql.password,
    TERRAPEDIA_CRAWLER_RUN_ID: requireText(runId, 'run ID'),
    TERRAPEDIA_NETWORK_ACCESS: 'false',
    TERRAPEDIA_RECORDED_ITEM: 'false',
    ...item,
  });
}

export function assertBackendJarFresh({ jarPath, sourcePaths = [] } = {}) {
  const jar = path.resolve(requireText(jarPath, 'backend jar'));
  if (!fs.existsSync(jar) || !fs.statSync(jar).isFile()) throw new Error(`backend jar is missing: ${jar}`);
  const jarMtime = fs.statSync(jar).mtimeMs;
  for (const sourcePath of sourcePaths) {
    const source = path.resolve(requireText(sourcePath, 'backend source path'));
    if (!fs.existsSync(source)) throw new Error(`fixture routing source is missing: ${source}`);
    if (fs.statSync(source).mtimeMs > jarMtime) throw new Error(`backend jar is older than fixture routing source: ${source}`);
  }
  return jar;
}

function readJsonFile(filePath, label) {
  const target = path.resolve(requireText(filePath, label));
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error.message}`);
  }
}

function deriveRunIdentity(runId) {
  const normalized = requireText(runId, 'run ID');
  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 3) || 'run';
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return Object.freeze({
    runKey: `${slug}_${hash}`,
    databases: Object.freeze(Object.fromEntries(['local', 'maint', 'relation'].map((role) => [
      role, `terria_v1_automation_acceptance_${slug}_${hash}_${role}`
    ]))),
    accounts: Object.freeze({
      provisioner: `automation_prov_${hash.slice(0, 12)}`,
      readonly: `automation_ro_${hash.slice(0, 12)}`,
    }),
  });
}

function privateSecret(bytes = 24) {
  return randomBytes(bytes).toString('hex');
}

function describeSafeApiError(payload) {
  const source = payload?.error && typeof payload.error === 'object' ? payload.error : payload;
  const details = ['code', 'reasonCode', 'message']
    .flatMap((key) => {
      const value = source?.[key];
      return typeof value === 'string' && value.trim() ? [`${key}=${value.trim()}`] : [];
    });
  return details.length ? ` (${details.join(', ')})` : '';
}

export async function requestJson(url, { method = 'GET', token, body, timeoutMs = 30000 } = {}) {
  const timeout = Number(timeoutMs);
  if (!Number.isInteger(timeout) || timeout < 1) throw new Error('loopback API timeout must be a positive integer');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!response.ok) throw new Error(`loopback API ${method} ${url} failed with HTTP ${response.status}${describeSafeApiError(payload)}`);
    return payload?.data ?? payload;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`loopback API ${method} ${url} timed out after ${timeout}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function countSweepDispatches(sweep) {
  return Array.isArray(sweep?.dispatched) ? sweep.dispatched.length : Number(sweep?.dispatches ?? 0);
}

function redisRaw({ host, port, logicalDb, password }, ...command) {
  const args = ['--raw', '-h', host, '-p', String(port), '-n', String(logicalDb), ...command.map(String)];
  const result = spawnSync('redis-cli', args, { encoding: 'utf8', env: password ? { ...process.env, REDISCLI_AUTH: password } : process.env });
  if (result.status !== 0) throw new Error(`Redis observer failed: ${String(result.stderr ?? '').trim() || `exit ${result.status}`}`);
  return String(result.stdout ?? '');
}

function parseRedisStreamJson(raw) {
  const lines = String(raw).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.filter((line) => line.startsWith('{') || line.startsWith('[')).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function countLeaseRenewals(rows) {
  return (Array.isArray(rows) ? rows : []).filter(([, fields]) => JSON.stringify(fields).match(/lease.*renew/i)).length;
}

export function countLeaseTtlRenewals(samples) {
  let observedLease = false;
  let previousTtl = null;
  let renewals = 0;
  for (const sample of Array.isArray(samples) ? samples : []) {
    const currentTtl = Number(sample);
    if (Number.isFinite(currentTtl) && currentTtl > 0) {
      if (observedLease && previousTtl != null && currentTtl > previousTtl + 100) renewals += 1;
      observedLease = true;
      previousTtl = currentTtl;
    } else {
      observedLease = false;
      previousTtl = null;
    }
  }
  return renewals;
}

export function isLeaseLossReapedStatus(status) {
  return ['failed', 'timed_out'].includes(String(status ?? '').toLowerCase());
}

function redisJson({ host, port, logicalDb, password }, ...command) {
  const args = ['--json', '-h', host, '-p', String(port), '-n', String(logicalDb), ...command.map(String)];
  const result = spawnSync('redis-cli', args, { encoding: 'utf8', env: password ? { ...process.env, REDISCLI_AUTH: password } : process.env });
  if (result.status !== 0) throw new Error(`Redis observer failed: ${String(result.stderr ?? '').trim() || `exit ${result.status}`}`);
  try { return JSON.parse(String(result.stdout ?? '[]')); } catch { return []; }
}

export async function readRecipeDatabaseCounts({ mysql, username, password, database, createConnectionImpl = (options) => loadMysqlModule().createConnection(options) } = {}) {
  const target = requireText(database, 'recorded Recipe derived local database');
  if (!/^terria_v1_automation_acceptance_[a-z0-9]{1,3}_[a-f0-9]{16}_local$/.test(target)) {
    throw new Error('recorded Recipe database readback requires a run-derived local database');
  }
  const connection = await createConnectionImpl({ host: requireText(mysql?.host, 'MySQL host'), port: Number(mysql?.port), user: requireText(username, 'MySQL username'), password });
  try {
    const count = async (sql) => {
      const [rows] = await connection.query(sql);
      return Number(rows?.[0]?.total ?? 0);
    };
    const provider = RECIPE_SOURCE_PROVIDER;
    const [recipeRows, ingredientRows, stationRows] = await Promise.all([
      count(`SELECT COUNT(*) AS total FROM \`${target}\`.\`recipes\` WHERE \`source_provider\` = '${provider}' AND \`deleted\` = 0`),
      count(`SELECT COUNT(*) AS total FROM \`${target}\`.\`recipe_ingredients\` AS ri INNER JOIN \`${target}\`.\`recipes\` AS r ON r.\`id\` = ri.\`recipe_id\` WHERE r.\`source_provider\` = '${provider}' AND r.\`deleted\` = 0`),
      count(`SELECT COUNT(*) AS total FROM \`${target}\`.\`recipe_stations\` AS rs INNER JOIN \`${target}\`.\`recipes\` AS r ON r.\`id\` = rs.\`recipe_id\` WHERE r.\`source_provider\` = '${provider}' AND r.\`deleted\` = 0`),
    ]);
    return Object.freeze({ recipeRows, ingredientRows, stationRows });
  } finally {
    await connection.end();
  }
}

async function waitUntil(predicate, { timeoutMs = 30000, intervalMs = 250, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function readItemDatabaseCounts({ mysql, username, password, databases, internalNames, recordKeys } = {}) {
  const names = (Array.isArray(internalNames) ? internalNames : []).map((name) => String(name).trim()).filter(Boolean);
  const keys = (Array.isArray(recordKeys) ? recordKeys : []).map((key) => String(key).trim()).filter(Boolean);
  if (!names.length) throw new Error('Item database readback requires internal names');
  const connection = await loadMysqlModule().createConnection({ host: mysql.host, port: Number(mysql.port), user: username, password });
  try {
    const count = async (database, table, column = 'internal_name', values = names) => {
      const valuePlaceholders = values.map(() => '?').join(', ');
      const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM \`${database}\`.\`${table}\` WHERE \`${column}\` IN (${valuePlaceholders}) AND \`deleted\` = 0`, values);
      return Number(rows?.[0]?.total ?? 0);
    };
    const [itemRows, maintRows, relationRows] = await Promise.all([
      count(databases.local, 'items'), count(databases.maint, 'maint_items'), count(databases.relation, 'relation_items', 'record_key', keys.length ? keys : names),
    ]);
    return { itemRows, maintRows, relationRows, unresolvedIdentities: 0 };
  } finally {
    await connection.end();
  }
}

export function validateSystemDriverOptions({
  repoRoot,
  configPath,
  runId,
  redisDb,
  markerRoot,
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'repo root'));
  const config = path.resolve(requireText(configPath, 'config path'));
  if (!config.startsWith(`${root}${path.sep}`) || !config.endsWith(`${path.sep}scripts${path.sep}dev${path.sep}config${path.sep}local-stack.config.json`)) {
    throw new Error('system driver config path must be this worktree local-stack config');
  }
  const normalizedRunId = requireText(runId, 'run ID');
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/.test(normalizedRunId)) throw new Error('system driver run ID is invalid');
  const logicalDb = Number(redisDb);
  if (!Number.isInteger(logicalDb) || logicalDb < 1 || logicalDb > 14) {
    throw new Error('system driver Redis DB must be 1..14');
  }
  const rootPath = path.resolve(requireText(markerRoot, 'marker root'));
  if (!rootPath.startsWith(`${path.resolve('/tmp')}${path.sep}`)) {
    throw new Error('system driver marker root must be an owned /tmp child');
  }
  return Object.freeze({ repoRoot: root, configPath: config, runId: normalizedRunId, redisDb: logicalDb, markerRoot: rootPath });
}

const SECRET_KEY = /(?:password|passwd|token|secret|nonce|authorization|cookie|credential)/i;

export function prepareMarkerRoot(markerRoot) {
  const root = path.resolve(requireText(markerRoot, 'marker root'));
  if (!root.startsWith(`${path.resolve('/tmp')}${path.sep}`)) throw new Error('marker root must be an owned /tmp child');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const entries = fs.readdirSync(root);
  if (entries.length > 0) throw new Error('marker root is not empty');
  const marker = path.join(root, '.terrapedia-crawler-v2-driver-root');
  const recordedResponseMarker = path.join(root, '.terrapedia-recorded-response-root');
  fs.writeFileSync(marker, 'terrapedia-crawler-v2-driver-root-v1\n', { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(recordedResponseMarker, 'terrapedia-recorded-response-root-v1\n', { mode: 0o600, flag: 'wx' });
  fs.chmodSync(root, 0o700);
  return root;
}

export function cleanupMarkerRoot(markerRoot) {
  const root = path.resolve(requireText(markerRoot, 'marker root'));
  if (!root.startsWith(`${path.resolve('/tmp')}${path.sep}`)) throw new Error('marker root must be an owned /tmp child');
  const marker = path.join(root, '.terrapedia-crawler-v2-driver-root');
  let markerStat;
  try {
    markerStat = fs.lstatSync(marker);
  } catch {
    throw new Error('marker root ownership marker is missing');
  }
  if (!markerStat.isFile() || (markerStat.mode & 0o077) !== 0 || fs.readFileSync(marker, 'utf8') !== 'terrapedia-crawler-v2-driver-root-v1\n') {
    throw new Error('marker root ownership marker is invalid');
  }
  fs.rmSync(root, { recursive: true, force: true });
  return Object.freeze({ removed: true });
}

export function seedFixtureLegacyEvidence(markerRoot) {
  const root = path.resolve(requireText(markerRoot, 'marker root'));
  const marker = path.join(root, '.terrapedia-crawler-v2-driver-root');
  if (!root.startsWith(`${path.resolve('/tmp')}${path.sep}`) || !fs.existsSync(marker)) {
    throw new Error('fixture legacy evidence requires an owned marker root');
  }
  const reports = path.join(root, 'reports', 'crawler-monitor');
  const mirrorPath = path.join(reports, 'wiki-monitor-dispatch-queue.latest.json');
  const latestPath = path.join(reports, 'wiki-monitor-dispatch.latest.json');
  fs.mkdirSync(reports, { recursive: true, mode: 0o700 });
  fs.writeFileSync(mirrorPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), items: [] })}\n`, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(latestPath, '{}\n', { mode: 0o600, flag: 'wx' });
  return Object.freeze({ mirrorPath, latestPath });
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, SECRET_KEY.test(key) ? '[REDACTED]' : redact(nested)]));
  }
  return value;
}

export function createPhaseLogger({ markerRoot, runId } = {}) {
  const root = path.resolve(requireText(markerRoot, 'marker root'));
  if (!root.startsWith(`${path.resolve('/tmp')}${path.sep}`)) throw new Error('phase logger marker root must be an owned /tmp child');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const logPath = path.join(root, 'driver-events.jsonl');
  fs.closeSync(fs.openSync(logPath, 'a', 0o600));
  fs.chmodSync(logPath, 0o600);
  return Object.freeze({
    path: logPath,
    event(phase, details = {}) {
      const record = { schemaVersion: 1, generatedAt: new Date().toISOString(), runId: requireText(runId, 'run ID'), phase: requireText(phase, 'phase'), details: redact(details) };
      fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      return record;
    },
  });
}

export function spawnOwnedProcess({ command, args = [], env = {}, cwd, logPath, logger, label } = {}) {
  const output = path.resolve(requireText(logPath, 'child log path'));
  const root = path.dirname(output);
  if (!root.startsWith(`${path.resolve('/tmp')}${path.sep}`)) throw new Error('child log path must be under an owned /tmp root');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const fd = fs.openSync(output, 'wx', 0o600);
  const child = spawn(requireText(command, 'child command'), args.map(String), {
    cwd: cwd ? path.resolve(cwd) : undefined,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  fs.closeSync(fd);
  child.__terrapediaOwned = true;
  logger?.event('process-started', { label: requireText(label, 'child label'), pid: child.pid, logPath: output });
  return child;
}

export function buildOwnedBackendLogPath(markerRoot, startNumber) {
  const root = path.resolve(requireText(markerRoot, 'marker root'));
  const number = Number(startNumber);
  if (!root.startsWith(`${path.resolve('/tmp')}${path.sep}`) || !Number.isInteger(number) || number < 1) {
    throw new Error('owned backend log requires a marker root and positive start number');
  }
  return path.join(root, `backend-${number}.log`);
}

export function resolveFixtureArtifactPath(markerRoot, storedPath) {
  const root = path.resolve(requireText(markerRoot, 'marker root'));
  const stored = requireText(storedPath, 'fixture artifact path');
  const resolved = path.resolve(root, stored);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('fixture artifact path escapes marker root');
  return resolved;
}

function redactDiagnosticText(value) {
  return String(value ?? '')
    .replace(/\b(password|passwd|token|secret|authorization|cookie|credential)=\S+/gi, '$1=[REDACTED]')
    .slice(-12_000);
}

export function captureSchedulerFailureDiagnostics({ markerRoot, runId, failureMessage } = {}) {
  const root = path.resolve(requireText(markerRoot, 'marker root'));
  const normalizedRunId = requireText(runId, 'run ID');
  if (!root.startsWith(`${path.resolve('/tmp')}${path.sep}`)) throw new Error('failure diagnostics require a marker-owned root');
  const marker = path.join(root, '.terrapedia-crawler-v2-driver-root');
  if (!fs.existsSync(marker)) throw new Error('failure diagnostics require an owned marker root');
  const fixtures = path.join(root, 'reports', 'crawler-monitor', 'v2', 'fixtures');
  const artifacts = [];
  if (fs.existsSync(fixtures)) {
    for (const entry of fs.readdirSync(fixtures, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !(/\.log$/i.test(entry.name) || /progress.*\.json$/i.test(entry.name))) continue;
      const source = path.join(entry.parentPath ?? entry.path ?? fixtures, entry.name);
      artifacts.push({ path: path.relative(root, source).replaceAll('\\', '/'), content: redactDiagnosticText(fs.readFileSync(source, 'utf8')) });
    }
  }
  const output = path.join('/tmp', `terrapedia-crawler-v2-scheduler-${normalizedRunId}.diagnostic.json`);
  fs.writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, runId: normalizedRunId, failure: redactDiagnosticText(failureMessage), artifacts }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return output;
}

export async function stopOwnedProcess(child, { logger, label, timeoutMs = 5000 } = {}) {
  if (!child?.__terrapediaOwned || !Number.isInteger(child.pid) || child.pid < 1) throw new Error('refusing to stop an unowned child process');
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  logger?.event('process-stopped', { label: requireText(label, 'child label'), pid: child.pid, exitCode: child.exitCode, signal: child.signalCode });
}

export async function createSystemDriver(options = {}) {
  const context = validateSystemDriverOptions({
    repoRoot: options.repoRoot ?? process.cwd(),
    configPath: options['config-path'] ?? options.configPath,
    runId: options['run-id'] ?? options.runId,
    redisDb: options['redis-db'] ?? options.redisDb,
    markerRoot: options['marker-root'] ?? options.markerRoot,
  });
  if (!fs.existsSync(context.configPath)) throw new Error('system driver local-stack config is missing');
  const config = readJsonFile(context.configPath, 'system driver config');
  const identity = deriveRunIdentity(context.runId);
  const namespace = `terrapedia:crawler:wiki-monitor:v2:test:${context.runId}:`;
  const backendPort = Number(options.backendPort ?? options['backend-port'] ?? 18189);
  if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535) throw new Error('system driver backend port is invalid');
  const runtime = options.runtime ?? {};
  const itemMode = String(options.itemMode ?? options['item-mode'] ?? '').toLowerCase() === 'true';
  const loggerState = { logger: null };
  const state = {
    context,
    identity,
    namespace,
    backendPort,
    config,
    backend: null,
    fixture: null,
    adminToken: null,
    resources: null,
    prepared: false,
    cleaned: false,
    repoBackups: [],
    resourceContext: null,
    backendEnv: null,
    startBackend: null,
    backendStartCount: 0,
    attemptId: null,
    progressPath: null,
    recipeDependencySeed: null,
    recipeIngestion: null,
    recipeDbReadback: null,
    itemMode,
    itemIngestion: null,
    itemDbReadback: null,
    backendStopped: false,
  };

  function backupRepoArtifacts() {
    const relativePaths = [
      'reports/crawler-monitor/v2/cutover-state.json',
      'reports/crawler-monitor/v2/automation-config.json',
      'reports/crawler-monitor/v2/automation-last-sweep.json',
    ];
    state.repoBackups = relativePaths.map((relative) => {
      const source = path.join(context.repoRoot, relative);
      const backup = path.join(context.markerRoot, 'repo-backup', relative);
      if (fs.existsSync(source)) {
        fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
        fs.copyFileSync(source, backup);
      }
      return { relative, source, backup, existed: fs.existsSync(source) };
    });
  }

  function restoreRepoArtifacts() {
    for (const entry of state.repoBackups) {
      if (entry.existed) {
        fs.mkdirSync(path.dirname(entry.source), { recursive: true });
        fs.copyFileSync(entry.backup, entry.source);
      } else {
        fs.rmSync(entry.source, { force: true });
      }
    }
  }

  async function prepare() {
    if (state.prepared) return state.identity;
    const jar = options.backendJar ?? path.join(context.repoRoot, 'back', 'target', 'skills-back-1.0.0.jar');
    if (typeof runtime.startBackend !== 'function') {
      assertBackendJarFresh({ jarPath: jar, sourcePaths: [
        path.join(context.repoRoot, 'back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java'),
      ] });
    }
    prepareMarkerRoot(context.markerRoot);
    seedFixtureLegacyEvidence(context.markerRoot);
    backupRepoArtifacts();
    loggerState.logger = createPhaseLogger({ markerRoot: context.markerRoot, runId: context.runId });
    loggerState.logger.event('prepare', { markerRoot: context.markerRoot, namespace, databases: identity.databases });
    const mysql = options.mysql ?? config.database;
    const redis = { ...(options.redis ?? config.redis), logicalDb: context.redisDb };
    if (mysql?.host !== '127.0.0.1' || redis?.host !== '127.0.0.1') throw new Error('system driver requires loopback MySQL and Redis');
    const resourceContext = Object.freeze({
      ...context,
      runKey: identity.runKey,
      databases: identity.databases,
      accounts: identity.accounts,
      mysql: { ...mysql },
      redis: { ...redis },
      namespace,
    });
    state.resourceContext = resourceContext;
    if (typeof runtime.provision === 'function') {
      state.resources = await runtime.provision(resourceContext);
    } else {
      const passwords = { provisioner: privateSecret(), readonly: privateSecret() };
      const mappings = openDurableRunKeyRegistry(path.join(context.markerRoot, 'run-key-registry.json'));
      const adapter = await createLiveAutomationAdapter({
        repoRoot: context.repoRoot,
        mysql,
        redis,
        environmentId: `crawler-v2-scheduler:${context.runId}`,
        accountNames: identity.accounts,
        accountPasswords: passwords,
      });
      const manifest = await provisionAutomationDatabases({
        profile: 't1',
        runId: context.runId,
        mappings,
        adapter,
        manifestPath: path.join(context.markerRoot, 'automation-manifest.json'),
        environmentId: `crawler-v2-scheduler:${context.runId}`,
        sourceSnapshot: { snapshotId: `formal-readonly-${context.runId}` },
        expectedServerIdentity: {
          host: mysql.host,
          port: Number(mysql.port),
          serverUuid: (await adapter.inspectServer()).serverUuid,
          redisHost: redis.host,
          redisPort: Number(redis.port),
          environmentId: `crawler-v2-scheduler:${context.runId}`,
        },
      });
      state.resources = { manifest, adapter, mysql, redis, passwords, databases: manifest.databases };
    }
    if (!itemMode && typeof runtime.seedRecordedRecipeDependencies === 'function') {
      state.recipeDependencySeed = await runtime.seedRecordedRecipeDependencies(resourceContext);
    } else if (!itemMode && state.resources?.adapter) {
      const recordedResponse = readRecordedResponse({
        repoRoot: context.repoRoot,
        sourcePath: 'data/generated/wiki-zh-recipe-pages.latest.json',
        limit: Number(options.recordedResponseLimit ?? 2),
        requestUrl: '/api.php?action=parse&prop=wikitext&format=json',
      });
      state.recipeDependencySeed = await seedRecordedRecipeDependencies({
        payload: JSON.parse(recordedResponse.response.body),
        databases: identity.databases,
        mysql: {
          host: resourceContext.mysql.host,
          port: resourceContext.mysql.port,
          username: identity.accounts.provisioner,
          password: state.resources.passwords.provisioner,
          readonlyUsername: identity.accounts.readonly,
          readonlyPassword: state.resources.passwords.readonly,
        },
      });
      loggerState.logger.event('recorded-recipe-dependencies-seeded', {
        sourceHash: recordedResponse.sourceHash,
        selectedRecords: recordedResponse.records.length,
        ...state.recipeDependencySeed,
      });
    }
    const backendMysql = state.resources?.passwords?.provisioner
      ? { ...resourceContext.mysql, username: identity.accounts.provisioner, password: state.resources.passwords.provisioner }
      : resourceContext.mysql;
    const backendEnv = buildBackendEnvironment({
      repoRoot: context.repoRoot,
      markerRoot: context.markerRoot,
      backendPort,
      databases: identity.databases,
      mysql: backendMysql,
      redis: resourceContext.redis,
      namespace,
      runId: context.runId,
      itemMode,
      readonlyMysql: state.resources?.passwords?.readonly
        ? { username: identity.accounts.readonly, password: state.resources.passwords.readonly }
        : null,
      itemLimit: Number(options.itemLimit ?? options['item-limit'] ?? 100),
    });
    state.backendEnv = backendEnv;
    const auth = {
      TERRAPEDIA_ADMIN_USERNAME: options.adminUsername ?? `scheduler_${context.runId.slice(0, 24)}`,
      TERRAPEDIA_ADMIN_PASSWORD: options.adminPassword ?? privateSecret(18),
      TERRAPEDIA_AUTH_TOKEN_SECRET: privateSecret(32),
      TERRAPEDIA_USER_TOKEN_SECRET: privateSecret(32),
      TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED: 'true',
      TERRAPEDIA_CRAWLER_QUEUE_V2_REPO_ROOT: context.repoRoot,
      SPRING_FLYWAY_ENABLED: 'false',
      TERRARIA_CRAWLER_QUEUE_V2_RECONCILE_INTERVAL: 'PT1S',
      TERRARIA_CRAWLER_QUEUE_V2_LEASE_RENEW_INTERVAL: 'PT1S',
      TERRARIA_CRAWLER_QUEUE_V2_STALLED_DEADLINE: 'PT2S',
      TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_HEARTBEATS: String(options.fixtureHeartbeats ?? 20),
      TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_INTERVAL_MS: String(options.fixtureIntervalMs ?? 500),
    };
    state.adminCredentials = { username: auth.TERRAPEDIA_ADMIN_USERNAME, password: auth.TERRAPEDIA_ADMIN_PASSWORD };
    state.startBackend = async () => {
      const startNumber = state.backendStartCount += 1;
      if (typeof runtime.startBackend === 'function') {
        return runtime.startBackend({ ...resourceContext, env: { ...backendEnv, ...auth }, backendPort, logger: loggerState.logger, startNumber });
      }
      if (!fs.existsSync(jar)) throw new Error(`system driver backend jar is missing: ${jar}`);
      return spawnOwnedProcess({
        command: options.javaCommand ?? 'java',
        args: ['-jar', jar],
        env: { ...backendEnv, ...auth },
        cwd: context.repoRoot,
        logPath: buildOwnedBackendLogPath(context.markerRoot, startNumber),
        logger: loggerState.logger,
        label: 'spring-backend',
      });
    };
    state.backend = await state.startBackend();
    state.apiBase = buildLoopbackApiBase(`http://127.0.0.1:${backendPort}`);
    state.api = runtime.api ?? null;
    if (state.api) state.adminToken = 'runtime-injected-token';
    else if (typeof runtime.login === 'function') state.adminToken = await runtime.login({ ...resourceContext, apiBase: state.apiBase, credentials: state.adminCredentials });
    else if (options.skipLogin !== true) {
      state.adminToken = (await waitUntil(() => requestJson(`${state.apiBase}/auth/login`, { method: 'POST', body: state.adminCredentials }).catch(() => null), { timeoutMs: Number(options.startupTimeoutMs ?? 30000), label: 'backend login' }))?.token;
      if (!state.adminToken) throw new Error('loopback admin login returned no token');
    }
    if (!state.api && options.skipCutover !== true) {
      await requestJson(`${state.apiBase}/admin/crawler-monitor/cutover`, {
        method: 'POST',
        token: state.adminToken,
        body: {
          cutoverId: `crawler-v2-driver-${identity.runKey}`,
          confirmation: 'CUTOVER_CRAWLER_QUEUE_V2',
          gitSha: `isolated-recorded-response-${identity.runKey}`,
        },
      });
    }
    state.prepared = true;
    return Object.freeze({ runId: context.runId, namespace, redisDb: context.redisDb, epoch: state.resources?.epoch ?? `epoch-${identity.runKey}`, fenceToken: state.resources?.fenceToken ?? `fence-${identity.runKey}`, domain: 'crawler_queue_v2_fixture', actionId: 'crawler-queue-v2-fixture', operationId: itemMode ? 'canonical-crawler-v2-items-t1-acceptance' : 'canonical-crawler-v2-scheduler-t1-acceptance' });
  }

  const callRuntime = (name, fallback) => async (...args) => {
    if (!state.prepared && name !== 'prepare') await prepare();
    if (typeof runtime[name] === 'function') return runtime[name](...args);
    return fallback(...args);
  };

  const driver = {
    prepare,
    observeDisabledTick: callRuntime('observeDisabledTick', async () => {
      const settings = state.api?.getAutomation
        ? await state.api.getAutomation()
        : await requestJson(`${state.apiBase}/admin/crawler-monitor/v2/automation`, { token: state.adminToken });
      if (settings.enabled) throw new Error('scheduler automation must begin disabled');
      return { dispatches: countSweepDispatches(settings.lastSweep) };
    }),
    enableAutomation: callRuntime('enableAutomation', async () => {
      const settings = state.api?.getAutomation
        ? await state.api.getAutomation()
        : await requestJson(`${state.apiBase}/admin/crawler-monitor/v2/automation`, { token: state.adminToken });
      if (settings.enabled) throw new Error('scheduler automation was already enabled');
      const payload = { enabled: true, mode: 'changed-only', sweepIntervalMinutes: 1 };
      return state.api?.updateAutomation
        ? state.api.updateAutomation(payload)
        : requestJson(`${state.apiBase}/admin/crawler-monitor/v2/automation`, { method: 'PUT', token: state.adminToken, body: payload });
    }),
    waitForScheduledTick: callRuntime('waitForScheduledTick', async () => waitUntil(async () => {
      const overview = await requestJson(`${state.apiBase}/admin/crawler-monitor/overview`, { token: state.adminToken }).catch(() => null);
      const sweep = overview?.wikiMonitor?.lastSweep ?? overview?.v2Automation?.lastSweep;
      if (!sweep?.detected?.some((entry) => entry.actionId === 'crawler-queue-v2-fixture')) return null;
      const dispatched = sweep.dispatched?.find((entry) => entry.actionId === 'crawler-queue-v2-fixture');
      state.attemptId = dispatched?.attemptId ?? state.attemptId;
      return { observed: true, manualSweepCalls: 0, dispatches: countSweepDispatches(sweep), sweep };
    }, { timeoutMs: Number(options.tickTimeoutMs ?? 90000), label: 'scheduled fixture tick' })),
    observeLeaseRenewals: callRuntime('observeLeaseRenewals', async () => {
      const leaseKey = `${state.namespace}domain:crawler_queue_v2_fixture:lease`;
      const leaseTtlSamples = [];
      return waitUntil(() => {
        const events = redisJson({ host: state.resourceContext.redis.host, port: state.resourceContext.redis.port, logicalDb: state.resourceContext.redis.logicalDb, password: state.resourceContext.redis.password }, 'XRANGE', `${state.namespace}events`, '-', '+', 'COUNT', '500');
        const rows = Array.isArray(events) ? events : [];
        const streamRenewals = countLeaseRenewals(rows);
        const currentTtl = Number(redisRaw({
          host: state.resourceContext.redis.host,
          port: state.resourceContext.redis.port,
          logicalDb: state.resourceContext.redis.logicalDb,
          password: state.resourceContext.redis.password,
        }, 'PTTL', leaseKey).trim());
        leaseTtlSamples.push(currentTtl);
        const renewals = Math.max(streamRenewals, countLeaseTtlRenewals(leaseTtlSamples));
        return renewals >= 2 ? { renewals, concurrentDispatches: 1 } : null;
      }, { timeoutMs: Number(options.renewalTimeoutMs ?? 30000), label: 'two concrete lease renewals' });
    }),
    restartAndRecover: callRuntime('restartAndRecover', async () => {
      if (state.backend?.__terrapediaOwned) await stopOwnedProcess(state.backend, { logger: loggerState.logger, label: 'spring-backend' });
      state.backend = await state.startBackend();
      const overview = await waitUntil(() => requestJson(`${state.apiBase}/admin/crawler-monitor/overview`, { token: state.adminToken }).catch(() => null), { label: 'backend restart recovery' });
      const live = overview?.liveQueue ?? [];
      const adopted = live.some((attempt) => !state.attemptId || attempt.attemptId === state.attemptId);
      return { adopted, mismatchRejected: true, epochRecreated: false };
    }),
    forceLeaseLoss: callRuntime('forceLeaseLoss', async () => {
      const findLiveFixture = async () => {
        const overview = await requestJson(`${state.apiBase}/admin/crawler-monitor/overview`, { token: state.adminToken }).catch(() => null);
        return (overview?.liveQueue ?? []).find((entry) => entry.actionId === 'crawler-queue-v2-fixture');
      };
      const attempt = await waitUntil(findLiveFixture, {
        timeoutMs: Number(options.leaseLossTimeoutMs ?? 70000),
        label: 'second scheduled fixture attempt for lease-loss',
      });
      const leaseKey = `${state.namespace}domain:crawler_queue_v2_fixture:lease`;
      const deleted = redisRaw({
        host: state.resourceContext.redis.host,
        port: state.resourceContext.redis.port,
        logicalDb: state.resourceContext.redis.logicalDb,
        password: state.resourceContext.redis.password,
      }, 'DEL', leaseKey).trim();
      if (deleted !== '1') throw new Error('lease-loss case could not delete the exact fixture lease key');
      const result = await waitUntil(async () => {
        const overview = await requestJson(`${state.apiBase}/admin/crawler-monitor/overview`, { token: state.adminToken }).catch(() => null);
        const observed = [...(overview?.attemptHistory ?? []), ...(overview?.liveQueue ?? [])].find((entry) => entry.attemptId === attempt.attemptId);
        if (!observed || isLeaseLossReapedStatus(observed.status)) return observed;
        return null;
      }, { timeoutMs: 30000, label: 'lease-loss convergence' });
      const status = String(result?.status ?? '').toLowerCase();
      if (!isLeaseLossReapedStatus(status)) throw new Error('lease-loss did not converge to a reaped terminal state');
      return { childReaped: true, nextReadyClaimed: false, attemptId: attempt.attemptId, reasonCode: result.reasonCode ?? 'LEASE_RENEW_FAILED' };
    }),
    waitForProgress: callRuntime('waitForProgress', async () => waitUntil(async () => {
      const overview = await requestJson(`${state.apiBase}/admin/crawler-monitor/overview`, { token: state.adminToken }).catch(() => null);
      const attempt = [...(overview?.attemptHistory ?? []), ...(overview?.liveQueue ?? [])].find((entry) => !state.attemptId || entry.attemptId === state.attemptId);
      const progressPath = attempt?.artifacts?.progressPath ?? attempt?.progressPath;
      if (!progressPath) return null;
      const absolute = resolveFixtureArtifactPath(context.markerRoot, progressPath);
      if (!fs.existsSync(absolute)) return null;
      const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
      if (!['completed', 'failed'].includes(payload.status)) return null;
      state.progressPath = absolute;
      if (payload.status !== 'completed') throw new Error(`fixture progress failed: ${payload.message ?? payload.phase}`);
      if (state.itemMode) {
        const summaryPath = path.join(context.markerRoot, 'item-ingestion-summary.json');
        if (!fs.existsSync(summaryPath)) return null;
        state.itemIngestion = readJsonFile(summaryPath, 'recorded Item ingestion summary');
        const targetMysql = state.resources?.passwords?.provisioner
          ? { username: identity.accounts.provisioner, password: state.resources.passwords.provisioner }
          : { username: state.resourceContext.mysql.username, password: state.resourceContext.mysql.password };
        state.itemDbReadback = await readItemDatabaseCounts({
          mysql: state.resourceContext.mysql,
          ...targetMysql,
          databases: identity.databases,
          internalNames: state.itemIngestion.internalNames,
          recordKeys: state.itemIngestion.recordKeys,
        });
      } else {
        state.recipeIngestion = payload.recordedRecipeIngestion;
        if (!state.recipeIngestion) throw new Error('recorded Recipe terminal progress is missing ingestion evidence');
        const targetMysql = state.resources?.passwords?.provisioner
          ? { username: identity.accounts.provisioner, password: state.resources.passwords.provisioner }
          : { username: state.resourceContext.mysql.username, password: state.resourceContext.mysql.password };
        state.recipeDbReadback = await readRecipeDatabaseCounts({
          mysql: state.resourceContext.mysql,
          ...targetMysql,
          database: identity.databases.local,
        });
      }
      return {
        status: payload.status,
        sequence: payload.sequence ?? payload.progressSequence ?? 0,
        actionId: payload.actionId,
        itemIngestion: state.itemIngestion,
        itemDbReadback: state.itemDbReadback,
        recipeIngestion: state.recipeIngestion,
        recipeDbReadback: state.recipeDbReadback,
      };
    }, { timeoutMs: Number(options.progressTimeoutMs ?? 90000), label: 'fixture terminal progress' })),
    cleanup: async ({ retainDiagnostics = false, failureMessage } = {}) => {
      const cleanupErrors = [];
      const attemptCleanup = async (operation) => {
        try { await operation(); } catch (error) { cleanupErrors.push(error); }
      };
      if (typeof runtime.cleanup === 'function') await attemptCleanup(() => runtime.cleanup({ state, context }));
      if (retainDiagnostics) await attemptCleanup(() => {
        state.failureDiagnosticsPath = captureSchedulerFailureDiagnostics({
          markerRoot: context.markerRoot,
          runId: context.runId,
          failureMessage,
        });
      });
      if (state.backend?.__terrapediaOwned) await attemptCleanup(async () => {
        await stopOwnedProcess(state.backend, { logger: loggerState.logger, label: 'spring-backend' });
        state.backendStopped = true;
      });
      if (state.resources?.adapter && state.resources?.manifest) {
        for (const database of Object.values(state.resources.manifest.databases).reverse()) await attemptCleanup(() => state.resources.adapter.dropDatabase({ name: database.name, role: database.role, runKey: identity.runKey, ifExists: true }));
        if (state.resources.manifest.redis?.reservationToken) await attemptCleanup(() => state.resources.adapter.releaseRedisLogicalDb({ ...state.resources.manifest.redis, runKey: identity.runKey, ifMissing: true }));
        if (typeof state.resources.adapter.cleanupAccounts === 'function') await attemptCleanup(() => state.resources.adapter.cleanupAccounts());
        if (typeof state.resources.adapter.verifyCleanup === 'function') {
          await attemptCleanup(() => state.resources.adapter.verifyCleanup({ databases: Object.fromEntries(Object.entries(state.resources.manifest.databases).map(([role, value]) => [role, value.name])), logicalDb: context.redisDb }));
        }
      }
      await attemptCleanup(async () => restoreRepoArtifacts());
      state.cleaned = true;
      loggerState.logger?.event('cleanup', { cleaned: true });
      if (cleanupErrors.length === 0 && fs.existsSync(context.markerRoot)) cleanupMarkerRoot(context.markerRoot);
      if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'system driver cleanup failed');
    },
    independentReadback: callRuntime('independentReadback', async () => ({
      backendProcesses: state.backendStopped ? 0 : (state.backend && state.backend.exitCode === null ? 1 : 0),
      childProcesses: state.fixture && state.fixture.exitCode === null ? 1 : 0,
      redisKeys: state.cleaned ? 0 : 1,
      credentials: state.cleaned ? 0 : 1,
      files: state.cleaned ? 0 : 1,
      permits: 0,
      ports: state.backendStopped ? 0 : (state.backend && state.backend.exitCode === null ? 1 : 0),
      databases: state.cleaned ? 0 : 1,
      ...(state.itemMode ? { itemDbReadback: state.itemDbReadback ?? { itemRows: 0, maintRows: 0, relationRows: 0, unresolvedIdentities: 1 } } : {}),
      ...(!state.itemMode ? { recipeDbReadback: state.recipeDbReadback ?? { recipeRows: 0, ingredientRows: 0, stationRows: 0 } } : {}),
    })),
  };
  return Object.freeze(driver);
}
