import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SHIMMER_GENERATION_FILES,
  SHIMMER_GENERATION_PAYLOAD_FILES,
  publishShimmerGeneration,
  verifyShimmerGeneration,
} from './shimmer-generation-contract.mjs';

test('publishes and verifies all eight content-addressed generation files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-generation-'));
  const fixture = buildFixture();

  try {
    const publication = publishShimmerGeneration({
      ...fixture,
      generationRoot: path.join(tempDir, 'generations'),
      pointerPath: path.join(tempDir, 'wiki-shimmer-current-generation.json'),
      runId: 'run-01'
    });

    assert.equal(SHIMMER_GENERATION_FILES.length, 8);
    assert.deepEqual(
      publication.manifest.files.map((entry) => entry.name),
      SHIMMER_GENERATION_PAYLOAD_FILES
    );
    for (const fileName of SHIMMER_GENERATION_FILES) {
      assert.equal(fs.existsSync(path.join(publication.generationPath, fileName)), true, fileName);
    }

    const verified = verifyShimmerGeneration({ manifestPath: publication.manifestPath });
    assert.equal(verified.valid, true);
    assert.equal(verified.manifest.generationId, publication.manifest.generationId);
    assert.match(publication.manifest.generationId, /^[a-f0-9]{64}$/);
    assert.match(publication.manifest.dataBundleSha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(publication.manifest.manifestSha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(publication.manifest.langlinks.sha256, /^sha256:[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('rejects a one-byte shard mutation and a missing shard', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-generation-'));
  const fixture = buildFixture();

  try {
    const publication = publishShimmerGeneration({
      ...fixture,
      generationRoot: path.join(tempDir, 'generations'),
      pointerPath: path.join(tempDir, 'current.json'),
      runId: 'run-01'
    });
    const shardPath = path.join(publication.generationPath, 'wiki-shimmer-item-transforms.importable.json');
    fs.appendFileSync(shardPath, 'x');
    assert.throws(
      () => verifyShimmerGeneration({ manifestPath: publication.manifestPath }),
      /hash mismatch/i
    );

    fs.rmSync(shardPath);
    assert.throws(
      () => verifyShimmerGeneration({ manifestPath: publication.manifestPath }),
      /missing.*file|missing.*shard/i
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('rejects mixed-generation shards, wrong generation id, standardized hash, and role version', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-generation-'));
  const firstRoot = path.join(tempDir, 'first');
  const secondRoot = path.join(tempDir, 'second');

  try {
    const first = publishShimmerGeneration({
      ...buildFixture(),
      generationRoot: path.join(firstRoot, 'generations'),
      pointerPath: path.join(firstRoot, 'current.json'),
      runId: 'run-01'
    });
    const second = publishShimmerGeneration({
      ...buildFixture({ rawMarker: 'second' }),
      generationRoot: path.join(secondRoot, 'generations'),
      pointerPath: path.join(secondRoot, 'current.json'),
      runId: 'run-02'
    });

    fs.copyFileSync(
      path.join(second.generationPath, 'wiki-shimmer-item-transforms.importable.json'),
      path.join(first.generationPath, 'wiki-shimmer-item-transforms.importable.json')
    );
    assert.throws(
      () => verifyShimmerGeneration({ manifestPath: first.manifestPath }),
      /hash mismatch/i
    );

    const restoreFirst = publishShimmerGeneration({
      ...buildFixture(),
      generationRoot: path.join(tempDir, 'restored', 'generations'),
      pointerPath: path.join(tempDir, 'restored', 'current.json'),
      runId: 'run-03'
    });
    const manifest = JSON.parse(fs.readFileSync(restoreFirst.manifestPath, 'utf8'));
    manifest.generationId = 'f'.repeat(64);
    fs.writeFileSync(restoreFirst.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(
      () => verifyShimmerGeneration({ manifestPath: restoreFirst.manifestPath }),
      /manifest hash|generation id/i
    );

    const restoreSecond = publishShimmerGeneration({
      ...buildFixture(),
      generationRoot: path.join(tempDir, 'restored-hash', 'generations'),
      pointerPath: path.join(tempDir, 'restored-hash', 'current.json'),
      runId: 'run-04'
    });
    const wrongInput = JSON.parse(fs.readFileSync(restoreSecond.manifestPath, 'utf8'));
    wrongInput.standardizedInputs.items.sha256 = `sha256:${'e'.repeat(64)}`;
    fs.writeFileSync(restoreSecond.manifestPath, `${JSON.stringify(wrongInput, null, 2)}\n`);
    assert.throws(
      () => verifyShimmerGeneration({ manifestPath: restoreSecond.manifestPath }),
      /manifest hash|generation id|standardized/i
    );

    const restoreThird = publishShimmerGeneration({
      ...buildFixture(),
      generationRoot: path.join(tempDir, 'restored-role', 'generations'),
      pointerPath: path.join(tempDir, 'restored-role', 'current.json'),
      runId: 'run-05'
    });
    const wrongRole = JSON.parse(fs.readFileSync(restoreThird.manifestPath, 'utf8'));
    wrongRole.tableRoleVersion = 'shimmer-table-roles/999';
    fs.writeFileSync(restoreThird.manifestPath, `${JSON.stringify(wrongRole, null, 2)}\n`);
    assert.throws(
      () => verifyShimmerGeneration({ manifestPath: restoreThird.manifestPath }),
      /manifest hash|generation id|table.role.version/i
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('a failed publication preserves the previous pointer and generation', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-generation-'));
  const generationRoot = path.join(tempDir, 'generations');
  const pointerPath = path.join(tempDir, 'current.json');

  try {
    const first = publishShimmerGeneration({
      ...buildFixture(),
      generationRoot,
      pointerPath,
      runId: 'run-01'
    });
    const pointerBefore = fs.readFileSync(pointerPath, 'utf8');

    assert.throws(
      () => publishShimmerGeneration({
        ...buildFixture({ rawMarker: 'failed' }),
        generationRoot,
        pointerPath,
        runId: 'run-02',
        beforeVerify({ manifestPath }) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const target = path.join(path.dirname(manifestPath), 'wiki-shimmer-npc-transforms.importable.json');
          fs.appendFileSync(target, 'corrupt');
          return manifest;
        }
      }),
      /hash mismatch/i
    );

    assert.equal(fs.readFileSync(pointerPath, 'utf8'), pointerBefore);
    assert.equal(fs.existsSync(first.generationPath), true);
    assert.equal(fs.readdirSync(generationRoot).length, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function buildFixture({ rawMarker = 'first' } = {}) {
  const raw = {
    pageTitle: '微光',
    pageId: 4242,
    revisionTimestamp: '2026-07-30T00:00:00Z',
    html: `<table data-marker="${rawMarker}"></table>`
  };
  const shards = {
    context: { entity: 'wiki_shimmer_context_importable', records: [{ code: 'SHIMMER' }] },
    itemTransforms: { entity: 'wiki_shimmer_item_transforms_importable', records: [{ code: `item-${rawMarker}` }] },
    decraftRules: { entity: 'wiki_shimmer_decraft_rules_importable', records: [{ code: 'rule-1' }] },
    entityTransforms: { entity: 'wiki_shimmer_entity_transforms_importable', records: [{ code: 'entity-1' }] },
    npcTransforms: { entity: 'wiki_shimmer_npc_transforms_importable', records: [{ code: 'npc-1' }] },
    titleResolution: { entity: 'wiki_shimmer_title_resolution', records: [{ nameZh: '木剑', kind: 'resolved' }] }
  };
  return {
    rawBytes: Buffer.from(JSON.stringify(raw)),
    shards,
    standardizedInputs: {
      items: { path: 'data/standardized/items.standardized.json', sha256: `sha256:${'a'.repeat(64)}` },
      npcs: { path: 'data/standardized/npcs.standardized.json', sha256: `sha256:${'b'.repeat(64)}` }
    },
    langlinkEvidenceBytes: Buffer.from(JSON.stringify({ records: [{ nameZh: '木剑', nameEn: 'Wood Sword' }] })),
    producerCodeSha256: `sha256:${crypto.createHash('sha256').update('producer').digest('hex')}`,
    tableRoleVersion: 'shimmer-table-roles/1',
    generatedAt: '2026-07-30T12:00:00.000Z'
  };
}
