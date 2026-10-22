import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HASH = /^sha256:[a-f0-9]{64}$/;
const RUN_KEY = /^[a-z0-9]{1,3}_[a-f0-9]{16}$/;
const RUN_SCHEMA = /^terria_v1_automation_acceptance_([a-z0-9]{1,3}_[a-f0-9]{16})_(local|maint|relation)$/;
const FORMAL = new Set(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation', 'terria_v1_v55_rehearsal']);
const ISOLATED_FLAG = 'true';

function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function privateOrdinaryFile(filePath, label) {
  const target = path.resolve(filePath);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error(`${label} must be a private ordinary file`);
  return { path: target, bytes: fs.readFileSync(target) };
}

function insideRoot(root, candidate, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the execution root`);
  return resolved;
}

function requireSchemaSet(databases, runKey) {
  if (!databases || typeof databases !== 'object' || Array.isArray(databases) || !RUN_KEY.test(runKey)) throw new Error('isolated V2 schema binding is invalid');
  const values = {};
  for (const role of ['local', 'maint', 'relation']) {
    const name = text(databases[role], `isolated ${role} schema`);
    const match = name.match(RUN_SCHEMA);
    if (!match || match[1] !== runKey || match[2] !== role || FORMAL.has(name)) throw new Error(`isolated ${role} schema is not the exact run-derived target`);
    values[role] = name;
  }
  return Object.freeze(values);
}

function requireTargetIdentity(value, label) {
  if (!value || value.host !== '127.0.0.1' || Number(value.port) !== 13306 || !text(value.serverUuid, `${label} serverUuid`)) throw new Error(`${label} MySQL identity is invalid`);
  return Object.freeze({ host: value.host, port: 13306, serverUuid: value.serverUuid });
}

function requireRedisIdentity(value, runKey) {
  if (!value || value.host !== '127.0.0.1' || Number(value.port) !== 16380 || !Number.isInteger(Number(value.logicalDb)) || Number(value.logicalDb) < 1 || Number(value.logicalDb) > 8 || value.stateStoreEpoch !== `epoch-${runKey}`) {
    throw new Error('isolated V2 Redis identity is invalid');
  }
  return Object.freeze({ host: value.host, port: 16380, logicalDb: Number(value.logicalDb), stateStoreEpoch: value.stateStoreEpoch });
}

export function buildIsolatedAcceptanceManifest({
  repoRoot, manifestPath, domain, runId, runKey, codeBundleSha256, mysql, redis, source, authorization,
} = {}) {
  const root = path.resolve(text(repoRoot, 'repoRoot'));
  const target = insideRoot(root, manifestPath, 'isolated V2 manifest');
  const sourcePath = insideRoot(root, path.resolve(root, text(source?.path, 'source manifest path')), 'source manifest');
  const sourceFile = privateOrdinaryFile(sourcePath, 'source manifest');
  if (!HASH.test(source?.sha256 ?? '') || hashBytes(sourceFile.bytes) !== source.sha256) throw new Error('source manifest hash does not match its bytes');
  const normalizedRunKey = text(runKey, 'runKey');
  const body = {
    schemaVersion: 1,
    profile: 'eight-domain-isolated-acceptance',
    domain: text(domain, 'domain'),
    runId: text(runId, 'runId'),
    runKey: normalizedRunKey,
    codeBundleSha256: text(codeBundleSha256, 'code bundle hash'),
    mysql: { ...requireTargetIdentity(mysql, 'isolated V2'), databases: requireSchemaSet(mysql?.databases, normalizedRunKey) },
    redis: requireRedisIdentity(redis, normalizedRunKey),
    source: {
      path: path.relative(root, sourcePath).replaceAll('\\', '/'),
      sha256: source.sha256,
      fingerprint: text(source.fingerprint, 'source fingerprint'),
    },
    authorization: {
      sourceMode: authorization?.sourceMode,
      queueId: text(authorization?.queueId, 'authorization queueId'),
      attemptId: text(authorization?.attemptId, 'authorization attemptId'),
      stateStoreEpoch: text(authorization?.stateStoreEpoch, 'authorization stateStoreEpoch'),
    },
  };
  if (!HASH.test(body.codeBundleSha256) || !HASH.test(body.source.fingerprint)
      || body.authorization.sourceMode !== 'local' || body.authorization.stateStoreEpoch !== body.redis.stateStoreEpoch) throw new Error('isolated V2 authorization binding is invalid');
  const persisted = { ...body, manifestSha256: hashBytes(Buffer.from(JSON.stringify(body))) };
  const bytes = Buffer.from(`${JSON.stringify(persisted, null, 2)}\n`);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' });
  return Object.freeze({ ...persisted, manifestPath: target });
}

export function loadIsolatedAcceptanceManifest({ repoRoot, manifestPath, domain, env = process.env } = {}) {
  if (String(env.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_ACCEPTANCE ?? '').trim() !== ISOLATED_FLAG) throw new Error('isolated V2 acceptance mode is not enabled');
  const root = path.resolve(text(repoRoot, 'repoRoot'));
  const target = insideRoot(root, manifestPath, 'isolated V2 manifest');
  const file = privateOrdinaryFile(target, 'isolated V2 manifest');
  let manifest;
  try { manifest = JSON.parse(file.bytes.toString('utf8')); } catch (error) { throw new Error('isolated V2 manifest is not valid JSON', { cause: error }); }
  const { manifestSha256, ...manifestBody } = manifest;
  if (!HASH.test(manifestSha256 ?? '') || hashBytes(Buffer.from(JSON.stringify(manifestBody))) !== manifestSha256) throw new Error('isolated V2 manifest content hash drift');
  const runKey = text(manifest.runKey, 'manifest runKey');
  if (manifest.schemaVersion !== 1 || manifest.profile !== 'eight-domain-isolated-acceptance' || manifest.domain !== domain || !RUN_KEY.test(runKey)) throw new Error('isolated V2 manifest profile/domain/run identity is invalid');
  const databases = requireSchemaSet(manifest.mysql?.databases, runKey);
  const mysql = requireTargetIdentity(manifest.mysql, 'isolated V2');
  const redis = requireRedisIdentity(manifest.redis, runKey);
  if (manifest.authorization?.sourceMode !== 'local' || manifest.authorization?.stateStoreEpoch !== redis.stateStoreEpoch) throw new Error('isolated V2 source mode or epoch drifted');
  const sourcePath = insideRoot(root, path.resolve(root, text(manifest.source?.path, 'source manifest path')), 'source manifest');
  const source = privateOrdinaryFile(sourcePath, 'source manifest');
  if (!HASH.test(manifest.source?.sha256 ?? '') || hashBytes(source.bytes) !== manifest.source.sha256) throw new Error('isolated V2 source manifest hash drifted');
  if (!HASH.test(manifest.source?.fingerprint ?? '')) throw new Error('isolated V2 source fingerprint is invalid');
  const sourcePayload = JSON.parse(source.bytes.toString('utf8'));
  if (Array.isArray(sourcePayload.sourceFiles)) {
    for (const entry of sourcePayload.sourceFiles) {
      const declaredPath = text(entry?.path, 'source file path');
      const filePath = insideRoot(root, path.resolve(root, declaredPath), 'source file');
      const sourceFile = privateOrdinaryFile(filePath, 'bound source file');
      if (!HASH.test(entry?.sha256 ?? '') || hashBytes(sourceFile.bytes) !== entry.sha256) throw new Error(`isolated V2 bound source file hash drifted: ${declaredPath}`);
    }
  }
  if (env.TERRAPEDIA_DB_NAME !== databases.local || env.TERRAPEDIA_DB_MAINT !== databases.maint || env.TERRAPEDIA_DB_RELATION !== databases.relation) throw new Error('isolated V2 database environment differs from manifest');
  if (env.TERRAPEDIA_DB_HOST !== mysql.host || Number(env.TERRAPEDIA_DB_PORT) !== mysql.port || env.TERRAPEDIA_REDIS_HOST !== redis.host || Number(env.TERRAPEDIA_REDIS_PORT) !== redis.port || Number(env.TERRAPEDIA_REDIS_DATABASE) !== redis.logicalDb) throw new Error('isolated V2 endpoint environment differs from manifest');
  return Object.freeze({ ...manifest, manifestPath: target, manifestSha256, mysql: { ...mysql, databases }, redis, source: { ...manifest.source, path: path.relative(root, sourcePath).replaceAll('\\', '/'), manifestPayload: sourcePayload } });
}

export function connectionOptions(env = process.env, { domain, repoRoot = process.cwd(), manifestPath = env.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_MANIFEST_PATH } = {}) {
  const port = Number(text(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid TERRAPEDIA_DB_PORT');
  if (String(env.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_ACCEPTANCE ?? '').trim() !== ISOLATED_FLAG) {
    if (env.TERRAPEDIA_DB_NAME !== 'terria_v1_local') throw new Error('TERRAPEDIA_DB_NAME must be terria_v1_local');
    return { host: text(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'), port, user: text(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'), password: text(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'), database: 'terria_v1_local', multipleStatements: false, dateStrings: true };
  }
  const manifest = loadIsolatedAcceptanceManifest({ repoRoot, manifestPath, domain, env });
  return { host: manifest.mysql.host, port: manifest.mysql.port, user: text(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'), password: text(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'), database: manifest.mysql.databases.local, multipleStatements: false, dateStrings: true };
}
