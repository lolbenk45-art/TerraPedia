import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { computePolicySetHash } from './policy-set-hash.mjs';
import { hashCanonicalServerFingerprint } from './automation-database-contract.mjs';

const HASH = (character) => `sha256:${character.repeat(64)}`;
const SERVER = { host: '127.0.0.1', port: 13306, serverUuid: 'server-1', databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'] };
const ROWS = [
  { domainId: 'items', policyVersion: 2, policyHash: HASH('a'), currentLevel: 'L2', operationalState: 'ACTIVE' },
  { domainId: 'npcs', policyVersion: 2, policyHash: HASH('b'), currentLevel: 'L2', operationalState: 'ACTIVE' },
];
const H8 = computePolicySetHash(ROWS);
const INPUT = {
  schemaVersion: 1, operationId: 'automation-items-l2-reauthorization', databaseName: 'terria_v1_local',
  domainId: 'items', reauthorization: true,
  currentPolicy: { domainId: 'items', policyVersion: 2, policyHash: HASH('a'), level: 'L2', operationalState: 'ACTIVE', policySetHash: H8 },
  targetPolicy: { domainId: 'items', policyVersion: 2, policyHash: HASH('a'), level: 'L2', operationalState: 'ACTIVE', policySetHash: H8 },
  predecessorL1Evidence: { policyVersion: 1, policyHash: HASH('d'), policySetHash: HASH('e'), minimumSuccessfulL1Runs: 3, fullReconciliation: true },
  priorDecision: { decisionKind: 'L2_PROMOTION', decisionIdentity: 'items-old', packetHash: HASH('c'), policySetHash: HASH('e'), expiresAt: '2026-09-01T00:00:00.000Z' },
};

test('proposal binds current L2 as both current and target and declares no policy update', async () => {
  const { buildL2PolicyStableReauthorizationProposal, assertProposal } = await import(
    './build-l2-policy-stable-reauthorization-proposal.mjs'
  );
  const proposal = buildL2PolicyStableReauthorizationProposal({
    input: INPUT, policyRows: ROWS, serverFingerprint: SERVER,
    generatedAt: '2026-09-12T00:00:00.000Z',
  });
  assert.equal(proposal.proposalOnly, true);
  assert.equal(proposal.databaseWrites, false);
  assert.equal(proposal.policyUpdate, false);
  assert.deepEqual(proposal.currentPolicy, proposal.targetPolicy);
  assert.equal(proposal.currentPolicySetHash, H8);
  assert.equal(proposal.forbidden.includes('policy-update'), true);
  assert.match(proposal.serverFingerprintHash, /^sha256:/);
  assert.doesNotThrow(() => assertProposal(proposal));
});

test('proposal writer requires a content-addressed confined path and refuses overwrite', async () => {
  const { buildL2PolicyStableReauthorizationProposal, writeL2PolicyStableReauthorizationProposal } = await import(
    './build-l2-policy-stable-reauthorization-proposal.mjs'
  );
  const proposal = buildL2PolicyStableReauthorizationProposal({ input: INPUT, policyRows: ROWS, serverFingerprint: SERVER });
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-reauth-proposal-'));
  try {
    assert.throws(() => writeL2PolicyStableReauthorizationProposal({
      repoRoot, proposal, outputPath: 'reports/runtime/proposal.json',
    }), /authorization|content-addressed/i);
    const outputPath = `reports/authorization/canonical/automation-items-l2-reauthorization/${proposal.proposalHash.slice(7)}/proposal.json`;
    const written = writeL2PolicyStableReauthorizationProposal({ repoRoot, proposal, outputPath });
    assert.equal(written.path, outputPath);
    assert.equal(fs.statSync(path.join(repoRoot, outputPath)).mode & 0o777, 0o600);
    assert.throws(() => writeL2PolicyStableReauthorizationProposal({ repoRoot, proposal, outputPath }), /overwrite|exists/i);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('proposal rejects a target policy that drifts from current L2', async () => {
  const { buildL2PolicyStableReauthorizationProposal } = await import(
    './build-l2-policy-stable-reauthorization-proposal.mjs'
  );
  assert.throws(() => buildL2PolicyStableReauthorizationProposal({
    input: { ...INPUT, targetPolicy: { ...INPUT.targetPolicy, policyHash: HASH('f') } },
    policyRows: ROWS, serverFingerprint: SERVER,
  }), /target policy|current L2/i);
});

test('execution input binds the content-addressed proposal without adding a policy transition', async () => {
  const { buildL2PolicyStableReauthorizationExecutionInput, buildL2PolicyStableReauthorizationProposal } = await import(
    './build-l2-policy-stable-reauthorization-proposal.mjs'
  );
  const proposal = buildL2PolicyStableReauthorizationProposal({ input: INPUT, policyRows: ROWS, serverFingerprint: SERVER });
  const proposalPath = `reports/authorization/canonical/${proposal.operationId}/${proposal.proposalHash.slice(7)}/proposal.json`;
  const proposalBytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`);
  const execution = buildL2PolicyStableReauthorizationExecutionInput({
    input: INPUT,
    proposalPath,
    proposalFileSha256: `sha256:${createHash('sha256').update(proposalBytes).digest('hex')}`,
    proposalHash: proposal.proposalHash,
  });
  assert.equal(execution.proposalOnly, false);
  assert.equal(execution.proposalPath, proposalPath);
  assert.equal(Object.hasOwn(execution, 'targetLevel'), false);
});

test('execution input writer uses a private retry path and refuses overwrite', async () => {
  const {
    buildL2PolicyStableReauthorizationProposal,
    writeL2PolicyStableReauthorizationExecutionInput,
  } = await import('./build-l2-policy-stable-reauthorization-proposal.mjs');
  const proposal = buildL2PolicyStableReauthorizationProposal({ input: INPUT, policyRows: ROWS, serverFingerprint: SERVER });
  const proposalPath = `reports/authorization/canonical/${proposal.operationId}/${proposal.proposalHash.slice(7)}/proposal.json`;
  const proposalBytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`);
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-reauth-execution-input-'));
  const outputPath = 'reports/authorization/canonical/automation-items-l2-reauthorization.retry-22.input.json';
  try {
    const written = writeL2PolicyStableReauthorizationExecutionInput({
      repoRoot,
      input: INPUT,
      proposalPath,
      proposalFileSha256: `sha256:${createHash('sha256').update(proposalBytes).digest('hex')}`,
      proposalHash: proposal.proposalHash,
      outputPath,
    });
    assert.equal(written.path, outputPath);
    assert.equal(fs.statSync(path.join(repoRoot, outputPath)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(path.join(repoRoot, outputPath), 'utf8')).proposalOnly, false);
    assert.throws(() => writeL2PolicyStableReauthorizationExecutionInput({
      repoRoot, input: INPUT, proposalPath,
      proposalFileSha256: `sha256:${createHash('sha256').update(proposalBytes).digest('hex')}`,
      proposalHash: proposal.proposalHash, outputPath,
    }), /overwrite|exists/i);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
