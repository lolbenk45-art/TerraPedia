import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalStackConfig, resolveAdminAuth } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { writeJsonNoOverwrite } from '../lib/wiki-item-utils.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { assertAuthorizedOperationDataBundle, consumeAuthorizedOperationDispatchPermit, loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint } from '../automation/authorized-operation-context.mjs';
import { assertArmorIncrementalRuntimeFence, buildArmorIncrementalConnectionOptions, readArmorIncrementalArtifact } from '../relation/run-armor-set-projection-incremental.mjs';
import { resolveManagedImageUrlPrefixes } from '../relation/managed-image-url-policy.mjs';
import { writeJsonFile } from './backend-refresh-runtime-state.mjs';
import { ARMOR_IMAGE_CACHE_OPERATION_ID as OPERATION_ID, executeArmorImageCache, validateArmorImageCacheProposal } from './armor-image-cache.mjs';

const API = 'http://127.0.0.1:18102/api';
const STORE = 'http://127.0.0.1:19000';
const OWNERSHIP = ['managed_objects.armor_source_images'];
const UPLOAD_DELAY_MS = 1500;
export function buildArmorImageCachePaths(label) {
  if (typeof label !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) throw new Error('Armor cache result label is required');
  const prefix = `reports/authorization/canonical/${OPERATION_ID}.${label}`;
  return { proposalPath: `${prefix}.proposal.json`, preparedPath: `${prefix}.prepared.json`, resultPath: `${prefix}.result.json`,
    journalPath: `${prefix}.uploads.jsonl`,
    progressPath: `reports/backend-refresh/history/${OPERATION_ID}.${label}.runtime/child-status.json` };
}
function confined(root, relative) {
  return assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relative), label: 'Armor cache artifact', createParent: true });
}
function fresh(root, relative) {
  const target = confined(root, relative);
  try { fs.lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Armor cache output already exists: ${relative}`);
}
export function writeArmorImageCacheProgress({ repoRoot, monitorRoot = repoRoot,
  progressPath = 'data/generated/armor-image-cache-progress.latest.json', payload } = {}) {
  writeJsonFile(confined(repoRoot, progressPath), payload);
  const monitorPath = confined(monitorRoot, 'data/generated/armor-image-cache-progress.latest.json');
  if (monitorPath !== path.resolve(repoRoot, progressPath)) writeJsonFile(monitorPath, payload);
}
async function json(fetchImpl, url, options) {
  const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Armor cache local API HTTP ${response.status}`);
  const body = await response.json();
  if (body.success === false) throw new Error('Armor cache local API rejected request');
  return body.data ?? body;
}

export async function applyArmorImageCache({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule, fetchImpl = fetch } = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorImageCachePaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel || JSON.stringify(context.executionManifest.ownershipKeys) !== JSON.stringify(OWNERSHIP)) throw new Error('Armor cache packet scope drift');
  const binding = context.dataBundleEntries.find(row => row.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Armor cache proposal binding missing');
  const proposal = readArmorIncrementalArtifact(root, paths.proposalPath, binding.contentHash);
  let resumeVerified = [];
  const resumePath = context.executionManifest.armorImageCacheResumeResultPath;
  if (resumePath) {
    const resumeEntry = context.dataBundleEntries.find(row => row.path === resumePath);
    if (!resumeEntry?.contentHash) throw new Error('Armor cache resume evidence binding missing');
    const resumeFile = readArmorIncrementalArtifact(root, resumePath, resumeEntry.contentHash);
    if (resumeFile.operationId !== OPERATION_ID || resumeFile.status !== 'FAILED'
        || resumeFile.proposalSha256 !== proposal.proposalSha256 || !resumeFile.requiresObjectReconciliation
        || !Array.isArray(resumeFile.uploaded)) throw new Error('Armor cache resume evidence is not a matching failed result');
    resumeVerified = resumeFile.uploaded.filter(row => row.verified === true);
  }
  validateArmorImageCacheProposal(proposal);
  const configured = resolveManagedImageUrlPrefixes({ repoRoot: root });
  if (JSON.stringify(configured) !== JSON.stringify(proposal.managedImageUrlPrefixes)) throw new Error('Armor cache runtime managed policy drift');
  for (const prefix of configured) {
    const url = new URL(prefix);
    if (!['http://127.0.0.1:19000', 'http://localhost:19000'].includes(url.origin)) throw new Error('Armor cache store must be local port 19000');
  }
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== options.port
      || JSON.stringify([...fingerprint.databases].sort()) !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) throw new Error('Armor cache server target drift');
  fresh(root, paths.preparedPath); fresh(root, paths.resultPath); fresh(root, paths.progressPath); fresh(root, paths.journalPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  const authorization = { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash, policySetHash: context.policySetHash, serverFingerprint: fingerprint };
  const write = (relative, value) => writeJsonNoOverwrite(confined(root, relative), { ...value, authorization, recordedAt: new Date().toISOString() });
  const startedAt = new Date().toISOString(); let current = 0; let heartbeat; let latest; let primaryError;
  let journalFd; let sequence = 0;
  const publish = (status, message) => {
    const now = new Date().toISOString();
    latest = { actionId: 'armor-set-images', status, phase: 'managed-image-cache', generatedAt: now, lastHeartbeatAt: now,
      startedAt, current, total: proposal.assets.length, childStatusPath: paths.progressPath, outputPath: paths.resultPath, message };
    writeArmorImageCacheProgress({ repoRoot: root,
      monitorRoot: env.TERRAPEDIA_CRAWLER_QUEUE_V2_REPO_ROOT || root, progressPath: paths.progressPath, payload: latest });
  };
  const gate = () => assertArmorIncrementalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid });
  try {
    publish('running', 'Verifying Armor cache authorization');
    heartbeat = setInterval(() => { try { if (latest?.status === 'running') publish('running', latest.message); } catch (error) { primaryError ??= error; } }, 10000);
    await connection.beginTransaction();
    await gate();
    const auth = resolveAdminAuth({}, { repoRoot: root });
    const login = await json(fetchImpl, `${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(auth) });
    if (!login.token) throw new Error('Armor cache admin login failed');
    const headers = { authorization: `Bearer ${login.token}` };
    const preflight = await json(fetchImpl, `${API}/admin/crawler-monitor/v2/automation/preflight`, { headers });
    if (preflight.control?.enabled !== false || preflight.counts?.liveAttempts !== 0 || preflight.counts?.sweepClaims !== 0
        || preflight.reconciler?.status !== 'healthy' || preflight.reconciler.failureCount !== 0 || preflight.reconciler.overdueAttemptCount !== 0
        || preflight.policySetHash !== context.policySetHash) throw new Error('Armor cache runtime preflight blocks upload');
    const result = await executeArmorImageCache({ proposal, resumeVerified,
      persistPrepared: evidence => {
        write(paths.preparedPath, evidence);
        journalFd = fs.openSync(confined(root, paths.journalPath), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      },
      persistUploadEvent: event => {
        if (primaryError) throw primaryError;
        fs.writeFileSync(journalFd, `${JSON.stringify({ ...event, sequence: ++sequence, proposalSha256: proposal.proposalSha256,
          authorization, recordedAt: new Date().toISOString() })}\n`);
        fs.fsyncSync(journalFd);
      },
      consumePermit: async () => {
        if (primaryError) throw primaryError;
        await gate();
        assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
        consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context, decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') });
      },
      upload: async asset => {
        if (primaryError) throw primaryError;
        await gate();
        await new Promise(resolve => setTimeout(resolve, UPLOAD_DELAY_MS));
        const data = new FormData();
        data.append('file', new File([Buffer.from(asset.bytesBase64, 'base64')], asset.sourceFileTitle, { type: asset.before.mime }));
        data.append('entityDomain', 'items');
        const uploaded = await json(fetchImpl, `${API}/files/images`, { method: 'POST', headers, body: data });
        return uploaded.url;
      },
      readManaged: async url => {
        const parsed = new URL(url, STORE);
        // Proof compares bytes via the pinned local store; URL policy was checked in the core.
        const response = await fetchImpl(`${STORE}${parsed.pathname}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Armor cache readback HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer()); current++;
        publish('running', `Verified Armor cache bytes ${current}/${proposal.assets.length}`);
        return bytes;
      },
      persistResult: evidence => write(paths.resultPath, evidence),
    });
    if (primaryError) throw primaryError;
    publish('completed', 'Armor cache byte readback completed');
    return result;
  } catch (error) {
    primaryError = error;
    try { publish('failed', error.message); } catch (cause) { (error.suppressedErrors ??= []).push(cause); }
    throw error;
  } finally {
    clearInterval(heartbeat);
    const cleanupErrors = [];
    if (journalFd != null) { try { fs.closeSync(journalFd); } catch (error) { cleanupErrors.push(error); } }
    try { await connection.rollback(); } catch (error) { cleanupErrors.push(error); }
    try { await connection.end(); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) {
      if (primaryError) (primaryError.suppressedErrors ??= []).push(...cleanupErrors);
      else {
        const error = cleanupErrors.shift();
        (error.suppressedErrors ??= []).push(...cleanupErrors);
        try { publish('failed', `Armor cache cleanup failed: ${error.message}`); }
        catch (cause) { error.suppressedErrors.push(cause); }
        throw error;
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = {};
    for (const value of process.argv.slice(2)) {
      const match = /^--(operation-id|result-label|apply)=(.+)$/.exec(value);
      if (!match || Object.hasOwn(args, match[1])) throw new Error('Armor cache CLI argument invalid or duplicate');
      args[match[1]] = match[2];
    }
    if (args['operation-id'] !== OPERATION_ID || args.apply !== 'true') throw new Error('Armor cache CLI requires exact operation and apply=true');
    const result = await applyArmorImageCache({ resultLabel: args['result-label'] });
    console.log(JSON.stringify({ operationId: OPERATION_ID, status: result.status, images: result.uploaded.length, payloadSha256: result.payloadSha256 }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
