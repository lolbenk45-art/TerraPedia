import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildAudioAssetDbAudit,
  runAudioAssetDbAudit
} from './audio-asset-db-readiness-audit.mjs';

test('buildAudioAssetDbAudit passes when db rows match metadata and files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-audit-pass-'));
  const filePath = path.join(tempDir, 'item.wav');
  fs.writeFileSync(filePath, 'item-one');
  const metadata = { assets: [asset({ absoluteLocalPath: filePath, sha256: sha256('item-one') })] };

  const audit = buildAudioAssetDbAudit(metadata, {
    assetRows: [{ asset_id: 'items:item-1', size_bytes: 8, sha256: sha256('item-one') }],
    linkRows: [{ asset_id: 'items:item-1', match_status: 'unmatched' }]
  });

  assert.equal(audit.status, 'pass');
  assert.equal(audit.summary.metadataAssets, 1);
  assert.equal(audit.summary.dbAssets, 1);
  assert.equal(audit.summary.dbLinks, 1);
  assert.equal(audit.summary.unmatchedLinks, 1);
  assert.equal(audit.failures.length, 0);
});

test('buildAudioAssetDbAudit fails for missing db asset', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-audit-missing-db-'));
  const filePath = path.join(tempDir, 'item.wav');
  fs.writeFileSync(filePath, 'item-one');

  const audit = buildAudioAssetDbAudit({ assets: [asset({ absoluteLocalPath: filePath })] }, {
    assetRows: [],
    linkRows: []
  });

  assert.equal(audit.status, 'fail');
  assert.equal(audit.summary.missingDbAssets, 1);
});

test('buildAudioAssetDbAudit fails for size hash and local file mismatches', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-audit-mismatch-'));
  const filePath = path.join(tempDir, 'item.wav');
  fs.writeFileSync(filePath, 'item-one');
  const missingPath = path.join(tempDir, 'missing.wav');
  const metadata = {
    assets: [
      asset({ assetId: 'items:item-1', absoluteLocalPath: filePath, size: 8, sha256: sha256('item-one') }),
      asset({ assetId: 'items:item-2', absoluteLocalPath: missingPath, size: 8, sha256: sha256('item-one') })
    ]
  };

  const audit = buildAudioAssetDbAudit(metadata, {
    assetRows: [
      { asset_id: 'items:item-1', size_bytes: 9, sha256: '0'.repeat(64) },
      { asset_id: 'items:item-2', size_bytes: 8, sha256: sha256('item-one') }
    ],
    linkRows: []
  });

  assert.equal(audit.status, 'fail');
  assert.equal(audit.summary.sizeMismatch, 1);
  assert.equal(audit.summary.hashMismatch, 1);
  assert.equal(audit.summary.missingLocalFiles, 1);
});

test('runAudioAssetDbAudit queries db and writes report', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-db-audit-run-'));
  const filePath = path.join(tempDir, 'item.wav');
  const inputPath = path.join(tempDir, 'metadata.json');
  const reportPath = path.join(tempDir, 'audit.json');
  fs.writeFileSync(filePath, 'item-one');
  fs.writeFileSync(inputPath, JSON.stringify({ assets: [asset({ absoluteLocalPath: filePath, sha256: sha256('item-one') })] }));
  let ended = false;

  const audit = await runAudioAssetDbAudit({
    inputJsonPath: inputPath,
    reportPath,
    db: { database: 'terria_v1_local' }
  }, {
    mysqlModule: {
      async createConnection() {
        return {
          async execute(sql) {
            if (sql.includes('FROM audio_assets')) {
              return [[{ asset_id: 'items:item-1', size_bytes: 8, sha256: sha256('item-one') }]];
            }
            if (sql.includes('FROM audio_asset_links')) {
              return [[{ asset_id: 'items:item-1', match_status: 'unmatched' }]];
            }
            return [[]];
          },
          async end() { ended = true; }
        };
      }
    }
  });

  assert.equal(ended, true);
  assert.equal(audit.status, 'pass');
  assert.equal(JSON.parse(fs.readFileSync(reportPath, 'utf8')).status, 'pass');
});

function asset(overrides = {}) {
  return {
    assetId: 'items:item-1',
    absoluteLocalPath: '/tmp/item-1.wav',
    size: 8,
    sha256: sha256('item-one'),
    ...overrides
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
