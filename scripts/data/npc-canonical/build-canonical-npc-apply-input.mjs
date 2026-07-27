#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildNpcCrawlerFactEvidence,
  validateNpcCrawlerFactRunEvidence,
} from './npc-canonical-contract.mjs';

const ENTITY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function writeCanonicalNpcApplyInput({
  repoRoot = process.cwd(),
  targetsPath,
  crawlerOutputRoot = null,
  outputPath,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const targetsFile = path.resolve(requireText(targetsPath, 'targetsPath'));
  const output = path.resolve(requireText(outputPath, 'outputPath'));
  const crawlerRoot = path.resolve(crawlerOutputRoot ?? path.join(root, 'data/wiki-crawler'));
  requireInsideRoot(root, targetsFile, 'targetsPath');
  requireInsideRoot(root, crawlerRoot, 'crawlerOutputRoot');
  requireTimestamp(generatedAt, 'generatedAt');

  const targetBytes = readRequiredFile(targetsFile, 'frozen NPC targets');
  const targetManifest = JSON.parse(targetBytes.toString('utf8'));
  const targets = validateTargetManifest(targetManifest);
  const evidence = [];
  const evidencePairs = targets.map((target) => {
    const normalizedPath = path.join(
      crawlerRoot,
      'normalized-light/npc',
      `${target.entityId}.latest.json`,
    );
    const auditPath = path.join(crawlerRoot, 'audit/npc', `${target.entityId}.latest.json`);
    const normalizedBytes = readRequiredFile(normalizedPath, `${target.entityId} normalized evidence`);
    const auditBytes = readRequiredFile(auditPath, `${target.entityId} audit evidence`);
    const fact = buildNpcCrawlerFactEvidence({
      normalized: JSON.parse(normalizedBytes.toString('utf8')),
      audit: JSON.parse(auditBytes.toString('utf8')),
    });
    if (fact.entityId !== target.entityId || fact.sourcePage !== target.pageTitle) {
      throw new Error(`NPC target identity drifted for ${target.entityId}`);
    }
    evidence.push(fact);
    return {
      entityId: fact.entityId,
      sourcePage: fact.sourcePage,
      sourceRevisionTimestamp: fact.sourceRevisionTimestamp,
      recordKey: fact.recordKey,
      normalizedContentHash: fact.normalizedContentHash,
      auditContentHash: fact.auditContentHash,
      payloadBytes: fact.payloadBytes,
      normalized: summarizeFile(root, normalizedPath, normalizedBytes),
      audit: summarizeFile(root, auditPath, auditBytes),
    };
  });
  const run = validateNpcCrawlerFactRunEvidence(evidence);
  const result = {
    schemaVersion: 1,
    operationId: 'canonical-npc-apply',
    sourceOperationId: 'canonical-npc-crawler',
    generatedAt,
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation',
    },
    targetManifest: summarizeFile(root, targetsFile, targetBytes),
    pairCount: evidencePairs.length,
    payloadBytes: run.payloadBytes,
    evidencePairs,
  };
  writeJsonAtomic(output, result);
  return result;
}

function validateTargetManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('frozen NPC target manifest must be an object');
  }
  if (manifest.schemaVersion !== 1 || manifest.operationId !== 'canonical-npc-crawler') {
    throw new Error('frozen NPC target manifest identity is invalid');
  }
  if (manifest.selection?.targetLimit !== 25 || !Array.isArray(manifest.targets)
      || manifest.targets.length !== 25) {
    throw new Error('frozen NPC target manifest must contain exactly 25 targets');
  }
  const seen = new Set();
  return manifest.targets.map((target) => {
    const entityId = requireText(target?.entityId, 'target entityId');
    if (!ENTITY_ID_PATTERN.test(entityId)) throw new Error(`target entityId is invalid: ${entityId}`);
    if (seen.has(entityId)) throw new Error(`target entityId is duplicated: ${entityId}`);
    seen.add(entityId);
    return { entityId, pageTitle: requireText(target?.pageTitle, `${entityId} pageTitle`) };
  });
}

function summarizeFile(repoRoot, filePath, bytes) {
  return {
    path: toRelativePath(repoRoot, filePath),
    contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    sizeBytes: bytes.length,
  };
}

function readRequiredFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} file is missing: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function requireInsideRoot(repoRoot, filePath, label) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside repoRoot`);
  }
}

function toRelativePath(repoRoot, filePath) {
  requireInsideRoot(repoRoot, filePath, 'evidence path');
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireTimestamp(value, label) {
  const timestamp = requireText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} must be a valid timestamp`);
  return timestamp;
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
    const result = writeCanonicalNpcApplyInput({
      repoRoot: args['repo-root'] ?? process.cwd(),
      targetsPath: args.targets ?? 'reports/authorization/canonical/canonical-npc-crawler.targets.json',
      crawlerOutputRoot: args['crawler-output-root'] ?? null,
      outputPath: args.output ?? 'reports/authorization/canonical/canonical-npc-apply.input.json',
      generatedAt: args['generated-at'] ?? new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify({ output: path.resolve(args.output), pairCount: result.pairCount })}\n`);
  } catch (error) {
    process.stderr.write(`canonical NPC apply input failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
