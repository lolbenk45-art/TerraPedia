import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveTrustedEvidenceRoot } from './private-repository-path.mjs';

function makeLinkedRepositoryFixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-evidence-root-'));
  const primaryRoot = path.join(workspace, 'primary');
  const linkedRoot = path.join(workspace, 'linked');
  const commonGitDir = path.join(primaryRoot, '.git');
  const worktreeGitDir = path.join(commonGitDir, 'worktrees', 'linked');

  fs.mkdirSync(path.join(commonGitDir, 'objects'), { recursive: true });
  fs.mkdirSync(worktreeGitDir, { recursive: true });
  fs.mkdirSync(path.join(linkedRoot, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(commonGitDir, 'HEAD'), 'ref: refs/heads/test\n');
  fs.writeFileSync(path.join(commonGitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n');
  fs.writeFileSync(path.join(worktreeGitDir, 'commondir'), '../..\n');
  fs.writeFileSync(path.join(worktreeGitDir, 'gitdir'), `${path.join(linkedRoot, '.git')}\n`);
  fs.writeFileSync(path.join(linkedRoot, '.git'), `gitdir: ${worktreeGitDir}\n`);

  return { workspace, primaryRoot, linkedRoot, commonGitDir, worktreeGitDir };
}

test('default evidence root remains the caller worktree and does not authorize an external absolute path', () => {
  const fixture = makeLinkedRepositoryFixture();
  fs.mkdirSync(path.join(fixture.workspace, 'unrelated'));
  const resolved = resolveTrustedEvidenceRoot({ repoRoot: fixture.linkedRoot });
  assert.equal(resolved.root, fixture.linkedRoot);
  assert.equal(resolved.kind, 'caller-worktree');
  assert.throws(
    () => resolveTrustedEvidenceRoot({
      repoRoot: fixture.linkedRoot,
      evidenceRoot: path.join(fixture.workspace, 'unrelated'),
    }),
    /same repository|primary worktree|trusted evidence root/i,
  );
});

test('explicit corresponding primary worktree is accepted as a read-only evidence root', () => {
  const fixture = makeLinkedRepositoryFixture();
  fs.mkdirSync(path.join(fixture.primaryRoot, 'reports', 'authorization', 'canonical'), { recursive: true });
  fs.mkdirSync(path.join(fixture.primaryRoot, 'reports', 'runtime', 'l1-reconciliation'), { recursive: true });

  const resolved = resolveTrustedEvidenceRoot({
    repoRoot: fixture.linkedRoot,
    evidenceRoot: fixture.primaryRoot,
  });
  assert.equal(resolved.root, fixture.primaryRoot);
  assert.equal(resolved.kind, 'primary-worktree');
  assert.equal(resolved.repositoryRelativeRoot, '.');
});

test('evidence root rejects path escapes, symlink aliases, unrelated repositories, and missing roots', () => {
  const fixture = makeLinkedRepositoryFixture();
  const outside = path.join(fixture.workspace, 'outside');
  fs.mkdirSync(outside);
  const symlink = path.join(fixture.workspace, 'primary-alias');
  fs.symlinkSync(fixture.primaryRoot, symlink, 'dir');

  for (const evidenceRoot of [
    path.join(fixture.linkedRoot, '..', 'outside'),
    symlink,
    outside,
    path.join(fixture.workspace, 'missing'),
  ]) {
    assert.throws(
      () => resolveTrustedEvidenceRoot({ repoRoot: fixture.linkedRoot, evidenceRoot }),
      /canonical|same repository|primary worktree|ordinary|trusted evidence root|missing/i,
      `must reject ${evidenceRoot}`,
    );
  }
});
