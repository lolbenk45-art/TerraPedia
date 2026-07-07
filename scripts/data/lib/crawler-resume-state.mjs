import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

export function computeInputFingerprint(entries, options = {}) {
  const normalizeEntry = typeof options.normalizeEntry === 'function'
    ? options.normalizeEntry
    : normalizeFingerprintEntry;
  const normalized = [...entries].map((entry) => {
    const normalizedEntry = normalizeEntry(entry);
    return typeof normalizedEntry === 'string' ? normalizedEntry : JSON.stringify(normalizedEntry);
  }).sort();
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function normalizeFingerprintEntry(entry) {
  if (entry && typeof entry === 'object') {
    return JSON.stringify({
      gameId: String(entry.gameId ?? ''),
      internalName: String(entry.internalName ?? ''),
      pageTitle: String(entry.pageTitle ?? ''),
      nameZh: String(entry.nameZh ?? ''),
    });
  }
  return String(entry);
}

function recordKeyFor(record, fallbackKey, getRecordKey) {
  if (typeof getRecordKey === 'function') return String(getRecordKey(record));
  return String(record?.gameId ?? fallbackKey ?? '');
}

export function createResumeState({ actionId, resumeMode, inputFingerprint }) {
  return {
    actionId,
    resumeMode,
    inputFingerprint,
    completedKeys: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadResumeState(statePath) {
  try {
    if (!statePath || !fs.existsSync(statePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!Array.isArray(parsed.completedKeys)) parsed.completedKeys = [];
    return parsed;
  } catch {
    return null;
  }
}

export function verifyResumeState({ state, actionId, resumeMode, inputFingerprint }) {
  if (!state) return { ok: false, reason: 'missing' };
  if (state.actionId !== actionId) return { ok: false, reason: 'actionId-mismatch' };
  if (state.resumeMode !== resumeMode) return { ok: false, reason: 'mode-mismatch' };
  if (state.inputFingerprint !== inputFingerprint) return { ok: false, reason: 'fingerprint-mismatch' };
  return { ok: true, reason: 'valid' };
}

export function resolveResumeDecision({
  mode,
  state,
  actionId,
  resumeMode,
  inputFingerprint,
  partialStore,
  isValidRecord,
  validKeys,
  getRecordKey,
}) {
  if (!['fresh', 'resume', 'auto'].includes(mode)) {
    return { action: 'fail', reason: 'invalid-mode' };
  }
  if (mode === 'fresh') {
    return { action: 'fresh', reason: 'requested-fresh' };
  }

  const stateVerdict = verifyResumeState({ state, actionId, resumeMode, inputFingerprint });
  if (!stateVerdict.ok) {
    if (mode === 'resume') return { action: 'fail', reason: stateVerdict.reason };
    return { action: 'fresh', reason: `auto-downgrade:${stateVerdict.reason}` };
  }

  const partialVerdict = verifyResumePartialStore({ state, partialStore, isValidRecord, validKeys, getRecordKey });
  if (!partialVerdict.ok) {
    if (mode === 'resume') {
      return {
        action: 'fail',
        reason: partialVerdict.reason,
        missingKeys: partialVerdict.missingKeys,
      };
    }
    return { action: 'fresh', reason: `auto-downgrade:${partialVerdict.reason}` };
  }

  return { action: 'resume', reason: 'valid-state', state };
}

export function derivePartialPath(statePath) {
  const raw = String(statePath);
  return raw.endsWith('.resume.json')
    ? raw.replace(/\.resume\.json$/, '.partial.json')
    : `${raw}.partial.json`;
}

export function verifyResumePartialStore({
  state,
  partialStore,
  isValidRecord = defaultIsValidPartialRecord,
  validKeys = null,
  getRecordKey,
}) {
  if (partialStore == null) return { ok: false, reason: 'partial-missing-store', missingKeys: [] };
  if (!partialStore || typeof partialStore !== 'object' || Array.isArray(partialStore)) {
    return { ok: false, reason: 'partial-invalid', missingKeys: [] };
  }

  const completedKeys = [...new Set((state?.completedKeys || []).map((key) => String(key)))];
  if (validKeys != null) {
    const validKeySet = new Set([...validKeys].map((key) => String(key)));
    const extraKeys = completedKeys.filter((key) => !validKeySet.has(key));
    if (extraKeys.length > 0) {
      return { ok: false, reason: 'completed-key-out-of-scope', missingKeys: [], extraKeys };
    }
  }
  const missingKeys = completedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(partialStore, key));
  if (missingKeys.length > 0) {
    return { ok: false, reason: 'partial-missing-completed-key', missingKeys };
  }

  for (const key of completedKeys) {
    const record = partialStore[key];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { ok: false, reason: 'partial-invalid-record', missingKeys: [] };
    }
    if (recordKeyFor(record, key, getRecordKey) !== key) {
      return { ok: false, reason: 'partial-key-mismatch', missingKeys: [] };
    }
    if (!isValidRecord(record, key)) {
      return { ok: false, reason: 'partial-invalid-record', missingKeys: [] };
    }
  }

  return { ok: true, reason: 'valid', missingKeys: [] };
}

export function makeSkipChecker(state, partialStore = {}, isValidRecordOrOptions = defaultIsValidPartialRecord) {
  const { getRecordKey, isValidRecord = defaultIsValidPartialRecord } =
    typeof isValidRecordOrOptions === 'function'
      ? { isValidRecord: isValidRecordOrOptions }
      : (isValidRecordOrOptions ?? {});
  const done = new Set((state?.completedKeys || []).map((key) => String(key)));
  return (key) => {
    const strKey = String(key);
    const record = partialStore?.[strKey];
    return Boolean(
      done.has(strKey)
        && record
        && typeof record === 'object'
        && !Array.isArray(record)
        && recordKeyFor(record, strKey, getRecordKey) === strKey
        && isValidRecord(record, strKey)
    );
  };
}

export function markCompleted({ statePath, state, key }) {
  const strKey = String(key);
  const completed = new Set((state.completedKeys || []).map((completedKey) => String(completedKey)));
  if (!completed.has(strKey)) {
    state.completedKeys.push(key);
  }
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  writeJsonFile(statePath, state);
  return state;
}

export function buildResumeProgressFields(state, totalKeys) {
  const completed = new Set((state?.completedKeys || []).map((key) => String(key))).size;
  return {
    resume: {
      mode: state?.resumeMode || 'none',
      completed: totalKeys == null ? completed : Math.min(completed, totalKeys),
      total: totalKeys ?? null,
      inputFingerprint: state?.inputFingerprint || null,
    },
  };
}

function defaultIsValidPartialRecord(record) {
  return Boolean(record && typeof record === 'object' && !Array.isArray(record));
}
