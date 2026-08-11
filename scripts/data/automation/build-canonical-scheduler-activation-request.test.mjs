import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildSchedulerActivationRequest,
} from './build-canonical-scheduler-activation-request.mjs';
import { sha256Json } from './crawler-v2-scheduler-activation-preflight.mjs';
import { sha256File } from './build-canonical-crawler-v2-scheduler-activation-proposal.mjs';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

const PROPOSAL_PATH = 'reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.proposal.json';

// ── 内联 fixture 工厂 ───────────────────────────────────────────────────────

const FAKE_PREFLIGHT_HASH = `sha256:${'a'.repeat(64)}`;
const FAKE_T1_HASH = `sha256:${'b'.repeat(64)}`;
const FAKE_CODE_HASH = `sha256:${'c'.repeat(64)}`;
const FAKE_FILE_SHA256 = `sha256:${'d'.repeat(64)}`;

function validProposalPayload(overrides = {}) {
  const base = {
    schemaVersion: 2,
    operationId: 'canonical-crawler-v2-scheduler-activation',
    proposalOnly: true,
    authorizationStatus: 'AWAITING_OWNER',
    databaseWrites: false,
    networkAccess: false,
    isolatedResourceWrites: false,
    preflight: {
      observedAt: '2026-08-11T10:00:00.000Z',
      preflightHash: FAKE_PREFLIGHT_HASH,
      endpoint: { method: 'GET', path: '/admin/crawler-monitor/v2/automation/preflight', server: 'spring-backend' },
    },
    mutation: { method: 'PUT', endpoint: '/admin/crawler-monitor/v2/automation', authenticatedLoopbackOnly: true },
    t1Report: {
      path: 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json',
      sha256: FAKE_T1_HASH,
      cleanupPassed: true,
    },
    codeBundle: [{ path: 'scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs', sha256: FAKE_CODE_HASH }],
    current: { enabled: false, mode: 'changed-only', epoch: 'epoch-test', namespace: 'terrapedia:v2:', liveAttempts: 0, sweepClaims: 0, reconcilerHealthy: true },
    eligibleDomains: { 'wiki-items-refresh': 'eligible' },
    requested: { sweepIntervalMinutes: 60, actor: null, reason: null, expiresAt: null },
    rollback: { endpoint: '/admin/crawler-monitor/v2/automation', body: { enabled: false, mode: 'changed-only' } },
    forbidden: ['direct-json-write', 'direct-redis-write', 'manual-sweep', 'external-daemon', 'formal-permit-consumption'],
    ...overrides,
  };
  return base;
}

function validProposal(overrides = {}) {
  const payload = validProposalPayload(overrides);
  return { ...payload, proposalHash: sha256Json(payload) };
}

// ── 成功路径 ────────────────────────────────────────────────────────────────

test('builds a valid AWAITING_OWNER request from a proposal-only input', () => {
  const proposal = validProposal();
  const { proposalHash } = proposal;
  const now = '2026-08-11T11:00:00.000Z';
  const req = buildSchedulerActivationRequest({
    proposal,
    proposalPath: PROPOSAL_PATH,
    proposalFileSha256: FAKE_FILE_SHA256,
    proposalHash,
    generatedAt: now,
  });

  assert.equal(req.schemaVersion, 1);
  assert.equal(req.requestKind, 'scheduler_activation_authorization');
  assert.equal(req.operationId, 'canonical-crawler-v2-scheduler-activation');
  assert.equal(req.authorizationStatus, 'AWAITING_OWNER');
  assert.equal(req.databaseWrites, false);
  assert.equal(req.networkAccess, false);
  assert.equal(req.isolatedResourceWrites, false);
  assert.equal(req.actor, null);
  assert.equal(req.reason, null);
  assert.deepEqual(req.missingOwnerFields, ['actor', 'reason', 'authorizationReference', 'decisionIdentity']);
  // proposal 锚点
  assert.equal(req.proposal.path, PROPOSAL_PATH);
  assert.equal(req.proposal.fileSha256, FAKE_FILE_SHA256);
  assert.equal(req.proposal.proposalHash, proposalHash);
  // 关键约束字段从 proposal 提升
  assert.deepEqual(req.rollback, proposal.rollback);
  assert.deepEqual(req.forbidden, proposal.forbidden);
  assert.deepEqual(req.mutation, proposal.mutation);
  assert.equal(req.current.enabled, false);
  // requestHash 自洽
  assert.match(req.requestHash, HASH_PATTERN);
  const { requestHash, ...payloadCheck } = req;
  assert.equal(sha256Json(payloadCheck), requestHash);
});

test('request binds the exact proposal identity (fileSha256 + proposalHash)', () => {
  const proposal = validProposal();
  const req = buildSchedulerActivationRequest({
    proposal,
    proposalPath: PROPOSAL_PATH,
    proposalFileSha256: FAKE_FILE_SHA256,
    proposalHash: proposal.proposalHash,
    generatedAt: '2026-08-11T11:00:00.000Z',
  });
  assert.equal(req.proposal.fileSha256, FAKE_FILE_SHA256);
  assert.equal(req.proposal.proposalHash, proposal.proposalHash);
});

test('request defaults expiresAt to generatedAt + 24h when omitted', () => {
  const proposal = validProposal();
  const generatedAt = '2026-08-11T11:00:00.000Z';
  const req = buildSchedulerActivationRequest({
    proposal,
    proposalPath: PROPOSAL_PATH,
    proposalFileSha256: FAKE_FILE_SHA256,
    proposalHash: proposal.proposalHash,
    generatedAt,
  });
  const expected = new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1000).toISOString();
  assert.equal(req.expiresAt, expected);
});

test('request accepts custom expiresAt within seven days', () => {
  const proposal = validProposal();
  const generatedAt = '2026-08-11T11:00:00.000Z';
  const expiresAt = new Date(Date.parse(generatedAt) + 48 * 60 * 60 * 1000).toISOString();
  const req = buildSchedulerActivationRequest({
    proposal,
    proposalPath: PROPOSAL_PATH,
    proposalFileSha256: FAKE_FILE_SHA256,
    proposalHash: proposal.proposalHash,
    generatedAt,
    expiresAt,
  });
  assert.equal(req.expiresAt, expiresAt);
});

// ── 拒绝路径 ────────────────────────────────────────────────────────────────

test('rejects proposal with wrong operationId', () => {
  const proposal = validProposal({ operationId: 'canonical-npc-apply' });
  assert.throws(
    () => buildSchedulerActivationRequest({ proposal, proposalPath: PROPOSAL_PATH, proposalFileSha256: FAKE_FILE_SHA256, proposalHash: proposal.proposalHash, generatedAt: '2026-08-11T11:00:00.000Z' }),
    /operationId must be canonical-crawler-v2-scheduler-activation/,
  );
});

test('rejects proposal with proposalOnly:false', () => {
  const proposal = validProposal({ proposalOnly: false });
  assert.throws(
    () => buildSchedulerActivationRequest({ proposal, proposalPath: PROPOSAL_PATH, proposalFileSha256: FAKE_FILE_SHA256, proposalHash: proposal.proposalHash, generatedAt: '2026-08-11T11:00:00.000Z' }),
    /proposalOnly:true/,
  );
});

test('rejects proposal with databaseWrites:true', () => {
  const proposal = validProposal({ databaseWrites: true });
  assert.throws(
    () => buildSchedulerActivationRequest({ proposal, proposalPath: PROPOSAL_PATH, proposalFileSha256: FAKE_FILE_SHA256, proposalHash: proposal.proposalHash, generatedAt: '2026-08-11T11:00:00.000Z' }),
    /databaseWrites:false/,
  );
});

test('rejects proposal with current.enabled:true', () => {
  const base = validProposalPayload();
  base.current = { ...base.current, enabled: true };
  const proposal = { ...base, proposalHash: sha256Json(base) };
  assert.throws(
    () => buildSchedulerActivationRequest({ proposal, proposalPath: PROPOSAL_PATH, proposalFileSha256: FAKE_FILE_SHA256, proposalHash: proposal.proposalHash, generatedAt: '2026-08-11T11:00:00.000Z' }),
    /current\.enabled:false/,
  );
});

test('rejects proposal missing a required forbidden operation', () => {
  const base = validProposalPayload();
  base.forbidden = ['direct-json-write', 'direct-redis-write', 'manual-sweep', 'external-daemon'];
  // drop formal-permit-consumption
  const proposal = { ...base, proposalHash: sha256Json(base) };
  assert.throws(
    () => buildSchedulerActivationRequest({ proposal, proposalPath: PROPOSAL_PATH, proposalFileSha256: FAKE_FILE_SHA256, proposalHash: proposal.proposalHash, generatedAt: '2026-08-11T11:00:00.000Z' }),
    /formal-permit-consumption/,
  );
});

test('rejects proposal with empty codeBundle', () => {
  const base = validProposalPayload({ codeBundle: [] });
  const proposal = { ...base, proposalHash: sha256Json(base) };
  assert.throws(
    () => buildSchedulerActivationRequest({ proposal, proposalPath: PROPOSAL_PATH, proposalFileSha256: FAKE_FILE_SHA256, proposalHash: proposal.proposalHash, generatedAt: '2026-08-11T11:00:00.000Z' }),
    /non-empty codeBundle/,
  );
});

test('rejects expiresAt in the past', () => {
  const proposal = validProposal();
  const generatedAt = '2026-08-11T11:00:00.000Z';
  assert.throws(
    () => buildSchedulerActivationRequest({ proposal, proposalPath: PROPOSAL_PATH, proposalFileSha256: FAKE_FILE_SHA256, proposalHash: proposal.proposalHash, generatedAt, expiresAt: '2026-08-11T10:00:00.000Z' }),
    /expiry must be future/,
  );
});

test('rejects expiresAt beyond seven days', () => {
  const proposal = validProposal();
  const generatedAt = '2026-08-11T11:00:00.000Z';
  const expiresAt = new Date(Date.parse(generatedAt) + 8 * 24 * 60 * 60 * 1000).toISOString();
  assert.throws(
    () => buildSchedulerActivationRequest({ proposal, proposalPath: PROPOSAL_PATH, proposalFileSha256: FAKE_FILE_SHA256, proposalHash: proposal.proposalHash, generatedAt, expiresAt }),
    /expiry must be future and bounded to seven days/,
  );
});

test('rejects invalid proposalFileSha256', () => {
  const proposal = validProposal();
  assert.throws(
    () => buildSchedulerActivationRequest({ proposal, proposalPath: PROPOSAL_PATH, proposalFileSha256: 'not-a-hash', proposalHash: proposal.proposalHash, generatedAt: '2026-08-11T11:00:00.000Z' }),
    /proposalFileSha256 must be a sha256 hash/,
  );
});

test('request contains no password, token, or secret-like string', () => {
  const proposal = validProposal();
  const req = buildSchedulerActivationRequest({
    proposal,
    proposalPath: PROPOSAL_PATH,
    proposalFileSha256: FAKE_FILE_SHA256,
    proposalHash: proposal.proposalHash,
    generatedAt: '2026-08-11T11:00:00.000Z',
  });
  const serialized = JSON.stringify(req);
  assert.doesNotMatch(serialized, /password|bearer |secret(?!")|BEGIN [A-Z ]+PRIVATE KEY/i);
});

// ── CLI 集成测试 ─────────────────────────────────────────────────────────────

test('CLI builds a request artifact from the real proposal file and writes it under the authorization root', () => {
  const repoRoot = process.cwd();
  const proposalAbsPath = path.resolve(repoRoot, PROPOSAL_PATH);
  if (!fs.existsSync(proposalAbsPath)) {
    // 如果真实 proposal 不存在（CI 环境），跳过此集成测试
    return;
  }
  const outputPath = 'reports/authorization/canonical/.test-scheduler-activation.request.json';
  const outputAbsPath = path.resolve(repoRoot, outputPath);
  try {
    const result = spawnSync(process.execPath, [
      'scripts/data/automation/build-canonical-scheduler-activation-request.mjs',
      `--proposal=${PROPOSAL_PATH}`,
      `--output=${outputPath}`,
      '--generated-at=2026-08-11T11:30:00.000Z',
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const stdout = JSON.parse(result.stdout.trim());
    assert.match(stdout.requestHash, HASH_PATTERN);
    assert.equal(stdout.authorizationStatus, 'AWAITING_OWNER');
    const written = JSON.parse(fs.readFileSync(outputAbsPath, 'utf8'));
    assert.equal(written.authorizationStatus, 'AWAITING_OWNER');
    assert.equal(written.databaseWrites, false);
    assert.equal(written.networkAccess, false);
    assert.equal(written.actor, null);
    assert.match(written.requestHash, HASH_PATTERN);
    // 验证 requestHash 自洽
    const { requestHash, ...payloadCheck } = written;
    assert.equal(sha256Json(payloadCheck), requestHash);
    // proposal 锚点存在
    assert.equal(written.proposal.path, PROPOSAL_PATH);
    assert.match(written.proposal.fileSha256, HASH_PATTERN);
    assert.match(written.proposal.proposalHash, HASH_PATTERN);
    // 文件权限 0o600
    const mode = fs.statSync(outputAbsPath).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    fs.rmSync(outputAbsPath, { force: true });
  }
});

test('CLI rejects a proposal whose proposalHash does not match its content', () => {
  const repoRoot = process.cwd();
  // 构造一个内容正确但 proposalHash 被篡改的 proposal 文件
  const proposal = validProposal();
  const tampered = { ...proposal, proposalHash: `sha256:${'f'.repeat(64)}` };
  const inputPath = 'reports/authorization/canonical/.test-tampered.proposal.json';
  const outputPath = 'reports/authorization/canonical/.test-tampered.request.json';
  const inputAbsPath = path.resolve(repoRoot, inputPath);
  const outputAbsPath = path.resolve(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(inputAbsPath), { recursive: true });
  fs.writeFileSync(inputAbsPath, `${JSON.stringify(tampered, null, 2)}\n`, { flag: 'wx' });
  try {
    const result = spawnSync(process.execPath, [
      'scripts/data/automation/build-canonical-scheduler-activation-request.mjs',
      `--proposal=${inputPath}`,
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /proposalHash/i);
    assert.equal(fs.existsSync(outputAbsPath), false);
  } finally {
    fs.rmSync(inputAbsPath, { force: true });
    fs.rmSync(outputAbsPath, { force: true });
  }
});

test('CLI refuses to overwrite an existing request artifact', () => {
  const repoRoot = process.cwd();
  const proposalAbsPath = path.resolve(repoRoot, PROPOSAL_PATH);
  if (!fs.existsSync(proposalAbsPath)) return;
  const outputPath = 'reports/authorization/canonical/.test-no-overwrite.request.json';
  const outputAbsPath = path.resolve(repoRoot, outputPath);
  // 预先写一个占位文件
  fs.mkdirSync(path.dirname(outputAbsPath), { recursive: true });
  fs.writeFileSync(outputAbsPath, '{"existing":true}\n', { mode: 0o600 });
  try {
    const result = spawnSync(process.execPath, [
      'scripts/data/automation/build-canonical-scheduler-activation-request.mjs',
      `--proposal=${PROPOSAL_PATH}`,
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already exists|overwrite is forbidden/i);
    // 原始文件未被破坏
    const content = JSON.parse(fs.readFileSync(outputAbsPath, 'utf8'));
    assert.equal(content.existing, true);
  } finally {
    fs.rmSync(outputAbsPath, { force: true });
  }
});
