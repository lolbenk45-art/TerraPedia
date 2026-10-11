import fs from 'node:fs';
import path from 'node:path';

import {
  assertRepositoryPathConfinement,
  assertRepositoryOrdinaryFile,
} from '../lib/private-repository-path.mjs';
import { validateBuffRecoveryJournal } from './buff-canonical-recovery-journal.mjs';

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function resolveTarget(repoRoot, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new Error('Buff recovery journal relativePath is required');
  }
  return assertRepositoryPathConfinement({
    repoRoot: path.resolve(repoRoot),
    filePath: path.resolve(repoRoot, relativePath),
    label: 'Buff recovery journal',
    createParent: true,
  });
}

function read(target, repoRoot) {
  const file = assertRepositoryOrdinaryFile({ repoRoot, filePath: target, label: 'Buff recovery journal' });
  if ((fs.statSync(file).mode & 0o077) !== 0) throw new Error('Buff recovery journal must be private');
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Buff recovery journal is unreadable: ${error.message}`); }
  validateBuffRecoveryJournal(value);
  return value;
}

function writeAtomically(target, value) {
  const temporary = `${target}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o600);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export function createBuffRecoveryJournalStore({ repoRoot = process.cwd(), relativePath } = {}) {
  const root = path.resolve(repoRoot);
  const target = resolveTarget(root, relativePath);
  return Object.freeze({
    path: target,
    async create(journal) {
      validateBuffRecoveryJournal(journal);
      try {
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink()) throw new Error('Buff recovery journal target must not be a symlink');
        throw new Error('Buff recovery journal already exists');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      writeAtomically(target, journal);
      return clone(journal);
    },
    async read() { return clone(read(target, root)); },
    async advance({ previousRecordSha256, journal } = {}) {
      if (typeof previousRecordSha256 !== 'string' || !previousRecordSha256.trim()) {
        throw new Error('Buff recovery journal previous record hash is required');
      }
      const current = read(target, root);
      if (current.recordSha256 !== previousRecordSha256) {
        throw new Error('Buff recovery journal previous record hash drifted');
      }
      validateBuffRecoveryJournal(journal);
      writeAtomically(target, journal);
      return clone(journal);
    },
  });
}
