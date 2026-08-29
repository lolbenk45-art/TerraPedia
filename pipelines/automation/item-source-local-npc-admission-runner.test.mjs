import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  runExecutionManifestCommand,
} from './run-authorized-canonical-operation.mjs';

test('Item-source admission runner rejects a non-completed terminal result even when the command exits successfully', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-item-source-runner-'));
  const attemptRoot = `reports/authorization/canonical/canonical-item-source-local-npc-admission/${'a'.repeat(64)}`;
  const resultPath = `${attemptRoot}/result.json`;
  const output = path.join(repoRoot, resultPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({
    resultKind: 'item_source_local_npc_admission_result',
    operationId: 'canonical-item-source-local-npc-admission',
    status: 'failed',
    apply: true,
    attemptId: 'a'.repeat(64),
    attemptRoot,
  }), { mode: 0o600 });

  try {
    await assert.rejects(
      runExecutionManifestCommand({
        cwd: repoRoot,
        manifest: manifest(attemptRoot),
        authorizationPacketPath: path.join(repoRoot, `${attemptRoot}/packet.json`),
        authorizationDispatchPermit: {
          path: path.join(repoRoot, `${attemptRoot}/permit.json`),
          nonce: 'test-nonce',
        },
        spawnImpl: async () => ({ exitCode: 0 }),
      }),
      /completed/i,
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('Item-source admission runner accepts the canonicalized attempt object carried by an authorization packet', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-item-source-runner-'));
  const attemptRoot = `reports/authorization/canonical/canonical-item-source-local-npc-admission/${'b'.repeat(64)}`;
  const resultPath = `${attemptRoot}/result.json`;
  const output = path.join(repoRoot, resultPath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({
    resultKind: 'item_source_local_npc_admission_result',
    operationId: 'canonical-item-source-local-npc-admission',
    status: 'completed',
    apply: true,
    attemptId: 'b'.repeat(64),
    attemptRoot,
    changedRowCount: 16,
    insertedCounts: {},
    reconciledCount: 9,
  }), { mode: 0o600 });

  try {
    await runExecutionManifestCommand({
      cwd: repoRoot,
      manifest: stableValue(manifest(attemptRoot)),
      authorizationPacketPath: path.join(repoRoot, `${attemptRoot}/packet.json`),
      authorizationDispatchPermit: {
        path: path.join(repoRoot, `${attemptRoot}/permit.json`),
        nonce: 'test-nonce',
      },
      spawnImpl: async () => ({ exitCode: 0 }),
    });
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

function manifest(attemptRoot) {
  const inputPath = `${attemptRoot}/input.json`;
  const resultPath = `${attemptRoot}/result.json`;
  return {
    operationId: 'canonical-item-source-local-npc-admission',
    command: [
      'node',
      'pipelines/relation/apply-item-source-local-npc-admission.mjs',
      `--input-contract=${inputPath}`,
      '--apply=true',
      `--output=${resultPath}`,
    ],
    inputPaths: [inputPath],
    outputPaths: [resultPath],
    itemSourceLocalNpcAdmissionAttempt: {
      attemptId: attemptRoot.split('/').at(-1),
      attemptRoot,
      proposalPath: `${attemptRoot}/proposal.json`,
      inputPath,
      manifestPath: `${attemptRoot}/execution-manifest.json`,
      requestPath: `${attemptRoot}/request.json`,
      packetPath: `${attemptRoot}/packet.json`,
      permitPath: `${attemptRoot}/permit.json`,
      resultPath,
    },
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}
