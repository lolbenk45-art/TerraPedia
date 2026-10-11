import fs from 'node:fs';
import path from 'node:path';
import { validateArmorCanonicalRecoveryJournal } from './armor-canonical-recovery-journal.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function privateOrdinaryFile(target, label) {
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} must be private`);
  return stat;
}

function readJournal(target, validateJournal) {
  privateOrdinaryFile(target, 'Armor recovery journal');
  let value;
  try { value = JSON.parse(fs.readFileSync(target, 'utf8')); }
  catch (error) { throw new Error(`Armor recovery journal is unreadable: ${error.message}`); }
  plain(value, 'Armor recovery journal');
  if (validateJournal) validateArmorCanonicalRecoveryJournal(value);
  return value;
}

function writeAtomically(target, value) {
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, target);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  fs.chmodSync(target, 0o600);
}

export function createArmorCanonicalRecoveryJournalStore({ repoRoot = process.cwd(), relativePath, validateJournal = true } = {}) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new Error('Armor recovery journal relativePath is required');
  }
  const target = assertRepositoryPathConfinement({
    repoRoot, filePath: path.resolve(repoRoot, relativePath), label: 'Armor recovery journal', createParent: true,
  });
  const validate = (journal) => {
    plain(journal, 'Armor recovery journal');
    if (validateJournal) validateArmorCanonicalRecoveryJournal(journal);
    return clone(journal);
  };
  return Object.freeze({
    path: target,
    async create(journal) {
      const value = validate(journal);
      try {
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink()) throw new Error('Armor recovery journal target must not be a symlink');
        throw new Error('Armor recovery journal already exists');
      }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      writeAtomically(target, value);
      return clone(value);
    },
    async read() { return clone(readJournal(target, validateJournal)); },
    async advance({ previousJournalSha256, journal } = {}) {
      if (typeof previousJournalSha256 !== 'string' || !previousJournalSha256.trim()) throw new Error('previous journal hash is required');
      const current = readJournal(target, validateJournal);
      if (current.journalSha256 !== previousJournalSha256) throw new Error('previous journal hash drifted');
      const value = validate(journal);
      const prefix = current.history ?? [];
      const nextPrefix = (value.history ?? []).slice(0, prefix.length);
      if (JSON.stringify(stable(nextPrefix)) !== JSON.stringify(stable(prefix))) throw new Error('recovery journal history was not retained');
      writeAtomically(target, value);
      return clone(value);
    },
  });
}
