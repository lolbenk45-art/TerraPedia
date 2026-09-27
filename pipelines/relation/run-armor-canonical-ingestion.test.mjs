import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_CANONICAL_OPERATION_ID,
} from './armor-canonical-operation-binding.mjs';
import {
  applyArmorCanonicalIngestion,
  buildArmorCanonicalIngestionConnectionOptions,
  buildArmorCanonicalIngestionPaths,
} from './run-armor-canonical-ingestion.mjs';

test('Armor full-chain runner has isolated labeled intent/result/journal paths', () => {
  assert.deepEqual(buildArmorCanonicalIngestionPaths('retry-01'), {
    intentPath: `reports/authorization/canonical/${ARMOR_CANONICAL_OPERATION_ID}.retry-01.intent.json`,
    resultPath: `reports/authorization/canonical/${ARMOR_CANONICAL_OPERATION_ID}.retry-01.result.json`,
    journalPath: `reports/authorization/canonical/${ARMOR_CANONICAL_OPERATION_ID}.retry-01.journal.json`,
  });
  assert.throws(() => buildArmorCanonicalIngestionPaths('../retry-01'), /label/);
  assert.throws(() => buildArmorCanonicalIngestionPaths('Retry-01'), /label/);
});

test('Armor full-chain runner rejects a non-loopback or wrong-port connection target', () => {
  assert.equal(buildArmorCanonicalIngestionConnectionOptions({ database: { host: '127.0.0.1', port: 13306, username: 'test', password: 'test' } }).database, 'terria_v1_local');
  assert.throws(() => buildArmorCanonicalIngestionConnectionOptions({ database: { host: 'example.com', port: 13306 } }), /loopback/);
  assert.throws(() => buildArmorCanonicalIngestionConnectionOptions({ database: { host: '127.0.0.1', port: 3306 } }), /13306/);
});

test('Armor full-chain runner fails closed before opening MySQL without a packet', async () => {
  let opened = false;
  await assert.rejects(() => applyArmorCanonicalIngestion({
    resultLabel: 'retry-01',
    intentPath: buildArmorCanonicalIngestionPaths('retry-01').intentPath,
    env: {},
    mysqlModule: { async createConnection() { opened = true; } },
  }), /TERRAPEDIA_AUTHORIZED_PACKET_PATH/);
  assert.equal(opened, false);
});
