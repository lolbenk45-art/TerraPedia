import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { assertRepositoryOrdinaryFile } from '../lib/private-repository-path.mjs';

const SOURCE_DISPATCH_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DEFAULT_READ_SOURCE_MONITOR_FILE = (filePath) => fs.readFileSync(filePath, 'utf8');

const SOURCE_KEY_BY_DOMAIN = Object.freeze({
  items: 'wiki.module.iteminfo',
  npcs: 'wiki.module.npcinfo',
  projectiles: 'wiki.module.projectileinfo',
  buffs: 'wiki.page.template_getbuffinfo',
  armor_sets: 'wiki.module.armorsetbonuses',
  audio: 'wiki.audio_assets.catalog',
  bosses: 'wiki.bosses.catalog',
  shimmer: 'wiki.shimmer.page_and_langlinks',
});

export function sourceDispatchIdentityFromEnvironment(env = process.env) {
  const requestedBy = String(env.TERRAPEDIA_CRAWLER_REQUESTED_BY ?? '').trim();
  const values = {
    sourceFingerprint: env.TERRAPEDIA_CRAWLER_SOURCE_FINGERPRINT,
    sourceRunIdentity: env.TERRAPEDIA_CRAWLER_SOURCE_RUN_IDENTITY,
    sourceContentIdentity: env.TERRAPEDIA_CRAWLER_SOURCE_CONTENT_IDENTITY,
  };
  const present = Object.values(values).filter((value) => String(value ?? '').trim()).length;
  if (requestedBy !== 'v2-automation') {
    if (present !== 0) {
      throw new Error('manual invocations must not carry a scheduler source dispatch identity');
    }
    return null;
  }
  if (present !== 3) throw new Error('scheduler source dispatch identity is incomplete');
  const sourceFingerprint = canonicalSourceFingerprint(values.sourceFingerprint);
  const sourceRunIdentity = requireTimestamp(values.sourceRunIdentity, 'scheduler sourceRunIdentity');
  const sourceContentIdentity = requireText(values.sourceContentIdentity, 'scheduler sourceContentIdentity');
  if (!SOURCE_DISPATCH_HASH_PATTERN.test(sourceContentIdentity)) {
    throw new Error('scheduler sourceContentIdentity must be a sha256 hash');
  }
  return Object.freeze({ sourceFingerprint, sourceRunIdentity, sourceContentIdentity });
}

export function canonicalSourceFingerprint(value) {
  const raw = requireText(value, 'source fingerprint');
  const normalized = raw.startsWith('sha256:') ? raw : `sha256:${raw}`;
  if (!SOURCE_DISPATCH_HASH_PATTERN.test(normalized)) {
    throw new Error('source fingerprint must be a lowercase sha256 content hash');
  }
  return normalized;
}

export function assertFrozenSourceMatchesDispatchIdentity(identity, sourceFingerprint) {
  if (identity == null) return;
  if (identity.sourceFingerprint !== canonicalSourceFingerprint(sourceFingerprint)) {
    throw new Error('frozen source fingerprint does not match the scheduler dispatch identity');
  }
}

/**
 * Bind a child runner to the exact source-monitor state that admitted its V2
 * attempt. The monitor state is mutable, so callers must retain the returned
 * frozen object and use it for all later identity checks.
 */
export function readFrozenSourceMonitorState({
  identity,
  domain,
  repoRoot,
  sourceStatePath = null,
  sourceKey = null,
  readFileImpl = DEFAULT_READ_SOURCE_MONITOR_FILE,
} = {}) {
  if (identity == null) return null;
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  const configuredPath = sourceStatePath == null || String(sourceStatePath).trim() === ''
    ? path.join(root, 'data', 'generated', 'source-update-monitor.latest.json')
    : String(sourceStatePath);
  const resolvedPath = path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(root, configuredPath);
  const relative = path.relative(root, resolvedPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('scheduler source monitor state must remain inside the runner repository');
  }
  const boundStatePath = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: resolvedPath,
    label: 'scheduler source monitor state',
  });
  let payload;
  try {
    payload = JSON.parse(readBoundSourceMonitorState({
      repoRoot: root,
      filePath: boundStatePath,
      readFileImpl,
    }));
  } catch (error) {
    if (String(error?.message ?? '').startsWith('scheduler source monitor state')) {
      throw error;
    }
    throw new Error('scheduler source monitor state is unavailable or invalid', { cause: error });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('scheduler source monitor state must be an object');
  }
  const runIdentity = requireTimestamp(payload.checkedAt, 'scheduler source monitor checkedAt');
  if (runIdentity !== identity.sourceRunIdentity) {
    throw new Error('scheduler source monitor checkedAt does not match the dispatch identity');
  }
  const contentIdentity = sha256Json(payload);
  if (contentIdentity !== identity.sourceContentIdentity) {
    throw new Error('scheduler source monitor content identity does not match the dispatch identity');
  }
  const expectedKey = sourceKey ?? SOURCE_KEY_BY_DOMAIN[domain];
  if (!expectedKey) throw new Error(`unsupported scheduler source identity domain: ${String(domain ?? '')}`);
  const sources = Array.isArray(payload.sources) ? payload.sources : null;
  const matches = sources?.filter((entry) => entry && entry.key === expectedKey) ?? [];
  if (matches.length !== 1) {
    throw new Error('scheduler source monitor state does not contain exactly one expected source');
  }
  const source = matches[0];
  if (source.checkedAt !== runIdentity || String(source.status ?? '').toLowerCase() !== 'ok') {
    throw new Error('scheduler source monitor source entry is not the admitted probe snapshot');
  }
  assertFrozenSourceMatchesDispatchIdentity(identity, source.currentValue);
  return Object.freeze({
    path: resolvedPath,
    runIdentity,
    contentIdentity,
    sourceKey: expectedKey,
    source: Object.freeze({ ...source }),
    payload: Object.freeze({ ...payload, sources: sources.map((entry) => Object.freeze({ ...entry })) }),
  });
}

function readBoundSourceMonitorState({ repoRoot, filePath, readFileImpl }) {
  const initial = readSourceMonitorFileIdentity(filePath);
  let contents;
  if (readFileImpl === DEFAULT_READ_SOURCE_MONITOR_FILE) {
    if (typeof fs.constants.O_NOFOLLOW !== 'number') {
      throw new Error('scheduler source monitor state requires no-follow file access');
    }
    const fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const opened = fs.fstatSync(fd);
      assertSourceMonitorFileIdentity(opened, initial);
      contents = fs.readFileSync(fd, 'utf8');
      assertSourceMonitorFileIdentity(fs.fstatSync(fd), initial);
    } finally {
      fs.closeSync(fd);
    }
  } else {
    contents = readFileImpl(filePath);
  }
  const reboundPath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath,
    label: 'scheduler source monitor state',
  });
  if (reboundPath !== filePath) {
    throw new Error('scheduler source monitor state identity changed during read');
  }
  assertSourceMonitorFileIdentity(readSourceMonitorFileIdentity(reboundPath), initial);
  return contents;
}

function readSourceMonitorFileIdentity(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('scheduler source monitor state must be an ordinary file');
  }
  return { dev: stat.dev, ino: stat.ino };
}

function assertSourceMonitorFileIdentity(actual, expected) {
  if (typeof actual?.isFile === 'function'
      && (!actual.isFile() || actual.isSymbolicLink?.())) {
    throw new Error('scheduler source monitor state identity changed during read');
  }
  if (actual?.dev !== expected?.dev || actual?.ino !== expected?.ino) {
    throw new Error('scheduler source monitor state identity changed during read');
  }
}

export function assertFrozenSourceMonitorStateMatches(identity, frozenState) {
  if (identity == null) return;
  if (!frozenState
      || frozenState.runIdentity !== identity.sourceRunIdentity
      || frozenState.contentIdentity !== identity.sourceContentIdentity) {
    throw new Error('frozen source monitor state does not match the scheduler dispatch identity');
  }
  assertFrozenSourceMatchesDispatchIdentity(identity, frozenState.source?.currentValue);
}

export function assertCurrentSourceMonitorStateMatchesDispatchIdentity({
  identity,
  domain,
  repoRoot,
  sourceStatePath = null,
  readSourceMonitorStateImpl = readFrozenSourceMonitorState,
} = {}) {
  if (identity == null) return null;
  const currentState = readSourceMonitorStateImpl({
    identity,
    domain,
    repoRoot,
    sourceStatePath,
  });
  assertFrozenSourceMonitorStateMatches(identity, currentState);
  return currentState;
}

function sha256Json(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}
