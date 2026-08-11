import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as shimmerImporter from './import-wiki-shimmer-to-db.mjs';
import { hashOrderedBundleBytes } from '../automation/build-canonical-cutover-authorization.mjs';
import { publishShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';

const { importShimmerItemTransforms } = shimmerImporter;

test('shimmer importer resolves a generation only through the private input contract', async () => {
  const fixture = createGenerationFixture();
  let connectionAttempts = 0;

  try {
    assert.equal(typeof shimmerImporter.loadVerifiedShimmerImportBundleFromInputContract, 'function');
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundleFromInputContract({
      inputContractPath: fixture.inputContractPath,
      repoRoot: fixture.repoRoot,
    });
    assert.equal(bundle.generationId, fixture.publication.manifest.generationId);
    assert.equal(bundle.manifestSha256, fixture.publication.manifest.manifestSha256);
    assert.equal(bundle.dataBundleSha256, fixture.publication.manifest.dataBundleSha256);

    const pathDrift = path.join(fixture.repoRoot, 'reports/authorization/canonical/path-drift.input.json');
    fs.copyFileSync(fixture.inputContractPath, pathDrift);
    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundleFromInputContract({
        inputContractPath: pathDrift,
        repoRoot: fixture.repoRoot,
      }),
      /canonical path/i,
    );

    fs.chmodSync(fixture.inputContractPath, 0o644);
    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundleFromInputContract({
        inputContractPath: fixture.inputContractPath,
        repoRoot: fixture.repoRoot,
      }),
      /private|ordinary/i,
    );
    fs.chmodSync(fixture.inputContractPath, 0o600);

    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: false,
        bundleManifestPath: fixture.publication.manifestPath,
        repoRoot: fixture.repoRoot,
      }, {
        mysql: {
          createConnection: async () => {
            connectionAttempts += 1;
            throw new Error('database connection must not be reached');
          },
        },
      }),
      /input contract/i,
    );
    assert.equal(connectionAttempts, 0);
  } finally {
    fixture.cleanup();
  }
});

test('shimmer importer accepts only a verified content-addressed bundle manifest', () => {
  assert.equal(typeof shimmerImporter.loadVerifiedShimmerImportBundle, 'function');
  const fixture = createGenerationFixture();

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });

    assert.equal(bundle.generationId, fixture.publication.manifest.generationId);
    assert.equal(bundle.dataBundleSha256, fixture.publication.manifest.dataBundleSha256);
    assert.equal(bundle.manifestSha256, fixture.publication.manifest.manifestSha256);
    assert.equal(bundle.rawPayload.pageTitle, 'Shimmer');
    assert.equal(bundle.itemTransformsPayload.records.length, 1);
    assert.equal(bundle.titleResolutionPayload.records.length, 1);

    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({ repoRoot: fixture.repoRoot }),
      /bundle manifest/i
    );
    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({
        bundleManifestPath: path.join(fixture.repoRoot, 'data', 'generated', 'shimmer', 'wiki-shimmer-manifest.latest.json'),
        repoRoot: fixture.repoRoot
      }),
      /content-addressed|generation/i
    );
    const relocatedGenerationPath = path.join(
      fixture.repoRoot,
      'data',
      'generated',
      'other',
      'generations',
      bundle.generationId
    );
    fs.cpSync(fixture.publication.generationPath, relocatedGenerationPath, { recursive: true });
    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({
        bundleManifestPath: path.join(relocatedGenerationPath, 'wiki-shimmer-manifest.json'),
        repoRoot: fixture.repoRoot
      }),
      /content-addressed|generation/i
    );

    fs.appendFileSync(
      path.join(fixture.publication.generationPath, 'wiki-shimmer-item-transforms.importable.json'),
      'mutation'
    );
    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({
        bundleManifestPath: fixture.publication.manifestPath,
        repoRoot: fixture.repoRoot
      }),
      /hash mismatch/i
    );
  } finally {
    fixture.cleanup();
  }
});

test('verified shimmer import projection rejects ambiguous or unresolved references', () => {
  const fixture = createGenerationFixture();

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot,
    });
    const ambiguous = structuredClone(bundle);
    ambiguous.itemTransformsPayload.records[0].inputKind = 'ambiguous';
    assert.throws(
      () => shimmerImporter.buildShimmerImportProjection({ bundle: ambiguous }),
      /ambiguous|unresolved|reference kind/i,
    );
  } finally {
    fixture.cleanup();
  }
});

test('shimmer importer rejects manifest self-hash and bundle-hash tampering before database access', () => {
  const fixture = createGenerationFixture();

  try {
    const manifest = JSON.parse(fs.readFileSync(fixture.publication.manifestPath, 'utf8'));
    manifest.dataBundleSha256 = sha256('tampered-data-bundle');
    fs.writeFileSync(fixture.publication.manifestPath, `${JSON.stringify(manifest)}\n`);

    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({
        bundleManifestPath: fixture.publication.manifestPath,
        repoRoot: fixture.repoRoot
      }),
      /manifest hash|data bundle/i
    );
  } finally {
    fixture.cleanup();
  }
});

test('shimmer importer rechecks a payload against its verified descriptor before use', () => {
  assert.equal(typeof shimmerImporter.readVerifiedShimmerGenerationPayload, 'function');
  const fixture = createGenerationFixture();

  try {
    const fileName = 'wiki-shimmer-item-transforms.importable.json';
    const descriptor = fixture.publication.manifest.files.find((file) => file.name === fileName);
    fs.writeFileSync(
      path.join(fixture.publication.generationPath, fileName),
      JSON.stringify({ entity: 'wiki_shimmer_item_transforms_importable', records: [] })
    );

    assert.throws(
      () => shimmerImporter.readVerifiedShimmerGenerationPayload({
        generationPath: fixture.publication.generationPath,
        fileName,
        expectedDescriptor: descriptor
      }),
      /hash mismatch/i
    );
  } finally {
    fixture.cleanup();
  }
});

test('shimmer importer rejects a manifest from one generation that names another generation', () => {
  const fixture = createGenerationFixture();

  try {
    const manifest = JSON.parse(fs.readFileSync(fixture.publication.manifestPath, 'utf8'));
    const siblingPath = path.join(
      path.dirname(fixture.publication.generationPath),
      'b'.repeat(64)
    );
    fs.cpSync(fixture.publication.generationPath, siblingPath, { recursive: true });

    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({
        bundleManifestPath: path.join(siblingPath, 'wiki-shimmer-manifest.json'),
        repoRoot: fixture.repoRoot
      }),
      /generation id|content-addressed/i
    );
  } finally {
    fixture.cleanup();
  }
});

test('shimmer importer rejects a symbolic-link generation manifest', () => {
  const fixture = createGenerationFixture();

  try {
    const sourcePath = path.join(fixture.repoRoot, 'manifest-source.json');
    fs.copyFileSync(fixture.publication.manifestPath, sourcePath);
    fs.rmSync(fixture.publication.manifestPath);
    fs.symlinkSync(sourcePath, fixture.publication.manifestPath);

    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({
        bundleManifestPath: fixture.publication.manifestPath,
        repoRoot: fixture.repoRoot
      }),
      /ordinary file/i
    );
  } finally {
    fixture.cleanup();
  }
});

test('shimmer importer rejects a generation directory that resolves outside the canonical root', () => {
  const fixture = createGenerationFixture();

  try {
    const redirectedGenerationPath = path.join(fixture.repoRoot, 'redirected-generation');
    fs.renameSync(fixture.publication.generationPath, redirectedGenerationPath);
    fs.symlinkSync(redirectedGenerationPath, fixture.publication.generationPath, 'dir');

    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({
        bundleManifestPath: fixture.publication.manifestPath,
        repoRoot: fixture.repoRoot
      }),
      /canonical generation root|ancestor|symbolic/i,
    );
  } finally {
    fixture.cleanup();
  }
});

test('shimmer importer rejects a canonical generation root that resolves outside the repository', () => {
  const fixture = createGenerationFixture();
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-outside-generation-root-'));
  const generationRoot = path.join(fixture.repoRoot, 'data', 'generated', 'shimmer', 'generations');
  const outsideGenerationRoot = path.join(outsideRoot, 'generations');

  try {
    fs.renameSync(generationRoot, outsideGenerationRoot);
    fs.symlinkSync(outsideGenerationRoot, generationRoot, 'dir');

    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({
        bundleManifestPath: fixture.publication.manifestPath,
        repoRoot: fixture.repoRoot,
      }),
      /generation root.*repository|canonical generation root|ordinary directory/i,
    );
    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundleFromInputContract({
        inputContractPath: fixture.inputContractPath,
        repoRoot: fixture.repoRoot,
      }),
      /generation root.*repository|canonical generation root|ordinary directory/i,
    );
  } finally {
    fixture.cleanup();
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('shimmer importer and private contract reject a generation path with an external transit symlink', () => {
  const fixture = createGenerationFixture();
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-transit-root-'));
  const shimmerPath = path.join(fixture.repoRoot, 'data', 'generated', 'shimmer');
  const internalShimmerPath = path.join(fixture.repoRoot, 'data', 'generated', 'shimmer-internal');
  const outsideShimmerPath = path.join(outsideRoot, 'shimmer');

  try {
    fs.renameSync(shimmerPath, internalShimmerPath);
    fs.mkdirSync(outsideShimmerPath, { recursive: true });
    fs.symlinkSync(outsideShimmerPath, shimmerPath, 'dir');
    fs.symlinkSync(path.join(internalShimmerPath, 'generations'), path.join(outsideShimmerPath, 'generations'), 'dir');

    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundle({
        bundleManifestPath: fixture.publication.manifestPath,
        repoRoot: fixture.repoRoot,
      }),
      /ancestor|symbolic|repository/i,
    );
    assert.throws(
      () => shimmerImporter.loadVerifiedShimmerImportBundleFromInputContract({
        inputContractPath: fixture.inputContractPath,
        repoRoot: fixture.repoRoot,
      }),
      /ancestor|symbolic|repository/i,
    );
  } finally {
    fixture.cleanup();
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('shimmer importer rejects missing, malformed, or non-SHIMMER contexts before connection', async () => {
  for (const [label, contextRecords] of [
    ['missing', []],
    ['malformed', [{}]],
    ['wrong code', [{ code: 'DAY' }]],
    ['multiple contexts', [{ code: 'SHIMMER' }, { code: 'SHIMMER' }]]
  ]) {
    const fixture = createGenerationFixture({ contextRecords });
    let connectionAttempts = 0;

    try {
      await assert.rejects(
        shimmerImporter.runShimmerImport({
          apply: false,
          inputContractPath: fixture.inputContractPath,
          repoRoot: fixture.repoRoot
        }, {
          mysql: {
            createConnection: async () => {
              connectionAttempts += 1;
              throw new Error('database connection must not be reached');
            }
          }
        }),
        /verified shimmer import context/i,
        `expected ${label} context to fail before connection`
      );
      assert.equal(connectionAttempts, 0, `${label} context must not open a connection`);
    } finally {
      fixture.cleanup();
    }
  }
});

test('shimmer import preview freezes one generation, target fingerprint, and provider-owned scope', () => {
  assert.equal(typeof shimmerImporter.buildShimmerImportPreview, 'function');
  const fixture = createGenerationFixture();

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const preview = shimmerImporter.buildShimmerImportPreview({
      bundle,
      target: {
        host: '127.0.0.1',
        port: 13306,
        database: 'terria_v1_local',
        serverUuid: 'shimmer-preview-server'
      },
      existing: {
        shimmerTables: {
          shimmer_item_transforms: [],
          shimmer_decraft_rules: [],
          shimmer_entity_transforms: [],
          shimmer_npc_transforms: []
        },
        snapshots: []
      }
    });

    assert.equal(preview.operationId, 'canonical-shimmer-import');
    assert.equal(preview.generationId, bundle.generationId);
    assert.equal(preview.dataBundleSha256, bundle.dataBundleSha256);
    assert.equal(preview.manifestSha256, bundle.manifestSha256);
    assert.match(preview.targetFingerprintSha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(preview.previewSha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(preview.providerScope.provider, 'wiki_zh');
    assert.equal(preview.tables.shimmer_item_transforms.after.count, 1);
    assert.equal(preview.tables.shimmer_decraft_rules.after.count, 1);
    assert.equal(preview.tables.shimmer_entity_transforms.after.count, 1);
    assert.equal(preview.tables.shimmer_npc_transforms.after.count, 1);
    assert.throws(
      () => shimmerImporter.buildShimmerImportPreview({
        bundle,
        target: {
          host: '127.0.0.1',
          port: 13306,
          database: 'terria_v1_local',
          serverUuid: ''
        }
      }),
      /fingerprint/i
    );
  } finally {
    fixture.cleanup();
  }
});

test('shimmer preview freezes logical keys and snapshot descriptors into its hash', () => {
  const fixture = createGenerationFixture();
  const target = {
    host: '127.0.0.1',
    port: 13306,
    database: 'terria_v1_local',
    serverUuid: 'shimmer-preview-server'
  };

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const preview = shimmerImporter.buildShimmerImportPreview({
      bundle,
      target,
      existing: {
        worldContext: null,
        shimmerTables: {
          shimmer_item_transforms: [],
          shimmer_decraft_rules: [],
          shimmer_entity_transforms: [],
          shimmer_npc_transforms: []
        },
        snapshots: []
      }
    });

    for (const tableName of preview.providerScope.tables) {
      for (const stage of ['before', 'after']) {
        const descriptor = preview.tables[tableName][stage];
        assert.equal(Array.isArray(descriptor.logicalKeys), true, `${tableName} ${stage} logical keys`);
        assert.equal(Object.isFrozen(descriptor.logicalKeys), true, `${tableName} ${stage} keys must freeze`);
        assert.match(descriptor.keySha256, /^sha256:[a-f0-9]{64}$/);
        assert.match(descriptor.sha256, /^sha256:[a-f0-9]{64}$/);
      }
    }

    const snapshot = preview.snapshots.after.descriptors.find(
      (descriptor) => descriptor.logicalKey.entityType === 'wiki_shimmer_context'
    );
    assert.equal(Object.isFrozen(preview), true);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.logicalKey), true);
    assert.deepEqual(snapshot.logicalKey, {
      entityType: 'wiki_shimmer_context',
      provider: 'wiki_zh',
      sourceKind: 'generated_json',
      sourceLocator: `data/generated/shimmer/generations/${bundle.generationId}/wiki-shimmer-context.importable.json`
    });
    assert.match(snapshot.payloadSha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(snapshot.fetchedAt, '2026-08-03 00:00:00');
    assert.equal(snapshot.sourceRevisionTimestamp, '2026-08-03 00:00:00');
    assert.equal(snapshot.parseStatus, 'parsed');

    const previewPayload = JSON.parse(JSON.stringify(preview));
    delete previewPayload.previewSha256;
    assert.equal(preview.previewSha256, sha256(JSON.stringify(stableValue(previewPayload))));
    previewPayload.tables.shimmer_item_transforms.after.logicalKeys[0].sortOrder += 1;
    assert.notEqual(preview.previewSha256, sha256(JSON.stringify(stableValue(previewPayload))));
  } finally {
    fixture.cleanup();
  }
});

test('shimmer preview result and report retain scope, target, and inspectable evidence', async () => {
  const fixture = createGenerationFixture();
  const outputPath = path.join(fixture.repoRoot, 'reports', 'wiki-shimmer-db-import-preview.json');
  const target = {
    host: '127.0.0.1',
    port: 13306,
    database: 'terria_v1_local',
    serverUuid: 'shimmer-preview-server'
  };
  const calls = [];

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const preview = shimmerImporter.buildShimmerImportPreview({
      bundle,
      target,
      existing: { worldContext: null, shimmerTables: {}, snapshots: [] }
    });
    const result = await shimmerImporter.runShimmerImport({
      apply: false,
      inputContractPath: fixture.inputContractPath,
      outputPath,
      repoRoot: fixture.repoRoot
    }, {
      mysql: {
        createConnection: async () => {
          calls.push('connect');
          return {
            async end() {
              calls.push('end');
            },
            async query() {
              calls.push('query');
              return [[{ serverUuid: target.serverUuid }]];
            }
          };
        }
      },
      loadCurrentScope: async () => ({ worldContext: null, shimmerTables: {}, snapshots: [] }),
      loadTarget: async () => target,
      buildPreview: () => preview
    });
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    for (const emitted of [result, report]) {
      assert.deepEqual(emitted.providerScope, preview.providerScope);
      assert.deepEqual(emitted.target, preview.target);
      assert.deepEqual(
        emitted.tables.shimmer_item_transforms.after.logicalKeys,
        preview.tables.shimmer_item_transforms.after.logicalKeys
      );
      assert.deepEqual(emitted.snapshots.after.descriptors, preview.snapshots.after.descriptors);
    }
    assert.deepEqual(calls, ['connect', 'query', 'end']);
  } finally {
    fixture.cleanup();
  }
});

test('shimmer import uses one database projection for context, snapshots, and provider-owned tables', () => {
  assert.equal(typeof shimmerImporter.buildShimmerImportProjection, 'function');
  const fixture = createGenerationFixture();

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const projection = shimmerImporter.buildShimmerImportProjection({ bundle });
    const preview = shimmerImporter.buildShimmerImportPreview({
      bundle,
      target: {
        host: '127.0.0.1',
        port: 13306,
        database: 'terria_v1_local',
        serverUuid: 'shimmer-preview-server'
      },
      existing: {
        worldContext: null,
        shimmerTables: Object.fromEntries(
          Object.keys(projection.shimmerTables).map((tableName) => [tableName, []])
        ),
        snapshots: []
      }
    });

    assert.equal(projection.worldContext.code, 'SHIMMER');
    assert.equal(preview.worldContext.before.count, 0);
    assert.equal(preview.worldContext.after.count, 1);
    assert.equal(preview.snapshots.before.count, 0);
    assert.equal(preview.snapshots.after.count, 7);
    for (const [tableName, rows] of Object.entries(projection.shimmerTables)) {
      assert.equal(preview.tables[tableName].after.count, rows.length);
      assert.equal(preview.tables[tableName].after.sha256, hashRowsForPreview(tableName, rows));
    }
    assert.doesNotThrow(() => shimmerImporter.assertShimmerImportScopeMatchesPreview({
      after: projection,
      preview
    }));
  } finally {
    fixture.cleanup();
  }
});

test('shimmer snapshot preview binds persisted payload bytes and manifest fetch time', () => {
  const fixture = createGenerationFixture();

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const projection = shimmerImporter.buildShimmerImportProjection({ bundle });
    const preview = shimmerImporter.buildShimmerImportPreview({
      bundle,
      target: {
        host: '127.0.0.1',
        port: 13306,
        database: 'terria_v1_local',
        serverUuid: 'shimmer-preview-server'
      },
      existing: {
        worldContext: null,
        shimmerTables: Object.fromEntries(
          Object.keys(projection.shimmerTables).map((tableName) => [tableName, []])
        ),
        snapshots: []
      }
    });
    const pageSnapshot = projection.snapshots.find((snapshot) => snapshot.entityType === 'wiki_shimmer_page');

    assert.match(pageSnapshot.payloadSha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(pageSnapshot.payloadSha256, sha256(JSON.stringify(bundle.rawPayload)));
    assert.equal(pageSnapshot.fetchedAt, '2026-08-03 00:00:00');
    assert.equal(
      preview.snapshots.after.sha256,
      hashRowsForPreview('entity_source_snapshots', projection.snapshots)
    );
    assert.doesNotThrow(() => shimmerImporter.assertShimmerImportScopeMatchesPreview({
      after: projection,
      preview
    }));

    const persistedPageSnapshot = { ...pageSnapshot };
    delete persistedPageSnapshot.payloadSha256;
    for (const driftedSnapshot of [
      { ...persistedPageSnapshot, payloadJson: '{"tampered":true}' },
      { ...pageSnapshot, fetchedAt: '2026-08-03 00:00:01' }
    ]) {
      assert.throws(
        () => shimmerImporter.assertShimmerImportScopeMatchesPreview({
          after: {
            ...projection,
            snapshots: projection.snapshots.map((snapshot) => (
              snapshot.entityType === pageSnapshot.entityType ? driftedSnapshot : snapshot
            ))
          },
          preview
        }),
        /entity_source_snapshots/i
      );
    }
  } finally {
    fixture.cleanup();
  }
});

test('shimmer import preview retains prior owned snapshots outside the current generation', () => {
  const fixture = createGenerationFixture();

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const projection = shimmerImporter.buildShimmerImportProjection({ bundle });
    const priorSnapshot = {
      entityType: 'wiki_shimmer_legacy',
      provider: 'wiki_zh',
      sourceKind: 'generated_json',
      sourceLocator: 'data/generated/shimmer/generations/legacy/wiki-shimmer-legacy.json',
      sourcePage: '微光',
      sourceRevisionTimestamp: '2026-07-01 00:00:00',
      isCurrent: 1,
      parseStatus: 'parsed'
    };
    const preview = shimmerImporter.buildShimmerImportPreview({
      bundle,
      target: {
        host: '127.0.0.1',
        port: 13306,
        database: 'terria_v1_local',
        serverUuid: 'shimmer-preview-server'
      },
      existing: {
        worldContext: null,
        shimmerTables: Object.fromEntries(
          Object.keys(projection.shimmerTables).map((tableName) => [tableName, []])
        ),
        snapshots: [priorSnapshot]
      }
    });

    assert.equal(preview.snapshots.before.count, 1);
    assert.equal(preview.snapshots.after.count, 8);
    assert.doesNotThrow(() => shimmerImporter.assertShimmerImportScopeMatchesPreview({
      after: {
        ...projection,
        snapshots: [priorSnapshot, ...projection.snapshots]
      },
      preview
    }));
  } finally {
    fixture.cleanup();
  }
});

test('shimmer import preview rejects bundle records outside the wiki_zh Shimmer scope', () => {
  const fixture = createGenerationFixture();

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    bundle.itemTransformsPayload.records[0].sourcePage = 'Not Shimmer';

    assert.throws(
      () => shimmerImporter.buildShimmerImportPreview({
        bundle,
        target: {
          host: '127.0.0.1',
          port: 13306,
          database: 'terria_v1_local',
          serverUuid: 'shimmer-preview-server'
        }
      }),
      /provider|source page|scope/i
    );
  } finally {
    fixture.cleanup();
  }
});

test('shimmer import rejects noncanonical title references before opening a database connection', async () => {
  for (const kind of ['ambiguous', 'unresolved', 'mixed', 'unreported', 'other']) {
    const fixture = createGenerationFixture({
      titleResolutionRecords: [{
        nameZh: 'Torch',
        nameEn: 'Torch',
        kind,
        internalName: null,
      }],
    });
    let connectionAttempts = 0;

    try {
      await assert.rejects(
        shimmerImporter.runShimmerImport({
          apply: false,
          inputContractPath: fixture.inputContractPath,
          repoRoot: fixture.repoRoot,
        }, {
          mysql: {
            createConnection: async () => {
              connectionAttempts += 1;
              throw new Error('database connection must not be reached');
            },
          },
        }),
        /title[- ]resolution|reference kind/i,
        `${kind} title references must fail closed`,
      );
      assert.equal(connectionAttempts, 0, `${kind} must stop before connection`);
    } finally {
      fixture.cleanup();
    }
  }
});

test('direct shimmer apply rejects a missing packet before opening a database connection', async () => {
  assert.equal(typeof shimmerImporter.runShimmerImport, 'function');
  const fixture = createGenerationFixture();
  let connectionAttempts = 0;

  try {
    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        env: {},
        repoRoot: fixture.repoRoot
      }, {
        mysql: {
          createConnection: async () => {
            connectionAttempts += 1;
            throw new Error('database connection must not be reached');
          }
        }
      }),
      /TERRAPEDIA_AUTHORIZED_PACKET_PATH/
    );
    assert.equal(connectionAttempts, 0);
  } finally {
    fixture.cleanup();
  }
});

test('verified shimmer apply rejects a missing private input contract before transaction or permit', async () => {
  const calls = [];
  const bundle = createVerifiedBundleIdentity();
  const preview = createAuthorizedPreview(bundle);
  const authorizedContext = createAuthorizedContext(bundle, preview);
  delete authorizedContext.inputContract;

  await assert.rejects(
    shimmerImporter.applyVerifiedShimmerImport({
      authorizedContext,
      bundle,
      connection: createTransactionConnection(calls),
      consumeDispatchPermit: () => calls.push('consume'),
      currentTargetFingerprintSha256: preview.targetFingerprintSha256,
      preview,
      readLockedBefore: async () => createEmptyShimmerScope(preview),
      applyChanges: async () => calls.push('apply'),
      verifyAfter: async () => calls.push('verify'),
    }),
    /private input contract/i,
  );
  assert.deepEqual(calls, []);
});

test('shimmer import rejects an authorization bundle that is not bound to the private contract', async () => {
  const fixture = createGenerationFixture();
  const calls = [];

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const preview = createAuthorizedPreview(bundle);

    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        repoRoot: fixture.repoRoot
      }, {
        loadAuthorizationContext: () => ({
          dataBundleSha256: bundle.dataBundleSha256,
          executionManifest: {},
          operationId: 'canonical-shimmer-import'
        }),
        mysql: {
          createConnection: async () => {
            calls.push('connect');
            return {
              async end() {},
              async query() {}
            };
          }
        },
        loadCurrentScope: async () => ({ worldContext: null, shimmerTables: {}, snapshots: [] }),
        loadTarget: async () => ({
          host: '127.0.0.1',
          port: 13306,
          database: 'terria_v1_local',
          serverUuid: 'shimmer-preview-server'
        }),
        buildPreview: () => preview,
        consumeDispatchPermit: () => calls.push('consume'),
        applyVerified: async ({ consumeDispatchPermit }) => {
          calls.push('apply');
          consumeDispatchPermit();
          return { status: 'completed' };
        }
      }),
      /private input contract/i
    );

    assert.deepEqual(calls, []);
  } finally {
    fixture.cleanup();
  }
});

test('shimmer input-contract identity drift fails closed before connection or permit consumption', async () => {
  const fixture = createGenerationFixture();
  const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
    bundleManifestPath: fixture.publication.manifestPath,
    repoRoot: fixture.repoRoot
  });
  const preview = createAuthorizedPreview(bundle);

  try {
    for (const [field, value] of [
      ['generationId', 'b'.repeat(64)],
      ['manifestSha256', sha256('different-manifest')],
      ['dataBundleSha256', sha256('different-bundle')],
      ['unexpected', 'extra binding field']
    ]) {
      const calls = [];
      const inputContract = bindFixtureContract(fixture, preview, { [field]: value });
      const authorizedContext = createAuthorizedContext(bundle, preview, inputContract);

      await assert.rejects(
        shimmerImporter.runShimmerImport({
          apply: true,
          inputContractPath: fixture.inputContractPath,
          repoRoot: fixture.repoRoot
        }, {
          loadAuthorizationContext: () => authorizedContext,
          mysql: {
            createConnection: async () => {
              calls.push('connect');
              throw new Error('database connection must not be reached');
            }
          },
          consumeDispatchPermit: () => calls.push('consume')
        }),
        /input contract|generation identity/i,
        `expected ${field} input contract drift to fail closed`
      );

      assert.deepEqual(calls, [], `${field} drift must not connect or consume`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('wrong frozen preview or target hashes stop before permit or apply after read-only preview work', async () => {
  const fixture = createGenerationFixture();

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const preview = createAuthorizedPreview(bundle);

    for (const [field, value] of [
      ['previewSha256', sha256('wrong-preview')],
      ['targetFingerprintSha256', sha256('wrong-target')]
    ]) {
      const calls = [];
      const resultWrites = [];
      const inputContract = bindFixtureContract(fixture, preview, { [field]: value });
      const authorizedContext = createAuthorizedContext(bundle, preview, inputContract);
      authorizedContext.executionManifest.shimmerImport[field] = value;
      const connection = {
        async beginTransaction() {
          calls.push('begin');
        },
        async end() {
          calls.push('end');
        },
        async query() {
          calls.push('query');
          return [[{ serverUuid: 'shimmer-preview-server' }]];
        }
      };

      await assert.rejects(
        shimmerImporter.runShimmerImport({
          apply: true,
          inputContractPath: fixture.inputContractPath,
          repoRoot: fixture.repoRoot
        }, {
          loadAuthorizationContext: () => authorizedContext,
          mysql: {
            createConnection: async () => {
              calls.push('connect');
              return connection;
            }
          },
          loadCurrentScope: async () => {
            calls.push('scope');
            return { worldContext: null, shimmerTables: {}, snapshots: [] };
          },
          loadTarget: async () => {
            calls.push('target');
            return {
              host: '127.0.0.1',
              port: 13306,
              database: 'terria_v1_local',
              serverUuid: 'shimmer-preview-server'
            };
          },
          buildPreview: () => {
            calls.push('preview');
            return preview;
          },
          consumeDispatchPermit: () => calls.push('consume'),
          applyVerified: async () => {
            calls.push('apply');
            return { status: 'completed' };
          },
          writeCanonicalResult: async (_output, _root, result) => resultWrites.push(result)
        }),
        /authorized shimmer import binding/i,
        `expected ${field} mismatch to reject after preview work`
      );

      assert.deepEqual(calls, ['connect', 'query', 'scope', 'target', 'preview', 'end']);
      assert.deepEqual(resultWrites.map((result) => result.status), ['failed']);
    }
  } finally {
    fixture.cleanup();
  }
});

test('shimmer apply resolves a canonical private result path before opening a database connection', async () => {
  assert.equal(typeof shimmerImporter.resolveShimmerImportOutputPath, 'function');
  const fixture = createGenerationFixture();
  const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
    bundleManifestPath: fixture.publication.manifestPath,
    repoRoot: fixture.repoRoot
  });
  const preview = createAuthorizedPreview(bundle);
  const inputContract = bindFixtureContract(fixture, preview);
  let connectionAttempts = 0;

  try {
    assert.equal(
      shimmerImporter.resolveShimmerImportOutputPath({ apply: true, repoRoot: fixture.repoRoot }),
      path.join(
        fixture.repoRoot,
        'reports',
        'authorization',
        'canonical',
        'canonical-shimmer-import.result.json'
      )
    );
    assert.throws(
      () => shimmerImporter.resolveShimmerImportOutputPath({
        apply: true,
        outputPath: path.join(
          fixture.repoRoot,
          'reports',
          'authorization',
          'canonical',
          'nested',
          'canonical-shimmer-import.result.json'
        ),
        repoRoot: fixture.repoRoot
      }),
      /canonical private result path/i
    );

    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        outputPath: path.join(fixture.repoRoot, 'reports', 'wiki-shimmer-db-import.json'),
        repoRoot: fixture.repoRoot
      }, {
        loadAuthorizationContext: () => ({
          ...createAuthorizedContext(bundle, preview, inputContract)
        }),
        mysql: {
          createConnection: async () => {
            connectionAttempts += 1;
            return {
              async end() {},
              async query() { return [[{ serverUuid: 'shimmer-preview-server' }]]; }
            };
          }
        },
        loadCurrentScope: async () => ({ shimmerTables: {}, snapshots: [] }),
        loadTarget: async () => ({
          host: '127.0.0.1',
          port: 13306,
          database: 'terria_v1_local',
          serverUuid: 'shimmer-preview-server'
        }),
        buildPreview: () => preview,
        applyVerified: async () => ({ status: 'completed' })
      }),
      /canonical private result path/i
    );
    assert.equal(connectionAttempts, 0);
  } finally {
    fixture.cleanup();
  }
});

test('direct shimmer apply rejects a canonical result path beneath an ancestor symlink before external write', async () => {
  const fixture = createGenerationFixture();
  const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
    bundleManifestPath: fixture.publication.manifestPath,
    repoRoot: fixture.repoRoot,
  });
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-result-outside-'));
  const canonicalDirectory = path.join(fixture.repoRoot, 'reports', 'authorization', 'canonical');
  const outsideCanonicalDirectory = path.join(outsideRoot, 'canonical');
  let connectionAttempts = 0;
  let permitAttempts = 0;

  try {
    fs.renameSync(canonicalDirectory, outsideCanonicalDirectory);
    fs.symlinkSync(outsideCanonicalDirectory, canonicalDirectory, 'dir');

    let rejection = null;
    try {
      await shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        repoRoot: fixture.repoRoot,
      }, {
        loadInputContractBundle: () => bundle,
        loadAuthorizationContext: () => {
          throw new Error('authorization should not be read for an unsafe result path');
        },
        mysql: {
          createConnection: async () => {
            connectionAttempts += 1;
            throw new Error('database connection must not be reached');
          },
        },
        consumeDispatchPermit: () => {
          permitAttempts += 1;
        },
      });
      assert.fail('unsafe canonical result ancestry must reject');
    } catch (error) {
      rejection = error;
    }

    assert.equal(
      fs.existsSync(path.join(outsideCanonicalDirectory, 'canonical-shimmer-import.result.json')),
      false,
      'unsafe result ancestry must not write outside the repository',
    );
    assert.match(rejection.message, /symbolic-link ancestor/i);
    assert.equal(connectionAttempts, 0);
    assert.equal(permitAttempts, 0);
  } finally {
    fixture.cleanup();
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('shimmer import writes a private preflight failure result without opening a connection', async () => {
  const fixture = createGenerationFixture();
  const outputPath = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'canonical-shimmer-import.result.json'
  );
  const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
    bundleManifestPath: fixture.publication.manifestPath,
    repoRoot: fixture.repoRoot
  });
  let connectionAttempts = 0;

  try {
    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        outputPath,
        repoRoot: fixture.repoRoot
      }, {
        loadAuthorizationContext: () => {
          throw new Error('controlled preflight failure');
        },
        mysql: {
          createConnection: async () => {
            connectionAttempts += 1;
            throw new Error('database connection must not be reached');
          }
        }
      }),
      /controlled preflight failure/
    );

    assert.equal(connectionAttempts, 0);
    const result = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    assert.equal(result.operationId, 'canonical-shimmer-import');
    assert.equal(result.apply, true);
    assert.equal(result.status, 'failed');
    assert.equal(result.phase, 'preflight');
    assert.match(result.reason, /controlled preflight failure/);
    assert.equal(result.generationId, bundle.generationId);
    assert.equal(result.dataBundleSha256, bundle.dataBundleSha256);
    assert.equal(result.manifestSha256, bundle.manifestSha256);
    assert.equal('previewSha256' in result, false);
    assert.equal('targetFingerprintSha256' in result, false);
  } finally {
    fixture.cleanup();
  }
});

test('shimmer import writes a private connection failure result without ending a missing connection', async () => {
  const fixture = createGenerationFixture();
  const outputPath = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'canonical-shimmer-import.result.json'
  );
  const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
    bundleManifestPath: fixture.publication.manifestPath,
    repoRoot: fixture.repoRoot
  });
  const preview = createAuthorizedPreview(bundle);
  const inputContract = bindFixtureContract(fixture, preview);
  const calls = [];

  try {
    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        outputPath,
        repoRoot: fixture.repoRoot
      }, {
        loadAuthorizationContext: () => createAuthorizedContext(bundle, preview, inputContract),
        mysql: {
          createConnection: async () => {
            calls.push('connect');
            throw new Error('controlled connection failure');
          }
        },
        consumeDispatchPermit: () => calls.push('consume')
      }),
      /controlled connection failure/
    );

    assert.deepEqual(calls, ['connect']);
    const result = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    assert.equal(result.operationId, 'canonical-shimmer-import');
    assert.equal(result.apply, true);
    assert.equal(result.status, 'failed');
    assert.equal(result.phase, 'connect');
    assert.match(result.reason, /controlled connection failure/);
    assert.equal(result.generationId, bundle.generationId);
    assert.equal(result.dataBundleSha256, bundle.dataBundleSha256);
    assert.equal(result.manifestSha256, bundle.manifestSha256);
    assert.equal('previewSha256' in result, false);
    assert.equal('targetFingerprintSha256' in result, false);
  } finally {
    fixture.cleanup();
  }
});

test('shimmer import does not overwrite a completed apply result when its writer fails', async () => {
  const fixture = createGenerationFixture();
  const outputPath = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'canonical-shimmer-import.result.json'
  );
  const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
    bundleManifestPath: fixture.publication.manifestPath,
    repoRoot: fixture.repoRoot
  });
  const preview = createAuthorizedPreview(bundle);
  const inputContract = bindFixtureContract(fixture, preview);
  const connectionCalls = [];
  const resultWrites = [];
  const connection = {
    async end() {
      connectionCalls.push('end');
    },
    async query() {
      connectionCalls.push('query');
      return [[{ serverUuid: 'shimmer-preview-server' }]];
    }
  };

  try {
    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        outputPath,
        repoRoot: fixture.repoRoot
      }, {
        loadAuthorizationContext: () => createAuthorizedContext(bundle, preview, inputContract),
        mysql: {
          createConnection: async () => {
            connectionCalls.push('connect');
            return connection;
          }
        },
        loadCurrentScope: async () => ({ shimmerTables: {}, snapshots: [] }),
        loadTarget: async () => ({
          host: '127.0.0.1',
          port: 13306,
          database: 'terria_v1_local',
          serverUuid: 'shimmer-preview-server'
        }),
        buildPreview: () => preview,
        applyVerified: async () => {
          connectionCalls.push('apply');
          return { status: 'completed' };
        },
        writeCanonicalResult: async (_output, _root, result) => {
          resultWrites.push(result);
          throw new Error('controlled completed result writer failure');
        }
      }),
      /controlled completed result writer failure/
    );

    assert.deepEqual(resultWrites.map((result) => result.status), ['completed']);
    assert.equal(resultWrites[0].operationId, 'canonical-shimmer-import');
    assert.equal(resultWrites[0].apply, true);
    assert.equal(fs.existsSync(outputPath), false);
    assert.deepEqual(connectionCalls, ['connect', 'query', 'apply', 'end']);
  } finally {
    fixture.cleanup();
  }
});

test('shimmer import preserves a +08:00 DATETIME fixture as a raw string', async () => {
  const fixture = createGenerationFixture();
  const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
    bundleManifestPath: fixture.publication.manifestPath,
    repoRoot: fixture.repoRoot
  });
  const preview = createAuthorizedPreview(bundle);
  const inputContract = bindFixtureContract(fixture, preview);
  const nonUtcDateTime = '2026-08-03 23:45:17';
  const connectionOptions = [];
  const calls = [];
  let previewSnapshotTimestamp = null;
  const connection = {
    async end() {
      calls.push('end');
    },
    async execute(sql) {
      calls.push('execute');
      if (/FROM entity_source_snapshots/i.test(sql)) {
        return [[{
          entityType: 'wiki_shimmer_page',
          provider: 'wiki_zh',
          sourceKind: 'wiki_page',
          sourceLocator: 'data/generated/shimmer/generations/test/wiki-shimmer.raw.json',
          sourcePage: '微光',
          sourceRevisionTimestamp: nonUtcDateTime,
          payloadJson: '{}',
          fetchedAt: nonUtcDateTime,
          isCurrent: 1,
          parseStatus: 'parsed'
        }]];
      }
      return [[]];
    },
    async query() {
      calls.push('query');
      return [[{ serverUuid: 'shimmer-preview-server' }]];
    }
  };

  try {
    const result = await shimmerImporter.runShimmerImport({
      apply: true,
      inputContractPath: fixture.inputContractPath,
      repoRoot: fixture.repoRoot
    }, {
      loadAuthorizationContext: () => createAuthorizedContext(bundle, preview, inputContract),
      mysql: {
        createConnection: async (options) => {
          connectionOptions.push(options);
          calls.push('connect');
          return connection;
        }
      },
      loadTarget: async () => ({
        host: '127.0.0.1',
        port: 13306,
        database: 'terria_v1_local',
        serverUuid: 'shimmer-preview-server'
      }),
      buildPreview: ({ existing }) => {
        previewSnapshotTimestamp = existing.snapshots[0]?.sourceRevisionTimestamp ?? null;
        return preview;
      },
      applyVerified: async () => {
        calls.push('apply');
        return { status: 'completed' };
      },
      writeCanonicalResult: async () => calls.push('write')
    });

    assert.equal(result.status, 'completed');
    assert.equal(connectionOptions.length, 1);
    assert.equal(connectionOptions[0].dateStrings, true);
    assert.equal(previewSnapshotTimestamp, nonUtcDateTime);
    assert.equal(calls.filter((call) => call === 'execute').length, 6);
    assert.deepEqual(calls, [
      'connect',
      'query',
      'execute',
      'execute',
      'execute',
      'execute',
      'execute',
      'execute',
      'apply',
      'write',
      'end'
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('shimmer import rejects a non-completed apply result before writing completion', async () => {
  const fixture = createGenerationFixture();
  const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
    bundleManifestPath: fixture.publication.manifestPath,
    repoRoot: fixture.repoRoot
  });
  const preview = createAuthorizedPreview(bundle);
  const inputContract = bindFixtureContract(fixture, preview);
  const calls = [];
  const resultWrites = [];
  const connection = {
    async end() {
      calls.push('end');
    },
    async query() {
      calls.push('query');
      return [[{ serverUuid: 'shimmer-preview-server' }]];
    }
  };

  try {
    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        repoRoot: fixture.repoRoot
      }, {
        loadAuthorizationContext: () => createAuthorizedContext(bundle, preview, inputContract),
        mysql: {
          createConnection: async () => {
            calls.push('connect');
            return connection;
          }
        },
        loadCurrentScope: async () => ({ shimmerTables: {}, snapshots: [] }),
        loadTarget: async () => ({
          host: '127.0.0.1',
          port: 13306,
          database: 'terria_v1_local',
          serverUuid: 'shimmer-preview-server'
        }),
        buildPreview: () => preview,
        applyVerified: async () => {
          calls.push('apply');
          return { status: 'partial' };
        },
        writeCanonicalResult: async (_output, _root, result) => {
          resultWrites.push(result);
          calls.push(`write:${result.status}`);
        }
      }),
      /did not complete/i
    );

    assert.deepEqual(resultWrites.map((result) => result.status), ['failed']);
    assert.equal(resultWrites[0].phase, 'apply');
    assert.match(resultWrites[0].reason, /did not complete/i);
    assert.deepEqual(calls, ['connect', 'query', 'apply', 'write:failed', 'end']);
  } finally {
    fixture.cleanup();
  }
});

test('shimmer import writes a private failed result after an apply error', async () => {
  const fixture = createGenerationFixture();
  const outputPath = path.join(
    fixture.repoRoot,
    'reports',
    'authorization',
    'canonical',
    'canonical-shimmer-import.result.json'
  );
  const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
    bundleManifestPath: fixture.publication.manifestPath,
    repoRoot: fixture.repoRoot
  });
  const preview = createAuthorizedPreview(bundle);
  const inputContract = bindFixtureContract(fixture, preview);
  const connection = {
    async beginTransaction() {},
    async rollback() {},
    async commit() {},
    async end() {},
    async query() { return [[{ serverUuid: 'shimmer-preview-server' }]]; }
  };

  try {
    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        outputPath,
        repoRoot: fixture.repoRoot
      }, {
        loadAuthorizationContext: () => createAuthorizedContext(bundle, preview, inputContract),
        mysql: {
          createConnection: async () => connection
        },
        loadCurrentScope: async () => ({ shimmerTables: {}, snapshots: [] }),
        loadTarget: async () => ({
          host: '127.0.0.1',
          port: 13306,
          database: 'terria_v1_local',
          serverUuid: 'shimmer-preview-server'
        }),
        buildPreview: () => preview,
        consumeDispatchPermit: () => true,
        applyVerified: async () => {
          throw new Error('controlled apply failure');
        }
      }),
      /controlled apply failure/
    );

    const result = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    assert.equal(result.status, 'failed');
    assert.equal(result.phase, 'apply');
    assert.match(result.reason, /controlled apply failure/);
    assert.equal(result.generationId, bundle.generationId);
    assert.equal(result.previewSha256, preview.previewSha256);
  } finally {
    fixture.cleanup();
  }
});

test('shimmer apply never performs schema DDL inside its transaction callback', () => {
  const importerSource = fs.readFileSync(
    new URL('./import-wiki-shimmer-to-db.mjs', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(
    importerSource,
    /async function applyBundleChanges\([\s\S]*?await ensureShimmerTables\(/,
    'CREATE TABLE may implicitly commit MySQL transactions'
  );
});

test('authorized shimmer apply rolls back when post-write verification drifts', async () => {
  assert.equal(typeof shimmerImporter.applyVerifiedShimmerImport, 'function');
  const calls = [];
  const connection = {
    async beginTransaction() {
      calls.push('begin');
    },
    async commit() {
      calls.push('commit');
    },
    async rollback() {
      calls.push('rollback');
    }
  };
  const bundle = {
    dataBundleSha256: sha256('bundle'),
    generationId: 'a'.repeat(64),
    manifestSha256: sha256('manifest')
  };
  const preview = createAuthorizedPreview(bundle);

  await assert.rejects(
    shimmerImporter.applyVerifiedShimmerImport({
      authorizedContext: {
        ...createAuthorizedContext(bundle, preview)
      },
      bundle,
      inputContract: createTestInputContract(bundle, preview),
      connection,
      consumeDispatchPermit: () => calls.push('consume'),
      preview,
      readLockedBefore: async () => {
        calls.push('locked');
        return createEmptyShimmerScope(preview);
      },
      applyChanges: async () => calls.push('apply'),
      verifyAfter: async () => {
        throw new Error('post-write count/hash mismatch');
      }
    }),
    /post-write count\/hash mismatch/
  );

  assert.deepEqual(calls, ['begin', 'locked', 'consume', 'apply', 'rollback']);
});

test('shimmer import rolls back a stale locked scope before permit consumption or DML', async () => {
  const fixture = createGenerationFixture();
  const target = {
    host: '127.0.0.1',
    port: 13306,
    database: 'terria_v1_local',
    serverUuid: 'shimmer-preview-server'
  };
  const calls = [];
  const lockedReadSql = [];
  const resultWrites = [];

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const previewScope = {
      worldContext: null,
      shimmerTables: Object.fromEntries([
        'shimmer_item_transforms',
        'shimmer_decraft_rules',
        'shimmer_entity_transforms',
        'shimmer_npc_transforms'
      ].map((tableName) => [tableName, []])),
      snapshots: []
    };
    const preview = shimmerImporter.buildShimmerImportPreview({ bundle, target, existing: previewScope });
    const inputContract = bindFixtureContract(fixture, preview);
    const connection = {
      async beginTransaction() {
        calls.push('begin');
      },
      async commit() {
        calls.push('commit');
      },
      async end() {
        calls.push('end');
      },
      async query(sql) {
        calls.push(`query:${sql}`);
        return [[]];
      },
      async rollback() {
        calls.push('rollback');
      },
      async execute(sql) {
        if (!/^\s*SELECT\b/i.test(sql) || !/\bFOR UPDATE\s*$/i.test(sql.trim())) {
          throw new Error('locked scope reads must request FOR UPDATE before DML');
        }
        lockedReadSql.push(sql);
        if (/\bFROM world_contexts\b/i.test(sql)) {
          return [[{
            code: 'SHIMMER',
            nameEn: 'Concurrent Shimmer',
            nameZh: '微光',
            contextType: 'ENVIRONMENT',
            description: null,
            iconUrl: null,
            sortOrder: 30
          }]];
        }
        return [[]];
      }
    };

    await assert.rejects(
      shimmerImporter.runShimmerImport({
        apply: true,
        inputContractPath: fixture.inputContractPath,
        repoRoot: fixture.repoRoot
      }, {
        loadAuthorizationContext: () => createAuthorizedContext(bundle, preview, inputContract),
        mysql: {
          createConnection: async () => {
            calls.push('connect');
            return connection;
          }
        },
        loadCurrentScope: async () => {
          calls.push('preview-scope');
          return previewScope;
        },
        loadTarget: async () => {
          calls.push('target');
          return target;
        },
        buildPreview: () => {
          calls.push('preview');
          return preview;
        },
        consumeDispatchPermit: () => calls.push('consume'),
        writeCanonicalResult: async (_output, _root, result) => {
          resultWrites.push(result);
          calls.push(`write:${result.status}`);
        }
      }),
      /locked pre-apply scope/i
    );

    assert.equal(lockedReadSql.length, 6);
    assert.equal(lockedReadSql.every((sql) => /\bFOR UPDATE\s*$/i.test(sql.trim())), true);
    assert.match(lockedReadSql[0], /\bFROM world_contexts\b/i);
    assert.match(lockedReadSql.at(-1), /\bFROM entity_source_snapshots\b/i);
    assert.equal(calls.includes('consume'), false);
    assert.equal(calls.includes('commit'), false);
    assert.deepEqual(resultWrites.map((result) => result.status), ['failed']);
    assert.match(resultWrites[0].reason, /locked pre-apply scope/i);
    assert.deepEqual(calls, [
      'connect',
      'query:SET NAMES utf8mb4',
      'preview-scope',
      'target',
      'preview',
      'target',
      'begin',
      'rollback',
      'write:failed',
      'end'
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('verified shimmer apply rejects bundle or scope drift before permit consumption', async () => {
  const calls = [];
  const bundle = createVerifiedBundleIdentity();
  const preview = createAuthorizedPreview(bundle);
  const connection = createTransactionConnection(calls);

  for (const mutation of [
    { generationId: 'b'.repeat(64) },
    { dataBundleSha256: sha256('different-bundle') },
    { manifestSha256: sha256('different-manifest') },
    { providerScope: { provider: 'other', sourcePage: 'Shimmer', tables: preview.providerScope.tables } },
  ]) {
    await assert.rejects(
      shimmerImporter.applyVerifiedShimmerImport({
        authorizedContext: createAuthorizedContext(bundle, preview),
        bundle,
        inputContract: createTestInputContract(bundle, preview),
        connection,
        consumeDispatchPermit: () => calls.push('consume'),
        preview: { ...preview, ...mutation },
        applyChanges: async () => calls.push('apply'),
        verifyAfter: async () => calls.push('verify')
      }),
      /preview|scope/i
    );
  }

  assert.deepEqual(calls, []);
});

test('verified shimmer apply requires a canonical private contract before transaction or permit use', async () => {
  const calls = [];
  const bundle = createVerifiedBundleIdentity();
  const preview = createAuthorizedPreview(bundle);

  await assert.rejects(
    shimmerImporter.applyVerifiedShimmerImport({
      authorizedContext: createAuthorizedContext(bundle, preview),
      bundle,
      connection: createTransactionConnection(calls),
      consumeDispatchPermit: () => calls.push('consume'),
      currentTargetFingerprintSha256: preview.targetFingerprintSha256,
      preview,
      readLockedBefore: async () => {
        calls.push('locked');
        return createEmptyShimmerScope(preview);
      },
      applyChanges: async () => calls.push('apply'),
      verifyAfter: async () => calls.push('verify'),
    }),
    /private input contract/i,
  );

  assert.deepEqual(calls, []);
});

test('verified shimmer apply rejects preview descriptor tampering before permit consumption', async () => {
  const fixture = createGenerationFixture();
  const calls = [];

  try {
    const bundle = shimmerImporter.loadVerifiedShimmerImportBundle({
      bundleManifestPath: fixture.publication.manifestPath,
      repoRoot: fixture.repoRoot
    });
    const preview = shimmerImporter.buildShimmerImportPreview({
      bundle,
      target: {
        host: '127.0.0.1',
        port: 13306,
        database: 'terria_v1_local',
        serverUuid: 'shimmer-preview-server'
      },
      existing: { shimmerTables: {}, snapshots: [] }
    });
    const tamperedPreview = JSON.parse(JSON.stringify(preview));
    tamperedPreview.tables.shimmer_item_transforms.after.count += 1;

    await assert.rejects(
      shimmerImporter.applyVerifiedShimmerImport({
        authorizedContext: createAuthorizedContext(bundle, preview),
        bundle,
        inputContract: createTestInputContract(bundle, preview),
        connection: createTransactionConnection(calls),
        consumeDispatchPermit: () => calls.push('consume'),
        preview: tamperedPreview,
        currentTargetFingerprintSha256: preview.targetFingerprintSha256,
        applyChanges: async () => calls.push('apply'),
        verifyAfter: async () => calls.push('verify')
      }),
      /preview/i
    );
    assert.deepEqual(calls, []);
  } finally {
    fixture.cleanup();
  }
});

test('verified shimmer apply rejects target fingerprint drift before permit consumption', async () => {
  const calls = [];
  const bundle = createVerifiedBundleIdentity();
  const preview = createAuthorizedPreview(bundle);

  await assert.rejects(
    shimmerImporter.applyVerifiedShimmerImport({
      authorizedContext: createAuthorizedContext(bundle, preview),
      bundle,
      inputContract: createTestInputContract(bundle, preview),
      connection: createTransactionConnection(calls),
      consumeDispatchPermit: () => calls.push('consume'),
      preview,
      currentTargetFingerprintSha256: sha256('different-target'),
      applyChanges: async () => calls.push('apply'),
      verifyAfter: async () => calls.push('verify')
    }),
    /target fingerprint/i
  );

  assert.deepEqual(calls, []);
});

test('frozen shimmer import binding rejects every altered identity before permit consumption', async () => {
  const bundle = createVerifiedBundleIdentity();
  const preview = createAuthorizedPreview(bundle);

  for (const [field, value] of [
    ['operationId', 'other-operation'],
    ['generationId', 'b'.repeat(64)],
    ['manifestSha256', sha256('different-manifest')],
    ['dataBundleSha256', sha256('different-bundle')],
    ['previewSha256', sha256('different-preview')],
    ['targetFingerprintSha256', sha256('different-target')],
    ['providerScope', { ...preview.providerScope, provider: 'other' }]
  ]) {
    const calls = [];
    const authorizedContext = createAuthorizedContext(bundle, preview);
    authorizedContext.executionManifest.shimmerImport[field] = value;

    await assert.rejects(
      shimmerImporter.applyVerifiedShimmerImport({
        authorizedContext,
        bundle,
        inputContract: createTestInputContract(bundle, preview),
        connection: createTransactionConnection(calls),
        consumeDispatchPermit: () => calls.push('consume'),
        currentTargetFingerprintSha256: preview.targetFingerprintSha256,
        preview,
        applyChanges: async () => calls.push('apply'),
        verifyAfter: async () => calls.push('verify')
      }),
      /authorized shimmer import binding/i,
      `expected ${field} binding drift to fail closed`
    );
    assert.deepEqual(calls, [], `${field} drift must not consume or begin`);
  }
});

test('verified shimmer apply commits only after every matching verification passes', async () => {
  const calls = [];
  const bundle = createVerifiedBundleIdentity();
  const preview = createAuthorizedPreview(bundle);

  const result = await shimmerImporter.applyVerifiedShimmerImport({
    authorizedContext: createAuthorizedContext(bundle, preview),
    bundle,
    inputContract: createTestInputContract(bundle, preview),
    connection: createTransactionConnection(calls),
    consumeDispatchPermit: () => calls.push('consume'),
    preview,
    currentTargetFingerprintSha256: preview.targetFingerprintSha256,
    readLockedBefore: async () => {
      calls.push('locked');
      return createEmptyShimmerScope(preview);
    },
    applyChanges: async () => calls.push('apply'),
    verifyAfter: async () => calls.push('verify')
  });

  assert.deepEqual(result, { status: 'completed' });
  assert.deepEqual(calls, ['begin', 'locked', 'consume', 'apply', 'verify', 'commit']);
});

test('post-write verification rejects a snapshot hash drift before commit', async () => {
  assert.equal(typeof shimmerImporter.assertShimmerImportScopeMatchesPreview, 'function');
  const bundle = createVerifiedBundleIdentity();
  const preview = createAuthorizedPreview(bundle);
  preview.tables = Object.fromEntries(preview.providerScope.tables.map((tableName) => [tableName, {
    after: { count: 0, sha256: hashRowsForPreview(tableName, []) }
  }]));
  preview.worldContext = {
    after: { count: 0, sha256: hashRowsForPreview('world_contexts', []) }
  };
  preview.snapshots = {
    after: {
      count: 1,
      sha256: hashRowsForPreview('entity_source_snapshots', [{ entityType: 'wiki_shimmer_page' }])
    }
  };

  assert.throws(
    () => shimmerImporter.assertShimmerImportScopeMatchesPreview({
      after: {
        shimmerTables: Object.fromEntries(preview.providerScope.tables.map((tableName) => [tableName, []])),
        snapshots: []
      },
      preview
    }),
    /entity_source_snapshots/i
  );
});

test('shimmer importer resolves mysql2 through the repository module loader', () => {
  const source = fs.readFileSync(new URL('./import-wiki-shimmer-to-db.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ loadMysqlModule \} from '\.\.\/lib\/mysql-module\.mjs'/);
  assert.match(source, /const mysql = loadMysqlModule\(\)/);
  assert.doesNotMatch(source, /createRequire|require\('mysql2\/promise'\)/);
});

test('importShimmerItemTransforms skips source scope rewrite when projection is unchanged', async () => {
  const record = shimmerItemRecord();
  const conn = createFakeConnection({
    existingRows: [existingShimmerItemRow(record)],
  });
  const stats = { created: 0, replaced: 0, skipped: 0 };

  await importShimmerItemTransforms(conn, 'SHIMMER', [record], stats, true);

  assert.equal(stats.created, 0);
  assert.equal(stats.replaced, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(conn.calls.some((call) => /\bDELETE FROM shimmer_item_transforms\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO shimmer_item_transforms\b/i.test(call.sql)), false);
});

test('importShimmerItemTransforms rewrites source scope when projection changes', async () => {
  const record = shimmerItemRecord({ outputNameEn: 'Changed Torch' });
  const conn = createFakeConnection({
    existingRows: [existingShimmerItemRow(shimmerItemRecord())],
  });
  const stats = { created: 0, replaced: 0, skipped: 0 };

  await importShimmerItemTransforms(conn, 'SHIMMER', [record], stats, true);

  assert.equal(stats.created, 1);
  assert.equal(stats.replaced, 1);
  assert.equal(stats.skipped, 0);
  assert.equal(conn.calls.filter((call) => /\bDELETE FROM shimmer_item_transforms\b/i.test(call.sql)).length, 1);
  assert.equal(conn.calls.filter((call) => /\bINSERT INTO shimmer_item_transforms\b/i.test(call.sql)).length, 1);
});

test('shimmer snapshot upsert preserves a same-key collision from another source page', async () => {
  const source = fs.readFileSync(new URL('./import-wiki-shimmer-to-db.mjs', import.meta.url), 'utf8');
  const upsertSnapshotSource = source.match(
    /async function upsertSnapshot\([\s\S]*?\n}\n\nasync function loadSnapshotStats/
  )?.[0] ?? '';
  assert.match(upsertSnapshotSource, /\bAND source_page = \?\s+LIMIT 1/i);
  assert.equal(typeof shimmerImporter.upsertSnapshot, 'function');
  const definition = {
    entityType: 'wiki_shimmer_page',
    provider: 'wiki_zh',
    sourceKind: 'wiki_page',
    sourceLocator: 'data/generated/shimmer/wiki-shimmer.raw.json',
    sourcePage: '微光',
    sourceRevisionTimestamp: '2026-08-03 00:00:00',
    payloadJson: '{}',
    fetchedAt: '2026-08-03 00:00:00',
    parseStatus: 'parsed'
  };
  const calls = [];
  const connection = {
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/^\s*SELECT id\s+FROM entity_source_snapshots\b/is.test(sql)) {
        return [params.at(-1) === definition.sourcePage ? [] : [{ id: 91 }]];
      }
      return [{ affectedRows: 1, insertId: 92 }];
    }
  };

  const result = await shimmerImporter.upsertSnapshot(connection, definition, true);

  assert.deepEqual(result, { action: 'created' });
  const lookup = calls.find((call) => /^\s*SELECT id\s+FROM entity_source_snapshots\b/is.test(call.sql));
  assert.match(lookup.sql, /\bAND source_page = \?\s+LIMIT 1/i);
  assert.deepEqual(lookup.params, [
    definition.entityType,
    definition.provider,
    definition.sourceKind,
    definition.sourceLocator,
    definition.sourcePage
  ]);
  assert.equal(calls.some((call) => /^\s*UPDATE entity_source_snapshots\b/i.test(call.sql)), false);
  assert.equal(calls.filter((call) => /^\s*INSERT INTO entity_source_snapshots\b/i.test(call.sql)).length, 1);
});

test('importShimmerItemTransforms preserves soft-deleted source scope rows', async () => {
  const record = shimmerItemRecord({ outputNameEn: 'Changed Torch' });
  const softDeleted = {
    ...existingShimmerItemRow(shimmerItemRecord()),
    deleted: 1
  };
  const conn = createSoftDeleteAwareConnection({ existingRows: [softDeleted] });
  const stats = { created: 0, replaced: 0, skipped: 0 };

  await importShimmerItemTransforms(conn, 'SHIMMER', [record], stats, true);

  const deleteCall = conn.calls.find((call) => /\bDELETE FROM shimmer_item_transforms\b/i.test(call.sql));
  assert.match(deleteCall.sql, /\bWHERE deleted = 0\b/i);
  assert.equal(conn.rows.some((row) => row.deleted === 1), true);
});

function shimmerItemRecord(overrides = {}) {
  return {
    inputKind: 'item',
    inputNameEn: 'Torch',
    inputNameZh: '火把',
    inputInternalName: 'Torch',
    outputKind: 'item',
    outputNameEn: 'Aether Torch',
    outputNameZh: '以太火把',
    outputInternalName: 'AetherTorch',
    conditions: [],
    notes: null,
    sourcePage: '微光',
    sourceRevisionTimestamp: '2026-06-20T01:02:03Z',
    ...overrides,
  };
}

function existingShimmerItemRow(record) {
  return {
    contextCode: 'SHIMMER',
    inputKind: record.inputKind,
    inputNameEn: record.inputNameEn,
    inputNameZh: record.inputNameZh,
    inputInternalName: record.inputInternalName,
    outputKind: record.outputKind,
    outputNameEn: record.outputNameEn,
    outputNameZh: record.outputNameZh,
    outputInternalName: record.outputInternalName,
    conditionsJson: JSON.stringify(record.conditions),
    notes: record.notes,
    sourceProvider: 'wiki_zh',
    sourcePage: record.sourcePage,
    sourceRevisionTimestamp: '2026-06-20 01:02:03',
    sortOrder: 1,
    status: 1,
    deleted: 0,
  };
}

function createFakeConnection({ existingRows = [] } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT\s+.+\s+FROM\s+shimmer_item_transforms\b/is.test(sql)) {
        return [existingRows];
      }
      if (/SELECT COUNT\(\*\) AS c\s+FROM\s+shimmer_item_transforms\b/is.test(sql)) {
        return [[{ c: existingRows.length }]];
      }
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
}

function createSoftDeleteAwareConnection({ existingRows = [] } = {}) {
  const calls = [];
  const rows = existingRows.map((row) => ({ ...row }));
  return {
    calls,
    rows,
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT\s+.+\s+FROM\s+shimmer_item_transforms\b/is.test(sql)) {
        return [rows.filter((row) => row.deleted === 0)];
      }
      if (/\bDELETE FROM shimmer_item_transforms\b/i.test(sql)) {
        if (/\bWHERE deleted = 0\b/i.test(sql)) {
          for (let index = rows.length - 1; index >= 0; index -= 1) {
            if (rows[index].deleted === 0) rows.splice(index, 1);
          }
        } else {
          rows.splice(0, rows.length);
        }
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1, insertId: 1 }];
    }
  };
}

function createVerifiedBundleIdentity() {
  return {
    dataBundleSha256: sha256('bundle'),
    generationId: 'a'.repeat(64),
    manifestSha256: sha256('manifest')
  };
}

function createAuthorizedPreview(bundle) {
  const tableNames = [
    'shimmer_item_transforms',
    'shimmer_decraft_rules',
    'shimmer_entity_transforms',
    'shimmer_npc_transforms'
  ];
  const emptyDescriptor = (tableName) => ({
    count: 0,
    sha256: hashRowsForPreview(tableName, [])
  });
  const preview = {
    operationId: 'canonical-shimmer-import',
    providerScope: {
      provider: 'wiki_zh',
      sourcePage: '微光',
      tables: tableNames
    },
    dataBundleSha256: bundle.dataBundleSha256,
    generationId: bundle.generationId,
    manifestSha256: bundle.manifestSha256,
    targetFingerprintSha256: sha256('target'),
    worldContext: { before: emptyDescriptor('world_contexts') },
    tables: Object.fromEntries(tableNames.map((tableName) => [tableName, {
      before: emptyDescriptor(tableName)
    }])),
    snapshots: { before: emptyDescriptor('entity_source_snapshots') }
  };
  return {
    ...preview,
    previewSha256: sha256(JSON.stringify(stableValue(preview)))
  };
}

function createEmptyShimmerScope(preview) {
  return {
    worldContext: null,
    shimmerTables: Object.fromEntries(preview.providerScope.tables.map((tableName) => [tableName, []])),
    snapshots: []
  };
}

function createAuthorizedContext(bundle, preview, inputContract = createTestInputContract(bundle, preview)) {
  return {
    dataBundleSha256: hashOrderedBundleBytes([{
      path: inputContract.relativePath,
      bytes: inputContract.bytes,
    }], 'data bundle'),
    inputContract,
    executionManifest: {
      shimmerImport: {
        operationId: 'canonical-shimmer-import',
        generationId: bundle.generationId,
        manifestSha256: bundle.manifestSha256,
        dataBundleSha256: bundle.dataBundleSha256,
        previewSha256: preview.previewSha256,
        targetFingerprintSha256: preview.targetFingerprintSha256,
        providerScope: stableValue(preview.providerScope)
      }
    },
    operationId: 'canonical-shimmer-import'
  };
}

function createTestInputContract(bundle, preview) {
  const contract = {
    schemaVersion: 1,
    operationId: 'canonical-shimmer-import',
    generationId: bundle.generationId,
    manifestPath: `data/generated/shimmer/generations/${bundle.generationId}/wiki-shimmer-manifest.json`,
    manifestSha256: bundle.manifestSha256,
    dataBundleSha256: bundle.dataBundleSha256,
    previewSha256: preview.previewSha256,
    targetFingerprintSha256: preview.targetFingerprintSha256,
    providerScope: stableValue(preview.providerScope),
  };
  const bytes = Buffer.from(`${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  return {
    ...contract,
    contract,
    bytes,
    contractPath: contract.manifestPath,
    relativePath: 'reports/authorization/canonical/canonical-shimmer-import.input.json',
  };
}

function bindFixtureContract(fixture, preview, overrides = {}) {
  return fixture.writeInputContract({
    previewSha256: preview.previewSha256,
    targetFingerprintSha256: preview.targetFingerprintSha256,
    providerScope: stableValue(preview.providerScope),
    ...overrides,
  });
}

function createTransactionConnection(calls) {
  return {
    async beginTransaction() {
      calls.push('begin');
    },
    async commit() {
      calls.push('commit');
    },
    async rollback() {
      calls.push('rollback');
    }
  };
}

function hashRowsForPreview(tableName, rows) {
  const normalizedRows = Array.isArray(rows)
    ? rows.map(stableValue).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    : [];
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stableValue({ tableName, rows: normalizedRows })), 'utf8').digest('hex')}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function createGenerationFixture({ contextRecords, titleResolutionRecords } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-import-'));
  const repoRoot = tempDir;
  const generationRoot = path.join(repoRoot, 'data', 'generated', 'shimmer', 'generations');
  const pointerPath = path.join(repoRoot, 'data', 'generated', 'shimmer', 'wiki-shimmer-current-generation.json');
  const publication = publishShimmerGeneration({
    rawBytes: Buffer.from(JSON.stringify({
      entity: 'wiki_shimmer_page',
      pageTitle: 'Shimmer',
      pageId: 4242,
      revisionId: 99,
      revisionTimestamp: '2026-08-03T00:00:00.000Z',
      html: '<table></table>'
    })),
    shards: {
      context: {
        entity: 'wiki_shimmer_context_importable',
        records: contextRecords ?? [{
          code: 'SHIMMER',
          generatedAt: '2026-08-03T00:00:00.000Z',
          sourcePage: 'Shimmer',
          sourcePageId: 4242,
          sourceRevisionTimestamp: '2026-08-03T00:00:00.000Z',
          tableRoleVersion: 'shimmer-table-roles/1'
        }]
      },
      itemTransforms: {
        entity: 'wiki_shimmer_item_transforms_importable',
        records: [shimmerItemRecord()]
      },
      decraftRules: {
        entity: 'wiki_shimmer_decraft_rules_importable',
        records: [{
          ruleType: 'decraft_unique',
          groupLabel: 'Unique',
          input: { kind: 'item', nameZh: 'Torch', nameEn: 'Torch', internalName: 'Torch' },
          outputs: [],
          conditions: [],
          sourcePage: '微光',
          sourceRevisionTimestamp: '2026-08-03T00:00:00.000Z'
        }]
      },
      entityTransforms: {
        entity: 'wiki_shimmer_entity_transforms_importable',
        records: [{
          transformGroup: 'enemy_transforms',
          input: { kind: 'npc', nameZh: 'Guide', nameEn: 'Guide', internalName: 'Guide' },
          output: { kind: 'npc', nameZh: 'Shimmered Guide', nameEn: 'Shimmered Guide', internalName: 'GuideShimmer' },
          sourcePage: '微光',
          sourceRevisionTimestamp: '2026-08-03T00:00:00.000Z'
        }]
      },
      npcTransforms: {
        entity: 'wiki_shimmer_npc_transforms_importable',
        records: [{
          npc: { kind: 'npc', nameZh: 'Guide', nameEn: 'Guide', internalName: 'Guide' },
          appearanceVariant: 'shimmer',
          effectType: 'visual_only',
          variantImageUrl: null,
          variantImageAlt: null,
          notes: null,
          sourcePage: '微光',
          sourceRevisionTimestamp: '2026-08-03T00:00:00.000Z'
        }]
      },
      titleResolution: {
        entity: 'wiki_shimmer_title_resolution',
        records: titleResolutionRecords ?? [{
          nameZh: 'Torch',
          nameEn: 'Torch',
          kind: 'item',
          internalName: 'Torch',
        }]
      }
    },
    standardizedInputs: {
      items: { path: 'data/standardized/items.standardized.json', sha256: sha256('items') },
      npcs: { path: 'data/standardized/npcs.standardized.json', sha256: sha256('npcs') }
    },
    langlinkEvidenceBytes: Buffer.from(JSON.stringify({ records: [{ nameZh: 'Torch', nameEn: 'Torch' }] })),
    producerCodeSha256: sha256('producer'),
    tableRoleVersion: 'shimmer-table-roles/1',
    generatedAt: '2026-08-03T00:00:00.000Z',
    generationRoot,
    pointerPath,
    runId: 'import-test'
  });
  const fixture = {
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
    publication,
    repoRoot
  };
  fixture.writeInputContract = (overrides = {}) => {
    const contractPath = path.join(
      repoRoot,
      'reports/authorization/canonical/canonical-shimmer-import.input.json',
    );
    const contract = {
      schemaVersion: 1,
      operationId: 'canonical-shimmer-import',
      generationId: publication.manifest.generationId,
      manifestPath: path.relative(repoRoot, publication.manifestPath).replaceAll('\\', '/'),
      manifestSha256: publication.manifest.manifestSha256,
      dataBundleSha256: publication.manifest.dataBundleSha256,
      previewSha256: sha256('fixture-preview'),
      targetFingerprintSha256: sha256('fixture-target'),
      providerScope: {
        provider: 'wiki_zh',
        sourcePage: '微光',
        tables: [
          'shimmer_item_transforms',
          'shimmer_decraft_rules',
          'shimmer_entity_transforms',
          'shimmer_npc_transforms',
        ],
      },
      ...overrides,
    };
    const bytes = Buffer.from(`${JSON.stringify(contract, null, 2)}\n`, 'utf8');
    fs.mkdirSync(path.dirname(contractPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(contractPath, bytes, { mode: 0o600 });
    fs.chmodSync(contractPath, 0o600);
    fixture.inputContractPath = contractPath;
    fixture.inputContract = {
      ...contract,
      contract,
      bytes,
      contractPath,
      relativePath: path.relative(repoRoot, contractPath).replaceAll('\\', '/'),
    };
    return fixture.inputContract;
  };
  fixture.writeInputContract();
  return fixture;
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
