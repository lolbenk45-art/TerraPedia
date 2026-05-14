#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const options = {
    skipDb: false,
    skipNoDb: false,
    allowDbSkip: false,
    failOnWarning: false,
    dbHost: '127.0.0.1',
    dbPort: 3306,
    sharedDataRoot: undefined,
    outputDir: path.join(repoRoot, 'reports'),
  };
  const setValue = (key, value) => {
    if (key === 'dbHost') options.dbHost = value;
    if (key === 'dbPort') options.dbPort = Number.parseInt(value, 10);
    if (key === 'sharedDataRoot') options.sharedDataRoot = value;
    if (key === 'outputDir') options.outputDir = path.resolve(value);
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [rawKey, rawValue] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const key = rawKey.toLowerCase();
    if (key === '--skip-db' || key === '-skipdb') options.skipDb = true;
    else if (key === '--skip-no-db' || key === '-skipnodb') options.skipNoDb = true;
    else if (key === '--allow-db-skip' || key === '-allowdbskip') options.allowDbSkip = true;
    else if (key === '--fail-on-warning' || key === '-failonwarning') options.failOnWarning = true;
    else if (key === '--db-host' || key === '-dbhost') setValue('dbHost', rawValue ?? argv[++index]);
    else if (key === '--db-port' || key === '-dbport') setValue('dbPort', rawValue ?? argv[++index]);
    else if (key === '--shared-data-root' || key === '-shared-data-root' || key === '-sharedataroot') setValue('sharedDataRoot', rawValue ?? argv[++index]);
    else if (key === '--output-dir' || key === '-outputdir') setValue('outputDir', rawValue ?? argv[++index]);
    else if (key === '--help' || key === '-h' || key === '/?') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.dbPort) || options.dbPort <= 0) {
    throw new Error(`Invalid DB port: ${options.dbPort}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/dev/acceptance-test.mjs [options]

Options:
  --skip-db              Skip DB-required phase.
  --skip-no-db           Skip no-DB phase.
  --allow-db-skip        Treat unreachable DB as skipped DB checks.
  --fail-on-warning      Treat warning status as failure.
  --db-host <host>       DB TCP preflight host. Default: 127.0.0.1.
  --db-port <port>       DB TCP preflight port. Default: 3306.
  --shared-data-root <p> Shared data root. Default: ../data/terraPedia.
  --output-dir <path>    Summary report directory. Default: reports.`);
}

function timestampParts() {
  const now = new Date();
  const compact = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return { compact, iso: now.toISOString() };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeUtf8NoBom(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, { encoding: 'utf8' });
}

function readConfig() {
  for (const candidate of [
    path.join(__dirname, 'config', 'local-stack.config.json'),
    path.join(__dirname, 'local-stack.config.json'),
  ]) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function getNested(root, segments) {
  let current = root;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current;
}

function resolveSetting(envName, configValue, fallback) {
  const envValue = process.env[envName];
  if (envValue != null && String(envValue).trim() !== '') return envValue;
  if (configValue != null && String(configValue).trim() !== '') return configValue;
  return fallback;
}

function getDbEnvVars(config, options) {
  return {
    host: String(resolveSetting('TERRAPEDIA_DB_HOST', getNested(config, ['database', 'host']), options.dbHost)),
    port: Number.parseInt(resolveSetting('TERRAPEDIA_DB_PORT', getNested(config, ['database', 'port']), options.dbPort), 10),
    username: String(resolveSetting('TERRAPEDIA_DB_USERNAME', getNested(config, ['database', 'username']), 'root')),
    password: String(resolveSetting('TERRAPEDIA_DB_PASSWORD', getNested(config, ['database', 'password']), 'root')),
  };
}

function testLocalTcpPort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function getOptionalArrayCount(root, propertyName) {
  if (root == null || typeof root !== 'object') return 0;
  const value = root[propertyName];
  if (value == null) return 0;
  return Array.isArray(value) ? value.length : 1;
}

function testAcceptanceBlocked(parsed, failOnWarning = false) {
  const summary = parsed?.summary ?? {};
  const statusPaths = [parsed?.status, parsed?.overallStatus, summary.status]
    .filter((value) => value != null && String(value) !== '')
    .map(String);

  if (statusPaths.includes('blocked')) return true;
  if (failOnWarning && statusPaths.includes('warning')) return true;
  if ((summary.blockingCount ?? 0) > 0) return true;
  if (getOptionalArrayCount(summary, 'schemaViolations') > 0) return true;
  if (getOptionalArrayCount(summary, 'missingLandingInputs') > 0) return true;
  if (summary.coverageRate != null && summary.coverageRate < 1) return true;
  if (summary.hashMatchRate != null && summary.hashMatchRate < 1) return true;
  return false;
}

function assertJsonKeys(stdout, keys) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`stdout is not valid JSON: ${error.message}`);
  }
  const missing = keys.filter((key) => !(key in parsed));
  if (missing.length > 0) {
    throw new Error(`Missing expected top-level keys: ${missing.join(', ')}`);
  }
  return parsed;
}

function statusSummary(parsed) {
  const status = parsed.status ?? parsed.overallStatus ?? 'unknown';
  const parts = [`status=${status}`];
  if (parsed.summary && typeof parsed.summary === 'object') {
    for (const [key, value] of Object.entries(parsed.summary)) {
      parts.push(`${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
  }
  const summary = parts.join(', ');
  return summary.length > 140 ? `${summary.slice(0, 140)}...` : summary;
}

function blockingReason(parsed, failOnWarning) {
  const summary = parsed.summary ?? {};
  const schemaViolationCount = getOptionalArrayCount(summary, 'schemaViolations');
  const missingLandingInputCount = getOptionalArrayCount(summary, 'missingLandingInputs');
  if (schemaViolationCount > 0) return `schemaViolations=${schemaViolationCount}`;
  if (missingLandingInputCount > 0) return `missingLandingInputs=${missingLandingInputCount}`;
  if ((summary.blockingCount ?? 0) > 0) return `blockingCount=${summary.blockingCount}`;
  if (summary.coverageRate != null && summary.coverageRate < 1) return `coverageRate=${summary.coverageRate}`;
  if (summary.hashMatchRate != null && summary.hashMatchRate < 1) return `hashMatchRate=${summary.hashMatchRate}`;
  if (failOnWarning) return 'top-level or summary.status=warning';
  return 'top-level or summary.status=blocked';
}

function addResult(results, stepId, phase, scriptPath, status, durationSeconds, exitCode, message, keyAssertions = []) {
  results.push({
    id: stepId,
    phase,
    script: scriptPath,
    status,
    durationSeconds: Number(durationSeconds.toFixed(2)),
    exitCode,
    message,
    keyAssertions,
  });
}

function writeStepLine(status, stepId, message, durationSeconds) {
  console.log(`[${status.toUpperCase()}] ${stepId} - ${message} (${durationSeconds.toFixed(1)}s)`);
}

function runNodeStep({ results, options, stepId, phase, scriptPath, args = [], keyAssertions = [], outputPath }) {
  const start = performance.now();
  let exitCode = -1;
  try {
    const fullScriptPath = path.join(repoRoot, scriptPath);
    const child = spawnSync(process.execPath, [fullScriptPath, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env },
      maxBuffer: 32 * 1024 * 1024,
    });
    exitCode = child.status ?? 1;
    const duration = (performance.now() - start) / 1000;
    const stdout = String(child.stdout ?? '').trim();
    if (!stdout) {
      addResult(results, stepId, phase, scriptPath, 'fail', duration, exitCode, 'No stdout output', keyAssertions);
      writeStepLine('fail', stepId, 'No stdout output', duration);
      return;
    }
    const parsed = assertJsonKeys(stdout, keyAssertions);
    const summary = statusSummary(parsed);
    if (exitCode !== 0) {
      addResult(results, stepId, phase, scriptPath, 'fail', duration, exitCode, `exit code ${exitCode}`, keyAssertions);
      writeStepLine('fail', stepId, `exit code ${exitCode}`, duration);
      return;
    }
    if (testAcceptanceBlocked(parsed, options.failOnWarning)) {
      const reason = blockingReason(parsed, options.failOnWarning);
      addResult(results, stepId, phase, scriptPath, 'fail', duration, 0, `blocked - ${reason}`, keyAssertions);
      writeStepLine('fail', stepId, `blocked - ${reason}`, duration);
      return;
    }
    if (outputPath) writeUtf8NoBom(outputPath, stdout);
    addResult(results, stepId, phase, scriptPath, 'pass', duration, 0, summary, keyAssertions);
    writeStepLine('pass', stepId, summary, duration);
  } catch (error) {
    const duration = (performance.now() - start) / 1000;
    addResult(results, stepId, phase, scriptPath, 'fail', duration, exitCode, error.message, keyAssertions);
    writeStepLine('fail', stepId, error.message, duration);
  }
}

function skipStep(results, stepId, phase, scriptPath, reason) {
  addResult(results, stepId, phase, scriptPath, 'skip', 0, 0, reason, []);
  writeStepLine('skip', stepId, reason, 0);
}

function noDbSteps(nowIso, sharedDataRoot, timestamp, acceptanceDir) {
  const b1Script = 'scripts/data/audit/b1-exemption-compliance.mjs';
  const b1Keys = ['generatedAt', 'domainId', 'panelId', 'status', 'summary', 'checks'];
  const steps = [
    ...[
      ['b1-recipe', 'support.recipe'],
      ['b1-shimmer', 'support.shimmer'],
      ['b1-item_group', 'support.item_group'],
      ['b1-town_npc', 'support.town_npc_maintenance'],
    ].map(([id, domain]) => ({
      stepId: id,
      phase: 'no-db',
      scriptPath: b1Script,
      args: [`--domain=${domain}`, `--generated-at=${nowIso}`, `--repo-root=${repoRoot}`],
      keyAssertions: b1Keys,
    })),
    {
      stepId: 'freshness-audit',
      phase: 'no-db',
      scriptPath: 'scripts/data/workflow/domain-acceptance-freshness-audit.mjs',
      args: [`--repo-root=${repoRoot}`, `--generated-at=${nowIso}`],
      keyAssertions: ['generatedAt', 'overallStatus', 'summary', 'panels'],
    },
    {
      stepId: 'refresh-plan',
      phase: 'no-db',
      scriptPath: 'scripts/data/workflow/domain-acceptance-refresh-plan.mjs',
      args: [`--repo-root=${repoRoot}`, `--generated-at=${nowIso}`],
      keyAssertions: ['generatedAt', 'overallStatus', 'summary', 'actions'],
    },
    {
      stepId: 'staleness-alert',
      phase: 'no-db',
      scriptPath: 'scripts/data/workflow/create-staleness-alert-issue.mjs',
      args: [`--generated-at=${nowIso}`],
      keyAssertions: ['generatedAt', 'shouldCreateIssue', 'title', 'historyEntry'],
    },
    {
      stepId: 'canonical-candidates',
      phase: 'no-db',
      scriptPath: 'scripts/data/canonical/generate-canonical-candidates.mjs',
      args: [`--repo-root=${repoRoot}`, `--shared-data-root=${sharedDataRoot}`],
      keyAssertions: ['domain', 'generatedAt', 'summary', 'artifactPaths'],
    },
  ];

  const crawlerWrapperPath = path.join(acceptanceDir, `crawler-layout-wrapper-${timestamp}.mjs`);
  const relativeCrawlerWrapper = path.relative(repoRoot, crawlerWrapperPath).replaceAll(path.sep, '/');
  writeUtf8NoBom(
    crawlerWrapperPath,
    "import { checkCrawlerSourceLayout } from '../../scripts/data/crawler/source-layout-check.mjs';\nconsole.log(JSON.stringify(checkCrawlerSourceLayout(), null, 2));\n",
  );
  steps.splice(7, 0, {
    stepId: 'crawler-layout',
    phase: 'no-db',
    scriptPath: relativeCrawlerWrapper,
    args: [],
    keyAssertions: ['status', 'blocking', 'warnings'],
  });
  return steps;
}

function dbSteps(nowIso) {
  return [
    {
      stepId: 'lineage-trace-item',
      scriptPath: 'scripts/data/audit/record-lineage-trace.mjs',
      args: ['--entity=item', '--internal-name=Wood'],
      keyAssertions: ['generatedAt', 'entity', 'lookup', 'databases', 'stages'],
    },
    {
      stepId: 'lineage-trace-npc',
      scriptPath: 'scripts/data/audit/record-lineage-trace.mjs',
      args: ['--entity=npc', '--internal-name=Guide'],
      keyAssertions: ['generatedAt', 'entity', 'lookup', 'databases', 'stages'],
    },
    {
      stepId: 'image-source-lineage',
      scriptPath: 'scripts/data/audit/image-source-lineage-report.mjs',
      args: ['--source=db', `--generated-at=${nowIso}`],
      keyAssertions: ['generatedAt', 'contractVersion', 'summary', 'entities'],
    },
    {
      stepId: 'cross-db-integrity',
      scriptPath: 'scripts/data/audit/cross-db-referential-integrity.mjs',
      args: ['--mode=quick', '--write-report=true', `--generated-at=${nowIso}`],
      keyAssertions: ['generatedAt', 'mode', 'summary', 'checks'],
    },
    {
      stepId: 'reresolve-candidates',
      scriptPath: 'scripts/data/relation/generate-reresolve-candidates.mjs',
      args: ['--relation-database=terria_v1_relation', '--write-report=true', `--generated-at=${nowIso}`],
      keyAssertions: ['generatedAt', 'summary', 'trend', 'candidates'],
    },
    {
      stepId: 'reresolve-dry-run',
      scriptPath: 'scripts/data/relation/apply-reresolve-results.mjs',
      args: ['--relation-database=terria_v1_relation', `--generated-at=${nowIso}`],
      keyAssertions: ['generatedAt', 'apply', 'summary'],
    },
  ].map((step) => ({ ...step, phase: 'db' }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { compact: timestamp, iso: nowIso } = timestampParts();
  const config = readConfig();
  const reportsDir = options.outputDir;
  const acceptanceDir = path.join(reportsDir, 'acceptance-test');
  const summaryPath = path.join(reportsDir, `acceptance-test-${timestamp}.json`);
  const sharedDataRoot = options.sharedDataRoot
    ?? (fs.existsSync(path.join(path.dirname(repoRoot), 'data', 'terraPedia'))
      ? path.join(path.dirname(repoRoot), 'data', 'terraPedia')
      : path.join(path.dirname(repoRoot), 'data', 'terraPedia'));
  ensureDir(acceptanceDir);

  const dbEnv = getDbEnvVars(config, options);
  const results = [];
  let dbAvailable = false;

  if (!options.skipDb) {
    console.log('');
    console.log('===================================================================');
    console.log('  DB TCP Preflight');
    console.log('===================================================================');
    console.log(`target: ${dbEnv.host}:${dbEnv.port}`);
    dbAvailable = await testLocalTcpPort(dbEnv.host, dbEnv.port, 2000);
    console.log(dbAvailable ? 'Result: reachable' : 'Result: NOT reachable - Phase 2 (DB) will be skipped');
  }

  if (!options.skipNoDb) {
    console.log('');
    console.log('===================================================================');
    console.log('  PHASE 1: No-DB Tests (13 steps)');
    console.log('===================================================================');
    for (const step of noDbSteps(nowIso, sharedDataRoot, timestamp, acceptanceDir)) {
      runNodeStep({ results, options, ...step });
    }

    const candidatesFile = path.join(repoRoot, 'reports', 'canonical', 'candidates', 'item', 'canonical-candidates.json');
    if (fs.existsSync(candidatesFile)) {
      runNodeStep({
        results,
        options,
        stepId: 'canonical-consistency',
        phase: 'no-db',
        scriptPath: 'scripts/data/canonical/audit-canonical-consistency.mjs',
        args: [`--repo-root=${repoRoot}`, `--shared-data-root=${sharedDataRoot}`, `--input=${candidatesFile}`],
        keyAssertions: ['domain', 'generatedAt', 'summary', 'reportPath'],
      });
    } else {
      skipStep(results, 'canonical-consistency', 'no-db', 'scripts/data/canonical/audit-canonical-consistency.mjs', `candidates file not found (step 9 may have failed): ${candidatesFile}`);
    }

    const chainAuditFile = path.join(acceptanceDir, `freshness-audit-${timestamp}.json`);
    const chainPlanFile = path.join(acceptanceDir, `refresh-plan-${timestamp}.json`);
    runNodeStep({
      results,
      options,
      stepId: 'chain-freshness-audit',
      phase: 'no-db',
      scriptPath: 'scripts/data/workflow/domain-acceptance-freshness-audit.mjs',
      args: [`--repo-root=${repoRoot}`, `--generated-at=${nowIso}`],
      keyAssertions: ['generatedAt', 'overallStatus', 'summary', 'panels'],
      outputPath: chainAuditFile,
    });
    if (fs.existsSync(chainAuditFile)) {
      runNodeStep({
        results,
        options,
        stepId: 'chain-refresh-plan',
        phase: 'no-db',
        scriptPath: 'scripts/data/workflow/domain-acceptance-refresh-plan.mjs',
        args: [`--repo-root=${repoRoot}`, `--generated-at=${nowIso}`, `--audit=${chainAuditFile}`],
        keyAssertions: ['generatedAt', 'overallStatus', 'summary', 'actions'],
        outputPath: chainPlanFile,
      });
      if (fs.existsSync(chainPlanFile)) {
        runNodeStep({
          results,
          options,
          stepId: 'chain-staleness-alert',
          phase: 'no-db',
          scriptPath: 'scripts/data/workflow/create-staleness-alert-issue.mjs',
          args: [`--generated-at=${nowIso}`, `--audit=${chainAuditFile}`, `--plan=${chainPlanFile}`, `--body-path=${path.join(acceptanceDir, `staleness-alert-${timestamp}.md`)}`, `--history-path=${path.join(acceptanceDir, `staleness-history-${timestamp}.jsonl`)}`],
          keyAssertions: ['generatedAt', 'shouldCreateIssue', 'title', 'bodyPath', 'historyPath', 'historyEntry'],
        });
      } else {
        skipStep(results, 'chain-staleness-alert', 'no-db', 'scripts/data/workflow/create-staleness-alert-issue.mjs', 'upstream failed: refresh plan temp file not found (chain-refresh-plan did not produce output)');
      }
    } else {
      skipStep(results, 'chain-refresh-plan', 'no-db', 'scripts/data/workflow/domain-acceptance-refresh-plan.mjs', 'upstream failed: audit temp file not found (chain-freshness-audit did not produce output)');
      skipStep(results, 'chain-staleness-alert', 'no-db', 'scripts/data/workflow/create-staleness-alert-issue.mjs', 'upstream failed: audit temp file not found (chain-freshness-audit did not produce output)');
    }
  }

  if (!options.skipDb) {
    console.log('');
    console.log('===================================================================');
    console.log('  PHASE 2: DB-Required Tests (6 steps)');
    console.log('===================================================================');
    const steps = dbSteps(nowIso);
    if (!dbAvailable) {
      for (const step of steps) {
        if (options.allowDbSkip) {
          skipStep(results, step.stepId, step.phase, step.scriptPath, 'DB not available (--allow-db-skip set)');
        } else {
          addResult(results, step.stepId, step.phase, step.scriptPath, 'fail', 0, -1, 'DB not available (use --allow-db-skip to permit skipping)');
          writeStepLine('fail', step.stepId, 'DB not available (use --allow-db-skip to permit skipping)', 0);
        }
      }
    } else {
      process.env.TERRAPEDIA_DB_HOST = dbEnv.host;
      process.env.TERRAPEDIA_DB_PORT = String(dbEnv.port);
      process.env.TERRAPEDIA_DB_USERNAME = dbEnv.username;
      process.env.TERRAPEDIA_DB_PASSWORD = dbEnv.password;
      for (const step of steps) runNodeStep({ results, options, ...step });
    }
  }

  const passed = results.filter((entry) => entry.status === 'pass').length;
  const failed = results.filter((entry) => entry.status === 'fail').length;
  const skipped = results.filter((entry) => entry.status === 'skip').length;
  const totalDuration = Number(results.reduce((sum, entry) => sum + entry.durationSeconds, 0).toFixed(1));
  console.log('');
  console.log('===================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped (${results.length} total) in ${totalDuration}s`);
  console.log('===================================================================');

  const summary = {
    timestamp,
    repoRoot,
    dbAvailable,
    dbHost: dbEnv.host,
    dbPort: dbEnv.port,
    totalSteps: results.length,
    passed,
    failed,
    skipped,
    durationSeconds: totalDuration,
    steps: results,
  };
  writeUtf8NoBom(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Summary written to: ${summaryPath}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
