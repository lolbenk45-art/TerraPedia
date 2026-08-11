import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildItemImageLineageContract,
  buildItemImageLineagePreviews,
  readItemImageLineageLayerState,
  resolveItemImageLineageRuntimeConfig,
  runItemImageLineagePreview
} from './item-image-lineage-db.mjs';

const OWNED_ROLE = 'icon';

test('every layer preview carries the exact bundle identity set', () => {
  const result = buildItemImageLineagePreviews({ bundle: bundle(), existing: emptyExisting() });

  assert.equal(result.identityCount, 3);
  assert.deepEqual(result.targetKeys, ['CopperCoin', 'IronPickaxe', 'Torch']);
  for (const layer of ['landing', 'maint', 'relation', 'local']) {
    assert.deepEqual(result.previews[layer].targetKeys, ['CopperCoin', 'IronPickaxe', 'Torch']);
    assert.deepEqual(result.previews[layer].deleteCandidateKeys, []);
  }
});

test('delete candidates are the owned rows each layer already holds', () => {
  const result = buildItemImageLineagePreviews({
    bundle: bundle(),
    existing: {
      landing: { identities: ['Torch'] },
      maint: { identities: ['Torch', 'CopperCoin'] },
      relation: { identities: ['CopperCoin'] },
      local: { ownedIdentities: ['IronPickaxe'], otherRoles: [] }
    }
  });

  assert.deepEqual(result.previews.landing.deleteCandidateKeys, ['Torch']);
  assert.deepEqual(result.previews.maint.deleteCandidateKeys, ['CopperCoin', 'Torch']);
  assert.deepEqual(result.previews.relation.deleteCandidateKeys, ['CopperCoin']);
  assert.deepEqual(result.previews.local.deleteCandidateKeys, ['IronPickaxe']);
});

test('an existing row outside the bundle is never a delete candidate', () => {
  // The lane owns 6,131 identities and nothing else. A layer holding rows this
  // lane did not produce must come out of the apply untouched.
  const result = buildItemImageLineagePreviews({
    bundle: bundle(),
    existing: {
      maint: { identities: ['Torch', 'SomeOtherItem'] },
      relation: { identities: ['NotOurs'] },
      local: { ownedIdentities: ['AlsoNotOurs', 'Torch'], otherRoles: [] }
    }
  });

  assert.deepEqual(result.previews.maint.deleteCandidateKeys, ['Torch']);
  assert.deepEqual(result.previews.relation.deleteCandidateKeys, []);
  assert.deepEqual(result.previews.local.deleteCandidateKeys, ['Torch']);
  assert.deepEqual(result.outOfScopeRetained.maint, ['SomeOtherItem']);
  assert.deepEqual(result.outOfScopeRetained.relation, ['NotOurs']);
  assert.deepEqual(result.outOfScopeRetained.local, ['AlsoNotOurs']);
});

test('local image roles this lane does not own are reported as preserved', () => {
  const result = buildItemImageLineagePreviews({
    bundle: bundle(),
    existing: {
      ...emptyExisting(),
      local: { ownedIdentities: ['Torch'], otherRoles: ['detail', 'banner'] }
    }
  });

  assert.deepEqual(result.preservedLocalRoles, ['banner', 'detail']);
  assert.deepEqual(result.previews.local.deleteCandidateKeys, ['Torch']);
});

test('a bundle with a duplicate identity is rejected', () => {
  const duplicated = bundle();
  duplicated.itemImages.push({ ...duplicated.itemImages[0] });

  assert.throws(
    () => buildItemImageLineagePreviews({ bundle: duplicated, existing: emptyExisting() }),
    /duplicate lineage identity Torch/i
  );
});

test('a bundle whose counters disagree with its rows is rejected', () => {
  const drifted = bundle();
  drifted.counters.total = 2;

  assert.throws(
    () => buildItemImageLineagePreviews({ bundle: drifted, existing: emptyExisting() }),
    /counters do not match/i
  );
});

test('the contract binds the bundle by hash and names every layer preview', () => {
  const bundleBytes = Buffer.from(JSON.stringify(bundle()));
  const contract = buildItemImageLineageContract({
    bundleBytes,
    bundlePath: 'reports/audit/item-image-lineage-2026-08-01.bundle.json',
    existing: emptyExisting(),
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']
    },
    generatedAt: '2026-08-01T00:00:00.000Z'
  });

  assert.equal(contract.operationId, 'canonical-item-image-lineage-apply');
  assert.equal(contract.lineageBundle.path, 'reports/audit/item-image-lineage-2026-08-01.bundle.json');
  assert.equal(
    contract.lineageBundle.sha256,
    `sha256:${createHash('sha256').update(bundleBytes).digest('hex')}`
  );
  assert.deepEqual(Object.keys(contract.previews).sort(), ['landing', 'local', 'maint', 'relation']);
  assert.equal(contract.expectedIdentityCount, 3);
  assert.match(contract.serverFingerprintSha256, /^sha256:[a-f0-9]{64}$/);
});

test('the contract refuses a server fingerprint missing a canonical database', () => {
  assert.throws(
    () => buildItemImageLineageContract({
      bundleBytes: Buffer.from(JSON.stringify(bundle())),
      bundlePath: 'reports/audit/item-image-lineage-2026-08-01.bundle.json',
      existing: emptyExisting(),
      serverFingerprint: { host: '127.0.0.1', port: 13306, serverUuid: 'uuid', databases: ['terria_v1_local'] },
      generatedAt: '2026-08-01T00:00:00.000Z'
    }),
    /databases must be exactly/i
  );
});

test('the layer state reader stays read-only and scopes local rows to the owned role', async () => {
  const statements = [];
  const state = await readItemImageLineageLayerState(connectionStub(statements), {
    maintDatabase: 'terria_v1_maint',
    relationDatabase: 'terria_v1_relation',
    localDatabase: 'terria_v1_local'
  });

  assert.ok(statements.every((sql) => /^\s*SELECT/i.test(sql)), statements.join('\n---\n'));
  assert.ok(statements.some((sql) => sql.includes("dataset_type = 'item_image_sources_raw'")));
  assert.ok(statements.some((sql) => sql.includes('`terria_v1_maint`.`maint_item_images`')));
  assert.ok(statements.some((sql) => sql.includes('`terria_v1_relation`.`relation_item_images`')));
  assert.ok(statements.some((sql) => sql.includes('`terria_v1_local`.`item_images`')));

  assert.deepEqual(state.landing.identities, ['Torch']);
  assert.deepEqual(state.maint.identities, ['CopperCoin', 'Torch']);
  assert.deepEqual(state.relation.identities, ['Torch']);
  assert.deepEqual(state.local.ownedIdentities, ['Torch']);
  assert.deepEqual(state.local.otherRoles, ['detail']);
});

function connectionStub(statements) {
  return {
    async query(sql) {
      statements.push(sql);
      if (sql.includes('source_dataset_landings')) {
        return [[{ payload_json: JSON.stringify({ itemImages: [{ itemInternalName: 'Torch' }] }) }], []];
      }
      if (sql.includes('maint_item_images')) {
        return [[{ item_internal_name: 'CopperCoin' }, { item_internal_name: 'Torch' }], []];
      }
      if (sql.includes('relation_item_images')) {
        return [[{ item_internal_name: 'Torch' }], []];
      }
      if (sql.includes('@@server_uuid')) {
        return [[{ server_uuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf' }], []];
      }
      if (sql.includes('item_images')) {
        return [[
          { internal_name: 'Torch', role: OWNED_ROLE },
          { internal_name: 'Torch', role: 'detail' }
        ], []];
      }
      return [[], []];
    }
  };
}

function emptyExisting() {
  return {
    landing: { identities: [] },
    maint: { identities: [] },
    relation: { identities: [] },
    local: { ownedIdentities: [], otherRoles: [] }
  };
}

function bundle() {
  return {
    schemaVersion: 1,
    entity: 'item_image_lineage_bundle',
    datasetType: 'item_image_sources_raw',
    provider: 'terraria.wiki.gg',
    counters: { total: 3 },
    itemImages: ['Torch', 'CopperCoin', 'IronPickaxe'].map((key, index) => ({
      itemId: index + 1,
      itemInternalName: key,
      itemName: key,
      role: OWNED_ROLE,
      provider: 'terraria.wiki.gg',
      originalUrl: `https://terraria.wiki.gg/images/${key}.png`,
      cachedUrl: `/terrapedia-images/items/${key.toLowerCase()}.png`,
      isPrimary: true,
      sortOrder: 0
    }))
  };
}

test('the preview run reads current state and writes the approvable contract', async () => {
  const statements = [];
  const written = [];
  const bundleBytes = Buffer.from(JSON.stringify(bundle()));

  const contract = await runItemImageLineagePreview({
    bundleBytes,
    bundlePath: 'reports/audit/item-image-lineage-2026-08-01.bundle.json',
    outputPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
    generatedAt: '2026-08-01T00:00:00.000Z',
    databases: {
      maintDatabase: 'terria_v1_maint',
      relationDatabase: 'terria_v1_relation',
      localDatabase: 'terria_v1_local'
    },
    expectedFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']
    },
    connect: async () => ({
      ...connectionStub(statements),
      async end() { statements.push('END'); }
    }),
    writeFile: (target, payload) => written.push([target, payload])
  });

  assert.equal(contract.operationId, 'canonical-item-image-lineage-apply');
  assert.equal(contract.expectedIdentityCount, 3);
  assert.deepEqual(contract.previews.maint.deleteCandidateKeys, ['CopperCoin', 'Torch']);
  assert.deepEqual(contract.previews.local.deleteCandidateKeys, ['Torch']);
  assert.deepEqual(contract.preservedLocalRoles, ['detail']);
  // The preview may only read, and it must close the connection it opened.
  assert.ok(statements.filter((sql) => sql !== 'END').every((sql) => /^\s*SELECT/i.test(sql)));
  assert.equal(statements.at(-1), 'END');
  assert.equal(written.length, 1);
  assert.equal(written[0][0], 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json');
});

test('the preview refuses a server whose uuid drifted from the authorized fingerprint', async () => {
  await assert.rejects(
    runItemImageLineagePreview({
      bundleBytes: Buffer.from(JSON.stringify(bundle())),
      bundlePath: 'reports/audit/item-image-lineage-2026-08-01.bundle.json',
      outputPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      generatedAt: '2026-08-01T00:00:00.000Z',
      databases: {
        maintDatabase: 'terria_v1_maint',
        relationDatabase: 'terria_v1_relation',
        localDatabase: 'terria_v1_local'
      },
      expectedFingerprint: {
        host: '127.0.0.1',
        port: 13306,
        serverUuid: 'not-the-running-server',
        databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']
      },
      connect: async () => ({ ...connectionStub([]), async end() {} }),
      writeFile: () => { throw new Error('must not write'); }
    }),
    /server uuid/i
  );
});

test('the runtime config comes from this worktree, not whichever root resolves first', () => {
  // `loadLocalStackConfig` prefers the primary worktree's file, which does not
  // carry the fingerprint block. A governed write must read the config of the
  // tree it is running in, or it validates one server and connects to another.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-image-lineage-config-'));
  fs.mkdirSync(path.join(root, 'scripts', 'dev', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'scripts', 'dev', 'config', 'local-stack.config.json'),
    JSON.stringify({
      database: { name: 'terria_v1_local', host: '127.0.0.1', port: 13306, username: 'root', password: 'root' },
      npcT1ServerFingerprint: {
        host: '127.0.0.1',
        port: 13306,
        serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
        databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']
      }
    })
  );

  const config = resolveItemImageLineageRuntimeConfig({ repoRoot: root });

  assert.equal(config.database.port, 13306);
  assert.equal(config.serverFingerprint.serverUuid, 'b4ae6728-4f72-11f1-bcc9-00155d37eadf');
});

test('a runtime config without a server fingerprint is rejected by name', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-image-lineage-config-bare-'));
  fs.mkdirSync(path.join(root, 'scripts', 'dev', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'scripts', 'dev', 'config', 'local-stack.config.json'),
    JSON.stringify({ database: { host: '127.0.0.1', port: 13306 } })
  );

  assert.throws(
    () => resolveItemImageLineageRuntimeConfig({ repoRoot: root }),
    /npcT1ServerFingerprint/
  );
});
