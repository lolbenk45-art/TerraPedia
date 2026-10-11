import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { prepareBaseAutomaticArtifactBoundary } from './prepare-base-automatic-artifact-boundary.mjs';

test('prepares the canonical automatic artifact ancestors as owner-only directories', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-automatic-boundary-'));
  try {
    const canonicalRoot = path.join(repoRoot, 'reports', 'authorization', 'canonical');
    fs.mkdirSync(canonicalRoot, { recursive: true, mode: 0o775 });
    fs.chmodSync(path.join(repoRoot, 'reports', 'authorization'), 0o775);
    fs.chmodSync(canonicalRoot, 0o775);

    const result = prepareBaseAutomaticArtifactBoundary({ repoRoot });

    assert.equal(result.relativeRoot, 'reports/authorization/canonical/automatic');
    for (const relativePath of [
      'reports/authorization',
      'reports/authorization/canonical',
      'reports/authorization/canonical/automatic',
    ]) {
      const stat = fs.statSync(path.join(repoRoot, relativePath));
      assert.equal(stat.uid, process.getuid());
      assert.equal(stat.mode & 0o777, 0o700);
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('does not repair a canonical artifact ancestor owned by another uid', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'base-automatic-boundary-owner-'));
  try {
    const canonicalRoot = path.join(repoRoot, 'reports', 'authorization', 'canonical');
    fs.mkdirSync(canonicalRoot, { recursive: true, mode: 0o775 });
    fs.chmodSync(canonicalRoot, 0o775);
    assert.throws(
      () => prepareBaseAutomaticArtifactBoundary({ repoRoot, serviceUid: process.getuid() + 1 }),
      /service UID|owner|owned/i,
    );
    assert.equal(fs.statSync(canonicalRoot).mode & 0o777, 0o775);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
