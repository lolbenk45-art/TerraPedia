#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const scriptPath = path.join(process.cwd(), 'scripts', 'data', 'backfill-item-periods-from-wiki.mjs');
const partitionCount = Math.max(1, Number(args.partitionCount || '4'));
const concurrency = Math.max(1, Math.min(partitionCount, Number(args.concurrency || String(partitionCount))));
const apply = args.apply === 'true';
const targetDelayMs = Math.max(0, Number(args.targetDelayMs || '600'));
const targetPageLimit = Math.max(0, Number(args.targetPageLimit || '0'));
const disableRemoteTargets = args.disableRemoteTargets !== 'false';
const reportDir = args.reportDir || path.join(process.cwd(), 'reports');
const label = args.label || new Date().toISOString().slice(0, 10);

fs.mkdirSync(reportDir, { recursive: true });

const queue = Array.from({ length: partitionCount }, (_, index) => index);
const shardSummaries = [];

await Promise.all(Array.from({ length: concurrency }, () => runWorker()));

const aggregate = {
  generatedAt: new Date().toISOString(),
  apply,
  partitionCount,
  concurrency,
  totalItems: 0,
  selectedItems: 0,
  candidateUpdated: 0,
  candidateRarityUpdated: 0,
  candidatePeriodUpdated: 0,
  rarityUpdated: 0,
  periodUpdated: 0,
  unresolved: 0,
  targetPagesFetched: 0,
  targetPagesCached: 0,
  periodReasonCounts: {},
  shardReports: shardSummaries.map((entry) => entry.output),
};

for (const summary of shardSummaries) {
  aggregate.totalItems = Math.max(aggregate.totalItems, Number(summary.totalItems || 0));
  aggregate.selectedItems += Number(summary.selectedItems || 0);
  aggregate.candidateUpdated += Number(summary.candidateUpdated || 0);
  aggregate.candidateRarityUpdated += Number(summary.candidateRarityUpdated || 0);
  aggregate.candidatePeriodUpdated += Number(summary.candidatePeriodUpdated || 0);
  aggregate.rarityUpdated += Number(summary.rarityUpdated || 0);
  aggregate.periodUpdated += Number(summary.periodUpdated || 0);
  aggregate.unresolved += Number(summary.unresolved || 0);
  aggregate.targetPagesFetched += Number(summary.targetPagesFetched || 0);
  aggregate.targetPagesCached += Number(summary.targetPagesCached || 0);
  for (const [reason, count] of Object.entries(summary.periodReasonCounts || {})) {
    aggregate.periodReasonCounts[reason] = (aggregate.periodReasonCounts[reason] || 0) + Number(count || 0);
  }
}

const aggregatePath = path.join(reportDir, `item-period-backfill-batches-${label}.json`);
fs.writeFileSync(aggregatePath, JSON.stringify(aggregate, null, 2), 'utf8');
console.log(JSON.stringify({ aggregatePath, aggregate }, null, 2));

async function runWorker() {
  while (queue.length > 0) {
    const partitionIndex = queue.shift();
    if (partitionIndex == null) {
      return;
    }
    const output = path.join(reportDir, `item-period-backfill-${label}-partition-${partitionIndex}-of-${partitionCount}.json`);
    await runPartition({ partitionIndex, output });
    shardSummaries.push({ ...JSON.parse(fs.readFileSync(output, 'utf8')), output });
  }
}

function runPartition({ partitionIndex, output }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        scriptPath,
        `--apply=${apply}`,
        `--output=${output}`,
        `--partitionCount=${partitionCount}`,
        `--partitionIndex=${partitionIndex}`,
        `--targetDelayMs=${targetDelayMs}`,
        `--targetPageLimit=${targetPageLimit}`,
        `--disableRemoteTargets=${disableRemoteTargets}`,
      ],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env,
      },
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Partition ${partitionIndex} failed with exit code ${code}`));
    });
  });
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = 'true';
  }
  return out;
}
