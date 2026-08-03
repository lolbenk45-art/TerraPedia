import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeCanonicalCutoverRequest,
  buildCanonicalAuthorizationRequest,
} from './build-canonical-cutover-authorization.mjs';
import {
  assertExecutionManifestDispatchPreflight,
  consumeDecisionIdentityFile,
  runExecutionManifestCommand,
  runAuthorizedCanonicalOperation,
  runAuthorizedCanonicalOperationsIndependently,
} from './run-authorized-canonical-operation.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HASH = `sha256:${'a'.repeat(64)}`;

function technicalInput(operationId = 'canonical-image-sync') {
  return {
    operationId,
    targetDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    serverFingerprint: {
      host: '127.0.0.1',
      port: 13306,
      serverUuid: 'server-uuid',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    schemaEntries: [],
    dataEntries: [{ path: 'data/frozen/input.json', bytes: '{}' }],
    policyRows: [{ domainId: 'biomes', policyVersion: 1, policyHash: HASH }],
    executionManifest: {
      schemaVersion: 1,
      command: ['node', 'scripts/data/workflow/run-image-sync.mjs', '--apply=true'],
      outputPaths: ['reports/workflow-image-sync-frozen.json'],
      progressPath: 'data/generated/wiki-sync-progress.latest.json',
    },
    requiredTechnicalFields: [
      'serverFingerprint',
      'schemaBundleSha256',
      'dataBundleSha256',
      'policySetHash',
      'executionManifestHash',
    ],
  };
}

function authorizedJob(operationId, decisionIdentity) {
  const currentTechnicalInput = technicalInput(operationId);
  const request = buildCanonicalAuthorizationRequest({
    ...currentTechnicalInput,
    generatedAt: '2026-07-28T00:00:00.000Z',
    expiresAt: '2026-07-29T00:00:00.000Z',
  });
  const packet = authorizeCanonicalCutoverRequest({
    request,
    requestHash: request.requestHash,
    actor: 'owner',
    reason: `approve ${operationId}`,
    authorizationReference: `decision://${operationId}`,
    decisionIdentity,
    authorizedAt: '2026-07-28T00:10:00.000Z',
    currentTechnicalInput,
  });
  return { packet, currentTechnicalInput };
}

test('runner revalidates current identity and consumes the decision before dispatch', async () => {
  const usedDecisionIdentities = new Set();
  const job = authorizedJob('canonical-image-sync', 'image-sync-1');
  let observedConsumed = false;

  const result = await runAuthorizedCanonicalOperation({
    ...job,
    usedDecisionIdentities,
    now: '2026-07-28T01:00:00.000Z',
    dispatchers: {
      'canonical-image-sync': async () => {
        observedConsumed = usedDecisionIdentities.has('image-sync-1');
        return { applied: true };
      },
    },
  });

  assert.equal(observedConsumed, true);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.result, { applied: true });
  await assert.rejects(() => runAuthorizedCanonicalOperation({
    ...job,
    usedDecisionIdentities,
    now: '2026-07-28T01:01:00.000Z',
    dispatchers: { 'canonical-image-sync': async () => ({}) },
  }), /decision identity.*already used/i);
});

test('runner rejects technical drift before dispatch', async () => {
  const job = authorizedJob('canonical-image-sync', 'image-sync-2');
  let dispatched = false;

  await assert.rejects(() => runAuthorizedCanonicalOperation({
    ...job,
    currentTechnicalInput: {
      ...job.currentTechnicalInput,
      dataEntries: [{ path: 'data/frozen/input.json', bytes: '{"changed":true}' }],
    },
    usedDecisionIdentities: new Set(),
    now: '2026-07-28T01:00:00.000Z',
    dispatchers: {
      'canonical-image-sync': async () => { dispatched = true; },
    },
  }), /data bundle.*drift/i);
  assert.equal(dispatched, false);
});

test('runner supports durable decision consumption immediately before dispatch', async () => {
  const job = authorizedJob('canonical-image-sync', 'image-sync-durable');
  let consumed = false;
  let dispatchedAfterConsume = false;
  await runAuthorizedCanonicalOperation({
    ...job,
    usedDecisionIdentities: new Set(),
    now: '2026-07-28T01:00:00.000Z',
    consumeDecisionIdentity: async (identity) => {
      assert.equal(identity, 'image-sync-durable');
      consumed = true;
    },
    dispatchers: {
      'canonical-image-sync': async () => {
        dispatchedAfterConsume = consumed;
        return {};
      },
    },
  });
  assert.equal(dispatchedAfterConsume, true);
});

test('runner dispatch preflight rejects before consuming a decision or dispatching', async () => {
  const job = authorizedJob('canonical-image-sync', 'image-sync-preflight');
  let consumed = false;
  let dispatched = false;

  await assert.rejects(() => runAuthorizedCanonicalOperation({
    ...job,
    usedDecisionIdentities: new Set(),
    now: '2026-07-28T01:00:00.000Z',
    preflight: () => {
      throw new Error('declared output has a symbolic-link ancestor');
    },
    consumeDecisionIdentity: () => {
      consumed = true;
    },
    dispatchers: {
      'canonical-image-sync': async () => {
        dispatched = true;
      },
    },
  }), /symbolic-link ancestor/i);

  assert.equal(consumed, false);
  assert.equal(dispatched, false);
});

test('runner dispatch preflight safely prepares missing output parents without creating outputs', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outputPaths = [
    'data/wiki-crawler/normalized-light/npc',
    'data/wiki-crawler/canonical/npc',
    'data/wiki-crawler/audit/npc',
  ];

  try {
    fs.mkdirSync(path.join(repoRoot, 'data', 'wiki-crawler'), { recursive: true });

    assert.doesNotThrow(() => assertExecutionManifestDispatchPreflight({
      cwd: repoRoot,
      manifest: {
        command: ['node', 'scripts/data/npc-canonical/npc-crawler-fact-action.mjs'],
        outputPaths,
      },
    }));

    for (const outputPath of outputPaths) {
      assert.equal(fs.existsSync(path.join(repoRoot, outputPath)), false);
      assert.equal(fs.lstatSync(path.dirname(path.join(repoRoot, outputPath))).isDirectory(), true);
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('runner dispatch preflight rejects a canonical result directory before decision consumption or dispatch', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outputPath = 'reports/authorization/canonical/canonical-image-sync.result.json';
  const output = path.join(repoRoot, outputPath);
  const job = authorizedJob('canonical-image-sync', 'image-sync-result-directory');
  let consumed = false;
  let dispatches = 0;

  try {
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'sentinel.txt'), 'not a result file\n');

    await assert.rejects(() => runAuthorizedCanonicalOperation({
      ...job,
      usedDecisionIdentities: new Set(),
      now: '2026-07-28T01:00:00.000Z',
      preflight: () => assertExecutionManifestDispatchPreflight({
        cwd: repoRoot,
        manifest: {
          command: ['node', 'scripts/data/workflow/run-image-sync.mjs'],
          outputPaths: [outputPath],
        },
      }),
      consumeDecisionIdentity: () => {
        consumed = true;
      },
      dispatchers: {
        'canonical-image-sync': async () => {
          dispatches += 1;
        },
      },
    }), /canonical result.*ordinary file/i);

    assert.equal(consumed, false);
    assert.equal(dispatches, 0);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('independent coordinator keeps a failed lane closed and continues eligible lanes', async () => {
  const first = authorizedJob('canonical-image-sync', 'image-sync-3');
  const second = authorizedJob('canonical-boss-import', 'boss-import-1');
  const usedDecisionIdentities = new Set();

  const results = await runAuthorizedCanonicalOperationsIndependently({
    jobs: [first, second],
    usedDecisionIdentities,
    now: '2026-07-28T01:00:00.000Z',
    dispatchers: {
      'canonical-image-sync': async () => { throw new Error('image sync failed'); },
      'canonical-boss-import': async () => ({ imported: 5 }),
    },
  });

  assert.deepEqual(results.map((entry) => [entry.operationId, entry.status]), [
    ['canonical-image-sync', 'failed'],
    ['canonical-boss-import', 'completed'],
  ]);
  assert.match(results[0].error, /image sync failed/);
  assert.deepEqual(results[1].result, { imported: 5 });
  assert.deepEqual([...usedDecisionIdentities].sort(), ['boss-import-1', 'image-sync-3']);
});

test('durable decision ledger atomically records one-time use and rejects reuse', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-decision-ledger-'));
  const ledgerPath = path.join(dir, 'used-decisions.json');
  consumeDecisionIdentityFile({ ledgerPath, decisionIdentity: 'decision-1' });
  assert.deepEqual(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')), ['decision-1']);
  assert.throws(
    () => consumeDecisionIdentityFile({ ledgerPath, decisionIdentity: 'decision-1' }),
    /already used/i,
  );
});

test('durable decision ledger binds a wrapper dispatch permit to one consumed identity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-decision-ledger-'));
  const ledgerPath = path.join(dir, 'used-decisions.json');
  const dispatchPermitHash = `sha256:${'d'.repeat(64)}`;
  consumeDecisionIdentityFile({
    ledgerPath,
    decisionIdentity: 'decision-with-dispatch-permit',
    dispatchPermitHash,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')), [{
    decisionIdentity: 'decision-with-dispatch-permit',
    dispatchPermitHash,
  }]);
  assert.throws(
    () => consumeDecisionIdentityFile({
      ledgerPath,
      decisionIdentity: 'decision-with-dispatch-permit',
      dispatchPermitHash,
    }),
    /already used/i,
  );
});

test('manifest command dispatch uses no shell and rejects credential-shaped arguments', async () => {
  let observed;
  const result = await runExecutionManifestCommand({
    cwd: '/tmp/worktree',
    authorizationPacketPath: '/tmp/private/packet.json',
    authorizationDispatchPermit: {
      path: '/tmp/private/dispatch-permit.json',
      nonce: 'dispatch-nonce',
    },
    manifest: {
      command: ['node', 'scripts/data/fetch/example.mjs', '--limit=10'],
    },
    spawnImpl: async (command, args, options) => {
      observed = { command, args, options };
      return { exitCode: 0 };
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(observed.command, 'node');
  assert.deepEqual(observed.args, ['scripts/data/fetch/example.mjs', '--limit=10']);
  assert.equal(observed.options.cwd, '/tmp/worktree');
  assert.equal(observed.options.shell, false);
  assert.equal(observed.options.env.TERRAPEDIA_AUTHORIZED_PACKET_PATH, '/tmp/private/packet.json');
  assert.equal(observed.options.env.TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH, '/tmp/private/dispatch-permit.json');
  assert.equal(observed.options.env.TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE, 'dispatch-nonce');
  await assert.rejects(() => runExecutionManifestCommand({
    cwd: '/tmp/worktree',
    manifest: { command: ['node', 'script.mjs', '--password=secret'] },
    spawnImpl: async () => ({ exitCode: 0 }),
  }), /credential-shaped/i);
});

test('manifest command rejects a successful process when its declared result is empty', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outputPath = 'reports/authorization/canonical/example.result.json';
  const output = path.join(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '', { mode: 0o600 });

  await assert.rejects(() => runExecutionManifestCommand({
    cwd: repoRoot,
    manifest: {
      operationId: 'example',
      command: ['node', 'scripts/data/example.mjs'],
      outputPaths: [outputPath],
      databaseWrites: true,
    },
    spawnImpl: async () => ({ exitCode: 0 }),
  }), /declared output.*empty/i);
});

test('manifest command rejects a canonical result that is not private', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outputPath = 'reports/authorization/canonical/example.result.json';
  const output = path.join(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '{"operationId":"example","status":"COMPLETED"}\n', { mode: 0o644 });
  fs.chmodSync(output, 0o644);

  await assert.rejects(() => runExecutionManifestCommand({
    cwd: repoRoot,
    manifest: {
      operationId: 'example',
      command: ['node', 'scripts/data/example.mjs'],
      outputPaths: [outputPath],
    },
    spawnImpl: async () => ({ exitCode: 0 }),
  }), /canonical result.*private/i);
});

test('manifest command rejects a canonical result that is not valid JSON', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outputPath = 'reports/authorization/canonical/example.result.json';
  const output = path.join(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '{', { mode: 0o600 });

  await assert.rejects(() => runExecutionManifestCommand({
    cwd: repoRoot,
    manifest: {
      operationId: 'example',
      command: ['node', 'scripts/data/example.mjs'],
      outputPaths: [outputPath],
    },
    spawnImpl: async () => ({ exitCode: 0 }),
  }), /canonical result.*valid JSON/i);
});

test('manifest command rejects a canonical result for another operation', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outputPath = 'reports/authorization/canonical/example.result.json';
  const output = path.join(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '{"operationId":"other-operation","status":"COMPLETED"}\n', { mode: 0o600 });

  await assert.rejects(() => runExecutionManifestCommand({
    cwd: repoRoot,
    manifest: {
      operationId: 'example',
      command: ['node', 'scripts/data/example.mjs'],
      outputPaths: [outputPath],
    },
    spawnImpl: async () => ({ exitCode: 0 }),
  }), /canonical result.*operationId/i);
});

test('manifest command rejects failed and dry-run canonical result outputs', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outputPath = 'reports/authorization/canonical/canonical-shimmer-import.result.json';
  const output = path.join(repoRoot, outputPath);
  const manifest = {
    operationId: 'canonical-shimmer-import',
    command: ['node', 'scripts/data/import/import-wiki-shimmer-to-db.mjs', '--apply=true'],
    outputPaths: [outputPath],
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });

  for (const [result, error] of [
    [{ operationId: 'canonical-shimmer-import', status: 'failed', apply: true }, /status.*completed/i],
    [{ operationId: 'canonical-shimmer-import', status: 'completed', apply: false }, /apply.*true/i],
  ]) {
    fs.writeFileSync(output, `${JSON.stringify(result)}\n`, { mode: 0o600 });
    fs.chmodSync(output, 0o600);
    await assert.rejects(
      runExecutionManifestCommand({
        cwd: repoRoot,
        manifest,
        spawnImpl: async () => ({ exitCode: 0 }),
      }),
      error,
    );
  }
});

test('manifest command rejects a matching canonical result that is not completed and applied', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outputPath = 'reports/authorization/canonical/canonical-shimmer-import.result.json';
  const output = path.join(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '{"operationId":"canonical-shimmer-import","status":"failed","apply":false}\n', { mode: 0o600 });
  fs.chmodSync(output, 0o600);

  await assert.rejects(() => runExecutionManifestCommand({
    cwd: repoRoot,
    manifest: {
      operationId: 'canonical-shimmer-import',
      command: ['node', 'scripts/data/import/import-wiki-shimmer-to-db.mjs', '--apply=true'],
      outputPaths: [outputPath],
      databaseWrites: true,
    },
    spawnImpl: async () => ({ exitCode: 0 }),
  }), /completed|applied/i);
});

test('manifest command accepts the established result shape for another database-writing operation', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outputPath = 'reports/authorization/canonical/canonical-npc-base-maint-nontown-apply.result.json';
  const output = path.join(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({
    operationId: 'canonical-npc-base-maint-nontown-apply',
    status: 'COMPLETED',
  }), { mode: 0o600 });
  fs.chmodSync(output, 0o600);

  await runExecutionManifestCommand({
    cwd: repoRoot,
    manifest: {
      operationId: 'canonical-npc-base-maint-nontown-apply',
      command: ['node', 'scripts/data/npc-canonical/npc-base-maint-apply.mjs'],
      outputPaths: [outputPath],
      databaseWrites: true,
    },
    spawnImpl: async () => ({ exitCode: 0 }),
  });
});

test('manifest command rejects a canonical result beneath an ancestor symlink outside its cwd', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-outside-'));
  try {
    const outputPath = 'reports/authorization/canonical/example.result.json';
    const canonicalDirectory = path.join(repoRoot, 'reports/authorization/canonical');
    const outsideCanonicalDirectory = path.join(outsideRoot, 'canonical');
    fs.mkdirSync(path.dirname(canonicalDirectory), { recursive: true });
    fs.mkdirSync(outsideCanonicalDirectory, { recursive: true });
    fs.symlinkSync(outsideCanonicalDirectory, canonicalDirectory, 'dir');
    const output = path.join(outsideCanonicalDirectory, 'example.result.json');
    fs.writeFileSync(output, '{"operationId":"example","status":"completed","apply":true}\n', { mode: 0o600 });
    fs.chmodSync(output, 0o600);

    let spawnCalls = 0;
    await assert.rejects(() => runExecutionManifestCommand({
      cwd: repoRoot,
      manifest: {
        operationId: 'example',
        command: ['node', 'scripts/data/example.mjs'],
        outputPaths: [outputPath],
        databaseWrites: true,
      },
      spawnImpl: async () => {
        spawnCalls += 1;
        return { exitCode: 0 };
      },
    }), /inside.*repository|ancestor|symbolic/i);
    assert.equal(spawnCalls, 0, 'unsafe output ancestry must reject before dispatch');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('manifest command rejects a symbolic-link output endpoint before dispatch', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-outside-'));
  try {
    const outputPath = 'reports/authorization/canonical/example.result.json';
    const output = path.join(repoRoot, outputPath);
    const outsideOutput = path.join(outsideRoot, 'example.result.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(outsideOutput, '{"operationId":"example","status":"completed","apply":true}\n', { mode: 0o600 });
    fs.chmodSync(outsideOutput, 0o600);
    fs.symlinkSync(outsideOutput, output);

    let spawnCalls = 0;
    await assert.rejects(() => runExecutionManifestCommand({
      cwd: repoRoot,
      manifest: {
        operationId: 'example',
        command: ['node', 'scripts/data/example.mjs'],
        outputPaths: [outputPath],
        databaseWrites: true,
      },
      spawnImpl: async () => {
        spawnCalls += 1;
        return { exitCode: 0 };
      },
    }), /ordinary|symbolic/i);
    assert.equal(spawnCalls, 0, 'symbolic-link output must reject before dispatch');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('manifest command rejects a dangling symbolic-link output endpoint before dispatch', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-authorized-output-outside-'));
  try {
    const outputPath = 'reports/authorization/canonical/example.result.json';
    const output = path.join(repoRoot, outputPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.symlinkSync(path.join(outsideRoot, 'missing.result.json'), output);

    let spawnCalls = 0;
    await assert.rejects(() => runExecutionManifestCommand({
      cwd: repoRoot,
      manifest: {
        operationId: 'example',
        command: ['node', 'scripts/data/example.mjs'],
        outputPaths: [outputPath],
        databaseWrites: true,
      },
      spawnImpl: async () => {
        spawnCalls += 1;
        return { exitCode: 0 };
      },
    }), /ordinary|symbolic/i);
    assert.equal(spawnCalls, 0, 'dangling symbolic-link output must reject before dispatch');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});
