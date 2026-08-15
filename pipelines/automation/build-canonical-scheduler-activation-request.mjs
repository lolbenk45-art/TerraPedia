#!/usr/bin/env node
// build-canonical-scheduler-activation-request.mjs
// Task 5 Step 2: 从已验证的 proposal 构建 scheduler-activation 授权请求（AWAITING_OWNER）。
// 不写正式库，不调用通用 cutover builder，不启用任何东西。

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { sha256Json } from './crawler-v2-scheduler-activation-preflight.mjs';

const OPERATION_ID = 'canonical-crawler-v2-scheduler-activation';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
// 请求默认有效期 24 小时；审批窗口在 Task 6 Step 2 用 TOCTOU 补偿
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;
// 最长 7 天（与通用 cutover builder 一致）
const MAX_REQUEST_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireTimestamp(value, label) {
  const text = requireText(String(value ?? ''), label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be a valid ISO timestamp`);
  return text;
}

function assertOutputPath(outputPath, repoRoot) {
  const root = path.resolve(repoRoot, 'reports/authorization/canonical');
  const normalized = path.resolve(outputPath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error('request output must remain under reports/authorization/canonical');
  }
}

function assertInsideRepo(filePath, repoRoot, label) {
  const root = path.resolve(repoRoot);
  const normalized = path.resolve(filePath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} must remain inside the repository`);
  }
  return normalized;
}

// 验证 proposal 文件字节 hash，并校验其内嵌 proposalHash 与内容自洽
function readAndVerifyProposal(proposalPath, repoRoot) {
  const absPath = assertInsideRepo(path.resolve(repoRoot, proposalPath), repoRoot, 'proposal');
  const bytes = fs.readFileSync(absPath);
  const fileSha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  let proposal;
  try {
    proposal = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('proposal must contain valid JSON');
  }
  // 验证 proposalHash 与内容自洽
  const { proposalHash, ...payload } = proposal;
  requireHash(proposalHash, 'proposalHash');
  if (sha256Json(payload) !== proposalHash) {
    throw new Error('proposal content does not match its embedded proposalHash');
  }
  return { proposal, fileSha256, proposalHash };
}

// 校验 proposal 满足构建请求的前提条件
function assertProposalEligible(proposal) {
  if (proposal.operationId !== OPERATION_ID) {
    throw new Error(`proposal operationId must be ${OPERATION_ID}`);
  }
  if (proposal.proposalOnly !== true) {
    throw new Error('proposal must be proposalOnly:true');
  }
  if (proposal.authorizationStatus !== 'AWAITING_OWNER') {
    throw new Error('proposal authorizationStatus must be AWAITING_OWNER');
  }
  if (proposal.databaseWrites !== false) {
    throw new Error('proposal must declare databaseWrites:false');
  }
  if (proposal.networkAccess !== false) {
    throw new Error('proposal must declare networkAccess:false');
  }
  if (proposal.isolatedResourceWrites !== false) {
    throw new Error('proposal must declare isolatedResourceWrites:false');
  }
  if (proposal.current?.enabled !== false) {
    throw new Error('proposal must record current.enabled:false');
  }
  requireHash(proposal.preflight?.preflightHash, 'proposal.preflight.preflightHash');
  requireHash(proposal.t1Report?.sha256, 'proposal.t1Report.sha256');
  requireText(proposal.t1Report?.path, 'proposal.t1Report.path');
  if (!Array.isArray(proposal.codeBundle) || proposal.codeBundle.length === 0) {
    throw new Error('proposal must contain a non-empty codeBundle');
  }
  for (const entry of proposal.codeBundle) {
    requireText(entry?.path, 'codeBundle entry path');
    requireHash(entry?.sha256, 'codeBundle entry sha256');
  }
  if (!Array.isArray(proposal.forbidden) || proposal.forbidden.length === 0) {
    throw new Error('proposal must declare forbidden operations');
  }
  const REQUIRED_FORBIDDEN = [
    'direct-json-write', 'direct-redis-write', 'manual-sweep',
    'external-daemon', 'formal-permit-consumption',
  ];
  for (const op of REQUIRED_FORBIDDEN) {
    if (!proposal.forbidden.includes(op)) {
      throw new Error(`proposal must forbid operation: ${op}`);
    }
  }
}

// 核心构建函数（纯函数，可单元测试）
export function buildSchedulerActivationRequest({
  proposal,
  proposalPath,
  proposalFileSha256,
  proposalHash,
  generatedAt = new Date().toISOString(),
  expiresAt,
} = {}) {
  if (!proposal || typeof proposal !== 'object') throw new Error('proposal object is required');
  assertProposalEligible(proposal);
  requireText(proposalPath, 'proposalPath');
  requireHash(proposalFileSha256, 'proposalFileSha256');
  requireHash(proposalHash, 'proposalHash');
  const generated = requireTimestamp(generatedAt, 'generatedAt');
  const expires = requireTimestamp(
    expiresAt ?? new Date(Date.parse(generated) + DEFAULT_EXPIRY_MS).toISOString(),
    'expiresAt',
  );
  const lifetime = Date.parse(expires) - Date.parse(generated);
  if (lifetime <= 0 || lifetime > MAX_REQUEST_LIFETIME_MS) {
    throw new Error('request expiry must be future and bounded to seven days');
  }

  const payload = {
    schemaVersion: 1,
    requestKind: 'scheduler_activation_authorization',
    operationId: OPERATION_ID,
    authorizationStatus: 'AWAITING_OWNER',
    databaseWrites: false,
    networkAccess: false,
    isolatedResourceWrites: false,
    generatedAt: generated,
    expiresAt: expires,
    // proposal 身份锚点：路径 + 文件字节 hash + 内容 hash
    proposal: {
      path: proposalPath,
      fileSha256: proposalFileSha256,
      proposalHash,
    },
    // 从 proposal 提升的约束字段（审批侧可直接核对，无需重新解析 proposal）
    preflight: proposal.preflight,
    mutation: proposal.mutation,
    t1Report: proposal.t1Report,
    codeBundle: proposal.codeBundle,
    current: proposal.current,
    eligibleDomains: proposal.eligibleDomains,
    requested: proposal.requested,
    rollback: proposal.rollback,
    forbidden: proposal.forbidden,
    // 待所有者填写（AWAITING_OWNER）
    actor: null,
    reason: null,
    authorizationReference: null,
    decisionIdentity: null,
    missingOwnerFields: ['actor', 'reason', 'authorizationReference', 'decisionIdentity'],
  };
  return Object.freeze({ ...payload, requestHash: sha256Json(payload) });
}

function writeJsonAtomic(filePath, payload) {
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.linkSync(temporary, filePath);
    fs.unlinkSync(temporary);
    fs.chmodSync(filePath, 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('request artifact already exists; overwrite is forbidden');
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const [key, ...rest] = String(arg).replace(/^--/, '').split('=');
    args[key] = rest.join('=');
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  for (const key of ['proposal', 'output']) {
    if (!args[key]) throw new Error(`--${key}=<path> is required`);
  }
  const outputPath = path.resolve(args.output);
  assertOutputPath(outputPath, repoRoot);

  const { proposal, fileSha256, proposalHash } = readAndVerifyProposal(args.proposal, repoRoot);
  const generatedAt = args['generated-at'] ?? new Date().toISOString();
  const request = buildSchedulerActivationRequest({
    proposal,
    proposalPath: args.proposal,
    proposalFileSha256: fileSha256,
    proposalHash,
    generatedAt,
    expiresAt: args['expires-at'],
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  writeJsonAtomic(outputPath, request);
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    requestHash: request.requestHash,
    authorizationStatus: request.authorizationStatus,
  })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`scheduler activation request build failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
