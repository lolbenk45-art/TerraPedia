#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const BRIDGE_PATH = 'data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json';
const SCAN_EXTENSIONS = new Set(['.mjs', '.js', '.ts', '.vue', '.java', '.sh', '.md', '.json']);
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'target', 'dist', '.nuxt', '.output']);

// Retirement means the path is no longer a SOURCE INPUT. It does not forbid naming the path at
// all: the bridge is still a legitimate generator output, docs must name it to explain the
// retirement, and the retired identity has to be registered somewhere to stay auditable.
// Every excused reference is classified and reported, so nothing is silently invisible.
function classifyReference(relativePath, text) {
  if (relativePath.startsWith('docs/')) {
    return 'documentation';
  }
  if (relativePath.startsWith('reports/')) {
    return 'historical-report';
  }
  if (relativePath.endsWith('build-npc-bridge-retirement-report.mjs')
    || relativePath.endsWith('build-npc-bridge-retirement-report.test.mjs')) {
    return 'retirement-scanner';
  }
  if (relativePath.endsWith('canonical-source-contract-registry.mjs')
    || relativePath.endsWith('canonical-source-contract-registry.test.mjs')) {
    return 'contract-registration';
  }
  // The crawler monitor displays the bridge as the output of the NPC coverage crawl, and the
  // bridge writer produces it. Producing an artifact is not consuming it as a source.
  if (text.includes('setOutputPath') || relativePath.endsWith('write-npc-bridge-data-dir.mjs')) {
    return 'producer-output';
  }
  return null;
}

function* walk(root, current = root) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') {
      continue;
    }
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }
      yield* walk(root, full);
      continue;
    }
    if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

export function buildNpcBridgeRetirementReport({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const references = [];
  const allowedReferences = [];
  let scannedFileCount = 0;

  for (const full of walk(root)) {
    scannedFileCount += 1;
    const relative = path.relative(root, full).split(path.sep).join('/');
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((text, index) => {
      if (!text.includes(BRIDGE_PATH)) {
        return;
      }
      const reason = classifyReference(relative, text);
      if (reason) {
        allowedReferences.push({ file: relative, line: index + 1, reason });
        return;
      }
      references.push({ file: relative, line: index + 1, text: text.trim() });
    });
  }
  const allowedReferenceCount = allowedReferences.length;

  const blockingReasons = [];
  if (scannedFileCount === 0) {
    blockingReasons.push('Retirement scan found zero scannable files; failing closed rather than reporting a vacuous pass.');
  }
  for (const reference of references) {
    blockingReasons.push(`${BRIDGE_PATH} is still referenced at ${reference.file}:${reference.line}.`);
  }

  return {
    generatedAt,
    reportId: 'npcBridgeRetirement',
    retiredPath: BRIDGE_PATH,
    status: blockingReasons.length > 0 ? 'blocked' : 'pass',
    requiresDatabase: false,
    writesDatabase: false,
    scannedFileCount,
    allowedReferenceCount,
    allowedReferences,
    referenceCount: references.length,
    references,
    blockingReasons,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildNpcBridgeRetirementReport({ repoRoot: process.cwd() });
  const outputPath = path.join(process.cwd(), 'reports', 'canonical-migration', 'npc-bridge-retirement.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${report.status}: ${report.referenceCount} reference(s) across ${report.scannedFileCount} files\n`);
  process.exitCode = report.status === 'pass' ? 0 : 1;
}
