#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  booleanOption,
  numericOption,
  parseCliArgs,
  sharedDataPath
} from '../lib/wiki-item-utils.mjs';
import {
  resolveProjectPath
} from '../lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_KEEP = 7;
const SNAPSHOT_PATTERN = /^(?<stem>.+)\.(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d{3})?Z)\.(?<extension>json)$/;

export function buildSnapshotGcPlan({
  roots = defaultSnapshotRoots(),
  keep = DEFAULT_KEEP
} = {}) {
  const normalizedKeep = Math.max(0, numericOption(keep, DEFAULT_KEEP));
  const groups = new Map();

  for (const root of normalizeRoots(roots)) {
    for (const filePath of listSnapshotFiles(root)) {
      const parsed = parseSnapshotFile(filePath);
      if (!parsed) {
        continue;
      }
      const groupKey = `${parsed.directory}\0${parsed.stem}\0${parsed.extension}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(parsed);
    }
  }

  const keepFiles = [];
  const deleteFiles = [];

  for (const group of groups.values()) {
    group.sort((left, right) => {
      return right.timestamp.localeCompare(left.timestamp) || right.filePath.localeCompare(left.filePath);
    });
    keepFiles.push(...group.slice(0, normalizedKeep).map((entry) => entry.filePath));
    deleteFiles.push(...group.slice(normalizedKeep).map((entry) => entry.filePath));
  }

  return {
    roots: normalizeRoots(roots),
    keep: normalizedKeep,
    keepFiles: keepFiles.sort(),
    deleteFiles: deleteFiles.sort()
  };
}

export function runSnapshotGc({
  roots = defaultSnapshotRoots(),
  keep = DEFAULT_KEEP,
  dryRun = false
} = {}) {
  const plan = buildSnapshotGcPlan({ roots, keep });
  if (!dryRun) {
    for (const filePath of plan.deleteFiles) {
      fs.rmSync(filePath, { force: true });
    }
  }
  return {
    ...plan,
    deleted: dryRun ? 0 : plan.deleteFiles.length,
    plannedDeleteCount: plan.deleteFiles.length
  };
}

function defaultSnapshotRoots() {
  return [
    sharedDataPath('raw', 'wiki'),
    sharedDataPath('generated'),
    resolveProjectPath('data', 'generated')
  ];
}

function normalizeRoots(roots) {
  return [...new Set((Array.isArray(roots) ? roots : [roots])
    .map((root) => String(root ?? '').trim())
    .filter(Boolean)
    .map((root) => path.resolve(root)))];
}

function listSnapshotFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSnapshotFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function parseSnapshotFile(filePath) {
  const match = path.basename(filePath).match(SNAPSHOT_PATTERN);
  if (!match?.groups) {
    return null;
  }
  return {
    filePath,
    directory: path.dirname(filePath),
    stem: match.groups.stem,
    timestamp: match.groups.timestamp,
    extension: match.groups.extension
  };
}

function parseRootOptions(options) {
  const rawRoots = options.root ?? options.roots;
  if (!rawRoots) {
    return defaultSnapshotRoots();
  }
  return String(rawRoots)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

if (process.argv[1] === __filename) {
  const options = parseCliArgs(process.argv.slice(2));
  const result = runSnapshotGc({
    roots: parseRootOptions(options),
    keep: numericOption(options.keep, DEFAULT_KEEP),
    dryRun: booleanOption(options['dry-run'] ?? options.dryRun, false)
  });
  console.log(JSON.stringify({
    roots: result.roots,
    keep: result.keep,
    plannedDeleteCount: result.plannedDeleteCount,
    deleted: result.deleted
  }, null, 2));
}
