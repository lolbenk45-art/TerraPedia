import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  resolveCanonicalOperationTechnicalInput,
} from './build-canonical-cutover-authorization.mjs';
import {
  buildCanonicalOperationExecutionManifest,
  writeCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';
import {
  buildItemSourceLocalNpcAdmissionAttemptPaths,
  buildItemSourceLocalNpcAdmissionInputContract,
} from '../relation/item-source-local-npc-admission-contract.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const HASH = `sha256:${'a'.repeat(64)}`;

test('Item-source local NPC admission authorization binds its frozen proposal and every source snapshot', () => {
  const decisionIdentity = 'owner-item-source-local-npc-bundle-test-01';
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(decisionIdentity);
  const sourceRoot = `${paths.attemptRoot}/source-freeze`;
  const partitionPath = `${sourceRoot}/partition.json`;
  const normalizedPath = `${sourceRoot}/dryad.normalized.json`;
  const auditPath = `${sourceRoot}/dryad.audit.json`;
  const proposal = createProposal({ partitionPath, normalizedPath, auditPath });
  const proposalBytes = Buffer.from(`${JSON.stringify(proposal)}\n`);
  const input = buildItemSourceLocalNpcAdmissionInputContract({
    proposal,
    proposalPath: paths.proposalPath,
    proposalSha256: sha256(proposalBytes),
    decisionIdentity,
  });
  const attemptDirectory = path.join(repoRoot, paths.attemptRoot);
  fs.mkdirSync(attemptDirectory, { recursive: true });
  write(paths.proposalPath, proposalBytes);
  write(paths.inputPath, Buffer.from(`${JSON.stringify(input)}\n`));
  write(partitionPath, Buffer.from('{"partition":true}\n'));
  write(normalizedPath, Buffer.from('{"normalized":true}\n'));
  write(auditPath, Buffer.from('{"audit":true}\n'));
  overwriteSourceHashes({ proposal, partitionPath, normalizedPath, auditPath });
  write(paths.proposalPath, Buffer.from(`${JSON.stringify(proposal)}\n`));
  const rebuiltInput = buildItemSourceLocalNpcAdmissionInputContract({
    proposal,
    proposalPath: paths.proposalPath,
    proposalSha256: sha256(fs.readFileSync(path.join(repoRoot, paths.proposalPath))),
    decisionIdentity,
  });
  write(paths.inputPath, Buffer.from(`${JSON.stringify(rebuiltInput)}\n`));
  try {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-item-source-local-npc-admission',
      artifactDate: '2026-08-25',
      itemSourceLocalNpcAdmissionAttemptRoot: paths.attemptRoot,
    });
    const technical = resolveCanonicalOperationTechnicalInput({
      repoRoot,
      operationId: 'canonical-item-source-local-npc-admission',
      executionManifest: manifest,
    });

    assert.deepEqual(technical.dataEntries.map((entry) => entry.path), [
      paths.inputPath,
      paths.proposalPath,
      partitionPath,
      normalizedPath,
      auditPath,
    ]);
    fs.appendFileSync(path.join(repoRoot, auditPath), ' ');
    assert.throws(
      () => resolveCanonicalOperationTechnicalInput({
        repoRoot,
        operationId: 'canonical-item-source-local-npc-admission',
        executionManifest: manifest,
      }),
      /audit.*hash|source.*hash|bundle.*drift/i,
    );
  } finally {
    fs.rmSync(attemptDirectory, { recursive: true, force: true });
  }
});

test('Item-source admission authorization CLI uses its exact attempt paths and refuses overwrites', () => {
  const fixture = createItemSourceAdmissionCliFixture();
  try {
    const request = runItemSourceAdmissionAuthorizationCli(fixture, {
      mode: 'request', output: fixture.paths.requestPath,
    });
    assert.equal(request.authorizationStatus, 'AWAITING_OWNER');
    assert.equal(
      fs.statSync(path.join(fixture.repoRoot, fixture.paths.requestPath)).mode & 0o777,
      0o600,
    );
    assert.throws(
      () => runItemSourceAdmissionAuthorizationCli(fixture, {
        mode: 'request', output: fixture.paths.requestPath,
      }),
      /Command failed/,
    );
    const crossAttemptOutput = 'reports/authorization/canonical/item-source-admission-escape.request.json';
    assert.throws(
      () => runItemSourceAdmissionAuthorizationCli(fixture, {
        mode: 'request', output: crossAttemptOutput,
      }),
      /Command failed/,
    );
    assert.equal(fs.existsSync(path.join(fixture.repoRoot, crossAttemptOutput)), false);

    fixture.write('owner-input.json', {
      actor: 'admin',
      reason: 'Apply the exact Item-source local NPC admission proposal.',
      authorizationReference: 'decision://item-source-local-npc/2099-01-01',
      decisionIdentity: fixture.decisionIdentity,
      authorizedAt: '2026-08-25T01:00:00.000Z',
    });
    fixture.write('used-decisions.json', []);
    const packet = runItemSourceAdmissionAuthorizationCli(fixture, {
      mode: 'authorize', output: fixture.paths.packetPath,
    });
    assert.equal(packet.authorizationStatus, 'AUTHORIZED');
    assert.equal(
      fs.statSync(path.join(fixture.repoRoot, fixture.paths.packetPath)).mode & 0o777,
      0o600,
    );
    assert.throws(
      () => runItemSourceAdmissionAuthorizationCli(fixture, {
        mode: 'authorize', output: fixture.paths.packetPath,
      }),
      /Command failed/,
    );
  } finally {
    fixture.cleanup();
  }
});

function createItemSourceAdmissionCliFixture() {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-item-source-admission-authorization-'));
  fs.cpSync(path.join(sourceRoot, 'pipelines'), path.join(fixtureRoot, 'pipelines'), { recursive: true });
  const decisionIdentity = 'owner-item-source-local-npc-cli-test-01';
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(decisionIdentity);
  const write = (relativePath, value, { mode = 0o600 } = {}) => {
    const output = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    const bytes = Buffer.isBuffer(value)
      ? value
      : Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    fs.writeFileSync(output, bytes, { mode });
    fs.chmodSync(output, mode);
    return bytes;
  };
  const sourceRootPath = `${paths.attemptRoot}/source-freeze`;
  const partitionPath = `${sourceRootPath}/partition.json`;
  const normalizedPath = `${sourceRootPath}/dryad.normalized.json`;
  const auditPath = `${sourceRootPath}/dryad.audit.json`;
  const partitionBytes = write(partitionPath, { partition: true }, { mode: 0o644 });
  const normalizedBytes = write(normalizedPath, { normalized: true }, { mode: 0o644 });
  const auditBytes = write(auditPath, { audit: true }, { mode: 0o644 });
  const proposal = createProposal({ partitionPath, normalizedPath, auditPath });
  proposal.sourceFreeze.partition.sha256 = sha256(partitionBytes);
  proposal.sourceFreeze.snapshotPairs[0].normalizedSha256 = sha256(normalizedBytes);
  proposal.sourceFreeze.snapshotPairs[0].auditSha256 = sha256(auditBytes);
  const proposalBytes = write(paths.proposalPath, proposal);
  const input = buildItemSourceLocalNpcAdmissionInputContract({
    proposal,
    proposalPath: paths.proposalPath,
    proposalSha256: sha256(proposalBytes),
    decisionIdentity,
  });
  write(paths.inputPath, input);
  writeCanonicalOperationExecutionManifest({
    repoRoot: fixtureRoot,
    operationId: 'canonical-item-source-local-npc-admission',
    artifactDate: '2026-08-25',
    itemSourceLocalNpcAdmissionAttemptRoot: paths.attemptRoot,
    outputPath: path.join(fixtureRoot, paths.manifestPath),
  });
  return {
    repoRoot: fixtureRoot,
    paths,
    decisionIdentity,
    write,
    cleanup: () => fs.rmSync(fixtureRoot, { recursive: true, force: true }),
  };
}

function runItemSourceAdmissionAuthorizationCli(fixture, { mode, output }) {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const script = path.join(sourceRoot, 'pipelines/automation/build-canonical-cutover-authorization.mjs');
  const serverFingerprint = {
    host: '127.0.0.1',
    port: 13306,
    serverUuid: 'item-source-admission-authorization-server',
    databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
  };
  fixture.write('server-fingerprint.json', serverFingerprint);
  fixture.write('policy-rows.json', [{
    domainId: 'items', policyVersion: 1, policyHash: HASH,
  }]);
  const args = [
    script,
    `--mode=${mode}`,
    `--repo-root=${fixture.repoRoot}`,
    '--operation-id=canonical-item-source-local-npc-admission',
    `--server-fingerprint=${path.join(fixture.repoRoot, 'server-fingerprint.json')}`,
    `--policy-rows=${path.join(fixture.repoRoot, 'policy-rows.json')}`,
    `--execution-manifest=${fixture.paths.manifestPath}`,
    `--output=${output}`,
  ];
  if (mode === 'request') {
    args.push('--generated-at=2026-08-25T00:00:00.000Z', '--expires-at=2026-08-26T00:00:00.000Z');
  } else {
    const request = JSON.parse(fs.readFileSync(path.join(fixture.repoRoot, fixture.paths.requestPath), 'utf8'));
    args.push(
      `--request=${fixture.paths.requestPath}`,
      `--request-hash=${request.requestHash}`,
      '--owner-input=owner-input.json',
      '--used-decisions=used-decisions.json',
    );
  }
  return JSON.parse(execFileSync(process.execPath, args, {
    cwd: fixture.repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

function createProposal({ partitionPath, normalizedPath, auditPath }) {
  return {
    schemaVersion: 'item-source-local-npc-admission-proposal-v1',
    operationId: 'canonical-item-source-local-npc-admission',
    readOnly: true,
    authorizationAllowed: true,
    databaseFingerprint: {
      host: '127.0.0.1', port: 13306, serverUuid: 'bundle-test',
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    sourceFreeze: {
      partition: { path: partitionPath, sha256: HASH, scopeHash: HASH, candidateCount: 1 },
      snapshotPairs: [{
        entityId: 'dryad', normalizedPath, normalizedSha256: HASH, auditPath, auditSha256: HASH,
      }],
    },
    selectedIdentityHash: HASH,
    tableBeforeFingerprints: { 'terria_v1_local.item_acquisition_sources': HASH },
    beforeFingerprint: HASH,
    afterFingerprint: HASH,
    scopeHash: HASH,
    changedRowCount: 16,
    summary: { accepted: 1, blocked: 0, unclassified: 0, localSourceReconciliation: 9 },
  };
}

function overwriteSourceHashes({ proposal, partitionPath, normalizedPath, auditPath }) {
  const partitionSha256 = sha256(fs.readFileSync(path.join(repoRoot, partitionPath)));
  const normalizedSha256 = sha256(fs.readFileSync(path.join(repoRoot, normalizedPath)));
  const auditSha256 = sha256(fs.readFileSync(path.join(repoRoot, auditPath)));
  proposal.sourceFreeze.partition.sha256 = partitionSha256;
  proposal.sourceFreeze.snapshotPairs[0].normalizedSha256 = normalizedSha256;
  proposal.sourceFreeze.snapshotPairs[0].auditSha256 = auditSha256;
}

function write(relativePath, bytes) {
  const output = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, bytes, { mode: 0o600 });
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
