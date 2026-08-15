import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'crawler-queue-v2-smoke.sh');

function run(overrides = {}) {
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...overrides,
    },
  });
}

test('crawler queue V2 smoke exists and refuses unsafe fixture environments before any request', () => {
  assert.equal(existsSync(script), true);
  const source = readFileSync(script, 'utf8');
  assert.match(source, /http:\/\/127\.0\.0\.1:\$\{APP_PORT:-18088\}\/api/);
  assert.match(source, /json_attempt_state_version/);
  assert.match(source, /\/admin\/crawler-monitor\/domains\/items\/start/);
  assert.match(source, /operationId":"sample"/);
  assert.match(source, /fixture root ownership marker required/);
  assert.match(source, /fixture namespace must include a unique suffix/);

  const disabled = run();
  assert.notEqual(disabled.status, 0);
  assert.match(`${disabled.stdout}${disabled.stderr}`, /FIXTURE_ENABLED=true/);

  const productionPrefix = run({
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED: 'true',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v2:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v1:test:guard:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT: '/tmp/terrapedia-fixture-guard',
    TERRAPEDIA_ADMIN_TOKEN: 'guard-token',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_REDIS_DB: '9',
  });
  assert.notEqual(productionPrefix.status, 0);
  assert.match(`${productionPrefix.stdout}${productionPrefix.stderr}`, /test namespace|unique suffix/);

  const missingRedisDb = run({
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED: 'true',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v2:test:guard:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v1:test:guard:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT: '/tmp/terrapedia-fixture-guard',
    TERRAPEDIA_ADMIN_TOKEN: 'guard-token',
  });
  assert.notEqual(missingRedisDb.status, 0);
  assert.match(`${missingRedisDb.stdout}${missingRedisDb.stderr}`, /REDIS_DB/);

  const sharedPrefix = run({
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED: 'true',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v2:test:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v1:test:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT: '/tmp/terrapedia-fixture-guard',
    TERRAPEDIA_ADMIN_TOKEN: 'guard-token',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_REDIS_DB: '9',
  });
  assert.notEqual(sharedPrefix.status, 0);
  assert.match(`${sharedPrefix.stdout}${sharedPrefix.stderr}`, /unique suffix/);

  const occupiedRoot = mkdtempSync(`${tmpdir()}/terrapedia-fixture-occupied-`);
  writeFileSync(`${occupiedRoot}/user-owned.txt`, 'preserve');
  const occupied = run({
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED: 'true',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v2:test:occupied-root:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v1:test:occupied-root:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT: occupiedRoot,
    TERRAPEDIA_ADMIN_TOKEN: 'guard-token',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_REDIS_DB: '9',
  });
  assert.notEqual(occupied.status, 0);
  assert.match(`${occupied.stdout}${occupied.stderr}`, /fixture root ownership marker required/);
  assert.equal(existsSync(`${occupiedRoot}/user-owned.txt`), true);
  rmSync(occupiedRoot, { recursive: true, force: true });

  const ownedButDirtyRoot = mkdtempSync(`${tmpdir()}/terrapedia-fixture-owned-dirty-`);
  writeFileSync(`${ownedButDirtyRoot}/.terrapedia-crawler-v2-fixture-root`, 'terrapedia-crawler-v2-fixture-root-v1');
  writeFileSync(`${ownedButDirtyRoot}/user-owned.txt`, 'preserve');
  const ownedButDirty = run({
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED: 'true',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v2:test:owned-dirty-root:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE: 'terrapedia:crawler:wiki-monitor:v1:test:owned-dirty-root:',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT: ownedButDirtyRoot,
    TERRAPEDIA_ADMIN_TOKEN: 'guard-token',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_REDIS_DB: '9',
  });
  assert.notEqual(ownedButDirty.status, 0);
  assert.match(`${ownedButDirty.stdout}${ownedButDirty.stderr}`, /fixture root contains unowned files/);
  assert.equal(existsSync(`${ownedButDirtyRoot}/user-owned.txt`), true);
  rmSync(ownedButDirtyRoot, { recursive: true, force: true });
});
