#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildNpcCoverageTargets } from '../crawler/src/coverage/build-npc-coverage-targets.mjs';

const PRIORITY_ORDER = Object.freeze(['p0_town', 'p0_boss', 'p1_friendly', 'p1_enemy']);
const DEFAULT_QUOTAS = Object.freeze({
  p0_town: 8,
  p0_boss: 8,
  p1_friendly: 4,
  p1_enemy: 5,
});

export function buildCanonicalNpcTargets({
  standardizedPayload,
  standardizedBytes,
  crawledEntityIds = [],
  generatedAt = new Date().toISOString(),
  targetLimit = 25,
} = {}) {
  if (!standardizedPayload || !Array.isArray(standardizedPayload.records)) {
    throw new Error('standardized NPC payload with records is required');
  }
  if (!Number.isInteger(targetLimit) || targetLimit !== 25) {
    throw new Error('canonical NPC targetLimit must be exactly 25');
  }
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('generatedAt must be a timestamp');
  const bytes = toBuffer(standardizedBytes, 'standardized NPC bytes');
  const coverage = buildNpcCoverageTargets({ standardizedPayload, crawledEntityIds });
  const available = coverage.targets.filter((target) => (
    !target.alreadyCrawled
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(target.entityId ?? ''))
    && Array.isArray(target.targetEntityIds)
    && target.targetEntityIds.length > 0
  ));
  if (available.length < targetLimit) {
    throw new Error(`canonical NPC target selection requires exactly ${targetLimit} uncrawled targets`);
  }

  const selected = [];
  const selectedKeys = new Set();
  for (const priority of PRIORITY_ORDER) {
    for (const target of available.filter((row) => row.priority === priority).slice(0, DEFAULT_QUOTAS[priority])) {
      selected.push(target);
      selectedKeys.add(targetKey(target));
    }
  }
  for (const target of available) {
    if (selected.length >= targetLimit) break;
    if (!selectedKeys.has(targetKey(target))) {
      selected.push(target);
      selectedKeys.add(targetKey(target));
    }
  }
  if (selected.length !== targetLimit) {
    throw new Error(`canonical NPC target selection requires exactly ${targetLimit} uncrawled targets`);
  }

  const targets = selected.map((target) => ({
    pageTitle: target.pageTitle,
    entityId: target.entityId,
    targetEntityIds: target.targetEntityIds,
    priority: target.priority,
    variantCount: target.variantCount,
    standardizedRecords: target.standardizedRecords,
  }));
  return {
    schemaVersion: 1,
    operationId: 'canonical-npc-crawler',
    generatedAt,
    source: {
      path: 'data/standardized/npcs.standardized.json',
      contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      recordCount: standardizedPayload.records.length,
    },
    selection: {
      targetLimit,
      availableUncrawledTargets: available.length,
      requestedQuotas: { ...DEFAULT_QUOTAS },
      selectedCounts: Object.fromEntries(PRIORITY_ORDER.map((priority) => [
        priority,
        targets.filter((target) => target.priority === priority).length,
      ])),
    },
    targets,
  };
}

export function writeCanonicalNpcTargets({
  sourcePath,
  outputPath,
  crawlerOutputRoot = null,
  generatedAt = new Date().toISOString(),
  targetLimit = 25,
} = {}) {
  const source = path.resolve(requireText(sourcePath, 'sourcePath'));
  const output = path.resolve(requireText(outputPath, 'outputPath'));
  const sourceBytes = fs.readFileSync(source);
  const normalizedRoot = path.resolve(
    crawlerOutputRoot ?? path.join(path.dirname(source), '..', 'wiki-crawler', 'normalized-light', 'npc'),
  );
  const crawledEntityIds = fs.existsSync(normalizedRoot)
    ? fs.readdirSync(normalizedRoot)
      .filter((name) => name.endsWith('.latest.json'))
      .map((name) => name.slice(0, -'.latest.json'.length))
      .sort()
    : [];
  const result = buildCanonicalNpcTargets({
    standardizedPayload: JSON.parse(sourceBytes.toString('utf8')),
    standardizedBytes: sourceBytes,
    crawledEntityIds,
    generatedAt,
    targetLimit,
  });
  writeJsonAtomic(output, result);
  return result;
}

function targetKey(target) {
  return `${target.priority}\u0000${target.pageTitle}`;
}

function toBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error(`${label} are required`);
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = writeCanonicalNpcTargets({
      sourcePath: args.source ?? 'data/standardized/npcs.standardized.json',
      outputPath: args.output,
      crawlerOutputRoot: args['crawler-output-root'] ?? null,
      generatedAt: args['generated-at'] ?? new Date().toISOString(),
      targetLimit: args.limit == null ? 25 : Number(args.limit),
    });
    process.stdout.write(`${JSON.stringify({
      output: path.resolve(args.output),
      targetCount: result.targets.length,
      selectedCounts: result.selection.selectedCounts,
    })}\n`);
  } catch (error) {
    process.stderr.write(`canonical NPC target build failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
