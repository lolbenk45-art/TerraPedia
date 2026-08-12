#!/usr/bin/env node
// crawler-v2-scheduler-activation-preflight-eligible-only.mjs
// Wrapper around the canonical preflight builder that filters the API snapshot
// to only eligible domains before passing to assertSnapshot.
// Used when some domains are intentionally excluded from this authorization cycle.
// Same CLI surface as crawler-v2-scheduler-activation-preflight.mjs.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildCrawlerV2SchedulerActivationPreflight,
  buildPreflightEndpointUrl,
  resolveSchedulerActivationCodeBundlePaths,
} from './crawler-v2-scheduler-activation-preflight.mjs';

const PREFLIGHT_ENDPOINT_PATH = 'admin/crawler-monitor/v2/automation/preflight';

function parseArgs(argv) {
  const args = Object.fromEntries(
    argv.filter((a) => a.startsWith('--')).map((a) => {
      const [key, ...rest] = a.slice(2).split('=');
      return [key, rest.join('=')];
    }),
  );
  for (const key of ['api-base', 't1-report', 'output']) {
    if (!args[key]) throw new Error(`--${key}=<value> is required`);
  }
  return args;
}

function assertInsideRepo(filePath, repoRoot, label) {
  const root = path.resolve(repoRoot);
  const normalized = path.resolve(filePath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} must remain inside the repository`);
  }
  return normalized;
}

function assertAuthorizationOutputPath(outputPath, repoRoot) {
  const root = path.resolve(repoRoot, 'reports/authorization/canonical');
  const normalized = path.resolve(outputPath);
  if (normalized !== root && !normalized.startsWith(`${root}${path.sep}`)) {
    throw new Error('preflight output must remain under reports/authorization/canonical');
  }
}

function writeAtomicNoOverwrite(outputPath, payload) {
  const directory = path.dirname(outputPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temp = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try {
    fs.renameSync(temp, outputPath);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function readT1Report(reportPath, repoRoot) {
  const absolute = assertInsideRepo(path.resolve(repoRoot, reportPath), repoRoot, 'T1 report');
  const bytes = fs.readFileSync(absolute);
  const report = JSON.parse(bytes.toString('utf8'));
  return {
    ...report,
    path: reportPath,
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    contentSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

function resolveCodeBundle(repoRoot) {
  return resolveSchedulerActivationCodeBundlePaths(repoRoot).map((relativePath) => {
    const bytes = fs.readFileSync(
      assertInsideRepo(path.resolve(repoRoot, relativePath), repoRoot, `code bundle ${relativePath}`),
    );
    return { path: relativePath, sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
  });
}

async function fetchSnapshot(apiBase) {
  const url = buildPreflightEndpointUrl(apiBase);
  const headers = { accept: 'application/json' };
  if (process.env.TERRAPEDIA_ADMIN_TOKEN) headers.authorization = `Bearer ${process.env.TERRAPEDIA_ADMIN_TOKEN}`;
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) throw new Error(`preflight GET failed with HTTP ${response.status}`);
  const body = await response.json();
  if (body?.success === false) throw new Error('preflight GET returned success=false');
  return body?.data ?? body;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();

  const rawSnapshot = await fetchSnapshot(args['api-base']);

  // Filter to eligible domains only — explicitly exclude non-eligible operations
  // so that assertSnapshot does not reject the snapshot on their behalf.
  const allDomains = rawSnapshot.domains ?? [];
  const eligibleDomains = allDomains.filter((d) => d.readinessStatus === 'eligible');
  const excludedCount = allDomains.length - eligibleDomains.length;
  if (eligibleDomains.length === 0) throw new Error('no eligible domains in snapshot; cannot build preflight');
  process.stderr.write(
    `snapshot filter: ${eligibleDomains.length} eligible, ${excludedCount} excluded (non-eligible)\n`,
  );

  const snapshot = { ...rawSnapshot, domains: eligibleDomains };

  const t1Report = readT1Report(args['t1-report'], repoRoot);
  const codeBundle = resolveCodeBundle(repoRoot);

  const preflight = buildCrawlerV2SchedulerActivationPreflight({ snapshot, t1Report, codeBundle });

  const outputPath = path.resolve(repoRoot, args.output);
  assertAuthorizationOutputPath(outputPath, repoRoot);
  writeAtomicNoOverwrite(outputPath, preflight);

  process.stdout.write(
    `${JSON.stringify({ output: outputPath, preflightHash: preflight.preflightHash, eligibleCount: eligibleDomains.length, excludedCount })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
