import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import {
  ARMOR_CANONICAL_POLICY_OWNER_SCOPES,
  armorCanonicalMutationGenerationScopeHash,
  buildArmorCanonicalFenceCommit,
  validateArmorCanonicalFenceCommit,
} from './armor-canonical-write-fence.mjs';
import { FORMAL_DATABASES, canonicalServerFingerprint } from '../automation/automation-database-contract.mjs';

const HASH = /^sha256:[a-f0-9]{64}$/;
const CAPTURE_ROOT = 'reports/authorization/canonical/armor-fence-captures/';
const MAX_CAPTURE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;

const text = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) throw new Error(`Armor fence capture ${label} is required`);
  return value;
};

function timestamp(value, label) {
  const normalized = text(value, label);
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?Z$/);
  if (!match || !Number.isFinite(Date.parse(normalized))) throw new Error(`Armor fence capture ${label} is invalid`);
  const expected = normalized.replace(/(?:\.(\d{1,3}))?Z$/, (_suffix, milliseconds = '') => `.${milliseconds.padEnd(3, '0')}Z`);
  const canonical = new Date(normalized).toISOString();
  if (canonical !== expected) throw new Error(`Armor fence capture ${label} is invalid`);
  return canonical;
}

function assertSafeRunId(value, label = 'runId') {
  const runId = text(value, label);
  if (!SAFE_RUN_ID.test(runId)) throw new Error(`Armor fence capture ${label} has an unsafe path identity`);
  return runId;
}

function assertCaptureWindow(capturedAt, expiresAt) {
  const lifetime = Date.parse(expiresAt) - Date.parse(capturedAt);
  if (lifetime <= 0 || lifetime > MAX_CAPTURE_LIFETIME_MS) {
    throw new Error('Armor fence capture expiry must follow capturedAt and be bounded to seven days');
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export async function captureArmorCanonicalFenceCommitSnapshot({
  connection,
  runId,
  expiresAt,
  capturedAt = new Date().toISOString(),
  environmentId = 'local',
  ownerScopes = ARMOR_CANONICAL_POLICY_OWNER_SCOPES,
  tokenFactory,
  markerFactory,
} = {}) {
  if (!connection || typeof connection.query !== 'function') throw new Error('Armor fence capture read-only connection is required');
  const boundRunId = assertSafeRunId(runId);
  const captured = timestamp(capturedAt, 'capturedAt');
  const expires = timestamp(expiresAt, 'expiresAt');
  assertCaptureWindow(captured, expires);
  if (environmentId !== 'local') throw new Error('Armor fence capture environment must be local');
  const [serverRows] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS serverPort, DATABASE() AS databaseName');
  if (serverRows?.length !== 1 || Number(serverRows[0].serverPort) !== 13306
      || serverRows[0].databaseName !== 'terria_v1_local'
      || typeof serverRows[0].serverUuid !== 'string' || !serverRows[0].serverUuid.trim()) {
    throw new Error('Armor fence capture target is not the formal loopback local database');
  }
  const serverFingerprint = canonicalServerFingerprint({
    host: '127.0.0.1',
    port: Number(serverRows[0].serverPort),
    serverUuid: serverRows[0].serverUuid,
    databases: Object.values(FORMAL_DATABASES),
  });
  const generations = [];
  const generationReadbacks = [];
  for (const scope of ownerScopes) {
    const scopeKeyHash = armorCanonicalMutationGenerationScopeHash(scope);
    const [generationRows] = await connection.query(
      'SELECT generation, schema_hash FROM `terria_v1_local`.`crawler_automation_mutation_generation`'
        + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ? AND scope_key_hash = ?',
      [environmentId, scope.databaseRole, scope.table, scopeKeyHash],
    );
    if (generationRows?.length > 1) throw new Error(`Armor mutation generation row is duplicated: ${scope.databaseRole}.${scope.table}`);
    const generation = generationRows?.length === 1 ? Number(generationRows[0].generation) : 0;
    const schemaHash = generationRows?.length === 1 ? generationRows[0].schema_hash
      : hash({ schemaVersion: 1, databaseRole: scope.databaseRole, table: scope.table });
    if (!Number.isSafeInteger(generation) || generation < 0 || !HASH.test(schemaHash ?? '')) {
      throw new Error(`Armor mutation generation baseline is invalid: ${scope.databaseRole}.${scope.table}`);
    }
    const [fenceRows] = await connection.query(
      'SELECT latest_run_id AS latestRunId, fence_token AS fenceToken, expires_at AS expiresAt, (expires_at > CURRENT_TIMESTAMP) AS active'
        + ' FROM `terria_v1_local`.`crawler_automation_write_fence`'
        + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ? AND field_group = ? AND logical_predicate_hash = ?',
      [environmentId, scope.databaseRole, scope.table, scope.fieldGroup, scope.logicalPredicateHash],
    );
    if (fenceRows?.length > 1 || fenceRows?.some(row => Number(row.active) === 1)) {
      throw new Error(`Armor owner scope already has an active writer: ${scope.databaseRole}.${scope.table}`);
    }
    generations.push({ ...scope, generation, schemaHash });
    generationReadbacks.push({
      databaseRole: scope.databaseRole,
      table: scope.table,
      fieldGroup: scope.fieldGroup,
      logicalPredicateHash: scope.logicalPredicateHash,
      mutationGenerationScopeHash: scopeKeyHash,
      generation,
      schemaHash,
      rowPresent: generationRows?.length === 1,
      expiredFenceCount: fenceRows?.length ?? 0,
    });
  }
  const fenceCommit = buildArmorCanonicalFenceCommit({
    runId: boundRunId, expiresAt: expires, environmentId, ownerScopes, generations, tokenFactory, markerFactory,
  });
  validateArmorCanonicalFenceCommit(fenceCommit, { runId: boundRunId, environmentId });
  const body = {
    schemaVersion: 'armor-fence-commit-capture/v1',
    capturedAt: captured,
    readOnly: true,
    databaseWrites: false,
    environmentId,
    runId: boundRunId,
    expiresAt: expires,
    serverFingerprint,
    policyOwnedScopeCount: ownerScopes.length,
    generationReadbacks,
    fenceCommit,
  };
  return Object.freeze({ ...body, captureSha256: hash(body) });
}

export function writeArmorCanonicalFenceCommitCapture({ repoRoot = process.cwd(), capture, now = new Date().toISOString() } = {}) {
  if (!capture || capture.schemaVersion !== 'armor-fence-commit-capture/v1'
      || capture.readOnly !== true || capture.databaseWrites !== false) {
    throw new Error('Armor fence capture artifact is not a valid read-only capture');
  }
  const runId = assertSafeRunId(capture.runId, 'capture runId');
  const capturedAt = timestamp(capture.capturedAt, 'capture capturedAt');
  const expiresAt = timestamp(capture.expiresAt, 'capture expiresAt');
  const nowAt = timestamp(now, 'write now');
  assertCaptureWindow(capturedAt, expiresAt);
  if (Date.parse(capturedAt) > Date.parse(nowAt)
      || Date.parse(expiresAt) <= Date.parse(nowAt)
      || capture.environmentId !== 'local'
      || capture.policyOwnedScopeCount !== ARMOR_CANONICAL_POLICY_OWNER_SCOPES.length
      || capture.fenceCommit?.runId !== runId
      || capture.fenceCommit?.environmentId !== 'local'
      || capture.fenceCommit?.expiresAt !== expiresAt
      || !Array.isArray(capture.generationReadbacks)
      || capture.generationReadbacks.length !== ARMOR_CANONICAL_POLICY_OWNER_SCOPES.length) {
    throw new Error('Armor fence capture artifact identity or expiry is invalid');
  }
  validateArmorCanonicalFenceCommit(capture.fenceCommit, { runId, environmentId: 'local' });
  const expectedFenceBindings = new Map(capture.fenceCommit.bindings.map((binding) => [
    `${binding.databaseRole}\0${binding.table}\0${binding.fieldGroup}\0${binding.logicalPredicateHash}`,
    binding,
  ]));
  const readbackScopes = new Set();
  for (const readback of capture.generationReadbacks) {
    const key = `${readback?.databaseRole}\0${readback?.table}\0${readback?.fieldGroup}\0${readback?.logicalPredicateHash}`;
    const binding = expectedFenceBindings.get(key);
    if (!binding || readbackScopes.has(key)
        || readback.mutationGenerationScopeHash !== binding.mutationGenerationScopeHash
        || Number(readback.generation) !== Number(binding.beforeGeneration)
        || readback.schemaHash !== binding.generationSchemaHash
        || typeof readback.rowPresent !== 'boolean'
        || !Number.isSafeInteger(Number(readback.expiredFenceCount)) || Number(readback.expiredFenceCount) < 0) {
      throw new Error(`Armor fence capture generation readback does not match its fence binding: ${readback?.databaseRole}.${readback?.table}`);
    }
    readbackScopes.add(key);
  }
  if (readbackScopes.size !== expectedFenceBindings.size) {
    throw new Error('Armor fence capture generation readbacks do not cover every policy scope');
  }
  const { captureSha256, ...captureBody } = capture;
  if (!HASH.test(captureSha256 ?? '') || hash(captureBody) !== captureSha256) {
    throw new Error('Armor fence capture artifact hash drifted');
  }
  const fingerprint = canonicalServerFingerprint(capture.serverFingerprint);
  if (!['127.0.0.1', 'localhost', '::1'].includes(fingerprint.host)
      || fingerprint.port !== 13306
      || JSON.stringify(fingerprint.databases) !== JSON.stringify(Object.values(FORMAL_DATABASES))) {
    throw new Error('Armor fence capture artifact server identity is invalid');
  }
  const root = path.resolve(repoRoot);
  const relativePath = `${CAPTURE_ROOT}${runId}.${capture.captureSha256.slice('sha256:'.length)}.json`;
  const target = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, relativePath),
    label: 'Armor fence capture artifact',
    createParent: true,
  });
  const directory = path.dirname(target);
  const directoryMode = fs.statSync(directory).mode & 0o777;
  if ((directoryMode & 0o077) !== 0) throw new Error('Armor fence capture directory must be private');
  const bytes = Buffer.from(`${JSON.stringify(capture, null, 2)}\n`, 'utf8');
  const temporary = `${target}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  let temporaryCreated = false;
  let published = false;
  try {
    const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    temporaryCreated = true;
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.linkSync(temporary, target);
    published = true;
    fs.unlinkSync(temporary);
    temporaryCreated = false;
    const directoryFd = fs.openSync(directory, fs.constants.O_RDONLY);
    try { fs.fsyncSync(directoryFd); }
    finally { fs.closeSync(directoryFd); }
    return Object.freeze({ path: relativePath, sha256: hashBytes(bytes) });
  } catch (error) {
    if (temporaryCreated) {
      try { fs.unlinkSync(temporary); } catch { /* Keep the original error. */ }
    }
    if (published) {
      try { if (hashBytes(fs.readFileSync(target)) === hashBytes(bytes)) fs.unlinkSync(target); } catch { /* Keep the original error. */ }
    }
    throw error;
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter(token => token.startsWith('--')).map(token => {
    const body = token.slice(2);
    const split = body.indexOf('=');
    return split < 0 ? [body, 'true'] : [body.slice(0, split), body.slice(split + 1)];
  }));
}

export async function runArmorFenceCommitCaptureCli({ argv = process.argv.slice(2), repoRoot = process.cwd(), now = new Date().toISOString(), mysqlModule = null } = {}) {
  const args = parseArgs(argv);
  const runId = assertSafeRunId(args['run-id'], '--run-id');
  const expiresAt = timestamp(args['expires-at'], '--expires-at');
  const capturedAt = timestamp(now, 'capturedAt');
  assertCaptureWindow(capturedAt, expiresAt);
  const config = loadLocalStackConfig(repoRoot);
  const database = config.database;
  if (!['127.0.0.1', 'localhost', '::1'].includes(database?.host) || Number(database.port) !== 13306) {
    throw new Error('Armor fence capture requires the configured local MySQL loopback target');
  }
  const mysql = mysqlModule ?? loadMysqlModule({ repoRoot });
  const connection = await mysql.createConnection({
    host: database.host, port: Number(database.port), user: database.username, password: database.password,
    database: 'terria_v1_local', timezone: '+08:00', dateStrings: true, multipleStatements: false,
  });
  try {
    const capture = await captureArmorCanonicalFenceCommitSnapshot({ connection, runId, expiresAt, capturedAt });
    return writeArmorCanonicalFenceCommitCapture({ repoRoot, capture });
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runArmorFenceCommitCaptureCli().then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
