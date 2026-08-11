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
