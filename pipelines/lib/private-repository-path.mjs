import fs from 'node:fs';
import path from 'node:path';

export function assertRepositoryPathConfinement({
  repoRoot,
  filePath,
  label = 'repository path',
  createParent = false,
} = {}) {
  const root = path.resolve(requirePath(repoRoot, 'repository root'));
  const target = path.resolve(requirePath(filePath, label));
  const relativePath = path.relative(root, target);
  if (!relativePath || relativePath.startsWith(`..${path.sep}`)
      || relativePath === '..' || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must remain inside the repository root`);
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new Error('repository root must be a directory');
  }

  const realRoot = fs.realpathSync(root);
  let current = root;
  for (const segment of relativePath.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    const stat = readOrCreateDirectory({ current, label, createParent });
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} has a symbolic-link ancestor`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`${label} has a non-directory ancestor`);
    }
    if (!isPathInsideOrEqual(realRoot, fs.realpathSync(current))) {
      throw new Error(`${label} ancestor must resolve inside the repository root`);
    }
  }
  return target;
}

export function assertRepositoryOrdinaryFile({
  repoRoot,
  filePath,
  label = 'repository file',
} = {}) {
  const target = assertRepositoryPathConfinement({ repoRoot, filePath, label });
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be an ordinary file`);
  }
  return target;
}

export function assertRepositoryOrdinaryDirectory({
  repoRoot,
  filePath,
  label = 'repository directory',
} = {}) {
  const target = assertRepositoryPathConfinement({ repoRoot, filePath, label });
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be an ordinary directory`);
  }
  return target;
}

/**
 * Resolve an optional read-only evidence root for a linked worktree.
 *
 * Evidence written by a linked worktree may retain an absolute path to the
 * repository's primary worktree.  That path is intentionally rejected by the
 * normal confinement helpers.  Callers that need to read such historical
 * evidence must opt in with the corresponding primary worktree root.  The
 * root is accepted only when Git's worktree metadata proves that it shares the
 * same common `.git` directory; arbitrary directories and symlink aliases are
 * rejected.
 *
 * The returned descriptor is metadata only.  It grants no write capability;
 * callers must continue using read-only file operations and the ordinary-file
 * checks below for every artifact.
 */
export function resolveTrustedEvidenceRoot({
  repoRoot,
  evidenceRoot = null,
  label = 'evidence root',
} = {}) {
  const callerRoot = assertCanonicalDirectory(repoRoot, 'repository root');
  const rawEvidenceRoot = String(evidenceRoot ?? '').trim();
  if (!rawEvidenceRoot) {
    return Object.freeze({
      root: callerRoot,
      kind: 'caller-worktree',
      repositoryRelativeRoot: '.',
      explicit: false,
    });
  }

  const requestedRoot = assertCanonicalDirectoryPath(rawEvidenceRoot, label);
  if (samePath(requestedRoot, callerRoot)) {
    return Object.freeze({
      root: callerRoot,
      kind: 'caller-worktree',
      repositoryRelativeRoot: '.',
      explicit: true,
    });
  }

  const callerIdentity = inspectGitWorktree(callerRoot, 'repository root');
  if (!callerIdentity.primaryRoot || !samePath(requestedRoot, callerIdentity.primaryRoot)) {
    throw new Error(`${label} must be the corresponding primary worktree of the same repository`);
  }

  const requestedIdentity = inspectGitWorktree(requestedRoot, label);
  if (requestedIdentity.kind !== 'primary-worktree'
      || !samePath(requestedIdentity.commonGitDir, callerIdentity.commonGitDir)) {
    throw new Error(`${label} must be the corresponding primary worktree of the same repository`);
  }

  return Object.freeze({
    root: requestedRoot,
    kind: 'primary-worktree',
    repositoryRelativeRoot: '.',
    explicit: true,
  });
}

// Keep a descriptive alias for callers that prefer the repository-qualified
// name.  Both names intentionally expose the same narrow, read-only contract.
export const resolveTrustedRepositoryEvidenceRoot = resolveTrustedEvidenceRoot;

function readOrCreateDirectory({ current, label, createParent }) {
  try {
    return fs.lstatSync(current);
  } catch (error) {
    if (error?.code !== 'ENOENT' || !createParent) {
      throw new Error(`${label} parent directory is missing`);
    }
  }
  fs.mkdirSync(current, { mode: 0o700 });
  return fs.lstatSync(current);
}

function assertCanonicalDirectory(value, label) {
  const text = requirePath(value, label);
  const target = path.resolve(text);
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be an ordinary directory`);
  }
  const real = fs.realpathSync(target);
  if (!samePath(real, target)) {
    throw new Error(`${label} must be a canonical non-symbolic-link directory`);
  }
  return target;
}

function assertCanonicalDirectoryPath(value, label) {
  const text = requirePath(value, label);
  const target = path.resolve(text);
  if (!path.isAbsolute(text) || text !== target || text.endsWith(path.sep)) {
    throw new Error(`${label} must be a canonical absolute directory path`);
  }
  return assertCanonicalDirectory(target, label);
}

function inspectGitWorktree(root, label) {
  const gitEntry = path.join(root, '.git');
  let stat;
  try {
    stat = fs.lstatSync(gitEntry);
  } catch (error) {
    throw new Error(`${label} is not a verifiable Git worktree: ${error.message}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} Git metadata must not be a symbolic link`);
  }

  if (stat.isDirectory()) {
    const commonGitDir = assertCanonicalDirectory(gitEntry, `${label} .git`);
    assertGitDirectoryShape(commonGitDir, label);
    return {
      kind: 'primary-worktree',
      commonGitDir,
      primaryRoot: root,
    };
  }
  if (!stat.isFile()) {
    throw new Error(`${label} Git metadata must be a directory or gitdir file`);
  }

  const gitDirLine = readGitPathFile(gitEntry, `${label} gitdir`);
  const gitDirMatch = gitDirLine.match(/^gitdir:\s*(.+)$/i);
  if (!gitDirMatch) {
    throw new Error(`${label} gitdir is invalid`);
  }
  const gitDirValue = gitDirMatch[1].trim();
  const worktreeGitDir = assertCanonicalDirectory(
    path.resolve(root, gitDirValue),
    `${label} linked Git metadata`,
  );
  const commonDirFile = path.join(worktreeGitDir, 'commondir');
  const commonDirValue = readGitPathFile(commonDirFile, `${label} commondir`);
  const commonGitDir = assertCanonicalDirectory(
    path.resolve(worktreeGitDir, commonDirValue),
    `${label} common Git directory`,
  );
  assertGitDirectoryShape(commonGitDir, label);

  const backReference = readGitPathFile(
    path.join(worktreeGitDir, 'gitdir'),
    `${label} linked gitdir back-reference`,
  );
  const expectedGitFile = path.join(root, '.git');
  const actualBackReference = path.resolve(worktreeGitDir, backReference);
  if (!samePath(actualBackReference, expectedGitFile)) {
    throw new Error(`${label} Git worktree back-reference does not match the caller root`);
  }

  const primaryRoot = assertCanonicalDirectory(path.dirname(commonGitDir), `${label} primary worktree`);
  const primaryGitDir = assertCanonicalDirectory(path.join(primaryRoot, '.git'), `${label} primary .git`);
  if (!samePath(primaryGitDir, commonGitDir)) {
    throw new Error(`${label} primary worktree does not share the common Git directory`);
  }
  return {
    kind: 'linked-worktree',
    commonGitDir,
    primaryRoot,
  };
}

function assertGitDirectoryShape(commonGitDir, label) {
  for (const name of ['HEAD', 'config']) {
    const filePath = path.join(commonGitDir, name);
    let stat;
    try {
      stat = fs.lstatSync(filePath);
    } catch (error) {
      throw new Error(`${label} common Git directory is incomplete: ${error.message}`);
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`${label} common Git directory has invalid ${name}`);
    }
  }
}

function readGitPathFile(filePath, label) {
  let value;
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('must be an ordinary file');
    }
    value = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`${label} is invalid: ${error.message}`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('\n') || trimmed.includes('\r') || trimmed.includes('\0')) {
    throw new Error(`${label} is invalid`);
  }
  return trimmed;
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  if (process.platform === 'win32') {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

function isPathInsideOrEqual(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`)
    && relative !== '..' && !path.isAbsolute(relative));
}

function requirePath(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
