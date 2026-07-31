import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildItemImageSourceVerificationInput,
  prepareItemImageSourceVerificationInput,
  resolveItemImageSourceVerificationProgressPath,
  runItemImageSourceVerification
} from './fetch-item-image-source-verification.mjs';

test('prepareItemImageSourceVerificationInput writes one immutable offline input', async (t) => {
  const repoRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tp-item-image-verification-input-'));
  t.after(() => fs.promises.rm(repoRoot, { recursive: true, force: true }));
  const candidateReportPath = path.join(repoRoot, 'reports/audit/candidates.json');
  const promotionReviewPath = path.join(repoRoot, 'reports/audit/review.json');
  const rawDir = path.join(repoRoot, 'raw');
  const outputPath = path.join(repoRoot, 'reports/authorization/canonical/input.json');
  await fs.promises.mkdir(path.dirname(candidateReportPath), { recursive: true });
  await fs.promises.mkdir(rawDir, { recursive: true });
  const rawEvidenceBytesByFile = new Map([
    ['ambiguousitem.latest.json', rawPage({
      pageId: 1002,
      requestedPageTitle: 'Ambiguous Item',
      pageTitle: 'Ambiguous Item group'
    })],
    ['unresolveditem.latest.json', rawPage({
      pageId: 1003,
      requestedPageTitle: 'Unresolved Item',
      pageTitle: 'Unresolved Item group'
    })]
  ]);
  const candidateReport = candidateInputReport(rawEvidenceBytesByFile);
  const candidateReportBytes = JSON.stringify(candidateReport);
  const review = {
    schemaVersion: 1,
    entity: 'item_image_source_promotion_review',
    descriptor: {
      candidateReport: { sha256: sha256(candidateReportBytes) },
      standardized: {
        sha256: `sha256:${'c'.repeat(64)}`,
        identitySetSha256: `sha256:${'d'.repeat(64)}`,
        recordCount: 6131
      }
    },
    counters: {
      total: 6131,
      existing: 2119,
      promoted: 3135,
      unresolved: 1,
      ambiguous: 1,
      duplicate: 0,
      conflict: 0
    },
    rows: [
      reviewRow(2, 'AmbiguousItem', 'Ambiguous Item', 'ambiguous'),
      reviewRow(3, 'UnresolvedItem', 'Unresolved Item', 'unresolved')
    ]
  };
  await fs.promises.writeFile(candidateReportPath, candidateReportBytes);
  await fs.promises.writeFile(promotionReviewPath, JSON.stringify(review));
  for (const [fileName, bytes] of rawEvidenceBytesByFile) {
    await fs.promises.writeFile(path.join(rawDir, fileName), bytes);
  }

  const result = await prepareItemImageSourceVerificationInput({
    repoRoot,
    candidateReportPath,
    promotionReviewPath,
    rawDir,
    outputPath,
    generatedAt: '2026-07-31T00:00:00.000Z',
    batchSize: 1,
    maxRequests: 2
  });

  const written = JSON.parse(await fs.promises.readFile(outputPath, 'utf8'));
  assert.equal(written.records.length, 2);
  assert.equal(result.outputPath, outputPath);
  assert.match(result.sha256, /^sha256:[a-f0-9]{64}$/);
});

test('direct verifier without a canonical packet fails before network access', async (t) => {
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tp-item-image-no-packet-'));
  t.after(() => fs.promises.rm(tempDir, { recursive: true, force: true }));
  const inputPath = path.join(tempDir, 'input.json');
  const progressPath = path.join(tempDir, 'progress.json');
  const outputPath = path.join(tempDir, 'output.json');
  await fs.promises.writeFile(inputPath, `${JSON.stringify(frozenInput({ limit: 1 }))}\n`, {
    mode: 0o600
  });
  const env = { ...process.env };
  delete env.TERRAPEDIA_AUTHORIZED_PACKET_PATH;
  delete env.TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH;
  delete env.TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE;

  const result = spawnSync(process.execPath, [
    'scripts/data/fetch/fetch-item-image-source-verification.mjs',
    `--input=${inputPath}`,
    `--output=${outputPath}`,
    `--progress-path=${progressPath}`,
    '--batch-size=1',
    '--max-requests=1',
    '--api-url=http://127.0.0.1:9/api.php'
  ], {
    cwd: repoRoot,
    env,
    encoding: 'utf8'
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /TERRAPEDIA_AUTHORIZED_PACKET_PATH/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
  assert.equal(fs.existsSync(outputPath), false);
  const progress = JSON.parse(await fs.promises.readFile(progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
});

test('verification fetch performs one actual HTTP attempt for one frozen identity', async (t) => {
  const verifierModule = await import('./fetch-item-image-source-verification.mjs');
  assert.equal(typeof verifierModule.createItemImageSourceVerificationFetch, 'function');

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tp-item-image-single-attempt-'));
  t.after(() => fs.promises.rm(tempDir, { recursive: true, force: true }));
  let attempts = 0;
  const fetchJson = verifierModule.createItemImageSourceVerificationFetch({
    statePath: path.join(tempDir, 'wiki-request-gate.json'),
    sleepFn: async () => {},
    nowFn: () => Date.parse('2026-07-31T00:00:00.000Z'),
    fetchFn: async () => {
      attempts += 1;
      return new Response(JSON.stringify({ error: { code: 'ratelimited' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  await assert.rejects(
    () => fetchJson({
      identity: frozenRow({
        itemId: 1,
        itemInternalName: 'VerifiedItem',
        itemName: 'Verified Item',
        fileTitles: ['Verified Item.png']
      }),
      url: new URL('https://terraria.wiki.gg/api.php?action=query')
    }),
    /rate|429/i
  );
  assert.equal(attempts, 1);
});

test('buildItemImageSourceVerificationInput freezes only unresolved review identities', () => {
  const rawEvidenceBytesByFile = new Map([
    ['ambiguousitem.latest.json', rawPage({
      pageId: 1002,
      requestedPageTitle: 'Ambiguous Item',
      pageTitle: 'Ambiguous Item group'
    })],
    ['unresolveditem.latest.json', rawPage({
      pageId: 1003,
      requestedPageTitle: 'Unresolved Item',
      pageTitle: 'Unresolved Item group'
    })]
  ]);
  const candidateReport = candidateInputReport(rawEvidenceBytesByFile);
  const candidateReportBytes = JSON.stringify(candidateReport);
  const promotionReviewBytes = JSON.stringify({
    schemaVersion: 1,
    entity: 'item_image_source_promotion_review',
    descriptor: {
      candidateReport: { sha256: sha256(candidateReportBytes) },
      standardized: {
        sha256: `sha256:${'c'.repeat(64)}`,
        identitySetSha256: `sha256:${'d'.repeat(64)}`,
        recordCount: 6131
      }
    },
    counters: {
      total: 6131,
      existing: 2119,
      promoted: 3135,
      unresolved: 1,
      ambiguous: 1,
      duplicate: 0,
      conflict: 0
    },
    rows: [
      reviewRow(2, 'AmbiguousItem', 'Ambiguous Item', 'ambiguous'),
      reviewRow(3, 'UnresolvedItem', 'Unresolved Item', 'unresolved')
    ]
  });

  const input = buildItemImageSourceVerificationInput({
    candidateReportBytes,
    candidateReportPath: 'reports/audit/candidates.json',
    promotionReviewBytes,
    promotionReviewPath: 'reports/audit/review.json',
    rawEvidenceBytesByFile,
    generatedAt: '2026-07-31T00:00:00.000Z',
    batchSize: 1,
    maxRequests: 2
  });

  assert.equal(input.schemaVersion, '1.0.0');
  assert.equal(input.entity, 'item_image_source_verification_input');
  assert.deepEqual(input.constraints, { batchSize: 1, maxRequests: 2 });
  assert.match(input.inputs.unresolvedIdentitySetSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(input.inputs.rawFiles.length, 2);
  assert.deepEqual(
    input.records.map((record) => record.itemInternalName),
    ['AmbiguousItem', 'UnresolvedItem']
  );
  assert.deepEqual(input.records[0].fileTitles, [
    'Ambiguous Item.gif',
    'Ambiguous Item.png'
  ]);
  assert.deepEqual(input.records[1].fileTitles, [
    'Unresolved Item.gif',
    'Unresolved Item.png'
  ]);
  assert.equal(input.writeBoundary.networkRequests, false);
  assert.equal(input.writeBoundary.databaseWrites, false);
});

test('buildItemImageSourceVerificationInput rejects a duplicated review identity', () => {
  const rawEvidenceBytesByFile = new Map([[
    'unresolveditem.latest.json',
    rawPage({
      pageId: 1003,
      requestedPageTitle: 'Unresolved Item',
      pageTitle: 'Unresolved Item group'
    })
  ]]);
  const candidateReport = candidateInputReport(rawEvidenceBytesByFile, { unresolvedOnly: true });
  const candidateReportBytes = JSON.stringify(candidateReport);
  const row = reviewRow(3, 'UnresolvedItem', 'Unresolved Item', 'unresolved');
  const promotionReviewBytes = JSON.stringify({
    schemaVersion: 1,
    entity: 'item_image_source_promotion_review',
    descriptor: {
      candidateReport: { sha256: sha256(candidateReportBytes) },
      standardized: {
        sha256: `sha256:${'c'.repeat(64)}`,
        identitySetSha256: `sha256:${'d'.repeat(64)}`,
        recordCount: 6131
      }
    },
    counters: {
      total: 6131,
      existing: 2119,
      promoted: 3135,
      unresolved: 2,
      ambiguous: 0,
      duplicate: 0,
      conflict: 0
    },
    rows: [row, structuredClone(row)]
  });

  assert.throws(
    () => buildItemImageSourceVerificationInput({
      candidateReportBytes,
      promotionReviewBytes,
      rawEvidenceBytesByFile,
      batchSize: 1,
      maxRequests: 2
    }),
    /duplicate.*identity/i
  );
});

test('runItemImageSourceVerification publishes progress before bounded frozen requests', async () => {
  const events = [];
  const input = frozenInput();
  const frozenIdentities = new Set(input.records.map((record) => record.itemInternalName));

  const report = await runItemImageSourceVerification({
    repoRoot: '/tmp',
    input,
    inputPath: '/tmp/frozen-item-image-input.json',
    inputSha256: `sha256:${'a'.repeat(64)}`,
    progressPath: '/tmp/item-image-progress.json',
    outputPath: '/tmp/item-image-report.json',
    batchSize: 2,
    maxRequests: 3
  }, {
    authorize: async (context) => {
      events.push({ kind: 'authorize', context });
    },
    fetchJson: async ({ identity, url }) => {
      events.push({ kind: 'request', identity, url: String(url) });
      assert.ok(frozenIdentities.has(identity.itemInternalName));
      return wikiResponse(identity);
    },
    now: clock(),
    writeProgress: async (_filePath, payload) => {
      events.push({ kind: 'progress', payload });
    },
    writeReport: async (_filePath, payload) => {
      events.push({ kind: 'report', payload });
    }
  });

  assert.equal(events[0].kind, 'progress');
  assert.equal(events[0].payload.status, 'running');
  assert.equal(events.findIndex((event) => event.kind === 'authorize'), 1);
  assert.ok(events.findIndex((event) => event.kind === 'request') > 1);
  assert.equal(events.at(-1).kind, 'progress');
  assert.equal(events.at(-1).payload.status, 'completed');
  assert.equal(events.filter((event) => event.kind === 'request').length, 3);
  assert.ok(events
    .filter((event) => event.kind === 'progress')
    .every((event) => event.payload.batchLimit <= 2));
  assert.deepEqual(report.summary, {
    total: 3,
    verified: 1,
    ambiguous: 1,
    unresolved: 1,
    failed: 0,
    requestCount: 3
  });
  assert.deepEqual(
    report.records.map((record) => record.classification),
    ['verified', 'ambiguous', 'unresolved']
  );
  assert.match(report.records[0].responseSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(report.records[0].source.authority, 'raw_wiki_evidence');
  assert.equal(report.records[0].source.evidenceKind, 'mediawiki_exact_file');
});

test('runItemImageSourceVerification fails closed before exceeding the request cap', async () => {
  const progress = [];
  let requestCount = 0;

  await assert.rejects(
    () => runItemImageSourceVerification({
      repoRoot: '/tmp',
      input: frozenInput(),
      inputPath: '/tmp/frozen-item-image-input.json',
      inputSha256: `sha256:${'a'.repeat(64)}`,
      progressPath: '/tmp/item-image-progress.json',
      outputPath: '/tmp/item-image-report.json',
      batchSize: 2,
      maxRequests: 2
    }, {
      authorize: async () => {},
      fetchJson: async () => {
        requestCount += 1;
        return {};
      },
      now: clock(),
      writeProgress: async (_filePath, payload) => progress.push(payload),
      writeReport: async () => {}
    }),
    /request cap/i
  );

  assert.equal(requestCount, 0);
  assert.equal(progress[0].status, 'running');
  assert.equal(progress.at(-1).status, 'failed');
});

test('runItemImageSourceVerification records failed terminal progress on request error', async () => {
  const progress = [];

  await assert.rejects(
    () => runItemImageSourceVerification({
      repoRoot: '/tmp',
      input: frozenInput({ limit: 1 }),
      inputPath: '/tmp/frozen-item-image-input.json',
      inputSha256: `sha256:${'a'.repeat(64)}`,
      progressPath: '/tmp/item-image-progress.json',
      outputPath: '/tmp/item-image-report.json',
      batchSize: 1,
      maxRequests: 1
    }, {
      authorize: async () => {},
      fetchJson: async () => {
        throw new Error('injected wiki outage');
      },
      now: clock(),
      writeProgress: async (_filePath, payload) => progress.push(payload),
      writeReport: async () => {}
    }),
    /injected wiki outage/
  );

  assert.equal(progress[0].status, 'running');
  assert.equal(progress.at(-1).status, 'failed');
  assert.match(progress.at(-1).message, /injected wiki outage/);
});

test('resolveItemImageSourceVerificationProgressPath honors explicit and wrapper paths', () => {
  const repoRoot = path.resolve('/tmp/terrapedia-worktree');

  assert.equal(
    resolveItemImageSourceVerificationProgressPath({
      progressPath: 'reports/custom-progress.json',
      repoRoot,
      env: {}
    }),
    path.join(repoRoot, 'reports/custom-progress.json')
  );
  assert.equal(
    resolveItemImageSourceVerificationProgressPath({
      repoRoot,
      env: { TERRAPEDIA_CRAWLER_PROGRESS_PATH: '/tmp/attempt/child-progress.json' }
    }),
    '/tmp/attempt/child-progress.json'
  );
  assert.equal(
    resolveItemImageSourceVerificationProgressPath({ repoRoot, env: {} }),
    path.join(
      repoRoot,
      'reports/backend-refresh/history/canonical-item-image-source-verification.runtime/child-status.json'
    )
  );
});

function frozenInput({ limit = 3 } = {}) {
  const rows = [
    frozenRow({
      itemId: 1,
      itemInternalName: 'VerifiedItem',
      itemName: 'Verified Item',
      fileTitles: ['Verified Item.png']
    }),
    frozenRow({
      itemId: 2,
      itemInternalName: 'AmbiguousItem',
      itemName: 'Ambiguous Item',
      fileTitles: ['Ambiguous Item.png', 'Ambiguous Item.gif']
    }),
    frozenRow({
      itemId: 3,
      itemInternalName: 'UnresolvedItem',
      itemName: 'Unresolved Item',
      fileTitles: ['Unresolved Item.png']
    })
  ].slice(0, limit);
  return {
    schemaVersion: '1.0.0',
    entity: 'item_image_source_verification_input',
    generatedAt: '2026-07-31T00:00:00.000Z',
    constraints: {
      batchSize: Math.min(2, rows.length),
      maxRequests: rows.length
    },
    inputs: {
      candidateReport: {
        path: 'reports/audit/item-image-source-candidates-2026-07-30-v2.json',
        sha256: `sha256:${'b'.repeat(64)}`
      },
      rawFiles: rows.map((row) => ({
        path: row.rawSourceFile,
        sha256: row.rawFileSha256
      }))
    },
    records: rows
  };
}

function frozenRow({ itemId, itemInternalName, itemName, fileTitles }) {
  return {
    itemId,
    itemInternalName,
    itemName,
    priorClassification: 'unresolved',
    rawSourceFile: `${itemInternalName.toLowerCase()}.latest.json`,
    rawFileSha256: `sha256:${String(itemId).repeat(64)}`,
    pageId: 1000 + itemId,
    requestedPageTitle: itemName,
    sourcePage: `${itemName} group`,
    sourceRevisionTimestamp: '2026-07-30T00:00:00.000Z',
    fileTitles,
    comparison: {
      local: { status: 'comparison_only' },
      lineage: { status: 'missing' }
    }
  };
}

function wikiResponse(identity) {
  const files = identity.itemInternalName === 'VerifiedItem'
    ? [wikiFile('Verified Item.png')]
    : identity.itemInternalName === 'AmbiguousItem'
      ? [wikiFile('Ambiguous Item.png'), wikiFile('Ambiguous Item.gif')]
      : [];
  return {
    query: {
      pages: [
        {
          pageid: identity.pageId,
          title: identity.sourcePage,
          revisions: [{ timestamp: identity.sourceRevisionTimestamp }]
        },
        ...files
      ]
    }
  };
}

function wikiFile(fileTitle) {
  return {
    pageid: 9000,
    ns: 6,
    title: `File:${fileTitle}`,
    imageinfo: [{
      url: `https://terraria.wiki.gg/images/${fileTitle.replaceAll(' ', '_')}`,
      width: 18,
      height: 18,
      mime: fileTitle.endsWith('.gif') ? 'image/gif' : 'image/png'
    }]
  };
}

function clock() {
  let tick = 0;
  return () => new Date(Date.parse('2026-07-31T00:00:00.000Z') + tick++ * 1000).toISOString();
}

function candidateInputReport(rawEvidenceBytesByFile, { unresolvedOnly = false } = {}) {
  const records = unresolvedOnly
    ? [candidateInputRecord(3, 'UnresolvedItem', 'Unresolved Item', 'unresolved')]
    : [
        candidateInputRecord(2, 'AmbiguousItem', 'Ambiguous Item', 'ambiguous'),
        candidateInputRecord(3, 'UnresolvedItem', 'Unresolved Item', 'unresolved')
      ];
  return {
    schemaVersion: '2.0.0',
    entity: 'item_image_source_candidates',
    inputs: {
      rawFiles: [...rawEvidenceBytesByFile].map(([fileName, bytes]) => ({
        path: fileName,
        sha256: sha256(bytes)
      }))
    },
    records,
    quarantine: {
      groupPages: records.map((record) => ({
        itemId: record.itemId,
        itemInternalName: record.itemInternalName,
        itemName: record.itemName,
        sourceFile: `${record.itemInternalName.toLowerCase()}.latest.json`,
        requestedPageTitle: record.itemName,
        pageTitle: `${record.itemName} group`,
        candidateFileTitles: record.classification === 'ambiguous'
          ? [`${record.itemName}.png`, `${record.itemName}.gif`]
          : []
      })),
      nonGroupPages: []
    }
  };
}

function candidateInputRecord(itemId, itemInternalName, itemName, classification) {
  return {
    itemId,
    itemInternalName,
    itemName,
    classification,
    source: null,
    comparison: {
      local: { status: 'comparison_only' },
      lineage: { status: 'missing' }
    }
  };
}

function reviewRow(itemId, itemInternalName, itemName, status) {
  return { itemId, itemInternalName, itemName, status, source: null, comparison: null };
}

function rawPage({ pageId, requestedPageTitle, pageTitle }) {
  return JSON.stringify({
    pageId,
    requestedPageTitle,
    pageTitle,
    revisionTimestamp: '2026-07-30T00:00:00.000Z'
  });
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
