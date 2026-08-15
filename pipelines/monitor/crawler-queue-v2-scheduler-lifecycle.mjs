#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ACTION_ID = 'crawler-queue-v2-fixture';
const DOMAIN = 'crawler_queue_v2_fixture';

export function assertLiveCliMode({ live, offline } = {}) {
  if (offline === 'true') throw new Error('offline probe is not an acceptance run; use --live=true');
  if (live !== 'true') throw new Error('scheduler lifecycle acceptance requires --live=true');
  return { live: true };
}

export function buildSchedulerLifecycleIdentity({ runId, namespace, redisDb, epoch, fenceToken } = {}) {
  for (const [name, value] of Object.entries({ runId, namespace, redisDb, epoch, fenceToken })) {
    if (value == null || String(value).trim() === '') throw new Error(`${name} is required`);
  }
  if (!/^terrapedia:crawler:wiki-monitor:v2:test:[^:]+:$/.test(namespace)) {
    throw new Error('scheduler lifecycle namespace must be marker-owned test namespace');
  }
  if (!Number.isInteger(Number(redisDb)) || Number(redisDb) < 1 || Number(redisDb) > 15) {
    throw new Error('scheduler lifecycle Redis DB must be an isolated logical DB');
  }
  return Object.freeze({ runId: String(runId), namespace, redisDb: Number(redisDb), epoch: String(epoch), fenceToken: String(fenceToken), domain: DOMAIN, actionId: ACTION_ID });
}

export function assertExactAttemptIdentity(expected, observed) {
  const fields = ['runId', 'namespace', 'redisDb', 'epoch', 'fenceToken', 'domain', 'actionId'];
  for (const field of fields) {
    if (String(expected?.[field]) !== String(observed?.[field])) {
      throw new Error(`scheduler lifecycle identity drift: ${field}`);
    }
  }
  return true;
}

export function assertMarkerOwnedPath(filePath, markerRoot) {
  const root = path.resolve(markerRoot);
  const candidate = path.resolve(filePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error('scheduler lifecycle path is outside marker-owned root');
  }
  return candidate;
}

export async function runFixtureProgressProbe({ root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-v2-lifecycle-')), heartbeats = 3 } = {}) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const progressPath = path.join(root, 'child-status.json');
  const fixture = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'crawler-queue-v2-fixture.mjs');
  const child = spawn(process.execPath, [fixture, `--heartbeats=${heartbeats}`, '--interval-ms=10', `--progress-path=${progressPath}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      if (fs.existsSync(progressPath)) return resolve();
      if (Date.now() > deadline) return reject(new Error('fixture did not publish running progress'));
      setTimeout(poll, 10);
    };
    poll();
  });
  await new Promise((resolve, reject) => child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`fixture exited ${code}`))));
  const payload = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  if (payload.status !== 'completed' || payload.actionId !== ACTION_ID || payload.sequence < heartbeats) {
    throw new Error('fixture progress did not converge to an exact terminal payload');
  }
  return { progressPath, payload, root };
}

export function buildOfflineLifecycleReport({ identity, progress, cleanupPassed = true, scheduledTick = false } = {}) {
  if (!identity || !progress) throw new Error('scheduler lifecycle report requires identity and progress');
  return {
    schemaVersion: 1,
    operationId: 'canonical-crawler-v2-scheduler-t1-acceptance',
    status: 'probe-passed',
    cleanupPassed,
    offline: true,
    scheduledTickObserved: Boolean(scheduledTick),
    runtimeAssertionsDeferred: true,
    identity,
    progress: { status: progress.payload.status, sequence: progress.payload.sequence, actionId: progress.payload.actionId },
    leaseRenewals: 2,
    concurrentDispatches: 1,
    restart: { adopted: true, mismatchRejected: true, epochRecreated: false },
    leaseLoss: { childReaped: true, nextReadyClaimed: false },
    cleanup: { backendProcesses: 0, childProcesses: 0, redisKeys: 0, credentials: 0, files: 0, permits: 0 },
    generatedAt: new Date().toISOString(),
  };
}

export function buildPassedLifecycleReport({
  identity,
  scheduledTick,
  progress,
  lease,
  restart,
  leaseLoss,
  cleanup,
  operationId = 'canonical-crawler-v2-scheduler-t1-acceptance',
  itemIngestion = null,
  itemDbReadback = null,
  recipeIngestion = null,
  recipeDbReadback = null,
} = {}) {
  if (!identity || !scheduledTick || !progress || !lease || !restart || !leaseLoss || !cleanup) {
    throw new Error('passed scheduler lifecycle report requires complete runtime evidence');
  }
  if (scheduledTick.observed !== true || scheduledTick.manualSweepCalls !== 0 || scheduledTick.dispatches !== 1) {
    throw new Error('scheduler lifecycle requires one real scheduled tick and forbids manual sweep calls');
  }
  if (progress.status !== 'completed' || progress.actionId !== ACTION_ID || Number(progress.sequence) < 2) {
    throw new Error('scheduler lifecycle progress evidence is incomplete');
  }
  if (Number(lease.renewals) < 2) {
    throw new Error('scheduler lifecycle requires at least two lease renewals');
  }
  if (Number(lease.concurrentDispatches) !== 1) {
    throw new Error('scheduler lifecycle concurrent dispatch dedupe failed');
  }
  if (restart.adopted !== true || restart.mismatchRejected !== true || restart.epochRecreated !== false) {
    throw new Error('scheduler lifecycle restart evidence is incomplete');
  }
  if (leaseLoss.childReaped !== true || leaseLoss.nextReadyClaimed !== false) {
    throw new Error('scheduler lifecycle lease-loss evidence is incomplete');
  }
  if (Object.values(cleanup).some((value) => Number(value) !== 0)) {
    throw new Error('scheduler lifecycle cleanup did not return every resource to zero');
  }
  if (itemIngestion != null && (Number(itemIngestion.itemCount) < 1 || Number(itemIngestion.maintCount) !== Number(itemIngestion.itemCount) || Number(itemIngestion.relationCount) !== Number(itemIngestion.itemCount) || Number(itemIngestion.unresolvedIdentities) !== 0)) {
    throw new Error('Item ingestion evidence is incomplete');
  }
  if (itemIngestion != null && (!itemDbReadback || Number(itemDbReadback.itemRows) !== Number(itemIngestion.itemCount) || Number(itemDbReadback.maintRows) !== Number(itemIngestion.maintCount) || Number(itemDbReadback.relationRows) !== Number(itemIngestion.relationCount) || Number(itemDbReadback.unresolvedIdentities) !== 0)) {
    throw new Error('Item database readback evidence is incomplete');
  }
  if (operationId === 'canonical-crawler-v2-scheduler-t1-acceptance') {
    if (!recipeIngestion || Number(recipeIngestion.selectedRecords) < 1 || Number(recipeIngestion.inputRecipes) < 1 || Number(recipeIngestion.recipeRows) < 1 || Number(recipeIngestion.unresolvedItemRows) !== 0 || Number(recipeIngestion.unresolvedStationRows) !== 0) {
      throw new Error('Recipe ingestion evidence is incomplete');
    }
    if (!recipeDbReadback || Number(recipeDbReadback.recipeRows) !== Number(recipeIngestion.recipeRows) || Number(recipeDbReadback.ingredientRows) !== Number(recipeIngestion.ingredientRows) || Number(recipeDbReadback.stationRows) !== Number(recipeIngestion.stationRows)) {
      throw new Error('Recipe database readback evidence is incomplete');
    }
  }
  return {
    schemaVersion: 1,
    operationId,
    reportKind: operationId === 'canonical-crawler-v2-items-t1-acceptance' ? 'canonical_crawler_v2_items_t1_acceptance' : 'canonical_crawler_v2_scheduler_t1_acceptance',
    status: 'passed',
    cleanupPassed: true,
    offline: false,
    scheduledTickObserved: true,
    runtimeAssertionsDeferred: false,
    identity,
    progress,
    leaseRenewals: Number(lease.renewals),
    concurrentDispatches: Number(lease.concurrentDispatches),
    restart,
    leaseLoss,
    cleanup,
    ...(itemIngestion == null ? {} : { itemIngestion, itemDbReadback }),
    ...(recipeIngestion == null ? {} : { recipeIngestion, recipeDbReadback }),
    generatedAt: new Date().toISOString(),
  };
}

export async function runLiveLifecycle({ driver } = {}) {
  if (!driver || typeof driver !== 'object') throw new Error('live lifecycle driver is required');
  const phase = (name) => {
    if (typeof driver[name] !== 'function') throw new Error(`live lifecycle driver phase is missing: ${name}`);
    return driver[name].bind(driver);
  };
  const prepare = phase('prepare');
  const observeDisabledTick = phase('observeDisabledTick');
  const enableAutomation = phase('enableAutomation');
  const waitForScheduledTick = phase('waitForScheduledTick');
  const observeLeaseRenewals = phase('observeLeaseRenewals');
  const restartAndRecover = phase('restartAndRecover');
  const forceLeaseLoss = phase('forceLeaseLoss');
  const waitForProgress = phase('waitForProgress');
  const cleanup = phase('cleanup');
  const independentReadback = phase('independentReadback');
  let evidence;
  let primaryError;
  try {
    const identity = await prepare();
    const disabledTick = await observeDisabledTick();
    if (Number(disabledTick?.dispatches) !== 0) {
      throw new Error('disabled scheduler tick dispatched work');
    }
    await enableAutomation();
    const scheduledTick = await waitForScheduledTick();
    const lease = await observeLeaseRenewals();
    const restart = await restartAndRecover();
    const progress = await waitForProgress();
    const leaseLoss = await forceLeaseLoss();
    evidence = {
      identity, scheduledTick, progress, lease, restart, leaseLoss,
      itemIngestion: progress?.itemIngestion ?? null,
      itemDbReadback: progress?.itemDbReadback ?? null,
      recipeIngestion: progress?.recipeIngestion ?? null,
      recipeDbReadback: progress?.recipeDbReadback ?? null,
      operationId: identity?.operationId ?? 'canonical-crawler-v2-scheduler-t1-acceptance',
    };
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  try {
    await cleanup({ retainDiagnostics: Boolean(primaryError), failureMessage: primaryError?.message });
  } catch (error) {
    cleanupError = error;
  }
  let cleanupEvidence;
  try {
    const readback = await independentReadback();
    if (evidence && readback?.itemDbReadback && !evidence.itemDbReadback) evidence.itemDbReadback = readback.itemDbReadback;
    if (evidence && readback?.recipeDbReadback && !evidence.recipeDbReadback) evidence.recipeDbReadback = readback.recipeDbReadback;
    const { itemDbReadback: _itemDbReadback, recipeDbReadback: _recipeDbReadback, ...resourceReadback } = readback ?? {};
    cleanupEvidence = resourceReadback;
  } catch (error) {
    cleanupError ??= error;
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return buildPassedLifecycleReport({ ...evidence, cleanup: cleanupEvidence });
}

export async function loadLiveSystemDriver({ modulePath, options = {} } = {}) {
  const value = String(modulePath ?? '').trim();
  if (!value) throw new Error('live system driver module is required');
  const moduleUrl = pathToFileURL(path.resolve(value)).href;
  const loaded = await import(moduleUrl);
  if (typeof loaded.createSystemDriver !== 'function') {
    throw new Error('live system driver must export createSystemDriver');
  }
  const driver = await loaded.createSystemDriver(options);
  if (!driver || typeof driver !== 'object') throw new Error('live system driver factory returned no driver');
  return driver;
}

async function main() {
  const args = new Map(process.argv.slice(2).map((arg) => arg.split(/=(.*)/s, 2)));
  assertLiveCliMode({ live: args.get('--live'), offline: args.get('--offline') });
  const driver = await loadLiveSystemDriver({
    modulePath: args.get('--driver-module'),
    options: Object.fromEntries([...args.entries()].map(([key, value]) => [key.replace(/^--/, ''), value])),
  });
  const report = await runLiveLifecycle({ driver });
  const output = String(args.get('--output') ?? '').trim();
  if (!output) throw new Error('live scheduler lifecycle output is required');
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: report.status, output: path.resolve(output) })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
