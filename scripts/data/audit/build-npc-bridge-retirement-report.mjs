#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const BRIDGE_PATH = 'data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json';
const SCAN_EXTENSIONS = new Set(['.mjs', '.js', '.ts', '.vue', '.java', '.sh', '.md', '.json']);
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'target', 'dist', '.nuxt', '.output']);

// Documentation must be able to name the retired path in order to explain the retirement,
// and this scanner plus its test necessarily contain the literal they search for.
function isAllowedReference(relativePath) {
  if (relativePath.startsWith('docs/')) {
    return true;
  }
  if (relativePath.endsWith('build-npc-bridge-retirement-report.mjs')) {
    return true;
  }
  if (relativePath.endsWith('build-npc-bridge-retirement-report.test.mjs')) {
    return true;
  }
  return false;
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
  let scannedFileCount = 0;
  let allowedReferenceCount = 0;

  for (const full of walk(root)) {
    scannedFileCount += 1;
    const relative = path.relative(root, full).split(path.sep).join('/');
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((text, index) => {
      if (!text.includes(BRIDGE_PATH)) {
        return;
      }
      if (isAllowedReference(relative)) {
        allowedReferenceCount += 1;
        return;
      }
      references.push({ file: relative, line: index + 1, text: text.trim() });
    });
  }

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
