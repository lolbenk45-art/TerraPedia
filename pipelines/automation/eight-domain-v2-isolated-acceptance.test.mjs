import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildIsolatedAcceptanceManifest,
  connectionOptions,
  loadIsolatedAcceptanceManifest,
} from './eight-domain-v2-isolated-acceptance.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e8pr-v2-binding-'));
  const sourcePath = path.join(root, 'source.json');
  const sourceBytes = Buffer.from('{"domain":"items","records":100}\n');
  fs.writeFileSync(sourcePath, sourceBytes, { mode: 0o600 });
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = buildIsolatedAcceptanceManifest({
    repoRoot: root,
    manifestPath,
    domain: 'items',
    runId: 'e8pr-items-20261017-v1',
    runKey: 'e8p_547b4e28fb4004a0',
    codeBundleSha256: `sha256:${'a'.repeat(64)}`,
    mysql: {
      host: '127.0.0.1', port: 13306, serverUuid: 'server-1',
      databases: {
        local: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_local',
        maint: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_maint',
        relation: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_relation',
      },
    },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 1, stateStoreEpoch: 'epoch-e8p_547b4e28fb4004a0' },
    source: {
      path: 'source.json',
      sha256: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
      fingerprint: `sha256:${'c'.repeat(64)}`,
    },
    authorization: { sourceMode: 'local', queueId: 'queue-1', attemptId: 'attempt-1', stateStoreEpoch: 'epoch-e8p_547b4e28fb4004a0' },
  });
  return { root, manifestPath, manifest };
}

test('isolated V2 manifest binds one domain, exact target triple, source, and local mode', () => {
  const value = fixture();
  const env = {
    TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_ACCEPTANCE: 'true',
    TERRAPEDIA_DB_NAME: value.manifest.mysql.databases.local,
    TERRAPEDIA_DB_MAINT: value.manifest.mysql.databases.maint,
    TERRAPEDIA_DB_RELATION: value.manifest.mysql.databases.relation,
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'apiV2Test',
    TERRAPEDIA_DB_PASSWORD: 'secret',
    TERRAPEDIA_REDIS_HOST: '127.0.0.1',
    TERRAPEDIA_REDIS_PORT: '16380',
    TERRAPEDIA_REDIS_DATABASE: '1',
  };
  const loaded = loadIsolatedAcceptanceManifest({
    repoRoot: value.root,
    manifestPath: value.manifestPath,
    domain: 'items',
    env,
  });
  assert.equal(loaded.profile, 'eight-domain-isolated-acceptance');
  assert.deepEqual(connectionOptions(env, { domain: 'items', repoRoot: value.root, manifestPath: value.manifestPath }).database, value.manifest.mysql.databases.local);
});

test('isolated V2 guard rejects formal target, wrong Redis DB, and source-mode drift before connection', () => {
  const value = fixture();
  const baseEnv = {
    TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_ACCEPTANCE: 'true',
    TERRAPEDIA_DB_NAME: 'terria_v1_local',
    TERRAPEDIA_DB_MAINT: value.manifest.mysql.databases.maint,
    TERRAPEDIA_DB_RELATION: value.manifest.mysql.databases.relation,
    TERRAPEDIA_DB_HOST: '127.0.0.1', TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'prov', TERRAPEDIA_DB_PASSWORD: 'secret',
    TERRAPEDIA_REDIS_HOST: '127.0.0.1', TERRAPEDIA_REDIS_PORT: '16380', TERRAPEDIA_REDIS_DATABASE: '1',
  };
  assert.throws(() => connectionOptions(baseEnv, { domain: 'items', repoRoot: value.root, manifestPath: value.manifestPath }), /formal|run-derived|database/i);
  assert.throws(() => loadIsolatedAcceptanceManifest({
    repoRoot: value.root,
    manifestPath: value.manifestPath,
    domain: 'items',
    env: { ...baseEnv, TERRAPEDIA_DB_NAME: value.manifest.mysql.databases.local, TERRAPEDIA_REDIS_DATABASE: '2' },
  }), /Redis|logical DB|allocation|endpoint/i);
  const drifted = { ...value.manifest, authorization: { ...value.manifest.authorization, sourceMode: 'live' } };
  const { manifestSha256: ignoredHash, ...driftedBody } = drifted;
  drifted.manifestSha256 = `sha256:${createHash('sha256').update(JSON.stringify(driftedBody)).digest('hex')}`;
  fs.writeFileSync(value.manifestPath, `${JSON.stringify(drifted)}\n`, { mode: 0o600 });
  assert.throws(() => loadIsolatedAcceptanceManifest({
    repoRoot: value.root,
    manifestPath: value.manifestPath,
    domain: 'items',
    env: { ...baseEnv, TERRAPEDIA_DB_NAME: value.manifest.mysql.databases.local },
  }), /sourceMode|source mode|local/i);
});

test('production connection guard remains formal-local only when isolated mode is absent', () => {
  assert.equal(connectionOptions({
    TERRAPEDIA_DB_HOST: '127.0.0.1', TERRAPEDIA_DB_PORT: '13306', TERRAPEDIA_DB_NAME: 'terria_v1_local',
    TERRAPEDIA_DB_USERNAME: 'root', TERRAPEDIA_DB_PASSWORD: 'secret',
  }).database, 'terria_v1_local');
  assert.throws(() => connectionOptions({
    TERRAPEDIA_DB_HOST: '127.0.0.1', TERRAPEDIA_DB_PORT: '13306', TERRAPEDIA_DB_NAME: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_local',
    TERRAPEDIA_DB_USERNAME: 'root', TERRAPEDIA_DB_PASSWORD: 'secret',
  }), /terria_v1_local/i);
});
