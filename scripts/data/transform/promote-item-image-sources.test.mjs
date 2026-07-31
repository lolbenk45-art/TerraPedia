import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPromotedItemsPayload,
  runItemImageSourcePromotion
} from './promote-item-image-sources.mjs';

test('buildPromotedItemsPayload fills only empty image fields', () => {
  const fixture = promotionFixture();

  const payload = buildPromotedItemsPayload(fixture);

  assert.deepEqual(payload.counters, { total: 3, existing: 1, promoted: 2, unchanged: 1 });
  assert.equal(payload.before.sha256, sha256(fixture.standardizedBytes));
  assert.match(payload.after.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(payload.after.identitySetSha256, payload.before.identitySetSha256);

  const after = JSON.parse(payload.serializedAfter);
  const promoted = after.records.find((record) => record.internalName === 'CopperCoin');
  assert.deepEqual(
    {
      imageFileTitle: promoted.imageFileTitle,
      imageUrl: promoted.imageUrl,
      imageWidth: promoted.imageWidth,
      imageHeight: promoted.imageHeight,
      imageContentType: promoted.imageContentType
    },
    {
      imageFileTitle: 'Copper Coin.png',
      imageUrl: 'https://terraria.wiki.gg/images/Copper_Coin.png',
      imageWidth: 12,
      imageHeight: 12,
      imageContentType: 'image/png'
    }
  );
  // A retained secondary format belongs to the image lineage rows, never to the
  // single standardized image fields.
  assert.equal('secondarySources' in promoted, false);
  assert.equal(promoted.rarity, 1);

  const untouched = after.records.find((record) => record.internalName === 'Torch');
  assert.equal(untouched.imageFileTitle, 'Torch.png');

  assert.deepEqual(
    payload.changes.map((change) => [change.itemInternalName, change.fields.imageFileTitle.after]),
    [['Wrench', 'Red Wrench.png'], ['CopperCoin', 'Copper Coin.png']]
  );
});

test('buildPromotedItemsPayload rejects a bundle whose bytes do not match the contract', () => {
  const fixture = promotionFixture();
  fixture.contract.bundle.sha256 = sha256('other-bundle');

  assert.throws(() => buildPromotedItemsPayload(fixture), /bundle SHA-256 mismatch/i);
});

test('buildPromotedItemsPayload rejects a stale standardized before hash', () => {
  const fixture = promotionFixture();
  fixture.contract.standardizedBefore.sha256 = sha256('older-standardized');

  assert.throws(() => buildPromotedItemsPayload(fixture), /standardized before SHA-256 mismatch/i);
});

test('buildPromotedItemsPayload rejects a changed identity set', () => {
  const fixture = promotionFixture();
  const payload = JSON.parse(fixture.standardizedBytes);
  payload.records.push({ id: 99, internalName: 'Extra', name: 'Extra', imageFileTitle: null, imageUrl: null });
  fixture.standardizedBytes = JSON.stringify(payload);
  fixture.contract.standardizedBefore.sha256 = sha256(fixture.standardizedBytes);

  assert.throws(() => buildPromotedItemsPayload(fixture), /identity-set SHA-256 mismatch/i);
});

test('buildPromotedItemsPayload rejects a bundle that still carries an open row', () => {
  const fixture = promotionFixture();
  const bundle = JSON.parse(fixture.bundleBytes);
  bundle.counters.ambiguous = 1;
  fixture.bundleBytes = JSON.stringify(bundle);
  fixture.contract.bundle.sha256 = sha256(fixture.bundleBytes);

  assert.throws(() => buildPromotedItemsPayload(fixture), /bundle counters must be closed/i);
});

test('buildPromotedItemsPayload rejects promoting onto an item that already has a source', () => {
  const fixture = promotionFixture();
  const bundle = JSON.parse(fixture.bundleBytes);
  const torch = bundle.rows.find((row) => row.itemInternalName === 'Torch');
  torch.status = 'promoted';
  torch.source = { ...wikiSource(), fileTitle: 'Other Torch.png' };
  fixture.bundleBytes = JSON.stringify(bundle);
  fixture.contract.bundle.sha256 = sha256(fixture.bundleBytes);

  assert.throws(() => buildPromotedItemsPayload(fixture), /already carries an image source/i);
});

test('runItemImageSourcePromotion previews without touching the standardized file', async () => {
  const workspace = createWorkspace();
  const before = fs.readFileSync(workspace.itemsPath);

  const result = await runItemImageSourcePromotion({
    repoRoot: workspace.root,
    contractPath: workspace.contractPath,
    apply: false
  });

  assert.equal(result.applied, false);
  assert.deepEqual(result.counters, { total: 3, existing: 1, promoted: 2, unchanged: 1 });
  assert.deepEqual(fs.readFileSync(workspace.itemsPath), before);
  assert.equal(fs.existsSync(workspace.resultPath), false);
});

test('runItemImageSourcePromotion refuses to apply without an authorized context', async () => {
  const workspace = createWorkspace();
  const before = fs.readFileSync(workspace.itemsPath);

  await assert.rejects(
    () => runItemImageSourcePromotion({
      repoRoot: workspace.root,
      contractPath: workspace.contractPath,
      apply: true
    }, {
      loadAuthorizedContext: () => {
        throw new Error('TERRAPEDIA_AUTHORIZED_PACKET_PATH is required');
      }
    }),
    /TERRAPEDIA_AUTHORIZED_PACKET_PATH is required/
  );

  assert.deepEqual(fs.readFileSync(workspace.itemsPath), before);
});

test('runItemImageSourcePromotion refuses an authorized packet bound to other bytes', async () => {
  const workspace = createWorkspace();
  const before = fs.readFileSync(workspace.itemsPath);
  let permitConsumed = false;

  await assert.rejects(
    () => runItemImageSourcePromotion({
      repoRoot: workspace.root,
      contractPath: workspace.contractPath,
      apply: true
    }, {
      loadAuthorizedContext: () => ({ dataBundleSha256: sha256('unrelated-bundle') }),
      consumePermit: () => {
        permitConsumed = true;
      }
    }),
    /authorized data bundle SHA-256 mismatch/i
  );

  assert.equal(permitConsumed, false);
  assert.deepEqual(fs.readFileSync(workspace.itemsPath), before);
});

test('runItemImageSourcePromotion applies atomically and records the exact diff', async () => {
  const workspace = createWorkspace();
  let permitConsumed = false;

  const result = await runItemImageSourcePromotion({
    repoRoot: workspace.root,
    contractPath: workspace.contractPath,
    apply: true,
    generatedAt: '2026-08-01T00:00:00.000Z'
  }, {
    loadAuthorizedContext: () => ({
      dataBundleSha256: workspace.dataBundleSha256,
      decisionIdentity: 'canonical-item-image-source-promotion-20260801-01',
      packetHash: sha256('packet')
    }),
    consumePermit: () => {
      permitConsumed = true;
    }
  });

  assert.equal(permitConsumed, true);
  assert.equal(result.applied, true);
  const written = JSON.parse(fs.readFileSync(workspace.itemsPath, 'utf8'));
  assert.equal(
    written.records.find((record) => record.internalName === 'CopperCoin').imageFileTitle,
    'Copper Coin.png'
  );
  assert.equal(sha256(fs.readFileSync(workspace.itemsPath)), result.after.sha256);

  const saved = JSON.parse(fs.readFileSync(workspace.resultPath, 'utf8'));
  assert.equal(saved.status, 'COMPLETED');
  assert.equal(saved.operationId, 'canonical-item-image-source-promotion');
  assert.equal(saved.decisionIdentity, 'canonical-item-image-source-promotion-20260801-01');
  assert.equal(saved.before.sha256, workspace.beforeSha256);
  assert.equal(saved.after.sha256, result.after.sha256);
  assert.equal(saved.changes.length, 2);
  assert.equal((fs.statSync(workspace.resultPath).mode & 0o077), 0);
});

test('runItemImageSourcePromotion leaves the original bytes intact when the rename fails', async () => {
  const workspace = createWorkspace();
  const before = fs.readFileSync(workspace.itemsPath);

  await assert.rejects(
    () => runItemImageSourcePromotion({
      repoRoot: workspace.root,
      contractPath: workspace.contractPath,
      apply: true
    }, {
      loadAuthorizedContext: () => ({ dataBundleSha256: workspace.dataBundleSha256 }),
      consumePermit: () => {},
      rename: () => {
        throw new Error('injected rename failure');
      }
    }),
    /injected rename failure/
  );

  assert.deepEqual(fs.readFileSync(workspace.itemsPath), before);
  assert.deepEqual(
    fs.readdirSync(path.dirname(workspace.itemsPath)).filter((name) => name.includes('.tmp')),
    []
  );
});

test('runItemImageSourcePromotion refuses to rename a payload that changed a non-image field', async () => {
  const workspace = createWorkspace();
  const before = fs.readFileSync(workspace.itemsPath);

  await assert.rejects(
    () => runItemImageSourcePromotion({
      repoRoot: workspace.root,
      contractPath: workspace.contractPath,
      apply: true
    }, {
      loadAuthorizedContext: () => ({ dataBundleSha256: workspace.dataBundleSha256 }),
      consumePermit: () => {},
      tamperSerialized: (serialized) => {
        const payload = JSON.parse(serialized);
        payload.records.find((record) => record.internalName === 'CopperCoin').rarity = 9;
        return JSON.stringify(payload, null, 2);
      }
    }),
    /written payload SHA-256 mismatch/i
  );

  assert.deepEqual(fs.readFileSync(workspace.itemsPath), before);
});

function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-item-image-promotion-'));
  const fixture = promotionFixture();
  const itemsPath = path.join(root, 'data/standardized/items.standardized.json');
  const bundlePath = path.join(root, 'reports/audit/promotion.bundle.json');
  const contractPath = path.join(root, 'reports/authorization/canonical/contract.json');
  for (const filePath of [itemsPath, bundlePath, contractPath]) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  fs.writeFileSync(itemsPath, fixture.standardizedBytes);
  fs.writeFileSync(bundlePath, fixture.bundleBytes);
  fs.writeFileSync(contractPath, `${JSON.stringify({
    ...fixture.contract,
    bundle: { ...fixture.contract.bundle, path: 'reports/audit/promotion.bundle.json' },
    standardizedBefore: {
      ...fixture.contract.standardizedBefore,
      path: 'data/standardized/items.standardized.json'
    },
    resultPath: 'reports/authorization/canonical/promotion.result.json'
  }, null, 2)}\n`);
  return {
    root,
    itemsPath,
    contractPath,
    resultPath: path.join(root, 'reports/authorization/canonical/promotion.result.json'),
    beforeSha256: sha256(fixture.standardizedBytes),
    dataBundleSha256: fixture.contract.bundle.sha256
  };
}

function promotionFixture() {
  const standardizedPayload = {
    schemaVersion: '1.0.0',
    records: [
      {
        id: 8,
        internalName: 'Torch',
        name: 'Torch',
        rarity: 0,
        imageFileTitle: 'Torch.png',
        imageUrl: 'https://terraria.wiki.gg/images/Torch.png',
        imageWidth: 16,
        imageHeight: 16,
        imageContentType: 'image/png'
      },
      {
        id: 20,
        internalName: 'Wrench',
        name: 'Red Wrench',
        rarity: 2,
        imageFileTitle: null,
        imageUrl: null,
        imageWidth: null,
        imageHeight: null,
        imageContentType: null
      },
      {
        id: 71,
        internalName: 'CopperCoin',
        name: 'Copper Coin',
        rarity: 1,
        imageFileTitle: null,
        imageUrl: null,
        imageWidth: null,
        imageHeight: null,
        imageContentType: null
      }
    ]
  };
  const standardizedBytes = JSON.stringify(standardizedPayload, null, 2);
  const identitySetSha256 = identitySetHash(standardizedPayload.records);
  const bundle = {
    schemaVersion: 1,
    entity: 'item_image_source_promotion_bundle',
    generationId: 'a'.repeat(64),
    descriptor: {
      standardized: { sha256: sha256(standardizedBytes), identitySetSha256, recordCount: 3 }
    },
    counters: { total: 3, existing: 1, promoted: 2, unresolved: 0, ambiguous: 0, duplicate: 0, conflict: 0 },
    rows: [
      {
        itemId: 8,
        itemInternalName: 'Torch',
        itemName: 'Torch',
        status: 'existing',
        source: { authority: 'standardized_existing', fileTitle: 'Torch.png' },
        comparison: null
      },
      {
        itemId: 20,
        itemInternalName: 'Wrench',
        itemName: 'Red Wrench',
        status: 'promoted',
        source: wikiSource(),
        comparison: null
      },
      {
        itemId: 71,
        itemInternalName: 'CopperCoin',
        itemName: 'Copper Coin',
        status: 'promoted',
        source: {
          ...wikiSource(),
          anchorTitle: 'Copper Coin',
          fileTitle: 'Copper Coin.png',
          originalUrl: 'https://terraria.wiki.gg/images/Copper_Coin.png',
          width: 12,
          height: 12
        },
        secondarySources: [{
          ...wikiSource(),
          fileTitle: 'Copper Coin.gif',
          originalUrl: 'https://terraria.wiki.gg/images/Copper_Coin.gif',
          contentType: 'image/gif',
          sortOrder: 1
        }],
        comparison: null
      }
    ],
    bundlePayloadSha256: sha256('bundle-payload')
  };
  const bundleBytes = JSON.stringify(bundle);
  return {
    standardizedBytes,
    bundleBytes,
    contract: {
      schemaVersion: 1,
      operationId: 'canonical-item-image-source-promotion',
      bundle: { path: 'reports/audit/promotion.bundle.json', sha256: sha256(bundleBytes) },
      standardizedBefore: {
        path: 'data/standardized/items.standardized.json',
        sha256: sha256(standardizedBytes),
        identitySetSha256
      }
    }
  };
}

function wikiSource() {
  return {
    authority: 'raw_wiki_evidence',
    evidenceKind: 'mediawiki_exact_file',
    blockOrdinal: 1,
    anchorTitle: 'Red Wrench',
    fileTitle: 'Red Wrench.png',
    originalUrl: 'https://terraria.wiki.gg/images/Red_Wrench.png',
    width: 16,
    height: 16,
    contentType: 'image/png'
  };
}

function identitySetHash(records) {
  return sha256Canonical(records
    .map((record) => ({
      itemId: record.id ?? null,
      itemInternalName: record.internalName ?? null,
      itemName: record.name ?? null
    }))
    .sort((left, right) => Number(left.itemId) - Number(right.itemId)));
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Canonical(value) {
  return sha256(canonicalJson(value));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}
