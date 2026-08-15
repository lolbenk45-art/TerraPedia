import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { SHIMMER_TABLE_ROLE_SEQUENCE } from '../maint/shimmer-structured-parser.mjs';
import { hashOrderedBundleBytes } from '../automation/build-canonical-cutover-authorization.mjs';
import { verifyShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pipelinePath = path.join(__dirname, 'run-wiki-shimmer-extraction-pipeline.mjs');
const originalSpawnSync = childProcess.spawnSync;

test('scheduler preview authorization requires the complete V2 automation identity', async () => {
  const { isGovernedSchedulerPreviewContext } = await loadPipelineModule();
  const valid = {
    TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
    TERRAPEDIA_CRAWLER_ACTION_ID: 'domain-source-shimmer',
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-1',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-1',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '42',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-1',
    TERRAPEDIA_CRAWLER_PROGRESS_PATH: '/tmp/progress.json',
  };
  assert.equal(isGovernedSchedulerPreviewContext(valid), true);
  for (const key of Object.keys(valid)) {
    assert.equal(isGovernedSchedulerPreviewContext({ ...valid, [key]: '' }), false, key);
  }
  assert.equal(isGovernedSchedulerPreviewContext({ ...valid, TERRAPEDIA_CRAWLER_REQUESTED_BY: 'admin' }), false);
});

test('the extraction pipeline owns ordered progress and completes only after the published generation verifies', async () => {
  const fixture = createFixture('ordered-progress');
  const progress = [];
  const completedPointerGenerationIds = [];
  let requestedTitles = null;

  try {
    const result = await runPipeline(fixture, {
      fetchRaw: async ({ onPhase }) => {
        assert.equal(progress[0]?.status, 'running');
        assert.equal(progress[0]?.phase, 'preflight');
        onPhase({ phase: 'fetch_revision', current: 0, total: 3 });
        onPhase({ phase: 'fetch_sections', current: 1, total: 3 });
        onPhase({ phase: 'fetch_html', current: 2, total: 3 });
        return rawFixture();
      },
      fetchLanglinks: async ({ titles, onPhase }) => {
        requestedTitles = titles;
        onPhase({ phase: 'fetch_langlinks', current: 0, total: titles.length, batchSize: titles.length });
        return langlinkEvidence(titles);
      },
      writeProgress: (snapshot) => {
        progress.push({ ...snapshot });
        if (snapshot.status === 'completed') {
          const pointer = readJson(fixture.pointerPath);
          const manifestPath = path.resolve(path.dirname(fixture.pointerPath), pointer.manifestPath);
          assert.equal(verifyShimmerGeneration({ manifestPath }).valid, true);
          completedPointerGenerationIds.push(pointer.generationId);
        }
      }
    });

    assert.deepEqual(requestedTitles, expectedTitles());
    assert.equal(result.manifestPath, path.join(result.generationPath, 'wiki-shimmer-manifest.json'));
    assert.equal(fs.existsSync(fixture.pointerPath), true);
    assert.equal(result.verified.manifest.generationId, result.generationId);
    assert.equal(
      result.verified.manifest.standardizedInputs.items.path,
      'data/standardized/items.standardized.json'
    );
    assert.equal(
      result.verified.manifest.standardizedInputs.npcs.path,
      'data/standardized/npcs.standardized.json'
    );
    assert.deepEqual(completedPointerGenerationIds, [result.generationId]);

    assert.deepEqual(
      uniqueInOrder(progress.map((snapshot) => snapshot.phase)),
      [
        'preflight',
        'fetch_revision',
        'fetch_sections',
        'fetch_html',
        'resolve_langlinks',
        'transform',
        'verify_bundle',
        'publish'
      ]
    );
    const completed = progress.at(-1);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.phase, 'publish');
    assert.equal(completed.outputPath, fixture.pointerPath);
    assert.equal(completed.manifestPath, result.manifestPath);
    assert.equal(completed.generationId, result.generationId);
    assert.match(completed.dataBundleSha256, /^sha256:[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('the parent heartbeat advances while a delayed langlink child is resolving', async () => {
  const fixture = createFixture('heartbeat');
  const progress = [];
  const attemptIdentity = {
    TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-shimmer',
    TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-shimmer',
    TERRAPEDIA_CRAWLER_FENCE_TOKEN: '149',
    TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-shimmer',
    TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '2',
    TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '100',
  };

  try {
    writeJson(fixture.progressPath, {
      actionId: 'domain-source-shimmer',
      status: 'running',
      progressSequence: 101,
    });
    await runPipeline(fixture, {
      heartbeatIntervalMs: 5,
      fetchRaw: async ({ onPhase }) => {
        onPhase({ phase: 'fetch_revision', current: 0, total: 3 });
        onPhase({ phase: 'fetch_sections', current: 1, total: 3 });
        onPhase({ phase: 'fetch_html', current: 2, total: 3 });
        return rawFixture();
      },
      fetchLanglinks: async ({ titles, onPhase }) => {
        onPhase({ phase: 'fetch_langlinks', current: 0, total: titles.length, batchSize: titles.length });
        await delay(30);
        return langlinkEvidence(titles);
      },
      writeProgress: (snapshot) => progress.push({ ...snapshot })
    }, { env: attemptIdentity });

    const resolving = progress.filter((snapshot) => (
      snapshot.status === 'running' && snapshot.phase === 'resolve_langlinks'
    ));
    assert.ok(resolving.length >= 2, 'expected a parent heartbeat while langlinks were delayed');
    assert.ok(
      new Set(resolving.map((snapshot) => snapshot.lastHeartbeatAt)).size >= 2,
      'heartbeat writes must advance the heartbeat timestamp'
    );
    assert.ok(resolving.every((snapshot) => (
      snapshot.queueId === 'queue-shimmer'
      && snapshot.attemptId === 'attempt-shimmer'
      && snapshot.fenceToken === 149
      && snapshot.stateStoreEpoch === 'epoch-shimmer'
      && snapshot.progressSequence > 101
    )), 'heartbeats must carry the current V2 attempt identity after the outer progress snapshot');
    assert.ok(resolving.slice(1).every((snapshot, index) => (
      snapshot.progressSequence > resolving[index].progressSequence
    )), 'heartbeat progressSequence must strictly advance');
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('an attempt progress path is mirrored to the canonical monitor path', async () => {
  const fixture = createFixture('progress-mirror');
  const attemptProgressPath = path.join(fixture.tempDir, 'attempt', 'child-status.json');

  try {
    await runPipeline(fixture, {
      fetchRaw: async ({ onPhase }) => {
        onPhase({ phase: 'fetch_revision', current: 0, total: 3 });
        onPhase({ phase: 'fetch_sections', current: 1, total: 3 });
        onPhase({ phase: 'fetch_html', current: 2, total: 3 });
        return rawFixture();
      },
      fetchLanglinks: async ({ titles, onPhase }) => {
        onPhase({ phase: 'fetch_langlinks', current: 0, total: titles.length, batchSize: titles.length });
        return langlinkEvidence(titles);
      }
    }, { progressPath: attemptProgressPath });

    const attempt = readJson(attemptProgressPath);
    const canonical = readJson(fixture.progressPath);
    assert.equal(attempt.status, 'completed');
    assert.equal(canonical.status, 'completed');
    assert.equal(attempt.childStatusPath, attemptProgressPath);
    assert.equal(canonical.childStatusPath, fixture.progressPath);
    assert.equal(canonical.generationId, attempt.generationId);
    assert.equal(canonical.manifestPath, attempt.manifestPath);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('a child failure leaves one parent failed terminal snapshot', async () => {
  const fixture = createFixture('failed-child');
  const progress = [];

  try {
    await assert.rejects(
      runPipeline(fixture, {
        fetchRaw: async () => {
          throw new Error('frozen revision request failed');
        },
        writeProgress: (snapshot) => progress.push({ ...snapshot })
      }),
      /frozen revision request failed/
    );

    assert.equal(progress[0]?.status, 'running');
    assert.equal(progress[0]?.phase, 'preflight');
    const terminal = progress.at(-1);
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.phase, 'error');
    assert.match(terminal.message, /frozen revision request failed/);
    assert.equal(progress.filter((snapshot) => snapshot.status === 'failed').length, 1);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('an injected authorization is validated and its permit is consumed before raw fetching', async () => {
  const fixture = createFixture('authorization-before-raw');
  const calls = [];

  try {
    await assert.rejects(
      runPipeline(fixture, {
        loadAuthorizationContext: ({ operationId }) => {
          calls.push(`load:${operationId}`);
          return authorizationContext(fixture);
        },
        consumeDispatchPermit: ({ authorizedContext, decisionLedgerPath }) => {
          calls.push(`consume:${authorizedContext.operationId}`);
          assert.equal(
            decisionLedgerPath,
            path.join(fixture.tempDir, 'reports', 'authorization', 'canonical', 'used-decisions.json')
          );
          return true;
        },
        fetchRaw: async () => {
          assert.deepEqual(calls, [
            'load:canonical-shimmer-generation',
            'consume:canonical-shimmer-generation'
          ]);
          throw new Error('raw fetch reached after authorized preflight');
        }
      }),
      /raw fetch reached after authorized preflight/
    );
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('a frozen authorization mismatch fails before raw fetching and records failed progress', async () => {
  const fixture = createFixture('authorization-mismatch');
  const progress = [];
  let rawCalls = 0;

  try {
    await assert.rejects(
      runPipeline(fixture, {
        loadAuthorizationContext: () => ({
          ...authorizationContext(fixture),
          dataBundleSha256: sha256('wrong-shimmer-authorization-bundle')
        }),
        consumeDispatchPermit: () => {
          throw new Error('permit must not be consumed after a data-bundle mismatch');
        },
        fetchRaw: async () => {
          rawCalls += 1;
          throw new Error('raw fetch must not run after a data-bundle mismatch');
        },
        writeProgress: (snapshot) => progress.push({ ...snapshot })
      }),
      /data bundle/i
    );

    assert.equal(rawCalls, 0);
    assert.equal(progress[0]?.phase, 'preflight');
    assert.equal(progress.at(-1)?.status, 'failed');
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('the pipeline rejects a non-canonical authorization input path before raw fetching', async () => {
  const fixture = createFixture('non-canonical-input-path');
  const alternateInputPath = path.join(
    fixture.tempDir,
    'reports',
    'authorization',
    'canonical',
    'alternate-shimmer-generation.input.json'
  );
  let rawCalls = 0;
  fs.copyFileSync(fixture.authorizationInputPath, alternateInputPath);

  try {
    await assert.rejects(
      runPipeline(fixture, {
        loadAuthorizationContext: () => authorizationContext(fixture, {
          inputContractPath: alternateInputPath
        }),
        consumeDispatchPermit: () => {
          throw new Error('permit must not be consumed for an alternate input path');
        },
        fetchRaw: async () => {
          rawCalls += 1;
          throw new Error('raw fetch must not run for an alternate input path');
        }
      }, {
        inputContractPath: alternateInputPath
      }),
      /input contract path/i
    );

    assert.equal(rawCalls, 0);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('a frozen langlink request cap rejects expanded title scope before the langlink fetch', async () => {
  const fixture = createFixture('langlink-request-cap');
  let langlinkCalls = 0;
  writeAuthorizationInputContract(fixture, {
    constraints: {
      rawRequests: 3,
      langlinkBatchSize: 1,
      maxLanglinkRequests: 2,
      maxRequests: 5
    }
  });

  try {
    await assert.rejects(
      runPipeline(fixture, {
        fetchRaw: async () => rawFixture(),
        collectTitles: () => ['Wood Sword', 'Platinum Sword', 'Guide'],
        fetchLanglinks: async () => {
          langlinkCalls += 1;
          throw new Error('langlink fetch must not run after a request-cap failure');
        }
      }),
      /langlink request cap/i
    );

    assert.equal(langlinkCalls, 0);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('the direct CLI records failed preflight before network when packet or permit is absent', async () => {
  const fixture = createFixture('direct-cli-missing-permit');
  let rawCalls = 0;

  try {
    const { runWikiShimmerExtractionPipelineCli } = await loadPipelineModule();
    assert.equal(typeof runWikiShimmerExtractionPipelineCli, 'function');

    await assert.rejects(
      runWikiShimmerExtractionPipelineCli({
        argv: [
          '--api=https://example.test/zh/api.php',
          '--generated-at=2026-08-01T12:00:00.000Z',
          `--generation-root=${fixture.generationRoot}`,
          `--items=${fixture.itemsPath}`,
          `--npcs=${fixture.npcsPath}`,
          '--page=Shimmer',
          `--pointer-path=${fixture.pointerPath}`,
          `--progress-path=${fixture.progressPath}`,
          `--report-output=${fixture.reportPath}`
        ],
        env: {},
        repoRoot: fixture.tempDir,
        dependencies: {
          fetchRaw: async () => {
            rawCalls += 1;
            throw new Error('direct CLI must not fetch without authorization');
          }
        }
      }),
      /TERRAPEDIA_AUTHORIZED_PACKET_PATH/
    );

    assert.equal(rawCalls, 0);
    const terminal = readJson(fixture.progressPath);
    assert.equal(terminal.phase, 'error');
    assert.equal(terminal.status, 'failed');
    assert.match(terminal.message, /TERRAPEDIA_AUTHORIZED_PACKET_PATH/);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('the direct CLI uses the isolated WORKTREE_ROOT canonical progress path before authorization', () => {
  const fixture = createFixture('direct-cli-worktree-progress');

  try {
    const result = childProcess.spawnSync(process.execPath, [pipelinePath], {
      cwd: __dirname,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        WORKTREE_ROOT: fixture.tempDir,
        TERRAPEDIA_AUTHORIZED_PACKET_PATH: '',
        TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: '',
        TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: ''
      }
    });

    assert.notEqual(result.status, 0, result.stderr || result.stdout);
    const terminal = readJson(fixture.progressPath);
    assert.equal(terminal.actionId, 'domain-source-shimmer');
    assert.equal(terminal.status, 'failed');
    assert.equal(terminal.childStatusPath, fixture.progressPath);
    assert.match(terminal.message, /TERRAPEDIA_AUTHORIZED_PACKET_PATH/);
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

async function runPipeline(fixture, dependencies, overrides = {}) {
  const { runWikiShimmerExtractionPipeline } = await loadPipelineModule();
  assert.equal(typeof runWikiShimmerExtractionPipeline, 'function');
  return runWikiShimmerExtractionPipeline({
    apiUrl: 'https://example.test/zh/api.php',
    generatedAt: '2026-08-01T12:00:00.000Z',
    generationRoot: fixture.generationRoot,
    heartbeatIntervalMs: dependencies.heartbeatIntervalMs,
    itemsPath: fixture.itemsPath,
    npcsPath: fixture.npcsPath,
    pageTitle: 'Shimmer',
    pointerPath: fixture.pointerPath,
    producerCodeSha256: sha256('pipeline-test-producer'),
    progressPath: fixture.progressPath,
    reportPath: fixture.reportPath,
    repoRoot: fixture.tempDir,
    runId: 'pipeline-test',
    ...overrides
  }, {
    ...authorizedDependencies(fixture),
    ...dependencies
  });
}

async function loadPipelineModule() {
  // The legacy entrypoint executes spawnSync at import time. Stub it only until
  // the module becomes an import-safe in-process pipeline, so RED stays offline.
  childProcess.spawnSync = () => ({ status: 0 });
  syncBuiltinESMExports();
  try {
    return await import(`${pathToFileURL(pipelinePath).href}?pipeline-test=${Date.now()}-${Math.random()}`);
  } finally {
    childProcess.spawnSync = originalSpawnSync;
    syncBuiltinESMExports();
  }
}

function createFixture(label) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-shimmer-pipeline-${label}-`));
  const fixture = {
    tempDir,
    generationRoot: path.join(tempDir, 'data', 'generated', 'shimmer', 'generations'),
    itemsPath: path.join(tempDir, 'data', 'standardized', 'items.standardized.json'),
    npcsPath: path.join(tempDir, 'data', 'standardized', 'npcs.standardized.json'),
    pointerPath: path.join(tempDir, 'data', 'generated', 'shimmer', 'wiki-shimmer-current-generation.json'),
    progressPath: path.join(tempDir, 'data', 'generated', 'domain-source-shimmer-progress.latest.json'),
    reportPath: path.join(tempDir, 'reports', 'wiki-shimmer-summary.md')
  };
  writeJson(fixture.itemsPath, {
    records: [
      { name: 'Wood Sword', internalName: 'WoodSword' },
      { name: 'Platinum Sword', internalName: 'PlatinumSword' }
    ]
  });
  writeJson(fixture.npcsPath, {
    records: [{ name: 'Guide', internalName: 'Guide' }]
  });
  fixture.authorizationInputPath = path.join(
    tempDir,
    'reports',
    'authorization',
    'canonical',
    'canonical-shimmer-generation.input.json'
  );
  writeAuthorizationInputContract(fixture);
  return fixture;
}

function authorizedDependencies(fixture) {
  return {
    loadAuthorizationContext: ({ operationId }) => {
      assert.equal(operationId, 'canonical-shimmer-generation');
      return authorizationContext(fixture);
    },
    consumeDispatchPermit: ({ authorizedContext, decisionLedgerPath }) => {
      assert.equal(authorizedContext.operationId, 'canonical-shimmer-generation');
      assert.equal(
        decisionLedgerPath,
        path.join(fixture.tempDir, 'reports', 'authorization', 'canonical', 'used-decisions.json')
      );
      return true;
    }
  };
}

function authorizationContext(fixture, { inputContractPath = fixture.authorizationInputPath } = {}) {
  return {
    operationId: 'canonical-shimmer-generation',
    decisionIdentity: 'shimmer-generation-test-decision',
    packetHash: sha256('shimmer-generation-test-packet'),
    dataBundleSha256: hashOrderedBundleBytes([
      {
        path: path.relative(fixture.tempDir, inputContractPath).split(path.sep).join('/'),
        bytes: fs.readFileSync(inputContractPath)
      },
      {
        path: 'data/standardized/items.standardized.json',
        bytes: fs.readFileSync(fixture.itemsPath)
      },
      {
        path: 'data/standardized/npcs.standardized.json',
        bytes: fs.readFileSync(fixture.npcsPath)
      }
    ], 'shimmer generation data bundle')
  };
}

function writeAuthorizationInputContract(fixture, overrides = {}) {
  const base = {
    schemaVersion: 1,
    operationId: 'canonical-shimmer-generation',
    actionId: 'domain-source-shimmer',
    source: {
      pageTitle: 'Shimmer',
      apiUrl: 'https://example.test/zh/api.php'
    },
    canonicalProgressPath: 'data/generated/domain-source-shimmer-progress.latest.json',
    inputs: {
      items: {
        path: 'data/standardized/items.standardized.json',
        sha256: sha256(fs.readFileSync(fixture.itemsPath))
      },
      npcs: {
        path: 'data/standardized/npcs.standardized.json',
        sha256: sha256(fs.readFileSync(fixture.npcsPath))
      }
    },
    constraints: {
      rawRequests: 3,
      langlinkBatchSize: 8,
      maxLanglinkRequests: 1,
      maxRequests: 4
    }
  };
  const payload = {
    ...base,
    ...overrides,
    source: { ...base.source, ...overrides.source },
    inputs: { ...base.inputs, ...overrides.inputs },
    constraints: { ...base.constraints, ...overrides.constraints }
  };
  writeJson(fixture.authorizationInputPath, payload);
}

function rawFixture() {
  const tables = SHIMMER_TABLE_ROLE_SEQUENCE.map((role, index) => {
    if (index === 0) {
      return table(role.label, [[anchor('Wood Sword'), anchor('Platinum Sword'), '']]);
    }
    if (index === SHIMMER_TABLE_ROLE_SEQUENCE.length - 1) {
      return table(role.label, [[anchor('Guide'), anchor('Shimmered Guide')]]);
    }
    return table(role.label, []);
  });
  return {
    entity: 'wiki_shimmer_page',
    pageTitle: 'Shimmer',
    pageId: 4242,
    revisionId: 99,
    revisionTimestamp: '2026-08-01T00:00:00.000Z',
    html: tables.join('\n')
  };
}

function langlinkEvidence(titles) {
  return {
    entity: 'wiki_shimmer_langlink_evidence',
    requestedTitles: titles,
    records: titles.map((requestedTitle) => ({
      requestedTitle,
      resolvedTitle: requestedTitle,
      redirectSource: null,
      nameEn: requestedTitle,
      pageId: 1,
      revisionId: 1,
      status: 'resolved',
      responseSha256: sha256(`response:${requestedTitle}`)
    })),
    summary: { total: titles.length, resolved: titles.length, unresolved: 0 },
    responseSha256: sha256(JSON.stringify(titles))
  };
}

function expectedTitles() {
  return ['Wood Sword', 'Platinum Sword', 'Guide']
    .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function table(caption, rows) {
  const body = rows
    .map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('');
  return `<table><caption>${caption}</caption><tr><th>input</th><th>output</th></tr>${body}</table>`;
}

function anchor(title) {
  return `<a href="/wiki/${encodeURIComponent(title)}" title="${title}">${title}</a>`;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function uniqueInOrder(values) {
  return [...new Set(values)];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
